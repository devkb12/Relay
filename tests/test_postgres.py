"""PostgreSQL mode. Skipped unless RELAY_TEST_POSTGRES_URL points at a disposable database, e.g.
docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=relay postgres:16
RELAY_TEST_POSTGRES_URL=postgresql://postgres:relay@127.0.0.1:55432/postgres"""
import os, threading, time
import pytest
from relay.store import Store
from relay.core import Relay, RelayError
from relay.bank import concept
from relay.automation import tick

URL=os.getenv('RELAY_TEST_POSTGRES_URL','')
pytestmark=pytest.mark.skipif(not URL,reason='RELAY_TEST_POSTGRES_URL not set; PostgreSQL mode not exercised')
C=concept('compound-change')

@pytest.fixture
def core():
    import psycopg
    with psycopg.connect(URL,autocommit=True) as db:
        db.execute('DROP SCHEMA public CASCADE'); db.execute('CREATE SCHEMA public')
    clock=[1_800_000_000.0]
    r=Relay(Store(URL),now=lambda:clock[0],secret='x'*40); r.clock=clock
    return r

def test_migrations_idempotent(core):
    assert core.store.backend=='postgres' and core.store.migrate()==[]
    assert core.store.schema_version()>=4 and core.store.ping()

def test_full_cycle_on_postgres(core):
    h=core.create('H',discord_id='1',channel='a:b'); sid=h['session_id']
    p=core.join(sid,'P',discord_id='2'); q=core.join(sid,'Q',discord_id='3')
    core.advance(sid,h['token'],'lobby')
    for t in (h,p,q): core.answer(sid,t['token'],C['diagnostic']['id'],'A')
    core.advance(sid,h['token'],'diagnostic'); core.explain(sid,p['token'],'The base changes after the first step.')
    core.advance(sid,h['token'],'discussion')
    for t in (h,p,q): core.answer(sid,t['token'],C['transfer']['id'],C['transfer']['correct'])
    v=core.advance(sid,h['token'],'transfer')
    assert v['group']['paired_responses']==3 and v['group']['fresh_correct']==3
    assert core.store.by_channel('a:b')['id']==sid and core.store.for_member('discord:2')[0]['id']==sid

def test_concurrent_answers_and_single_advance_on_postgres(core):
    h=core.create('H'); sid=h['session_id']; people=[h]+[core.join(sid,f'P{i}') for i in range(6)]
    out=[]
    def adv():
        try: core.advance(sid,h['token'],'lobby'); out.append('ok')
        except RelayError as e: out.append(e.status)
    t=[threading.Thread(target=adv) for _ in range(4)]; [x.start() for x in t]; [x.join() for x in t]
    assert out.count('ok')==1
    errs=[]
    def ans(p):
        try: core.answer(sid,p['token'],C['diagnostic']['id'],'B')
        except Exception as e: errs.append(e)
    t=[threading.Thread(target=ans,args=(p,)) for p in people]; [x.start() for x in t]; [x.join() for x in t]
    assert not errs and all(m['responded'] for m in core.view(sid,h['token'])['members'])

def test_concurrent_ticks_send_once_on_postgres(core):
    h=core.create('H'); sid=h['session_id']; p=core.join(sid,'P')
    core.consent(sid,h['token'],True); core.advance(sid,h['token'],'lobby')
    for t in (h,p): core.answer(sid,t['token'],C['diagnostic']['id'],'A')
    core.advance(sid,h['token'],'diagnostic'); core.explain(sid,p['token'],'The base changes after the first step.')
    core.advance(sid,h['token'],'discussion')
    for t in (h,p): core.answer(sid,t['token'],C['transfer']['id'],'A')
    core.advance(sid,h['token'],'transfer'); core.clock[0]+=86401
    sent=[]
    def slow(uid,text): time.sleep(0.2); sent.append(1); return 'm'
    outs=[]
    t=[threading.Thread(target=lambda:outs.append(tick(core.store,slow,now=core.clock[0],dry_run=False))) for _ in range(4)]
    [x.start() for x in t]; [x.join() for x in t]
    assert len(sent)==1 and sum(o['claimed'] for o in outs)==1

def test_purge_and_delete_on_postgres(core):
    old=core.create('Old')['session_id']; core.clock[0]+=40*86400; keep=core.create('New')
    assert core.purge_expired(30)==1
    core.delete(keep['session_id'],keep['token'])
    with core.store.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]==0
