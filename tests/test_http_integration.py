"""Real HTTP: a uvicorn process on a local port, production mode, explicit migration, restart.
This exercises sockets, headers and process restart. It is NOT a deployed-domain, TLS, proxy or
Discord test."""
import os, socket, subprocess, sys, time
from pathlib import Path
import httpx
from relay.bank import concept

ROOT=Path(__file__).resolve().parents[1]
KEY='http-key-'+'y'*40
C=concept('compound-change')

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); return s.getsockname()[1]

def environment(db):
    env={k:v for k,v in os.environ.items() if not k.startswith(('RELAY_','DISCORD_','GEMINI_'))}
    env.update(RELAY_ENV='production',RELAY_DB=str(db),RELAY_SERVICE_KEY=KEY,RELAY_PUBLIC_DEMO='false',
               RELAY_MODEL_PROVIDER='none',RELAY_DELIVERY_ENABLED='false',RELAY_SERVE_WEB='false',PYTHONDONTWRITEBYTECODE='1')
    return env

def start(db,port):
    proc=subprocess.Popen([sys.executable,'-m','uvicorn','relay.api:app','--host','127.0.0.1','--port',str(port)],
                          cwd=ROOT,env=environment(db),stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    for _ in range(80):
        try:
            if httpx.get(f'http://127.0.0.1:{port}/ready',timeout=1).status_code==200: return proc
        except httpx.HTTPError: pass
        if proc.poll() is not None: break
        time.sleep(0.25)
    proc.kill(); raise AssertionError('server did not start: '+proc.stdout.read().decode(errors='replace')[-2000:])

def stop(proc):
    proc.terminate()
    try: proc.wait(10)
    except subprocess.TimeoutExpired: proc.kill()

def test_real_http_cycle_production_mode_and_restart(tmp_path):
    db=tmp_path/'vol'/'relay.sqlite3'
    migrate=subprocess.run([sys.executable,'-m','relay.migrate'],cwd=ROOT,env=environment(db),capture_output=True,text=True)
    assert migrate.returncode==0 and 'schema at version' in migrate.stdout
    port=free_port(); base=f'http://127.0.0.1:{port}'
    proc=start(db,port)
    try:
        with httpx.Client(base_url=base,timeout=10) as http:
            r=http.get('/health',headers={'X-Request-ID':'itest-123456'})
            assert r.json()=={'ok':True,'live_model':False,'delivery_enabled':False} and r.headers['x-request-id']=='itest-123456'
            assert http.get('/').json()['service']=='RELAY API'
            assert http.post('/api/sessions',json={'name':'x'}).status_code==403          # no synthetic identities
            assert http.post('/internal/discord',json={}).status_code in (403,422)
            assert http.get('/auth/me').json()['authenticated'] is False
            def bot(user,action,data=None,sid=None):
                body={'channel':'7:8','user_id':str(user),'name':f'U{user}','action':action,'data':data or {}}
                if sid: body['session_id']=sid
                return http.post('/internal/discord',headers={'X-Relay-Key':KEY},json=body)
            sid=bot(1,'create').json()['state']['id']; bot(2,'join')
            assert bot(1,'advance',{'expected_stage':'lobby'}).json()['state']['stage']=='diagnostic'
            for u in (1,2): assert bot(u,'answer',{'question_id':C['diagnostic']['id'],'choice':'A'},sid).status_code==200
            r=bot(1,'advance',{'expected_stage':'diagnostic'})
            assert r.json()['state']['stage']=='discussion' and r.headers['cache-control']=='no-store'
    finally:
        stop(proc)
    proc=start(db,port)
    try:
        with httpx.Client(base_url=base,timeout=10) as http:
            r=http.post('/internal/discord',headers={'X-Relay-Key':KEY},
                        json={'channel':'7:8','user_id':'2','name':'U2','action':'view','data':{}})
            s=r.json()['state']
            assert s['id']==sid and s['stage']=='discussion' and len(s['members'])==2
    finally:
        stop(proc)
