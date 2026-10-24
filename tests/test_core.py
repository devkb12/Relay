import json
from datetime import datetime,timezone
import pytest
from relay.core import Relay,RelayError
from relay.store import Store
from relay.bank import concept,public_question,CONCEPTS
from relay.scheduling import find_slots,parse_time,normalize,ics_event
from relay.automation import tick,RetryLater,DeliveryUnknown,DeliveryBlocked

BASE=datetime(2026,10,24,21,tzinfo=timezone.utc).timestamp()

@pytest.fixture
def setup(tmp_path):
    clock=[BASE]
    relay=Relay(Store(str(tmp_path/'test.sqlite3')),now=lambda:clock[0],secret='x'*40)
    a=relay.create('Rithik');sid=a['session_id']
    people=[a]+[relay.join(sid,n) for n in ('Dev','Sankalp','Kanha')]
    return relay,clock,sid,people

def go_to(relay,sid,people,target):
    host=people[0]['token']
    while relay.view(sid,host)['stage']!=target:
        stage=relay.view(sid,host)['stage']
        if stage in ('diagnostic','transfer'):
            q=concept('compound-change')[stage]
            for person in people:
                relay.answer(sid,person['token'],q['id'],'A' if stage=='diagnostic' else q['correct'],'confident')
        if stage=='discussion':relay.explain(sid,people[1]['token'],'Each percentage acts on the current amount.')
        relay.advance(sid,host,stage)

def set_availability(relay,sid,people):
    for p in people:
        relay.availability(sid,p['token'],[{'start':'2026-10-25T15:00:00-07:00','end':'2026-10-25T17:00:00-07:00'}])


def test_create_and_unauthorized(setup):
    r,clock,sid,p=setup
    assert r.view(sid,p[0]['token'])['is_host']
    with pytest.raises(RelayError):r.view(sid,'bad-token')

def test_not_host_cannot_advance(setup):
    r,c,s,p=setup
    with pytest.raises(RelayError):r.advance(s,p[1]['token'],'lobby')

def test_single_participant_cannot_start(tmp_path):
    r=Relay(Store(str(tmp_path/'t.db')));a=r.create('One')
    with pytest.raises(RelayError):r.advance(a['session_id'],a['token'],'lobby')

def test_answers_not_in_lobby(setup):
    r,c,s,p=setup
    with pytest.raises(RelayError):r.answer(s,p[0]['token'],'compound-d1','C')

