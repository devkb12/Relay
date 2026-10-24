"""P0 backend boundaries: Discord binding, privacy, outcomes, concurrency, auth, scheduling, jobs."""
import asyncio, json, threading, time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from relay.api import make_app
from relay.core import Relay, RelayError
from relay.store import Store, SchemaOutdated
from relay.bank import concept
from relay.automation import tick, reconcile, list_jobs
from relay import model

KEY='test-key-'+'x'*40
H={'X-Relay-Key':KEY}
C=concept('compound-change')

def env(monkeypatch,**extra):
    for k in ('RELAY_ENV','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','RELAY_OAUTH_REDIRECT_URI','RELAY_FRONTEND_URL','RELAY_ALLOWED_ORIGINS'):
        monkeypatch.delenv(k,raising=False)
    monkeypatch.setenv('RELAY_SERVICE_KEY',KEY)
    monkeypatch.setenv('RELAY_PUBLIC_DEMO','false')
    monkeypatch.setenv('RELAY_MODEL_PROVIDER','none')
    monkeypatch.setenv('RELAY_DELIVERY_ENABLED','false')
    for k,v in extra.items(): monkeypatch.setenv(k,v)

@pytest.fixture
def api(tmp_path,monkeypatch):
    env(monkeypatch)
    return TestClient(make_app(str(tmp_path/'p0.sqlite3')))

class Bot:
    """Drives /internal/discord exactly as relay/bot.py does."""
    def __init__(self,client,channel='10:20'): self.c,self.channel=client,channel
    def __call__(self,user,action,data=None,session_id=None,status=200):
        body={'channel':self.channel,'user_id':str(user),'name':f'User{user}','action':action,'data':data or {}}
        if session_id: body['session_id']=session_id
        r=self.c.post('/internal/discord',headers=H,json=body)
        assert r.status_code==status,(r.status_code,r.text)
        return r.json()

USERS=(101,102,103,104)

def run_cycle(bot,users=USERS,diag=None,fresh=None,until='debrief'):
    s=bot(users[0],'create')['state']; sid=s['id']
    for u in users[1:]: bot(u,'join')
    bot(users[0],'advance',{'expected_stage':'lobby'})
    for i,u in enumerate(users):
        bot(u,'answer',{'question_id':C['diagnostic']['id'],'choice':(diag or {}).get(u,'A'),'confidence':'confident','rationale':f'private reasoning {u}'},session_id=sid)
    bot(users[0],'advance',{'expected_stage':'diagnostic'})
    if until=='discussion': return sid
    bot(users[1],'explain',{'text':'Each percentage applies to the updated amount.'})
    bot(users[0],'advance',{'expected_stage':'discussion'})
    if until=='transfer': return sid
    for u in users:
        bot(u,'answer',{'question_id':C['transfer']['id'],'choice':(fresh or {}).get(u,C['transfer']['correct']),'confidence':'somewhat'},session_id=sid)
    bot(users[0],'advance',{'expected_stage':'transfer'})
    return sid

# ---------- Discord learning cycle, privacy, outcomes ----------

def test_four_member_discord_cycle_keeps_answers_private(api):
    bot=Bot(api); sid=run_cycle(bot)
    host=bot(101,'view')['state']; other=bot(102,'view')['state']
    assert host['stage']=='debrief' and host['group']['paired_responses']==4
    text=json.dumps(other)
    assert 'private reasoning' not in text and 'rationale' not in text and 'confidence' not in text
    assert set(other['my_results'])=={'diagnostic','transfer'}
    assert other['my_results']['diagnostic']['status']=='incorrect' and other['my_results']['transfer']['status']=='correct'
    assert all('choice' not in m for m in other['members'])

