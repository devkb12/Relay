"""Discord gateway adapter. Credentials required; not live-tested in this build kit.
Run: python -m relay.bot. All grades stay in ephemeral responses.
"""
from __future__ import annotations
import os
import discord
from discord import app_commands
import httpx
from dotenv import load_dotenv
load_dotenv()
BASE=os.getenv('RELAY_BASE_URL','http://127.0.0.1:8000').rstrip('/')
KEY=os.getenv('RELAY_SERVICE_KEY','')

async def request(interaction,action,data=None):
    if not interaction.guild_id or not interaction.channel_id:
        raise ValueError('Run RELAY in your study server channel, not a DM.')
    body={'channel':f'{interaction.guild_id}:{interaction.channel_id}',
          'user_id':str(interaction.user.id),'name':interaction.user.display_name[:40],
          'action':action,'data':data or {}}
    async with httpx.AsyncClient(timeout=25) as client:
        result=await client.post(BASE+'/internal/discord',headers={'X-Relay-Key':KEY},json=body)
    if result.is_error:
        detail=result.json().get('detail','Request failed.')
        raise ValueError(str(detail))
    return result.json()

async def fail(interaction,exc):
    text=f'RELAY could not complete that action: {str(exc)[:700]}'
    if interaction.response.is_done(): await interaction.followup.send(text,ephemeral=True)
    else: await interaction.response.send_message(text,ephemeral=True)


def group_embed(s):
    embed=discord.Embed(title='RELAY / '+s['concept']['title'],description='Find the time. Pass the understanding.',color=0x4567EF)
    embed.add_field(name='Stage',value=s['stage'].replace('_',' ').title())
    embed.add_field(name='Participants',value=str(len(s['members'])))
    if s.get('invalidated'):
        embed.add_field(name='Question discarded',value='The host discarded this item after review. Scores are suppressed; choose a reviewed item.',inline=False)
        return embed
    if (s.get('challenge') or {}).get('pending'):
        embed.add_field(name='Paused for source review',value='A participant challenged this question. Answers and stage changes are paused. The host must review the source with `/relay resolve`.',inline=False)
        return embed
    if s['stage'] in ('diagnostic','transfer'):
        n=sum(m['responded'] for m in s['members'])
        embed.add_field(name='Private responses',value=f'{n}/{len(s["members"])} received')
        embed.add_field(name='Next step',value='Use `/relay question`. Answers and confidence are not posted here.',inline=False)
    if s['stage']=='discussion':
        embed.add_field(name='Compare the reasoning',value=s['hint']['discussion_question'][:1000],inline=False)
        embed.add_field(name='Peer first',value='Volunteer with `/relay explain`. Nobody is assigned an ability label.',inline=False)
    if s.get('group'):
        g=s['group']; embed.add_field(name='Paired item results',value=f'{g["initial_correct"]}/{g["paired_responses"]} initial; {g["fresh_correct"]}/{g["paired_responses"]} fresh application. Not proof of lasting mastery.',inline=False)
    if s['plan']:
        p=s['plan']; embed.add_field(name=f'Schedule proposal v{s["plan_version"]}',value=f'{p["start"]} to {p["end"]} UTC\n{s["approved_count"]}/{len(s["members"])} approved. Not a Google Calendar write.',inline=False)
    embed.set_footer(text='Original demo teaching material. Private inputs are processed by the RELAY service.')
    return embed

