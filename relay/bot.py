"""Discord gateway adapter. Run: python -m relay.bot. Identity comes from Discord, never from typed ids.

Every button/modal is bound to an immutable session id plus question id or plan version, so a
control from an old session can never act on a newer session in the same channel. Buttons are
DynamicItems: they keep working after a bot restart, and stale ones get a friendly refusal.
Answers, results and review packets are only sent as ephemeral (private) responses.
"""
from __future__ import annotations
import os
import discord
from discord import app_commands
import httpx
from .store import load_local_env
load_local_env()
BASE=os.getenv('RELAY_BASE_URL','http://127.0.0.1:8000').rstrip('/')
KEY=os.getenv('RELAY_SERVICE_KEY','')
# The public website (the same RELAY_FRONTEND_URL the backend uses for Discord sign-in). Optional.
WEB=os.getenv('RELAY_FRONTEND_URL','').strip().rstrip('/')
SID=r'[A-Za-z0-9_-]{6,40}'
STATUS_LABEL={'correct':'Correct','incorrect':'Not correct','skipped':'Skipped','missing':'No response recorded',
              'withdrawn':'Withdrawn','invalidated':'Item discarded; not scored'}
PHASE_LABEL={'diagnostic':'Initial attempt','transfer':'Fresh problem','retention':'Delayed practice'}

class RelayFailure(Exception): pass

def clip(text,limit=1900):
    text=str(text)
    return text if len(text)<=limit else text[:limit-1]+'…'

def safe(text,limit=1000):
    return discord.utils.escape_mentions(discord.utils.escape_markdown(clip(text,limit)))

def bot_body(interaction,action,data=None,session_id=None):
    if not interaction.guild_id or not interaction.channel_id:
        raise RelayFailure('Run RELAY in your study server channel, not a DM.')
    body={'channel':f'{interaction.guild_id}:{interaction.channel_id}','user_id':str(interaction.user.id),
          'name':interaction.user.display_name[:40],'action':action,'data':data or {}}
    if session_id: body['session_id']=session_id
    return body

async def request(interaction,action,data=None,session_id=None,timeout=None):
    body=bot_body(interaction,action,data,session_id)
    http=interaction.client.http_client
    try:
        extra={'timeout':timeout} if timeout else {}
        result=await http.post(BASE+'/internal/discord',headers={'X-Relay-Key':KEY},json=body,**extra)
    except httpx.HTTPError:
        raise RelayFailure('The RELAY service is unreachable right now. Nothing was recorded; try again shortly.')
    if result.is_error:
        try: detail=result.json().get('detail','Request failed.')
        except ValueError: detail='Request failed.'
        if isinstance(detail,list): detail='Some input was invalid. Check the format and try again.'
        raise RelayFailure(str(detail))
    return result.json()

async def fail(interaction,exc):
    text='RELAY could not complete that: '+(str(exc) if isinstance(exc,RelayFailure) else 'unexpected error.')
    if interaction.response.is_done(): await interaction.followup.send(clip(text),ephemeral=True)
    else: await interaction.response.send_message(clip(text),ephemeral=True)

def room_link(sid):
    """The website room for this exact session. It identifies the room; opening it still needs Discord
    sign-in and membership. Only http(s) origins are linked, never a token."""
    if not WEB.startswith(('https://','http://localhost','http://127.0.0.1')) or not sid: return None
    return f'{WEB}/room/{sid}'