def test_incorrect_skipped_missing_and_withdrawn_are_distinct(api):
    bot=Bot(api)
    s=bot(101,'create')['state']; sid=s['id']
    for u in (102,103,104,105): bot(u,'join')
    bot(105,'leave')  # withdrawn in lobby
    bot(101,'advance',{'expected_stage':'lobby'})
    bot(101,'answer',{'question_id':C['diagnostic']['id'],'choice':'A'},session_id=sid)
    bot(102,'answer',{'question_id':C['diagnostic']['id'],'choice':'SKIP'},session_id=sid)
    bot(103,'answer',{'question_id':C['diagnostic']['id'],'choice':C['diagnostic']['correct']},session_id=sid)
    # 104 never answers: waiting blocks, explicit close records missing, not incorrect.
    bot(101,'advance',{'expected_stage':'diagnostic'},status=409)
    st=bot(101,'advance',{'expected_stage':'diagnostic','nonresponders':'mark_missing'})['state']
    assert st['stage']=='discussion'
    states={m['name']:m['state'] for m in st['members']}
    assert states['User105']=='withdrawn'
    bot(102,'explain',{'text':'The second change uses the new base value.'})
    bot(101,'advance',{'expected_stage':'discussion'})
    for u in (101,102,103,104): bot(u,'answer',{'question_id':C['transfer']['id'],'choice':C['transfer']['correct']},session_id=sid)
    bot(101,'advance',{'expected_stage':'transfer'})
    r={u:bot(u,'view')['state']['my_results']['diagnostic']['status'] for u in (101,102,103,104)}
    assert r=={101:'incorrect',102:'skipped',103:'correct',104:'missing'}
    gone=bot(105,'view')['state']  # withdrawn: only a minimal "you left" state
    assert gone['me']['withdrawn'] and gone['members']==[] and gone['my_results']=={}
    bot(105,'answer',{'question_id':C['transfer']['id'],'choice':'A'},session_id=sid,status=403)
    assert bot(101,'view')['state']['group'] is None  # only 2 paired non-skipped responders

def test_withdrawal_deletes_responses_and_host_cannot_leave(api):
    bot=Bot(api); sid=run_cycle(bot,until='discussion')
    bot(101,'leave',status=409)
    out=bot(103,'leave')
    assert 'not retracted' in out['notice']
    with api.app.state.core.store.connect() as db:
        s=api.app.state.core.store.load(db,sid)
    m=s['members']['discord:103']
    assert m['withdrawn_at'] and m['availability']==[] and 'discord:103' not in s['answers']['diagnostic']

def test_identical_retry_is_idempotent_and_changed_retry_conflicts(api):
    bot=Bot(api); s=bot(101,'create')['state']; sid=s['id']; bot(102,'join')
    bot(101,'advance',{'expected_stage':'lobby'})
    a={'question_id':C['diagnostic']['id'],'choice':'B','confidence':'unsure','rationale':'r'}
    first=bot(102,'answer',a,session_id=sid)['state']
    again=bot(102,'answer',a,session_id=sid)['state']
    assert first['revision']==again['revision']
    bot(102,'answer',{**a,'choice':'C'},session_id=sid,status=409)

def test_explanation_retry_not_duplicated_and_trivial_text_rejected(api):
    bot=Bot(api); run_cycle(bot,until='discussion')
    bot(102,'explain',{'text':'ok'},status=400)
    for _ in range(2): bot(102,'explain',{'text':'The base changes after the first step.'})
    assert len(bot(101,'view')['state']['explanations'])==1

# ---------- Stale Discord controls ----------

def test_old_button_cannot_act_on_newer_session_in_same_channel(api):
    bot=Bot(api)
    old=run_cycle(bot)                       # session A finished in this channel
    new=bot(101,'create')['state']['id']     # session B, same channel, same question ids
    bot(102,'join'); bot(101,'advance',{'expected_stage':'lobby'})
    # A's answer button (bound to A) must not write into B even though question ids repeat.
    bot(102,'answer',{'question_id':C['diagnostic']['id'],'choice':'B'},session_id=old,status=409)
    assert bot(102,'view')['state']['my_answer'] is None
    # A deleted session id or a session from another channel is refused as stale.
    bot(101,'delete',session_id=new)
    bot(102,'answer',{'question_id':C['diagnostic']['id'],'choice':'B'},session_id=new,status=410)
    other=Bot(api,channel='99:99'); x=other(201,'create')['state']['id']
    bot(101,'view',session_id=x,status=410)

def test_old_approval_button_rejected_after_plan_change(api):
    bot=Bot(api); sid=bot(101,'create')['state']['id']; bot(102,'join')
    start='2026-12-01T15:00:00-07:00'; end='2026-12-01T17:00:00-07:00'
    for u in (101,102): bot(u,'availability',{'windows':[{'start':start,'end':end}]})
    v1=bot(101,'propose',{'durations':[60]})['state']['plan_version']
    bot(102,'availability',{'windows':[{'start':start,'end':'2026-12-01T16:30:00-07:00'}]})
    v2=bot(101,'propose',{'durations':[60]})['state']['plan_version']
    bot(101,'approve',{'version':v1},session_id=sid,status=409)
    assert bot(101,'approve',{'version':v2},session_id=sid)['state']['approved_by_me']

