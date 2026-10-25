"""Export current request schemas and synthetic response fixtures; no network calls."""
from __future__ import annotations
import json,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,indent=2)+'\n',newline='\n')

def main():
    with tempfile.TemporaryDirectory() as td:
        keys=('RELAY_DB','RELAY_MODEL_PROVIDER','RELAY_DELIVERY_ENABLED','RELAY_PUBLIC_DEMO','RELAY_ENV')
        old={k:os.environ.get(k) for k in keys}
        os.environ.update(RELAY_DB=str(Path(td)/'default.sqlite3'),RELAY_MODEL_PROVIDER='none',
                          RELAY_DELIVERY_ENABLED='false',RELAY_PUBLIC_DEMO='true',RELAY_ENV='local')
        try:
            from relay.api import make_app
            from relay.core import Relay
            from relay.store import Store
            from relay.bank import concept
            from datetime import datetime,timedelta,timezone
            app=make_app(str(Path(td)/'schema.sqlite3'))
            write(ROOT/'contracts/openapi.json',app.openapi())
            now=datetime(2026,10,24,20,tzinfo=timezone.utc)
            core=Relay(Store(str(Path(td)/'fixtures.sqlite3')),now=lambda:now.timestamp())
            host=core.create('Demo Host');sid=host['session_id'];people=[host]
            for name in ('Demo Member B','Demo Member C','Demo Member D'):
                people.append(core.join(sid,name))
            from relay.api import presentation_view
            def scrub(view):
                view['id']='synthetic-session'
                if view.get('challenge'): view['challenge']['id']='synthetic-challenge'
                return view
            def snap(name,person=host):
                write(ROOT/f'contracts/fixtures/{name}.json',scrub(core.view(sid,person['token'])))
            def present(name):
                write(ROOT/f'contracts/fixtures/{name}.json',presentation_view(scrub(core.view(sid,host['token']))))
            snap('lobby')
            start=now+timedelta(days=1);end=start+timedelta(hours=2)
            for person in people:
                core.availability(sid,person['token'],[{'start':start.isoformat(),'end':end.isoformat()}])
            proposal=core.propose(sid,host['token'])['state']
            for person in people:core.approve(sid,person['token'],proposal['plan_version'])
            snap('schedule-confirmed')
            core.advance(sid,host['token'],'lobby')
            snap('diagnostic');snap('participant-diagnostic',people[1])
            c=concept('compound-change')
            wrong=next(k for k in c['diagnostic']['options'] if k!=c['diagnostic']['correct'])
            for person in people:
                core.answer(sid,person['token'],c['diagnostic']['id'],wrong,'confident')
            core.advance(sid,host['token'],'diagnostic');snap('discussion');snap('participant-discussion',people[1]);present('presentation-discussion')
            core.challenge(sid,people[1]['token'],'Synthetic review request: can we check the stated assumption?')
            snap('challenge-paused')
            core.resolve_challenge(sid,host['token'],'resume','Reviewed the original teaching fixture; the stated assumption is explicit.')
            core.explain(sid,people[1]['token'],'The second percentage operates on the updated amount, not the initial amount.')
            core.advance(sid,host['token'],'discussion');snap('transfer')
            for person in people[:3]:
                core.answer(sid,person['token'],c['transfer']['id'],c['transfer']['correct'],'somewhat')
            core.answer(sid,people[3]['token'],c['transfer']['id'],'SKIP')
            core.advance(sid,host['token'],'transfer');snap('debrief');snap('participant-debrief-skipped',people[3])
            present('presentation-debrief')
            # Two people: group results stay suppressed; each person still gets a private receipt.
            pair=core.create('Demo Host');sid2=pair['session_id'];other=core.join(sid2,'Demo Member B')
            core.advance(sid2,pair['token'],'lobby')
            for person in (pair,other): core.answer(sid2,person['token'],c['diagnostic']['id'],wrong,'confident')
            core.advance(sid2,pair['token'],'diagnostic')
            core.explain(sid2,other['token'],'The second percentage operates on the updated amount, not the initial amount.')
            core.advance(sid2,pair['token'],'discussion')
            for person in (pair,other): core.answer(sid2,person['token'],c['transfer']['id'],c['transfer']['correct'])
            core.advance(sid2,pair['token'],'transfer')
            write(ROOT/'contracts/fixtures/debrief-two-person.json',scrub(core.view(sid2,other['token'])))
            # A challenged item the host discards: nothing is scored, no follow-up.
            gone=core.create('Demo Host');sid3=gone['session_id'];member=core.join(sid3,'Demo Member B')
            core.advance(sid3,gone['token'],'lobby')
            core.challenge(sid3,member['token'],'Synthetic review request: the wording allows two readings.')
            core.resolve_challenge(sid3,gone['token'],'discard','Synthetic review: ambiguous wording, withdrawn from this session.')
            write(ROOT/'contracts/fixtures/discarded.json',scrub(core.view(sid3,member['token'])))
            rid='synthetic-request-id'
            write(ROOT/'contracts/fixtures/error-stale.json',{'detail':'The stage changed. Refresh before continuing.','request_id':rid})
            write(ROOT/'contracts/fixtures/error-unauthenticated.json',{'detail':'Sign in with Discord to open this session.','request_id':rid})
            write(ROOT/'contracts/fixtures/error-csrf.json',{'detail':'Missing or invalid CSRF token.','request_id':rid})
            write(ROOT/'contracts/fixtures/error-stale-control.json',{'detail':'This button belongs to an older or deleted RELAY session. Use /relay question or /relay status for the current one.','request_id':rid})
            write(ROOT/'contracts/fixtures/auth-me-signed-out.json',{'authenticated':False,'login_available':True,'demo_mode':False})
            write(ROOT/'contracts/fixtures/auth-me-signed-in.json',{'authenticated':True,'user':{'name':'Demo Member B'},'csrf_token':'synthetic-csrf-token','expires_at':now.timestamp()+43200,'demo_mode':False})
            from scripts.export_sample import export as export_sample
            export_sample(write,ROOT)
            write(ROOT/'contracts/fixtures/me-sessions.json',[{'id':'synthetic-session','concept':{'id':'compound-change','title':c['title']},'stage':'debrief','is_host':False,'created_at':now.timestamp(),'paused':False}])
        finally:
            for k,v in old.items():
                if v is None:os.environ.pop(k,None)
                else:os.environ[k]=v
    print('Exported OpenAPI and synthetic views. No participant tokens or real user records exported.')

if __name__=='__main__':main()
