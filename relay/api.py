from __future__ import annotations
import os, secrets
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from .core import Relay, RelayError
from .store import Store
from .bank import CONCEPTS
from .model import facilitate
from .automation import tick, discord_send

load_dotenv()
ROOT=Path(__file__).resolve().parents[1]

class Create(BaseModel):
    name:str=Field(min_length=1,max_length=40)
    concept_id:str='compound-change'
class Join(BaseModel):
    name:str=Field(min_length=1,max_length=40)
class Answer(BaseModel):
    question_id:str
    choice:str
    confidence:Literal['unsure','somewhat','confident']='unsure'
    rationale:str=Field(default='',max_length=600)
class Advance(BaseModel): expected_stage:str
class Explain(BaseModel):
    text:str=Field(default='',max_length=1200)
    source_fallback:bool=False
class Challenge(BaseModel): reason:str=Field(min_length=5,max_length=500)
class Resolve(BaseModel):
    decision:Literal['resume','discard']
    note:str=Field(min_length=10,max_length=500)
class Windows(BaseModel): windows:list[dict]=Field(max_length=12)
class Durations(BaseModel): durations:list[int]=[60,45,30]
class Approval(BaseModel): version:int
class Consent(BaseModel): enabled:bool
class TickRequest(BaseModel):
    kind:Literal['reminder','retention']|None=None
    dry_run:bool=True
class BotRequest(BaseModel):
    channel:str=Field(max_length=100)
    user_id:str=Field(pattern=r'^\d+$')
    name:str=Field(min_length=1,max_length=40)
    action:Literal['create','join','view','advance','answer','explain','availability','propose','approve','consent','facilitate','challenge','resolve','delete']
    data:dict={}
class ErrorReport(BaseModel):
    workflow:str=Field(default='unknown',max_length=100)
    execution:str=Field(default='unknown',max_length=100)