# ---------- Concurrency ----------

def test_concurrent_answers_are_not_lost(tmp_path):
    core=Relay(Store(str(tmp_path/'c.sqlite3')),secret='x'*40)
    host=core.create('H'); sid=host['session_id']
    people=[host]+[core.join(sid,f'P{i}') for i in range(6)]
    core.advance(sid,host['token'],'lobby')
    errors=[]
    def go(p):
        try: core.answer(sid,p['token'],C['diagnostic']['id'],'A')
        except Exception as e: errors.append(e)
    threads=[threading.Thread(target=go,args=(p,)) for p in people]
    [t.start() for t in threads]; [t.join() for t in threads]
    assert not errors
    assert sum(m['responded'] for m in core.view(sid,host['token'])['members'])==7

def test_concurrent_advance_moves_exactly_once(tmp_path):
    core=Relay(Store(str(tmp_path/'c.sqlite3')),secret='x'*40)
    host=core.create('H'); sid=host['session_id']; core.join(sid,'P')
    results=[]
    def go():
        try: core.advance(sid,host['token'],'lobby'); results.append('ok')
        except RelayError as e: results.append(e.status)
    threads=[threading.Thread(target=go) for _ in range(5)]
    [t.start() for t in threads]; [t.join() for t in threads]
    assert results.count('ok')==1 and results.count(409)==4
    assert core.view(sid,host['token'])['stage']=='diagnostic'

def test_late_model_response_cannot_overwrite_challenged_session(api):
    bot=Bot(api); sid=run_cycle(bot,until='discussion')
    core=api.app.state.core; tok=core.discord_token(sid,'discord:101')
    context,revision=core.model_context(sid,tok)
    bot(103,'challenge',{'reason':'The source wording looks ambiguous.'})
    with pytest.raises(RelayError) as e:
        core.save_facilitation(sid,tok,{'discussion_question':'late','mode':'live'},revision)
    assert e.value.status==409 and bot(101,'view')['state']['paused']

def test_challenge_concurrent_with_answer_never_scores_paused_item(tmp_path):
    core=Relay(Store(str(tmp_path/'c.sqlite3')),secret='x'*40)
    host=core.create('H'); sid=host['session_id']; p=[core.join(sid,f'P{i}') for i in range(4)]
    core.advance(sid,host['token'],'lobby')
    out=[]
    def ans(x):
        try: core.answer(sid,x['token'],C['diagnostic']['id'],'A'); out.append('a')
        except RelayError: out.append('rejected')
    t=[threading.Thread(target=ans,args=(x,)) for x in p]+[threading.Thread(target=lambda:core.challenge(sid,host['token'],'Check this item please.'))]
    [x.start() for x in t]; [x.join() for x in t]
    with core.store.connect() as db: s=core.store.load(db,sid)
    # Every accepted answer was committed before the challenge; none after it.
    assert len(s['answers']['diagnostic'])==out.count('a') and s['challenge']['pending']

# ---------- Challenge review ----------

def test_review_packet_hides_private_reasoning_and_stale_resolution(api):
    bot=Bot(api); sid=run_cycle(bot,until='discussion')
    bot(101,'review',status=409)  # no open review
    st=bot(103,'challenge',{'reason':'Is the base really the updated value?'})['state']
    bot(102,'review',status=403)
    r=bot(101,'review')['review']
    assert r['item']['correct']==C['diagnostic']['correct'] and 'private reasoning' not in json.dumps(r)
    bot(101,'resolve',{'decision':'resume','note':'Checked the teaching note.','challenge_id':'deadbeef'},status=409)
    bot(101,'resolve',{'decision':'resume','note':'Checked the teaching note.','challenge_id':st['challenge']['id']})
    bot(101,'resolve',{'decision':'resume','note':'Checked the teaching note.','challenge_id':st['challenge']['id']},status=409)

# ---------- Scheduling ----------