def group_embed(s):
    embed=discord.Embed(title=clip('RELAY / '+s['concept']['title'],250),description='Find the time. Pass the understanding.',color=0x4567EF)
    embed.add_field(name='Stage',value=s['stage'].title())
    active=[m for m in s['members'] if m['state']!='withdrawn']
    embed.add_field(name='Participants',value=str(len(active)))
    if s.get('invalidated'):
        embed.add_field(name='Question discarded',value='The host discarded this item after review. Scores are suppressed.',inline=False)
        return embed
    if s.get('paused'):
        embed.add_field(name='Paused for source review',value='A participant challenged this question. Answers and stage changes are paused until the host uses `/relay resolve`.',inline=False)
        return embed
    if s['stage'] in ('diagnostic','transfer'):
        n=sum(m['state']=='responded' for m in active)
        embed.add_field(name='Private responses',value=f'{n}/{len(active)} received')
        label='Fresh application: a different problem on the same idea.' if s['stage']=='transfer' else 'Think privately first.'
        embed.add_field(name='Next step',value=label+' Use `/relay question`. Answers are never posted here.',inline=False)
    if s['stage']=='discussion' and s.get('hint'):
        embed.add_field(name='Compare the reasoning',value=safe(s['hint']['discussion_question'],1000),inline=False)
        embed.add_field(name='Peer first',value='Volunteer with `/relay explain`. Passing is fine. Nobody is ranked.',inline=False)
    if s.get('group'):
        g=s['group']
        embed.add_field(name='Paired item results',value=f'{g["initial_correct"]}/{g["paired_responses"]} initial; {g["fresh_correct"]}/{g["paired_responses"]} fresh application. Two different items: not proof of lasting mastery.',inline=False)
    elif s['stage']=='debrief':
        embed.add_field(name='Group results',value='Hidden: fewer than three paired responses. Check `/relay question` for your private results.',inline=False)
    if s.get('plan'):
        p=s['plan']; shorter=' (shorter alternative)' if p.get('shorter_alternative') else ''
        embed.add_field(name=f'Schedule proposal v{s["plan_version"]}{shorter}',value=f'{p["start_local"]} for {p["minutes"]} min\n{s["approved_count"]}/{len(active)} approved. An .ics export is not a calendar write.',inline=False)
    elif s.get('plan_cancelled'):
        embed.add_field(name='Schedule',value='The host cancelled the previous proposal.',inline=False)
    link=room_link(s.get('id'))
    if link: embed.add_field(name='On the web',value=f'[Open this session]({link}) and sign in with Discord. Only members of this session can open it.',inline=False)
    embed.set_footer(text='Original demo teaching material. Private inputs are processed by the RELAY service.')
    return embed

class AnswerModal(discord.ui.Modal):
    def __init__(self,sid,question):
        super().__init__(title='Your private attempt',timeout=600)
        self.sid,self.qid=sid,question['id']
        options=[discord.SelectOption(label=clip(f'{k}. {v}',100),value=k) for k,v in question['options'].items()]
        options.append(discord.SelectOption(label='Skip this one',value='SKIP',description='Recorded as skipped, not incorrect.'))
        self.choice=discord.ui.Select(options=options,placeholder='Choose one')
        self.confidence=discord.ui.Select(options=[discord.SelectOption(label=x.title(),value=x) for x in ('unsure','somewhat','confident')],placeholder='How confident are you?')
        self.rationale=discord.ui.TextInput(style=discord.TextStyle.paragraph,required=False,max_length=600)
        self.add_item(discord.ui.Label(text='Your answer',component=self.choice))
        self.add_item(discord.ui.Label(text='Confidence',component=self.confidence))
        self.add_item(discord.ui.Label(text='Reasoning (optional, private)',component=self.rationale))
    async def on_submit(self,interaction):
        await interaction.response.defer(ephemeral=True,thinking=True)
        try:
            await request(interaction,'answer',{'question_id':self.qid,'choice':self.choice.values[0],
                'confidence':self.confidence.values[0],'rationale':str(self.rationale.value or '')},session_id=self.sid)
            await interaction.followup.send('Attempt locked. Correctness is withheld until the discussion and fresh check are complete.',ephemeral=True)
        except Exception as exc: await fail(interaction,exc)