def make_app(db_path=None):
    service_key=os.getenv('RELAY_SERVICE_KEY','')
    store=Store(db_path or os.getenv('RELAY_DB','relay.sqlite3'))
    core=Relay(store,secret=service_key)
    app=FastAPI(title='RELAY Track 3 Starter',version='0.1.0')
    app.state.core=core

    @app.exception_handler(RelayError)
    async def relay_error(request,exc): return JSONResponse({'detail':exc.message},status_code=exc.status)
    @app.exception_handler(KeyError)
    async def missing(request,exc): return JSONResponse({'detail':'Session not found.'},status_code=404)
    @app.exception_handler(ValueError)
    async def bad_value(request,exc): return JSONResponse({'detail':str(exc)},status_code=400)

    def token(auth):
        if not auth or not auth.startswith('Bearer '): raise HTTPException(401,'Use a participant bearer token.')
        return auth[7:]
    def internal(key):
        if len(service_key)<32 or not key or not secrets.compare_digest(key,service_key):
            raise HTTPException(403,'Internal service credentials required.')
    def public_demo():
        if os.getenv('RELAY_PUBLIC_DEMO','true').lower()!='true':
            raise HTTPException(403,'Public demo creation is disabled; join through Discord.')

    @app.get('/health')
    def health(): return {'ok':True,'live_model':os.getenv('RELAY_MODEL_PROVIDER','none')!='none','delivery_enabled':os.getenv('RELAY_DELIVERY_ENABLED','false')=='true'}
    @app.get('/api/concepts')
    def concepts(): return [{'id':c['id'],'title':c['title']} for c in CONCEPTS.values()]
    @app.post('/api/sessions')
    def create(body:Create):
        public_demo(); return core.create(body.name,body.concept_id)
    @app.post('/api/sessions/{sid}/join')
    def join(sid,body:Join):
        public_demo(); return core.join(sid,body.name)
    @app.get('/api/sessions/{sid}')
    def view(sid,authorization:str|None=Header(default=None)): return core.view(sid,token(authorization))
    @app.post('/api/sessions/{sid}/advance')
    def advance(sid,body:Advance,authorization:str|None=Header(default=None)): return core.advance(sid,token(authorization),body.expected_stage)
    @app.post('/api/sessions/{sid}/answer')
    def answer(sid,body:Answer,authorization:str|None=Header(default=None)): return core.answer(sid,token(authorization),**body.model_dump())
    @app.post('/api/sessions/{sid}/explain')
    def explain(sid,body:Explain,authorization:str|None=Header(default=None)): return core.explain(sid,token(authorization),**body.model_dump())
    @app.post('/api/sessions/{sid}/availability')
    def availability(sid,body:Windows,authorization:str|None=Header(default=None)): return core.availability(sid,token(authorization),body.windows)
    @app.post('/api/sessions/{sid}/propose')
    def propose(sid,body:Durations,authorization:str|None=Header(default=None)): return core.propose(sid,token(authorization),body.durations)
    @app.post('/api/sessions/{sid}/approve')
    def approve(sid,body:Approval,authorization:str|None=Header(default=None)): return core.approve(sid,token(authorization),body.version)
    @app.post('/api/sessions/{sid}/consent')
    def consent(sid,body:Consent,authorization:str|None=Header(default=None)): return core.consent(sid,token(authorization),body.enabled)
    @app.post('/api/sessions/{sid}/challenge')
    def challenge(sid,body:Challenge,authorization:str|None=Header(default=None)): return core.challenge(sid,token(authorization),body.reason)
    @app.post('/api/sessions/{sid}/resolve')
    def resolve(sid,body:Resolve,authorization:str|None=Header(default=None)): return core.resolve_challenge(sid,token(authorization),body.decision,body.note)
    @app.get('/api/sessions/{sid}/calendar.ics')
    def calendar(sid,authorization:str|None=Header(default=None)):
        return Response(core.calendar_file(sid,token(authorization)),media_type='text/calendar',headers={'Content-Disposition':'attachment; filename=relay-session.ics'})
    @app.delete('/api/sessions/{sid}')
    def delete(sid,authorization:str|None=Header(default=None)): return core.delete(sid,token(authorization))

    async def do_facilitate(sid,tok):
        context,revision=core.model_context(sid,tok)
        try:
            payload=await facilitate(context)
        except Exception:
            payload={'discussion_question':context['reviewed_hint'],'possible_misconception':'Check the assumption against the supplied source.',
                     'mode':'curated fallback; live model unavailable or rejected'}
        return core.save_facilitation(sid,tok,payload,revision)
    @app.post('/api/sessions/{sid}/facilitate')
    async def facilitation(sid,authorization:str|None=Header(default=None)): return await do_facilitate(sid,token(authorization))

    @app.post('/internal/automation/tick')
    def automate(body:TickRequest,x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key)
        enabled=os.getenv('RELAY_DELIVERY_ENABLED','false').lower()=='true'
        sender=lambda uid,text: discord_send(os.getenv('DISCORD_BOT_TOKEN',''),uid,text)
        return tick(store,sender,kind=body.kind,dry_run=body.dry_run or not enabled)
    @app.post('/internal/automation/error')
    def automation_error(body:ErrorReport,x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key)
        with store.transaction() as db:
            db.execute('INSERT INTO automation_errors(created_at,workflow,execution) VALUES(?,?,?)',(core.now(),body.workflow,body.execution))
        return {'recorded':True,'notice':'Only workflow/execution identifiers were retained.'}

    @app.post('/internal/discord')
    async def discord_action(body:BotRequest,x_relay_key:str|None=Header(default=None)):
        internal(x_relay_key)
        s=store.by_channel(body.channel)
        if body.action=='create':
            if s and s['stage']!='debrief': raise RelayError('This channel has an unfinished session. Finish or delete it first.',409)
            creds=core.create(body.name,body.data.get('concept_id','compound-change'),body.user_id,body.channel)
            return {'state':core.view(creds['session_id'],creds['token'])}
        if not s: raise RelayError('Create a session in this channel first.',404)
        sid=s['id']; uid='discord:'+body.user_id; tok=core.discord_token(sid,uid)
        if body.action=='join': core.join(sid,body.name,body.user_id)
        elif uid not in s['members']: raise RelayError('Use /relay join first.',403)
        if body.action in ('join','view'): result=core.view(sid,tok)
        elif body.action=='advance': result=core.advance(sid,tok,body.data['expected_stage'])
        elif body.action=='answer': result=core.answer(sid,tok,**Answer(**body.data).model_dump())
        elif body.action=='explain': result=core.explain(sid,tok,**Explain(**body.data).model_dump())
        elif body.action=='availability': result=core.availability(sid,tok,Windows(**body.data).windows)
        elif body.action=='propose': result=core.propose(sid,tok,Durations(**body.data).durations)['state']
        elif body.action=='approve': result=core.approve(sid,tok,Approval(**body.data).version)
        elif body.action=='consent': result=core.consent(sid,tok,Consent(**body.data).enabled)
        elif body.action=='facilitate': result=await do_facilitate(sid,tok)
        elif body.action=='challenge': result=core.challenge(sid,tok,Challenge(**body.data).reason)
        elif body.action=='resolve': result=core.resolve_challenge(sid,tok,**Resolve(**body.data).model_dump())
        elif body.action=='delete': return core.delete(sid,tok)
        else: raise RelayError('Unsupported operation.')
        return {'state':result}

    app.mount('/static',StaticFiles(directory=ROOT/'web'),name='static')
    @app.get('/')
    def index(): return FileResponse(ROOT/'web/index.html')
    return app

app=make_app()