def test_shorter_proposal_needs_explicit_confirmation(api):
    bot=Bot(api); sid=bot(101,'create')['state']['id']; bot(102,'join')
    for u in (101,102): bot(u,'availability',{'windows':[{'start':'2026-12-01T15:00:00-07:00','end':'2026-12-01T15:45:00-07:00'}]})
    st=bot(101,'propose',{'durations':[60,45]})['state']
    assert st['plan']['shorter_alternative'] and st['plan']['minutes']==45
    bot(101,'approve',{'version':st['plan_version']},session_id=sid,status=409)
    bot(101,'approve',{'version':st['plan_version'],'accept_shorter':True},session_id=sid)

def test_membership_change_requires_new_proposal(api):
    bot=Bot(api); sid=bot(101,'create')['state']['id']; bot(102,'join')
    w={'windows':[{'start':'2026-12-01T15:00:00-07:00','end':'2026-12-01T17:00:00-07:00'}],'timezone':'America/New_York'}
    for u in (101,102): bot(u,'availability',w)
    st=bot(101,'propose',{'durations':[60]})['state']
    assert 'EST' in st['plan']['start_local'] or 'EDT' in st['plan']['start_local']
    bot(103,'join')  # invalidates
    st=bot(101,'view')['state']
    assert st['plan'] is None and not st['schedule_confirmed']
    bot(101,'propose',{'durations':[60]},status=400)  # 103 has no availability: unknown is not free

def test_cancelled_plan_stays_visible_and_bad_inputs_rejected(api):
    bot=Bot(api); sid=bot(101,'create')['state']['id']; bot(102,'join')
    bot(101,'availability',{'windows':[{'start':'2020-01-01T10:00:00Z','end':'2020-01-01T11:00:00Z'}]},status=400)
    bot(101,'availability',{'windows':[{'start':'2026-12-01T10:00:00','end':'2026-12-01T11:00:00'}]},status=400)
    bot(101,'availability',{'windows':[{'start':'2026-12-01T10:00:00Z','end':'2026-12-01T11:00:00Z'}],'timezone':'Mars/Olympus'},status=400)
    for u in (101,102): bot(u,'availability',{'windows':[{'start':'2026-12-01T17:00:00Z','end':'2026-12-01T19:00:00Z'}]})
    bot(101,'propose',{'durations':[60]})
    bot(102,'cancel_plan',status=403)
    st=bot(101,'cancel_plan')['state']
    assert st['plan'] is None and st['plan_cancelled']['start']=='2026-12-01T17:00:00Z'

# ---------- Jobs ----------

def due_job(tmp_path):
    clock=[1_800_000_000.0]
    core=Relay(Store(str(tmp_path/'j.sqlite3')),now=lambda:clock[0],secret='x'*40)
    h=core.create('H'); sid=h['session_id']; p=core.join(sid,'P')
    core.consent(sid,h['token'],True); core.advance(sid,h['token'],'lobby')
    for t in (h,p): core.answer(sid,t['token'],C['diagnostic']['id'],'A')
    core.advance(sid,h['token'],'diagnostic'); core.explain(sid,p['token'],'The base value changes after the first step.')
    core.advance(sid,h['token'],'discussion')
    for t in (h,p): core.answer(sid,t['token'],C['transfer']['id'],'A')
    core.advance(sid,h['token'],'transfer'); clock[0]+=86401
    return core,clock,sid,h,p

def test_concurrent_ticks_send_once(tmp_path):
    core,clock,*_=due_job(tmp_path); sent=[]
    def slow(uid,text): time.sleep(0.2); sent.append(text); return 'm1'
    outs=[]
    t=[threading.Thread(target=lambda:outs.append(tick(core.store,slow,now=clock[0],dry_run=False))) for _ in range(4)]
    [x.start() for x in t]; [x.join() for x in t]
    assert len(sent)==1 and sum(o['claimed'] for o in outs)==1

def test_ambiguous_job_inspection_and_reconcile(tmp_path):
    core,clock,*_=due_job(tmp_path)
    from relay.automation import DeliveryUnknown
    def boom(*_): raise DeliveryUnknown('timeout after send')
    assert tick(core.store,boom,now=clock[0],dry_run=False)['unknown']==1
    [job]=list_jobs(core.store,'unknown')
    assert job['kind']=='retention'
    reconcile(core.store,job['id'],'sent','Saw the DM in Discord.')
    with pytest.raises(RelayError): reconcile(core.store,job['id'],'sent','again')
    assert tick(core.store,lambda *_:'x',now=clock[0]+10,dry_run=False)['claimed']==0