class AnswerButton(discord.ui.DynamicItem[discord.ui.Button],template=r'relay:ans:(?P<sid>'+SID+r'):(?P<qid>[A-Za-z0-9_-]{1,40})'):
    def __init__(self,sid,qid):
        super().__init__(discord.ui.Button(label='Answer privately',style=discord.ButtonStyle.primary,custom_id=f'relay:ans:{sid}:{qid}'))
        self.sid,self.qid=sid,qid
    @classmethod
    async def from_custom_id(cls,interaction,item,match): return cls(match['sid'],match['qid'])
    async def callback(self,interaction):
        # A modal must be the FIRST response, so validate quickly against the bound session first.
        try:
            # Discord's 3-second initial-response window: a slow lookup fails fast with a retry hint.
            s=(await request(interaction,'view',session_id=self.sid,timeout=2.2))['state']
            q=s.get('question')
            if not q or q['id']!=self.qid: raise RelayFailure('That question is closed. Use `/relay question` for the current one.')
            if s.get('my_answer'): raise RelayFailure('Your attempt for this question is already locked.')
            await interaction.response.send_modal(AnswerModal(self.sid,q))
        except Exception as exc: await fail(interaction,exc)

class ApproveButton(discord.ui.DynamicItem[discord.ui.Button],template=r'relay:apv:(?P<sid>'+SID+r'):(?P<v>\d{1,6}):(?P<short>[01])'):
    def __init__(self,sid,version,shorter=False,minutes=None):
        label=f'Approve shorter {minutes}-min time' if shorter else 'Approve this exact time'
        super().__init__(discord.ui.Button(label=label,style=discord.ButtonStyle.success,custom_id=f'relay:apv:{sid}:{version}:{int(shorter)}'))
        self.sid,self.version,self.shorter=sid,int(version),bool(shorter)
    @classmethod
    async def from_custom_id(cls,interaction,item,match): return cls(match['sid'],match['v'],match['short']=='1')
    async def callback(self,interaction):
        await interaction.response.defer(ephemeral=True,thinking=True)
        try:
            # The button label states the shorter duration, so pressing it is the explicit confirmation.
            s=(await request(interaction,'approve',{'version':self.version,'accept_shorter':self.shorter},session_id=self.sid))['state']
            await interaction.followup.send('Your approval was recorded. '+('Everyone has approved.' if s['schedule_confirmed'] else 'Other approvals are still needed.'),ephemeral=True)
        except Exception as exc: await fail(interaction,exc)

class AvailabilityModal(discord.ui.Modal,title='Your available window'):
    start=discord.ui.TextInput(label='Start with offset: 2026-10-25T15:00-07:00',max_length=40)
    end=discord.ui.TextInput(label='End with offset: 2026-10-25T17:00-07:00',max_length=40)
    tz=discord.ui.TextInput(label='Display timezone (IANA)',default='America/Phoenix',max_length=64,required=False)
    async def on_submit(self,interaction):
        await interaction.response.defer(ephemeral=True,thinking=True)
        try:
            await request(interaction,'availability',{'windows':[{'start':str(self.start).strip(),'end':str(self.end).strip()}],
                                                      'timezone':str(self.tz).strip() or None})
            await interaction.followup.send('Availability updated. Any prior proposal and approvals were invalidated.',ephemeral=True)
        except Exception as exc: await fail(interaction,exc)

def single(item):
    view=discord.ui.View(timeout=None); view.add_item(item); return view