class AnswerModal(discord.ui.Modal,title='Your private attempt'):
    choice=discord.ui.TextInput(label='Choice: A, B, C, D, or SKIP',max_length=4)
    confidence=discord.ui.TextInput(label='Confidence: unsure / somewhat / confident',default='unsure',max_length=12)
    rationale=discord.ui.TextInput(label='Your reasoning (optional, private)',style=discord.TextStyle.paragraph,required=False,max_length=600)
    def __init__(self,qid): super().__init__(); self.qid=qid
    async def on_submit(self,interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            await request(interaction,'answer',{'question_id':self.qid,'choice':str(self.choice).strip().upper(),
                'confidence':str(self.confidence).strip().lower(),'rationale':str(self.rationale)})
            await interaction.followup.send('Attempt locked. Correctness is withheld until the discussion and fresh check are complete.',ephemeral=True)
        except Exception as exc: await fail(interaction,exc)

class AnswerView(discord.ui.View):
    def __init__(self,qid): super().__init__(timeout=900); self.qid=qid
    @discord.ui.button(label='Answer privately',style=discord.ButtonStyle.primary)
    async def answer(self,interaction,button):
        await interaction.response.send_modal(AnswerModal(self.qid))

class ApprovalView(discord.ui.View):
    def __init__(self,version): super().__init__(timeout=900); self.version=version
    @discord.ui.button(label='Approve this exact time',style=discord.ButtonStyle.success)
    async def approve(self,interaction,button):
        await interaction.response.defer(ephemeral=True)
        try:
            result=await request(interaction,'approve',{'version':self.version})
            await interaction.followup.send('Your approval was recorded. '+('Everyone has approved.' if result['state']['schedule_confirmed'] else 'Other approvals are still needed.'),ephemeral=True)
        except Exception as exc: await fail(interaction,exc)

class AvailabilityModal(discord.ui.Modal,title='Your available window'):
    start=discord.ui.TextInput(label='Start with offset: 2026-10-25T15:00-07:00',max_length=40)
    end=discord.ui.TextInput(label='End with offset: 2026-10-25T17:00-07:00',max_length=40)
    async def on_submit(self,interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            await request(interaction,'availability',{'windows':[{'start':str(self.start),'end':str(self.end)}]})
            await interaction.followup.send('Availability updated. Any prior time proposal and approvals were invalidated.',ephemeral=True)
        except Exception as exc: await fail(interaction,exc)

class RelayClient(discord.Client):
    def __init__(self):
        intents=discord.Intents.none(); intents.guilds=True
        super().__init__(intents=intents,allowed_mentions=discord.AllowedMentions.none())
        self.tree=app_commands.CommandTree(self)
    async def setup_hook(self):
        guild=os.getenv('DISCORD_GUILD_ID','')
        if guild:
            obj=discord.Object(id=int(guild)); self.tree.copy_global_to(guild=obj); await self.tree.sync(guild=obj)
        else: await self.tree.sync()
    async def on_ready(self): print(f'RELAY connected as {self.user}. No message-content intent requested.')

client=RelayClient()
group=app_commands.Group(name='relay',description='Coordinate a peer study session and check a fresh application.')

@group.command(name='create',description='Create a study session in this channel.')
@app_commands.choices(concept=[app_commands.Choice(name='Successive percentage changes',value='compound-change'),app_commands.Choice(name='Base rates',value='base-rates'),app_commands.Choice(name='Correlation',value='correlation')])
async def create(interaction:discord.Interaction,concept:str='compound-change'):
    await interaction.response.defer(ephemeral=True)
    try:
        s=(await request(interaction,'create',{'concept_id':concept}))['state']
        await interaction.followup.send('Created. Participants can use `/relay join`. Responses are processed by this service; group results may permit inference in small groups.',ephemeral=True)
        await interaction.channel.send(embed=group_embed(s))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='join',description='Join and consent to processing your practice answers; no public score ranking.')
async def join(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        await request(interaction,'join')
        await interaction.followup.send('Joined. Your answers remain private to you and the service; aggregate results may appear after the fresh check. Reminders are OFF until you enable them.',ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='question',description='See your current question and answer privately.')
async def question(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        s=(await request(interaction,'view'))['state']; q=s.get('question')
        if not q:
            text='No question is open. Current stage: '+s['stage']
            if s['my_results']:
                text+='\nYour results:\n'+'\n'.join(f'{k}: {v["correct"]}. {v["explanation"]}' for k,v in s['my_results'].items())
            await interaction.followup.send(text,ephemeral=True); return
        text=q['prompt']+'\n\n'+'\n'.join(f'{k}. {v}' for k,v in q['options'].items())
        await interaction.followup.send(text,view=AnswerView(q['id']),ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='next',description='Host: move to the next stage after the required checks.')
async def next_stage(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        old=(await request(interaction,'view'))['state']
        s=(await request(interaction,'advance',{'expected_stage':old['stage']}))['state']
        await interaction.followup.send('Stage advanced.',ephemeral=True)
        await interaction.channel.send(embed=group_embed(s))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='explain',description='Volunteer an explanation. This text WILL be shared with your study group.')
async def explain(interaction:discord.Interaction,text:str):
    await interaction.response.defer(ephemeral=True)
    try:
        await request(interaction,'explain',{'text':text})
        await interaction.followup.send('Explanation shared.',ephemeral=True)
        await interaction.channel.send(f'**Peer explanation from {discord.utils.escape_markdown(interaction.user.display_name)}**\n{discord.utils.escape_markdown(text[:1200])}')
    except Exception as exc: await fail(interaction,exc)

@group.command(name='hint',description='Host: get a source-grounded discussion prompt; a curated fallback is available.')
async def hint(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        s=(await request(interaction,'facilitate'))['state']
        await interaction.followup.send('Prompt prepared. Mode: '+s['hint']['mode'],ephemeral=True)
        await interaction.channel.send('**RELAY asks:** '+s['hint']['discussion_question'])
    except Exception as exc: await fail(interaction,exc)

@group.command(name='source',description='Review the source during discussion; does not claim the source is infallible.')
async def source(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        s=(await request(interaction,'view'))['state']; src=s['source']
        await interaction.followup.send(src['source_title']+'\n'+src['source_text'] if src else 'The source is shown in discussion and debrief, not during an independent attempt.',ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='fallback',description='Host: record source review when nobody volunteers a peer explanation.')
async def fallback(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        await request(interaction,'explain',{'text':'','source_fallback':True})
        await interaction.followup.send('Source-review fallback recorded. This is not counted as peer teaching.',ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='availability',description='Enter one private availability window with an explicit timezone offset.')
async def availability(interaction:discord.Interaction): await interaction.response.send_modal(AvailabilityModal())

@group.command(name='schedule',description='Host: propose a shared time from submitted availability.')
async def schedule(interaction:discord.Interaction,minutes:int=60):
    await interaction.response.defer(ephemeral=True)
    try:
        durations=list(dict.fromkeys([minutes]+[x for x in (45,30) if x<minutes]))
        s=(await request(interaction,'propose',{'durations':durations}))['state']
        await interaction.followup.send('Proposal prepared.' if s['plan'] else 'No common time. Ask for changed availability or a shorter duration.',ephemeral=True)
        if s['plan']: await interaction.channel.send(embed=group_embed(s),view=ApprovalView(s['plan_version']))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='reminders',description='Opt into or stop private reminders and the delayed follow-up.')
async def reminders(interaction:discord.Interaction,enabled:bool):
    await interaction.response.defer(ephemeral=True)
    try:
        await request(interaction,'consent',{'enabled':enabled})
        await interaction.followup.send('Preference saved. Delivery also requires an enabled worker and permitted DMs; this message does not confirm a future delivery.',ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='status',description='Post the group-safe session card; no individual answer keys.')
async def status(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        s=(await request(interaction,'view'))['state']
        await interaction.followup.send('Group card posted.',ephemeral=True)
        await interaction.channel.send(embed=group_embed(s))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='challenge',description='Flag an ambiguous source or item. Your concern is shared; scoring pauses.')
async def challenge(interaction:discord.Interaction,reason:str):
    await interaction.response.defer(ephemeral=True)
    try:
        await request(interaction,'challenge',{'reason':reason})
        await interaction.followup.send('Item review opened. Scoring is paused.',ephemeral=True)
        await interaction.channel.send('**Item review requested:** '+discord.utils.escape_markdown(reason[:500]))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='resolve',description='Host: record a source review and resume or discard the item.')
@app_commands.choices(decision=[app_commands.Choice(name='Resume original item',value='resume'),app_commands.Choice(name='Discard and suppress scores',value='discard')])
async def resolve(interaction:discord.Interaction,decision:str,note:str):
    await interaction.response.defer(ephemeral=True)
    try:
        await request(interaction,'resolve',{'decision':decision,'note':note})
        await interaction.followup.send('Review decision recorded. A host review is not an instructor endorsement.',ephemeral=True)
        await interaction.channel.send('**Item review: '+decision+'** '+discord.utils.escape_markdown(note[:500]))
    except Exception as exc: await fail(interaction,exc)

client.tree.add_command(group)
if __name__=='__main__':
    token=os.getenv('DISCORD_BOT_TOKEN','')
    if not token or len(KEY)<32:
        raise SystemExit('Set DISCORD_BOT_TOKEN and a >=32-character RELAY_SERVICE_KEY in .env.')
    client.run(token)