def test_withdrawal_and_deletion_cancel_jobs(tmp_path):
    core,clock,sid,h,p=due_job(tmp_path)
    core.consent(sid,p['token'],True)
    core.withdraw(sid,p['token'])
    with core.store.connect() as db:
        rows={r['member_id']:r['status'] for r in db.execute('SELECT member_id,status FROM jobs').fetchall()}
    assert rows[p['member_id']]=='cancelled' and rows[h['member_id']]=='pending'
    core.delete(sid,h['token'])
    with core.store.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]==0

def test_retry_after_header_respected():
    from relay.automation import _retry_after
    class R:
        headers={'retry-after':'7.5'}
        def json(self): return {}
    assert _retry_after(R())==7.5

def test_retention_purge(tmp_path):
    clock=[1_800_000_000.0]
    core=Relay(Store(str(tmp_path/'r.sqlite3')),now=lambda:clock[0],secret='x'*40)
    old=core.create('Old')['session_id']; clock[0]+=40*86400
    new=core.create('New')
    assert core.purge_expired(30)==1
    with core.store.connect() as db:
        ids={r[0] for r in db.execute('SELECT id FROM sessions').fetchall()}
    assert ids=={new['session_id']}

# ---------- Key leakage ----------

def test_answer_keys_absent_from_views_presentation_and_model_context(api,monkeypatch):
    monkeypatch.setenv('RELAY_PUBLIC_DEMO','true')
    bot=Bot(api); sid=run_cycle(bot,until='transfer')
    core=api.app.state.core; tok=core.discord_token(sid,'discord:102')
    v=core.view(sid,tok)
    assert 'correct' not in v['question'] and 'explanation' not in v['question']
    assert C['transfer']['explanation'] not in json.dumps(v)
    # Model context never contains the fresh/delayed items or the option letter of the key.
    sid2=run_cycle(Bot(api,channel='5:5'),until='discussion')
    ctx,_=core.model_context(sid2,core.discord_token(sid2,'discord:101'))
    blob=json.dumps(ctx)
    assert C['transfer']['prompt'] not in blob and C['retention']['prompt'] not in blob
    assert isinstance(ctx['candidate_misconceptions'],list) and 'correct' not in blob

def test_presentation_view_has_no_private_fields(api,monkeypatch):
    monkeypatch.setenv('RELAY_PUBLIC_DEMO','true')
    host=api.post('/api/sessions',json={'name':'H'}).json(); sid=host['session_id']
    api.post(f'/api/sessions/{sid}/join',json={'name':'P'})
    r=api.get(f'/api/sessions/{sid}/presentation',headers={'Authorization':'Bearer '+host['token']}).json()
    assert r['view']=='presentation'
    assert not {'me','my_answer','my_results','is_host','approved_by_me'} & set(r)

def test_checked_in_fixtures_leak_no_keys_tokens_or_private_fields():
    root=Path(__file__).resolve().parents[1]/'contracts'/'fixtures'
    for path in root.glob('*.json'):
        data=json.loads(path.read_text()); text=path.read_text()
        assert 'token_hash' not in text and 'rationale' not in text and 'discord:' not in text, path.name
        if isinstance(data,dict) and data.get('question'):
            assert set(data['question'])=={'id','prompt','options'}, path.name
        if path.name.startswith('presentation'):
            assert not {'me','my_answer','my_results'} & set(data), path.name

# ---------- Production config, startup without frontend, readiness ----------

def test_production_refuses_demo_and_short_key(tmp_path,monkeypatch):
    env(monkeypatch,RELAY_ENV='production',RELAY_PUBLIC_DEMO='true')
    with pytest.raises(RuntimeError,match='PUBLIC_DEMO'): make_app(str(tmp_path/'a.sqlite3'))
    env(monkeypatch,RELAY_ENV='production',RELAY_SERVICE_KEY='short')
    with pytest.raises(RuntimeError,match='SERVICE_KEY'): make_app(str(tmp_path/'a.sqlite3'))