class RelayClient(discord.Client):
    def __init__(self):
        intents=discord.Intents.none(); intents.guilds=True  # No message-content or member intents.
        super().__init__(intents=intents,allowed_mentions=discord.AllowedMentions.none())
        self.tree=app_commands.CommandTree(self)
        self.http_client=None
        self.cards={}  # channel -> last status message (in memory; a restart posts a fresh card)
    async def setup_hook(self):
        self.http_client=httpx.AsyncClient(timeout=httpx.Timeout(20,connect=5),limits=httpx.Limits(max_connections=20))
        self.add_dynamic_items(AnswerButton,ApproveButton)
        await self.sync_commands()
    async def sync_commands(self):
        guild=os.getenv('DISCORD_GUILD_ID','').strip()
        try:
            if guild:
                obj=discord.Object(id=int(guild)); self.tree.copy_global_to(guild=obj)
                synced=await self.tree.sync(guild=obj)
                print(f'RELAY synced {len(synced)} slash command group(s) to the configured guild.')
            else:
                synced=await self.tree.sync(); print(f'RELAY synced {len(synced)} global command group(s); global commands can take time to appear.')
        except discord.Forbidden:
            # 50001 Missing Access: the bot is not in that guild yet. Stay connected and sync on join.
            print('RELAY cannot register commands: the bot is not in DISCORD_GUILD_ID yet. Invite it with scopes bot+applications.commands; commands sync automatically on join.')
    async def on_guild_join(self,guild):
        if str(guild.id)==os.getenv('DISCORD_GUILD_ID','').strip():
            await self.sync_commands()
    async def close(self):
        if self.http_client: await self.http_client.aclose()
        await super().close()
    async def on_ready(self): print(f'RELAY connected as {self.user}. No message-content intent requested.')
    async def post_card(self,interaction,s,view=None):
        """Edit the channel's status card when possible instead of flooding the channel."""
        key=interaction.channel_id; embed=group_embed(s); old=self.cards.get(key)
        if old is not None and view is None:
            try:
                await old.edit(embed=embed); return
            except discord.HTTPException: pass
        msg=await interaction.channel.send(embed=embed,view=view) if view else await interaction.channel.send(embed=embed)
        self.cards[key]=msg

client=RelayClient()
group=app_commands.Group(name='relay',description='Coordinate a peer study session and check a fresh application.')

@group.command(name='create',description='Create a study session in this channel.')
@app_commands.choices(concept=[app_commands.Choice(name='Successive percentage changes',value='compound-change'),app_commands.Choice(name='Base rates',value='base-rates'),app_commands.Choice(name='Correlation',value='correlation'),app_commands.Choice(name='Reading a correlation (Iris data)',value='iris-correlation')])
async def create(interaction:discord.Interaction,concept:str='compound-change'):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'create',{'concept_id':concept}))['state']
        link=room_link(s.get('id'))
        await interaction.followup.send('Created. You are the host. Participants use `/relay join`. Group results may permit inference in small groups.'+(f' Web room: {link}' if link else ''),ephemeral=True)
        await client.post_card(interaction,s,view=None)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='join',description='Join and consent to processing your practice answers; no public ranking.')
async def join(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'join'))['state']
        link=room_link(s.get('id'))
        await interaction.followup.send('Joined. Your answers stay private to you and the service. Reminders are OFF until you enable them. Use `/relay leave` to withdraw.'+(f' Web room: {link} (sign in with Discord).' if link else ''),ephemeral=True)
        await client.post_card(interaction,s)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='leave',description='Withdraw from this session. Your stored answers are removed.')
async def leave(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        out=await request(interaction,'leave')
        await interaction.followup.send(out['notice'],ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='question',description='See your current question and answer privately, or your private results.')
async def question(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'view'))['state']; q=s.get('question')
        if s.get('paused'):
            await interaction.followup.send('This item is paused for review. Wait for the host to resolve it.',ephemeral=True); return
        if not q:
            text='No question is open. Stage: '+s['stage']
            if s['my_results']:
                text+='\n**Your private results**\n'+'\n'.join(f'- {PHASE_LABEL[k]}: {STATUS_LABEL[v["status"]]}. {v["explanation"]}' for k,v in s['my_results'].items())
                text+='\nTwo different problems, one session: useful practice evidence, not proof of mastery.'
            await interaction.followup.send(clip(text),ephemeral=True); return
        if s.get('my_answer'):
            await interaction.followup.send('Your attempt for this question is locked. Waiting for the group.',ephemeral=True); return
        kind='**Fresh application**: a different problem on the same idea.\n\n' if s['stage']=='transfer' else ''
        text=(kind+safe(q['prompt'],1200)+'\n\n'+'\n'.join(f'**{k}.** {safe(v,200)}' for k,v in q['options'].items())
              +'\n\n*Answer with the button below. Please do not type your answer in the channel; everyone can see channel messages.*')
        await interaction.followup.send(clip(text),view=single(AnswerButton(s['id'],q['id'])),ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='next',description='Host: move to the next stage after the required checks.')