def test_no_answer_key_projection(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    view=r.view(s,p[1]['token'])
    assert view['source'] is None
    assert set(view['question'])=={'id','prompt','options'}
    assert 'correct' not in json.dumps(view)

def test_locked_duplicate_is_idempotent(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    x=r.answer(s,p[1]['token'],'compound-d1','A','confident')
    y=r.answer(s,p[1]['token'],'compound-d1','A','confident')
    assert x['revision']==y['revision']
    with pytest.raises(RelayError):r.answer(s,p[1]['token'],'compound-d1','C','confident')

def test_wrong_question_rejected(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    with pytest.raises(RelayError):r.answer(s,p[1]['token'],'compound-t1','A')

@pytest.mark.parametrize('choice,confidence',[('X','confident'),('A','certain')])
def test_invalid_answer_schema(setup,choice,confidence):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    with pytest.raises(RelayError):r.answer(s,p[1]['token'],'compound-d1',choice,confidence)

def test_cannot_skip_missing_participant(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    r.answer(s,p[0]['token'],'compound-d1','C')
    with pytest.raises(RelayError):r.advance(s,p[0]['token'],'diagnostic')

def test_private_rationale_not_leaked(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    r.answer(s,p[1]['token'],'compound-d1','A','confident','PRIVATE EXPLANATION SECRET')
    assert 'SECRET' not in json.dumps(r.view(s,p[0]['token']))
    assert r.view(s,p[0]['token'])['my_answer'] is None

def test_roster_locks(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    with pytest.raises(RelayError):r.join(s,'Late')

def test_stale_stage_rejected(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    with pytest.raises(RelayError):r.advance(s,p[0]['token'],'lobby')

def test_no_volunteer_requires_explicit_fallback(setup):
    r,c,s,p=setup;go_to(r,s,p,'discussion')
    with pytest.raises(RelayError):r.advance(s,p[0]['token'],'discussion')
    r.explain(s,p[0]['token'],'',True)
    assert r.advance(s,p[0]['token'],'discussion')['stage']=='transfer'

def test_nonhost_cannot_mark_source_fallback(setup):
    r,c,s,p=setup;go_to(r,s,p,'discussion')
    with pytest.raises(RelayError):r.explain(s,p[1]['token'],'',True)

def test_high_confident_wrong_signal(setup):
    r,c,s,p=setup;go_to(r,s,p,'discussion')
    assert r.view(s,p[0]['token'])['discussion_signal']=='Check the shared assumption'
    assert r.view(s,p[0]['token'])['group'] is None

def test_fresh_question_different(setup):
    r,c,s,p=setup;go_to(r,s,p,'transfer')
    assert r.view(s,p[0]['token'])['question']['id']!='compound-d1'
    assert r.view(s,p[0]['token'])['source'] is None

def test_debrief_same_pair_counts_and_private_results(setup):
    r,c,s,p=setup;go_to(r,s,p,'debrief')
    view=r.view(s,p[0]['token'])
    assert view['group']['paired_responses']==4
    assert view['group']['initial_correct']==0
    assert view['group']['fresh_correct']==4
    assert set(view['my_results'])=={'diagnostic','transfer'}
    assert 'correct' not in json.dumps(view['members'])

def test_skips_not_counted_as_wrong(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    for a in p:r.answer(s,a['token'],'compound-d1','SKIP')
    r.advance(s,p[0]['token'],'diagnostic');r.explain(s,p[0]['token'],'',True);r.advance(s,p[0]['token'],'discussion')
    for a in p:r.answer(s,a['token'],'compound-t1','A')
    r.advance(s,p[0]['token'],'transfer')
    assert r.view(s,p[0]['token'])['group'] is None

def test_delayed_not_immediate(setup):
    r,c,s,p=setup;go_to(r,s,p,'debrief')
    with pytest.raises(RelayError):r.answer(s,p[0]['token'],'compound-r1','B')
    c[0]+=86401
    assert r.view(s,p[0]['token'])['question']['id']=='compound-r1'
    result=r.answer(s,p[0]['token'],'compound-r1','B')
    assert result['my_results']['retention']['correct']

def test_no_jobs_without_consent(setup):
    r,c,s,p=setup;go_to(r,s,p,'debrief')
    with r.store.connect() as db:assert db.execute('SELECT count(*) FROM jobs').fetchone()[0]==0

def test_followup_idempotent_and_revocation(setup):
    r,c,s,p=setup;r.consent(s,p[0]['token'],True);go_to(r,s,p,'debrief');r.consent(s,p[0]['token'],True)
    with r.store.connect() as db:assert db.execute('SELECT count(*) FROM jobs').fetchone()[0]==1
    r.consent(s,p[0]['token'],False)
    with r.store.connect() as db:assert db.execute('SELECT status FROM jobs').fetchone()[0]=='cancelled'

def test_schedule_missing_is_not_free(setup):
    r,c,s,p=setup
    with pytest.raises(ValueError):r.propose(s,p[0]['token'])

def test_schedule_approval_and_stale_version(setup):
    r,c,s,p=setup;set_availability(r,s,p)
    view=r.propose(s,p[0]['token'])['state'];version=view['plan_version']
    for a in p:r.approve(s,a['token'],version)
    assert r.view(s,p[0]['token'])['schedule_confirmed']
    assert 'BEGIN:VCALENDAR' in r.calendar_file(s,p[0]['token'])
    r.availability(s,p[1]['token'],[{'start':'2026-10-25T16:00:00-07:00','end':'2026-10-25T17:00:00-07:00'}])
    assert not r.view(s,p[0]['token'])['schedule_confirmed']
    with pytest.raises(RelayError):r.approve(s,p[0]['token'],version)

def test_calendar_not_before_all_approve(setup):
    r,c,s,p=setup;set_availability(r,s,p);r.propose(s,p[0]['token'])
    with pytest.raises(RelayError):r.calendar_file(s,p[0]['token'])

def test_join_invalidates_schedule(setup):
    r,c,s,p=setup;set_availability(r,s,p);r.propose(s,p[0]['token']);r.join(s,'New')
    assert r.view(s,p[0]['token'])['plan'] is None

def test_schedule_no_overlap(setup):
    r,c,s,p=setup;set_availability(r,s,p)
    r.availability(s,p[1]['token'],[{'start':'2026-10-26T15:00:00-07:00','end':'2026-10-26T17:00:00-07:00'}])
    assert r.propose(s,p[0]['token'])['options']==[]

def test_model_context_minimizes_data(setup):
    r,c,s,p=setup;go_to(r,s,p,'discussion');context,rev=r.model_context(s,p[0]['token'])
    text=json.dumps(context)
    assert 'Rithik' not in text and 'token' not in text and 'rationale' not in text

def test_model_stale_result_rejected(setup):
    r,c,s,p=setup;go_to(r,s,p,'discussion');context,rev=r.model_context(s,p[0]['token'])
    r.explain(s,p[1]['token'],'Try multiplying the factors.')
    with pytest.raises(RelayError):r.save_facilitation(s,p[0]['token'],{'discussion_question':'Question'},rev)

def test_persistence(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby')
    another=Relay(Store(r.store.path))
    assert another.view(s,p[1]['token'])['stage']=='diagnostic'

def test_delete_cascades_jobs(setup):
    r,c,s,p=setup;r.consent(s,p[0]['token'],True);go_to(r,s,p,'debrief');r.delete(s,p[0]['token'])
    with pytest.raises(KeyError):r.view(s,p[0]['token'])
    with r.store.connect() as db:assert db.execute('SELECT count(*) FROM jobs').fetchone()[0]==0

@pytest.mark.parametrize('value',['2026-10-25T15:00:00','nonsense'])
def test_naive_time_rejected(value):
    with pytest.raises(ValueError):parse_time(value)

def test_cross_timezone_equivalence():
    assert parse_time('2026-10-25T15:00:00-07:00')==parse_time('2026-10-25T22:00:00Z')

def test_merge_overlapping_availability():
    windows=[{'start':'2026-10-25T10:00Z','end':'2026-10-25T11:00Z'},{'start':'2026-10-25T10:30Z','end':'2026-10-25T12:00Z'}]
    assert len(normalize(windows))==1

def test_shorter_requires_label():
    a={'a':[{'start':'2026-10-25T10:00Z','end':'2026-10-25T10:45Z'}],'b':[{'start':'2026-10-25T10:00Z','end':'2026-10-25T11:00Z'}]}
    options=find_slots(a,[60,45,30]);assert options[0]['minutes']==45 and options[0]['shorter_alternative']

@pytest.mark.parametrize('identifier',list(CONCEPTS))
def test_bank_questions_distinct_and_schema(identifier):
    c=concept(identifier)
    assert len({c[p]['id'] for p in ('diagnostic','transfer','retention')})==3
    for phase in ('diagnostic','transfer','retention'):
        q=c[phase];assert q['correct'] in q['options'];assert 'correct' not in public_question(q)

def test_demo_arithmetic_keys():
    assert 100*1.5*.5==75
    assert 200*1.25*.8==200
    assert 80*.75*1.5==90
    assert 90/(90+90)==.5
    assert 120/(120+40)==.75
    assert round(100*40/(40+45),1)==47.1


def make_due_job(r,c,s,p):
    r.consent(s,p[0]['token'],True);go_to(r,s,p,'debrief');c[0]+=86401

def test_dry_run_does_not_send(setup):
    r,c,s,p=setup;make_due_job(r,c,s,p)
    out=tick(r.store,lambda *_:(_ for _ in ()).throw(AssertionError()),now=c[0],dry_run=True)
    assert out['due_jobs']==1 and out['sent']==0

def test_delivery_once(setup):
    r,c,s,p=setup;make_due_job(r,c,s,p);sent=[]
    sender=lambda uid,text:sent.append(text) or 'message-1'
    assert tick(r.store,sender,now=c[0],dry_run=False)['sent']==1
    assert tick(r.store,sender,now=c[0],dry_run=False)['sent']==0
    assert len(sent)==1

def test_unknown_delivery_not_resent(setup):
    r,c,s,p=setup;make_due_job(r,c,s,p)
    def send(*_):raise DeliveryUnknown('timeout')
    assert tick(r.store,send,now=c[0],dry_run=False)['unknown']==1
    assert tick(r.store,send,now=c[0]+1000,dry_run=False)['claimed']==0

def test_rate_limit_retry_after(setup):
    r,c,s,p=setup;make_due_job(r,c,s,p)
    def send(*_):raise RetryLater(75)
    assert tick(r.store,send,now=c[0],dry_run=False)['retry']==1
    assert tick(r.store,send,now=c[0]+30,dry_run=False)['claimed']==0

def test_revoked_consent_not_sent(setup):
    r,c,s,p=setup;make_due_job(r,c,s,p);r.consent(s,p[0]['token'],False)
    assert tick(r.store,lambda *_:'bad',now=c[0],dry_run=False)['sent']==0

def test_pack_snapshot_survives_bank_edit(setup):
    r,c,s,p=setup
    before=r.view(s,p[0]['token'])['pack_hash']
    original=CONCEPTS['compound-change']['diagnostic']['correct']
    try:
        CONCEPTS['compound-change']['diagnostic']['correct']='A'
        go_to(r,s,p,'debrief')
        assert r.view(s,p[0]['token'])['group']['initial_correct']==0
        assert r.view(s,p[0]['token'])['pack_hash']==before
    finally:CONCEPTS['compound-change']['diagnostic']['correct']=original

def test_opt_back_in_revives_cancelled_not_sent(setup):
    r,c,s,p=setup;r.consent(s,p[0]['token'],True);go_to(r,s,p,'debrief')
    r.consent(s,p[0]['token'],False);r.consent(s,p[0]['token'],True)
    with r.store.connect() as db:
        rows=db.execute('SELECT status FROM jobs').fetchall()
        assert len(rows)==1 and rows[0][0]=='pending'

def test_challenge_pauses_grading(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby');r.challenge(s,p[1]['token'],'The wording may be ambiguous.')
    with pytest.raises(RelayError):r.answer(s,p[2]['token'],'compound-d1','A')
    with pytest.raises(RelayError):r.advance(s,p[0]['token'],'diagnostic')
    assert r.view(s,p[1]['token'])['source'] is not None

def test_challenge_only_host_resolves(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby');r.challenge(s,p[1]['token'],'Please inspect this source.')
    with pytest.raises(RelayError):r.resolve_challenge(s,p[1]['token'],'resume','Checked the source manually.')

def test_discard_suppresses_scores_and_followup(setup):
    r,c,s,p=setup;r.consent(s,p[0]['token'],True);go_to(r,s,p,'transfer');r.challenge(s,p[1]['token'],'This item is ambiguous.')
    result=r.resolve_challenge(s,p[0]['token'],'discard','The item needs a new review before use.')
    assert result['stage']=='debrief' and result['invalidated'] and result['group'] is None
    c[0]+=86401
    assert r.view(s,p[0]['token'])['question'] is None

def test_resume_keeps_original_key(setup):
    r,c,s,p=setup;r.advance(s,p[0]['token'],'lobby');r.challenge(s,p[1]['token'],'Please check the percentage base.')
    r.resolve_challenge(s,p[0]['token'],'resume','Reviewed both multipliers against the original source.')
    assert r.answer(s,p[0]['token'],'compound-d1','C')['my_answer']['choice']=='C'

def test_live_hint_is_blocked_during_source_review(setup):
    r,c,s,p=setup;go_to(r,s,p,'discussion')
    r.challenge(s,p[1]['token'],'The question seems ambiguous about the reference amount.')
    with pytest.raises(RelayError):r.model_context(s,p[0]['token'])