def test_production_requires_explicit_migration(tmp_path,monkeypatch):
    env(monkeypatch,RELAY_ENV='production')
    with pytest.raises(SchemaOutdated): make_app(str(tmp_path/'fresh.sqlite3'))
    Store(str(tmp_path/'fresh.sqlite3')).migrate()
    c=TestClient(make_app(str(tmp_path/'fresh.sqlite3')))
    assert c.get('/ready').json()=={'ready':True}
    assert c.post('/api/sessions',json={'name':'x'}).status_code==403

def test_production_oauth_config_must_be_https(tmp_path,monkeypatch):
    env(monkeypatch,RELAY_ENV='production',DISCORD_CLIENT_ID='1',DISCORD_CLIENT_SECRET='s',
        RELAY_OAUTH_REDIRECT_URI='http://insecure/cb',RELAY_FRONTEND_URL='https://app.example',RELAY_ALLOWED_ORIGINS='https://app.example')
    Store(str(tmp_path/'o.sqlite3')).migrate()
    with pytest.raises(RuntimeError,match='https'): make_app(str(tmp_path/'o.sqlite3'))

def test_api_starts_without_frontend_files(tmp_path,monkeypatch):
    env(monkeypatch,RELAY_SERVE_WEB='false')
    c=TestClient(make_app(str(tmp_path/'n.sqlite3')))
    assert c.get('/').json()['service']=='RELAY API'
    assert c.get('/static/app.js').status_code==404
    assert c.get('/health').json()['ok'] and c.get('/ready').status_code==200
    r=c.get('/api/concepts')
    assert r.headers['cache-control']=='no-store' and len(r.headers['x-request-id'])>=8

def test_errors_carry_request_id(api):
    r=api.get('/api/sessions/nope',headers={'X-Request-ID':'trace-12345678'})
    assert r.status_code==401 and r.json()['request_id']=='trace-12345678'

def test_bearer_tokens_rejected_when_demo_disabled(api):
    r=api.get('/api/sessions/abc',headers={'Authorization':'Bearer anything'})
    assert r.status_code==401

def test_migrations_upgrade_a_starter_database(tmp_path):
    import sqlite3
    path=tmp_path/'starter.sqlite3'
    db=sqlite3.connect(path)
    db.executescript("CREATE TABLE sessions(id TEXT PRIMARY KEY, body TEXT NOT NULL);")
    db.execute('INSERT INTO sessions VALUES(?,?)',('old1',json.dumps({'id':'old1','channel':'1:2','created_at':5,'members':{'discord:9':{}}})))
    db.commit(); db.close()
    store=Store(str(path))
    assert store.by_channel('1:2')['id']=='old1' and store.for_member('discord:9')[0]['id']=='old1'

# ---------- Model bounds ----------

def test_model_rejects_answer_choice_reference(monkeypatch):
    ctx={'source_id':'s','source_text':'Each percentage operates on the current amount.','reviewed_hint':'h'}
    good={'possible_misconception':'Maybe the base is reused.','discussion_question':'Which amount does the second change use?',
          'source_id':'s','evidence_quote':'Each percentage operates','needs_review':False}
    assert model.validate_output(json.dumps(good),ctx)
    with pytest.raises(model.ModelRejected,match='answer choice'):
        model.validate_output(json.dumps({**good,'discussion_question':'Why is option C right?'}),ctx)

def test_model_retries_once_then_falls_back_with_reason(monkeypatch):
    calls=[]
    class Resp:
        status_code=503
        def json(self): return {}
    class Client:
        def __init__(self,**k): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*a): pass
        async def post(self,*a,**k): calls.append(1); return Resp()
    async def nosleep(*_): pass
    monkeypatch.setattr(model.httpx,'AsyncClient',Client); monkeypatch.setattr(model.asyncio,'sleep',nosleep)
    monkeypatch.setenv('RELAY_MODEL_PROVIDER','gemini'); monkeypatch.setenv('GEMINI_API_KEY','k'); monkeypatch.setenv('RELAY_MODEL','m-1')
    with pytest.raises(RuntimeError): asyncio.run(model.facilitate({'reviewed_hint':'h','source_id':'s','source_text':'t'}))
    assert len(calls)==2
    fb=model.fallback_payload({'reviewed_hint':'h'},model.ModelRejected('model cited unsupported evidence'))
    assert fb['feedback_source']=='reviewed_fallback' and 'unsupported' in fb['fallback_reason']