@app_commands.describe(close_round='Record anyone who has not answered as missing (not incorrect) and continue.')
async def next_stage(interaction:discord.Interaction,close_round:bool=False):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        old=(await request(interaction,'view'))['state']
        s=(await request(interaction,'advance',{'expected_stage':old['stage'],'nonresponders':'mark_missing' if close_round else 'wait'},session_id=old['id']))['state']
        await interaction.followup.send(f'Stage advanced to {s["stage"]}.',ephemeral=True)
        client.cards.pop(interaction.channel_id,None)  # New stage: post a fresh card below the discussion.
        await client.post_card(interaction,s)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='explain',description='Volunteer an explanation. This text WILL be shared with your study group.')
async def explain(interaction:discord.Interaction,text:app_commands.Range[str,12,1200]):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        await request(interaction,'explain',{'text':text})
        await interaction.followup.send('Explanation shared.',ephemeral=True)
        await interaction.channel.send(clip(f'**Peer explanation from {safe(interaction.user.display_name,40)}**\n{safe(text,1200)}'))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='hint',description='Host: get a source-grounded discussion prompt; a reviewed fallback is always available.')
async def hint(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)  # Model calls can be slow: acknowledge first.
    try:
        s=(await request(interaction,'facilitate'))['state']; h=s['hint']
        source='live model (check its interpretation)' if h.get('feedback_source')=='live_model' else 'reviewed fallback'
        reason=f" Reason: {h['fallback_reason']}." if h.get('fallback_reason') else ''
        await interaction.followup.send(f'Prompt prepared from {source}.{reason}',ephemeral=True)
        await interaction.channel.send(clip('**RELAY asks:** '+safe(h['discussion_question'],1000)))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='source',description='Review the source during discussion; the source is not infallible.')
async def source(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'view'))['state']; src=s['source']
        await interaction.followup.send(clip(f"**{safe(src['source_title'],200)}**\n{safe(src['source_text'],1600)}") if src else 'The source is shown in discussion and debrief, not during an independent attempt.',ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='fallback',description='Host: record source review when nobody volunteers a peer explanation.')
async def fallback(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        await request(interaction,'explain',{'text':'','source_fallback':True})
        await interaction.followup.send('Source-review fallback recorded. This is not counted as peer teaching.',ephemeral=True)
        await interaction.channel.send('**No volunteer this time.** The group reviewed the source instead (`/relay source`).')
    except Exception as exc: await fail(interaction,exc)

@group.command(name='availability',description='Enter one private availability window with an explicit timezone offset.')
async def availability(interaction:discord.Interaction): await interaction.response.send_modal(AvailabilityModal())

@group.command(name='schedule',description='Host: propose a shared time from submitted availability.')
async def schedule(interaction:discord.Interaction,minutes:app_commands.Range[int,30,180]=60):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        durations=list(dict.fromkeys([minutes]+[x for x in (45,30) if x<minutes]))
        s=(await request(interaction,'propose',{'durations':durations}))['state']
        if not s['plan']:
            await interaction.followup.send('No common time for everyone. Ask for changed availability; nobody was excluded.',ephemeral=True); return
        await interaction.followup.send('Proposal posted. Every current participant must approve this exact version.',ephemeral=True)
        p=s['plan']
        await client.post_card(interaction,s,view=single(ApproveButton(s['id'],s['plan_version'],p.get('shorter_alternative'),p['minutes'])))
    except Exception as exc: await fail(interaction,exc)

@group.command(name='cancel-schedule',description='Host: cancel the current time proposal. The cancellation stays visible.')
async def cancel_schedule(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'cancel_plan'))['state']
        await interaction.followup.send('Proposal cancelled; queued reminders for it were cancelled.',ephemeral=True)
        await client.post_card(interaction,s)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='reminders',description='Opt into or stop private reminders and the delayed follow-up.')
