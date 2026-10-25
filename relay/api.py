from __future__ import annotations
import logging, os, re, secrets, time, uuid
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .core import Relay, RelayError
from .store import Store, default_db, load_local_env
from .bank import CONCEPTS
from .model import facilitate, fallback_payload
from .automation import tick, discord_send, list_jobs, reconcile
from .auth import Auth, load_config, safe_return_path

load_local_env()
ROOT=Path(__file__).resolve().parents[1]
log=logging.getLogger('relay.api')

class Create(BaseModel):
    name:str=Field(min_length=1,max_length=40)
    concept_id:str=Field(default='compound-change',max_length=60)
class Join(BaseModel):
    name:str=Field(min_length=1,max_length=40)
class Answer(BaseModel):
    question_id:str=Field(max_length=80)
    choice:str=Field(max_length=8)
    confidence:Literal['unsure','somewhat','confident']='unsure'
    rationale:str=Field(default='',max_length=600)
class Advance(BaseModel):
    expected_stage:Literal['lobby','diagnostic','discussion','transfer','debrief']
    nonresponders:Literal['wait','mark_missing']='wait'
class Explain(BaseModel):
    text:str=Field(default='',max_length=1200)
    source_fallback:bool=False
class Challenge(BaseModel): reason:str=Field(min_length=5,max_length=500)
class Resolve(BaseModel):
    decision:Literal['resume','discard']
    note:str=Field(min_length=10,max_length=500)
    challenge_id:str|None=Field(default=None,max_length=20)
class Window(BaseModel):
    start:str=Field(max_length=40)
    end:str=Field(max_length=40)
class Windows(BaseModel):
    windows:list[Window]=Field(min_length=1,max_length=12)
    timezone:str|None=Field(default=None,max_length=64)
class Durations(BaseModel): durations:list[int]=Field(default=[60,45,30],min_length=1,max_length=4)
class Approval(BaseModel):
    version:int
    accept_shorter:bool=False
class Consent(BaseModel): enabled:bool
class TickRequest(BaseModel):
    kind:Literal['reminder','retention']|None=None
    dry_run:bool=True
class BotRequest(BaseModel):
    channel:str=Field(max_length=100)
    user_id:str=Field(pattern=r'^\d{1,25}$')
    name:str=Field(min_length=1,max_length=40)
    action:Literal['create','join','view','advance','answer','explain','availability','propose','approve','consent',
                   'facilitate','challenge','resolve','review','cancel_plan','leave','delete']
    # Buttons/modals bind to the session they were created for; slash commands may omit it.
    session_id:str|None=Field(default=None,max_length=40)
    data:dict={}
class ErrorReport(BaseModel):
    workflow:str=Field(default='unknown',max_length=100)
    execution:str=Field(default='unknown',max_length=100)
class Reconcile(BaseModel):
    outcome:Literal['sent','failed','cancelled']
    note:str=Field(min_length=3,max_length=200)

REQUEST_ID=re.compile(r'^[A-Za-z0-9._-]{8,64}$')
UNSAFE={'POST','PUT','PATCH','DELETE'}

class RateLimiter:
    """Per-process sliding window. Single-instance only; not distributed enforcement."""
    def __init__(self): self.hits=defaultdict(deque)
    def check(self,key,limit,seconds):
        now=time.monotonic(); q=self.hits[key]
        while q and q[0]<now-seconds: q.popleft()
        if len(q)>=limit: raise RelayError('Too many requests. Wait a moment and try again.',429)
        q.append(now)

def production():
    return os.getenv('RELAY_ENV','local').strip().lower()=='production'

def demo_enabled():
    return not production() and os.getenv('RELAY_PUBLIC_DEMO','false').lower()=='true'

def validate_production(service_key):
    problems=[]
    if len(service_key)<32: problems.append('RELAY_SERVICE_KEY must be at least 32 characters')
    if os.getenv('RELAY_PUBLIC_DEMO','false').lower()=='true': problems.append('RELAY_PUBLIC_DEMO must be false (synthetic identities are not auth)')
    if problems: raise RuntimeError('RELAY_ENV=production: '+'; '.join(problems)+'.')

