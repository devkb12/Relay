"""Export current request schemas and synthetic response fixtures; no network calls."""
from __future__ import annotations
import json,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,indent=2)+'\n')

def main():
    with tempfile.TemporaryDirectory() as td:
        keys=('RELAY_DB','RELAY_MODEL_PROVIDER','RELAY_DELIVERY_ENABLED','RELAY_PUBLIC_DEMO')
        old={k:os.environ.get(k) for k in keys}
        os.environ.update(RELAY_DB=str(Path(td)/'default.sqlite3'),RELAY_MODEL_PROVIDER='none',
                          RELAY_DELIVERY_ENABLED='false',RELAY_PUBLIC_DEMO='true')
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
            def snap(name,person=host):
                view=core.view(sid,person['token']);view['id']='synthetic-session'
                write(ROOT/f'contracts/fixtures/{name}.json',view)
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
            core.advance(sid,host['token'],'diagnostic');snap('discussion')
            core.challenge(sid,people[1]['token'],'Synthetic review request: can we check the stated assumption?')
            snap('challenge-paused')
            core.resolve_challenge(sid,host['token'],'resume','Reviewed the original teaching fixture; the stated assumption is explicit.')
            core.explain(sid,people[1]['token'],'The second percentage operates on the updated amount, not the initial amount.')
            core.advance(sid,host['token'],'discussion');snap('transfer')
            for person in people:
                core.answer(sid,person['token'],c['transfer']['id'],c['transfer']['correct'],'somewhat')
            core.advance(sid,host['token'],'transfer');snap('debrief')
            write(ROOT/'contracts/fixtures/error-stale.json',{'detail':'The stage changed. Refresh before continuing.'})
        finally:
            for k,v in old.items():
                if v is None:os.environ.pop(k,None)
                else:os.environ[k]=v
    print('Exported OpenAPI and synthetic views. No participant tokens or real user records exported.')

if __name__=='__main__':main()