async def reminders(interaction:discord.Interaction,enabled:bool):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        await request(interaction,'consent',{'enabled':enabled})
        await interaction.followup.send('Preference saved. Delivery also requires an enabled worker and open DMs; this does not confirm a future delivery.',ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='status',description='Post the group-safe session card; no individual answers.')
async def status(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'view'))['state']
        await interaction.followup.send('Group card updated.',ephemeral=True)
        await client.post_card(interaction,s)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='challenge',description='Flag an ambiguous source or item. Your concern is shared; scoring pauses.')
async def challenge(interaction:discord.Interaction,reason:app_commands.Range[str,5,500]):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'challenge',{'reason':reason}))['state']
        await interaction.followup.send('Item review opened. Scoring is paused.',ephemeral=True)
        await interaction.channel.send(clip('**Item review requested:** '+safe(reason,500)))
        await client.post_card(interaction,s)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='review',description='Host: privately see the challenged item, its key and the source.')
async def review(interaction:discord.Interaction):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        r=(await request(interaction,'review'))['review']; it=r['item']
        text=(f"**Challenge:** {safe(r['challenge']['reason'],400)}\n**Item:** {safe(it['prompt'],600)}\n"
              +'\n'.join(f'{k}. {safe(v,150)}' for k,v in it['options'].items())
              +f"\n**Reviewed key:** {it['correct']}. {safe(it['explanation'],300)}\n**Source:** {safe(r['source']['source_text'],500)}"
              +"\nClassmates' private reasoning is not shown. Resolve with `/relay resolve`.")
        await interaction.followup.send(clip(text),ephemeral=True)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='resolve',description='Host: record a source review and resume or discard the item.')
@app_commands.choices(decision=[app_commands.Choice(name='Resume original item',value='resume'),app_commands.Choice(name='Discard and suppress scores',value='discard')])
async def resolve(interaction:discord.Interaction,decision:str,note:app_commands.Range[str,10,500]):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        s=(await request(interaction,'resolve',{'decision':decision,'note':note}))['state']
        await interaction.followup.send('Review decision recorded. A host review is not an instructor endorsement.',ephemeral=True)
        await interaction.channel.send(clip('**Item review: '+decision+'.** '+safe(note,500)))
        await client.post_card(interaction,s)
    except Exception as exc: await fail(interaction,exc)

@group.command(name='delete',description='Host: permanently delete this session and its stored responses.')
async def delete(interaction:discord.Interaction,confirm:bool):
    await interaction.response.defer(ephemeral=True,thinking=True)
    try:
        if not confirm: raise RelayFailure('Nothing deleted. Re-run with confirm:True to delete permanently.')
        out=await request(interaction,'delete')
        client.cards.pop(interaction.channel_id,None)
        await interaction.followup.send(out['notice'],ephemeral=True)
        await interaction.channel.send('This RELAY session was deleted by the host. Old buttons will no longer work.')
    except Exception as exc: await fail(interaction,exc)

client.tree.add_command(group)
if __name__=='__main__':
    token=os.getenv('DISCORD_BOT_TOKEN','')
    if not token or len(KEY)<32:
        raise SystemExit('Set DISCORD_BOT_TOKEN and a >=32-character RELAY_SERVICE_KEY in .env.')
    client.run(token)