def make_app(db_path=None):
    service_key=os.getenv('RELAY_SERVICE_KEY','')
    if production(): validate_production(service_key)
    store=Store(db_path or default_db(),auto_migrate=not production())
    core=Relay(store,secret=service_key)
    auth=Auth(store,load_config(production()),service_key)
    limits=RateLimiter()
    # Interactive docs are a local convenience; production does not publish them.
    docs={'docs_url':None,'redoc_url':None,'openapi_url':None} if production() else {}
    app=FastAPI(title='RELAY API',version='0.2.0',**docs)
    app.state.core,app.state.auth,app.state.limits=core,auth,limits

    @app.middleware('http')
    async def request_context(request:Request,call_next):
        rid=request.headers.get('x-request-id','')
        rid=rid if REQUEST_ID.match(rid) else uuid.uuid4().hex
        request.state.request_id=rid
        started=time.perf_counter()
        response=await call_next(request)
        response.headers['X-Request-ID']=rid
        if request.url.path.startswith(('/api','/auth','/internal')):
            response.headers['Cache-Control']='no-store'
            response.headers['Vary']='Cookie, Authorization'
        response.headers['X-Content-Type-Options']='nosniff'
        # Route template only: never log ids, tokens or bodies.
        route=getattr(request.scope.get('route'),'path',request.url.path if not request.url.path.startswith('/api') else 'api')
        log.info('request rid=%s method=%s route=%s status=%s ms=%.0f',rid,request.method,route,response.status_code,(time.perf_counter()-started)*1000)
        return response

    def error(request,status,detail):
        return JSONResponse({'detail':detail,'request_id':getattr(request.state,'request_id',None)},status_code=status,
                            headers={'Cache-Control':'no-store'})
    @app.exception_handler(RelayError)
    async def relay_error(request,exc): return error(request,exc.status,exc.message)
    @app.exception_handler(KeyError)
    async def missing(request,exc): return error(request,404,'Session not found.')
    @app.exception_handler(ValueError)
    async def bad_value(request,exc): return error(request,400,str(exc)[:300])

    def internal(key):
        if len(service_key)<32 or not key or not secrets.compare_digest(key,service_key):
            raise HTTPException(403,'Internal service credentials required.')
    def public_demo():
        # Synthetic identities are local test infrastructure only. Production never enables them.
        if not demo_enabled():
            raise HTTPException(403,'Public demo creation is disabled; join through Discord.')

    def principal(request:Request,sid:str,mutate:bool=False):
        """Resolve the caller to a participant token for this exact session (object-level check in core)."""
        authz=request.headers.get('authorization','')
        if authz.startswith('Bearer '):
            if not demo_enabled(): raise RelayError('Participant bearer tokens are disabled here. Sign in with Discord.',401)
            return authz[7:]
        user=auth.user(request.cookies.get(auth.cfg.session_cookie))
        if not user: raise RelayError('Sign in with Discord to open this session.',401)
        if mutate:
            origin=request.headers.get('origin')
            if origin is not None and origin.rstrip('/') not in auth.cfg.allowed_origins:
                raise RelayError('Request origin is not allowed.',403)
            auth.check_csrf(user,request.headers.get('x-csrf-token'))
        # The verified Discord id maps to the same server-derived credential the bot uses.
        return core.discord_token(sid,'discord:'+user.discord_id)

    @app.get('/health')
    def health():
        # Liveness and configuration flags only. These are NOT proof that a provider or bot works.
        return {'ok':True,'live_model':os.getenv('RELAY_MODEL_PROVIDER','none')!='none',
                'delivery_enabled':os.getenv('RELAY_DELIVERY_ENABLED','false')=='true'}
    @app.get('/ready')
    def ready():
        try:
            from .migrations import LATEST
            ok=store.ping() and store.schema_version()>=LATEST
        except Exception:
            ok=False
        return JSONResponse({'ready':ok},status_code=200 if ok else 503)

    @app.get('/api/concepts')
    def concepts(): return [{'id':c['id'],'title':c['title']} for c in CONCEPTS.values()]

    # ---- Browser auth (Discord OAuth) ----
    @app.get('/auth/discord/login')
    def login(request:Request,return_to:str='/'):
        limits.check(('login',request.client.host if request.client else '?'),20,60)
        url,state=auth.begin(return_to)
        response=RedirectResponse(url,status_code=302)
        response.set_cookie(auth.cfg.state_cookie,state,max_age=600,httponly=True,secure=auth.cfg.secure_cookies,samesite='lax',path='/')
        return response
    @app.get('/auth/discord/callback')
    async def callback(request:Request,code:str|None=None,state:str|None=None,iss:str|None=None,error:str|None=None):
        limits.check(('callback',request.client.host if request.client else '?'),20,60)
        target=auth.cfg.frontend_url or ''
        if error or not code:
            response=RedirectResponse(target+'/?login=cancelled',status_code=302)
        else:
            return_to=await run_in_threadpool(auth.consume_state,state,request.cookies.get(auth.cfg.state_cookie),iss)
            uid,name=await auth.exchange(code)
            raw,expires=await run_in_threadpool(auth.start_session,uid,name)
            response=RedirectResponse(target+safe_return_path(return_to),status_code=302)
            response.set_cookie(auth.cfg.session_cookie,raw,max_age=int(expires-time.time()),httponly=True,
                                secure=auth.cfg.secure_cookies,samesite='lax',path='/')
        response.delete_cookie(auth.cfg.state_cookie,path='/',secure=auth.cfg.secure_cookies,httponly=True,samesite='lax')
        return response
    @app.get('/auth/me')
    def me(request:Request):
        user=auth.user(request.cookies.get(auth.cfg.session_cookie))
        if not user: return {'authenticated':False,'login_available':auth.cfg.enabled,'demo_mode':demo_enabled()}
        return {'authenticated':True,'user':{'name':user.name},'csrf_token':auth.csrf_for(user.session_hash),
                'expires_at':user.expires_at,'demo_mode':demo_enabled()}
    @app.post('/auth/logout')
    def logout(request:Request):
        user=auth.user(request.cookies.get(auth.cfg.session_cookie))
        if user:
            auth.check_csrf(user,request.headers.get('x-csrf-token'))
            auth.revoke(user)
        response=JSONResponse({'authenticated':False})
        response.delete_cookie(auth.cfg.session_cookie,path='/',secure=auth.cfg.secure_cookies,httponly=True,samesite='lax')
        return response
    @app.get('/api/me/sessions')
    def my_sessions(request:Request):
        user=auth.user(request.cookies.get(auth.cfg.session_cookie))
        if not user: raise RelayError('Sign in with Discord first.',401)
        mid='discord:'+user.discord_id
        return [{'id':s['id'],'concept':{'id':s['pack']['id'],'title':s['pack']['title']},'stage':s['stage'],
                 'is_host':s['host']==mid,'created_at':s['created_at'],'paused':bool((s.get('challenge') or {}).get('pending'))}
                for s in store.for_member(mid) if not s['members'][mid].get('withdrawn_at')]

    # ---- Synthetic local demo identities (disabled unless RELAY_PUBLIC_DEMO=true outside production) ----
    @app.post('/api/sessions')
    def create(body:Create):
        public_demo(); return core.create(body.name,body.concept_id)
    @app.post('/api/sessions/{sid}/join')
    def join(sid:str,body:Join):
        public_demo(); return core.join(sid,body.name)

    # ---- Participant routes: bearer (demo) or Discord cookie session + CSRF ----
    @app.get('/api/sessions/{sid}')
    def view(sid:str,request:Request): return core.view(sid,principal(request,sid))
    @app.get('/api/sessions/{sid}/presentation')
    def presentation(sid:str,request:Request): return presentation_view(core.view(sid,principal(request,sid)))
    @app.post('/api/sessions/{sid}/advance')
    def advance(sid:str,body:Advance,request:Request): return core.advance(sid,principal(request,sid,True),body.expected_stage,body.nonresponders)
    @app.post('/api/sessions/{sid}/answer')
    def answer(sid:str,body:Answer,request:Request): return core.answer(sid,principal(request,sid,True),**body.model_dump())
    @app.post('/api/sessions/{sid}/explain')
    def explain(sid:str,body:Explain,request:Request): return core.explain(sid,principal(request,sid,True),**body.model_dump())
    @app.post('/api/sessions/{sid}/availability')
    def availability(sid:str,body:Windows,request:Request):
        return core.availability(sid,principal(request,sid,True),[w.model_dump() for w in body.windows],body.timezone)
    @app.post('/api/sessions/{sid}/propose')
    def propose(sid:str,body:Durations,request:Request): return core.propose(sid,principal(request,sid,True),body.durations)
    @app.post('/api/sessions/{sid}/cancel-plan')
    def cancel_plan(sid:str,request:Request): return core.cancel_plan(sid,principal(request,sid,True))
    @app.post('/api/sessions/{sid}/approve')
    def approve(sid:str,body:Approval,request:Request): return core.approve(sid,principal(request,sid,True),body.version,body.accept_shorter)
    @app.post('/api/sessions/{sid}/consent')
    def consent(sid:str,body:Consent,request:Request): return core.consent(sid,principal(request,sid,True),body.enabled)
    @app.post('/api/sessions/{sid}/challenge')
    def challenge(sid:str,body:Challenge,request:Request): return core.challenge(sid,principal(request,sid,True),body.reason)
    @app.get('/api/sessions/{sid}/review')
    def review(sid:str,request:Request): return core.review_packet(sid,principal(request,sid))
    @app.post('/api/sessions/{sid}/resolve')
    def resolve(sid:str,body:Resolve,request:Request): return core.resolve_challenge(sid,principal(request,sid,True),body.decision,body.note,body.challenge_id)
    @app.post('/api/sessions/{sid}/leave')
    def leave(sid:str,request:Request): return core.withdraw(sid,principal(request,sid,True))
    @app.get('/api/sessions/{sid}/calendar.ics')
    def calendar(sid:str,request:Request):
        return Response(core.calendar_file(sid,principal(request,sid)),media_type='text/calendar',
                        headers={'Content-Disposition':'attachment; filename=relay-session.ics','Cache-Control':'no-store'})
    @app.delete('/api/sessions/{sid}')
    def delete(sid:str,request:Request): return core.delete(sid,principal(request,sid,True))

    async def do_facilitate(sid,tok):
        limits.check(('facilitate',sid),6,60)
        context,revision=await run_in_threadpool(core.model_context,sid,tok)
        try:
            payload=await facilitate(context)
        except Exception as exc:
            payload=fallback_payload(context,exc)
        # Rejected if the session changed or was challenged while the model was running.
        return await run_in_threadpool(core.save_facilitation,sid,tok,payload,revision)
    @app.post('/api/sessions/{sid}/facilitate')
    async def facilitation(sid:str,request:Request):
        tok=await run_in_threadpool(principal,request,sid,True)
        return await do_facilitate(sid,tok)

    # ---- Server-to-server (bot, n8n). Never proxy /internal/* to browsers. ----
    @app.post('/internal/automation/tick')
    def automate(body:TickRequest,x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key)
        enabled=os.getenv('RELAY_DELIVERY_ENABLED','false').lower()=='true'
        sender=lambda uid,text: discord_send(os.getenv('DISCORD_BOT_TOKEN',''),uid,text)
        return tick(store,sender,kind=body.kind,dry_run=body.dry_run or not enabled)
    @app.get('/internal/jobs')
    def jobs(status:Literal['unknown','failed','pending','leased','sent','cancelled']='unknown',x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key); return list_jobs(store,status)
    @app.post('/internal/jobs/{job_id}/reconcile')
    def reconcile_job(job_id:str,body:Reconcile,x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key); return reconcile(store,job_id,body.outcome,body.note)
    @app.post('/internal/maintenance/purge')
    def purge(x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key)
        days=float(os.getenv('RELAY_RETENTION_DAYS','30'))
        return {'deleted_sessions':core.purge_expired(days),'retention_days':days,
                'notice':'Database rows only. Discord messages, provider logs and backups are outside this purge.'}
    @app.post('/internal/automation/error')
    def automation_error(body:ErrorReport,x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key)
        with store.transaction() as db:
            db.execute('INSERT INTO automation_errors(created_at,workflow,execution) VALUES(?,?,?)',(core.now(),body.workflow,body.execution))
        return {'recorded':True,'notice':'Only workflow/execution identifiers were retained.'}

    def bot_dispatch(body:BotRequest):
        if body.action=='create':
            s=store.by_channel(body.channel)
            if s and s['stage']!='debrief': raise RelayError('This channel has an unfinished session. Finish or delete it first.',409)
            creds=core.create(body.name,body.data.get('concept_id','compound-change'),body.user_id,body.channel)
            return {'state':core.view(creds['session_id'],creds['token'])}
        if body.session_id:
            # A control is bound to its session: never redirect an old button into a newer session.
            with store.connect() as db:
                try: s=store.load(db,body.session_id)
                except KeyError: s=None
            if not s or s.get('deleted') or s.get('channel')!=body.channel:
                raise RelayError('This button belongs to an older or deleted RELAY session. Use /relay question or /relay status for the current one.',410)
        else:
            s=store.by_channel(body.channel)
            if not s: raise RelayError('Create a session in this channel first.',404)
        sid=s['id']; uid='discord:'+body.user_id; tok=core.discord_token(sid,uid)
        if body.action=='join': core.join(sid,body.name,body.user_id)
        elif uid not in s['members']: raise RelayError('Use /relay join first.',403)
        a,d=body.action,body.data
        if a in ('join','view'): result=core.view(sid,tok)
        elif a=='advance': result=core.advance(sid,tok,Advance(**d).expected_stage,Advance(**d).nonresponders)
        elif a=='answer': result=core.answer(sid,tok,**Answer(**d).model_dump())
        elif a=='explain': result=core.explain(sid,tok,**Explain(**d).model_dump())
        elif a=='availability':
            w=Windows(**d); result=core.availability(sid,tok,[x.model_dump() for x in w.windows],w.timezone)
        elif a=='propose': result=core.propose(sid,tok,Durations(**d).durations)['state']
        elif a=='cancel_plan': result=core.cancel_plan(sid,tok)
        elif a=='approve':
            ap=Approval(**d); result=core.approve(sid,tok,ap.version,ap.accept_shorter)
        elif a=='consent': result=core.consent(sid,tok,Consent(**d).enabled)
        elif a=='challenge': result=core.challenge(sid,tok,Challenge(**d).reason)
        elif a=='review': return {'review':core.review_packet(sid,tok),'session_id':sid}
        elif a=='resolve':
            r=Resolve(**d); result=core.resolve_challenge(sid,tok,r.decision,r.note,r.challenge_id)
        elif a=='leave': return {**core.withdraw(sid,tok),'session_id':sid}
        elif a=='delete': return {**core.delete(sid,tok),'session_id':sid}
        else: raise RelayError('Unsupported operation.')
        return {'state':result}

    @app.post('/internal/discord')
    async def discord_action(body:BotRequest,x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key)
        limits.check(('discord',body.user_id),30,60)
        if body.action=='facilitate':
            s=store.by_channel(body.channel) if not body.session_id else None
            sid=body.session_id or (s['id'] if s else None)
            if not sid: raise RelayError('Create a session in this channel first.',404)
            return {'state':await do_facilitate(sid,core.discord_token(sid,'discord:'+body.user_id))}
        # Blocking DB work runs in the threadpool so one slow call cannot stall the event loop.
        return await run_in_threadpool(bot_dispatch,body)

    # Optional same-origin static UI (legacy starter). The API does not require web/ to exist.
    index=ROOT/'web'/'index.html'
    if index.is_file() and os.getenv('RELAY_SERVE_WEB','true').lower()=='true':
        app.mount('/static',StaticFiles(directory=ROOT/'web'),name='static')
        @app.get('/')
        def root(): return FileResponse(index)
    else:
        @app.get('/')
        def root(): return {'service':'RELAY API','health':'/health'}
    if os.getenv('RELAY_EXPOSE_INTERNAL','true').strip().lower()=='false':
        # Public listener (e.g. behind Tailscale Funnel): server-to-server routes do not exist here at all.
        app.router.routes=[r for r in app.router.routes if not getattr(r,'path','').startswith('/internal')]
    return app

def presentation_view(v):
    """Shared-screen projection: no private answer, results, availability, or reviewer data."""
    keep=('id','concept','stage','revision','members','plan','plan_version','approved_count','schedule_confirmed',
          'plan_cancelled','paused','invalidated','source','question','explanations','hint','discussion_signal',
          'group','notice','retention_note')
    out={k:v.get(k) for k in keep}
    out['members']=[{k:m[k] for k in ('name','state','responded','is_host')} for m in v['members']]
    if out['plan']: out['plan']={k:out['plan'][k] for k in ('start','end','minutes','shorter_alternative')}
    out['challenge']={'pending':True,'reason':v['challenge']['reason']} if (v.get('challenge') or {}).get('pending') else None
    out['view']='presentation'
    return out

app=make_app()
