"""Browser identity: Discord OAuth state, sessions, CSRF, origin, logout, expiry and membership linking.
Discord's token/user endpoints are mocked here; a live OAuth round trip is NOT covered by these tests."""
from urllib.parse import urlparse, parse_qs
import pytest
from fastapi.testclient import TestClient
from relay.api import make_app
from relay.auth import safe_return_path
from relay.bank import concept

KEY='test-key-'+'x'*40
H={'X-Relay-Key':KEY}
ORIGIN='http://localhost:3000'

@pytest.fixture
def app(tmp_path,monkeypatch):
    for k in ('RELAY_ENV',): monkeypatch.delenv(k,raising=False)
    monkeypatch.setenv('RELAY_SERVICE_KEY',KEY)
    monkeypatch.setenv('RELAY_PUBLIC_DEMO','false')
    monkeypatch.setenv('DISCORD_CLIENT_ID','123456')
    monkeypatch.setenv('DISCORD_CLIENT_SECRET','synthetic-secret')
    monkeypatch.setenv('RELAY_OAUTH_REDIRECT_URI',ORIGIN+'/auth/discord/callback')
    monkeypatch.setenv('RELAY_FRONTEND_URL',ORIGIN)
    monkeypatch.setenv('RELAY_ALLOWED_ORIGINS',ORIGIN)
    return make_app(str(tmp_path/'auth.sqlite3'))

def as_discord_user(app,monkeypatch,uid,name='Student'):
    async def exchange(code,http=None):
        assert code=='good-code'
        return uid,name
    monkeypatch.setattr(app.state.auth,'exchange',exchange)

def login(client,app,monkeypatch,uid='555',return_to='/room/abc'):
    as_discord_user(app,monkeypatch,uid)
    r=client.get('/auth/discord/login',params={'return_to':return_to},follow_redirects=False)
    assert r.status_code==302
    q=parse_qs(urlparse(r.headers['location']).query)
    assert q['scope']==['identify'] and q['redirect_uri']==[ORIGIN+'/auth/discord/callback'] and q['response_type']==['code']
    cb=client.get('/auth/discord/callback',params={'code':'good-code','state':q['state'][0]},follow_redirects=False)
    assert cb.status_code==302, cb.text
    return cb, client.get('/auth/me').json()

def bot(client,user,action,data=None,channel='1:1'):
    return client.post('/internal/discord',headers=H,json={'channel':channel,'user_id':str(user),'name':f'U{user}','action':action,'data':data or {}})

def test_login_sets_httponly_cookie_and_redirects_to_safe_path(app,monkeypatch):
    c=TestClient(app)
    cb,me=login(c,app,monkeypatch)
    assert cb.headers['location']==ORIGIN+'/room/abc'
    cookie=[h for h in cb.headers.get_list('set-cookie') if h.startswith('relay_session=')][0]
    assert 'HttpOnly' in cookie and 'SameSite=lax' in cookie and 'Path=/' in cookie
    assert me['authenticated'] and me['user']=={'name':'Student'} and len(me['csrf_token'])==64

def test_state_must_match_browser_cookie(app,monkeypatch):
    c=TestClient(app); as_discord_user(app,monkeypatch,'555')
    r=c.get('/auth/discord/login',follow_redirects=False)
    state=parse_qs(urlparse(r.headers['location']).query)['state'][0]
    other=TestClient(app)  # attacker's browser: no matching state cookie
    assert other.get('/auth/discord/callback',params={'code':'good-code','state':state},follow_redirects=False).status_code==400
    assert c.get('/auth/discord/callback',params={'code':'good-code','state':'forged'},follow_redirects=False).status_code==400

def test_state_is_single_use_and_expires(app,monkeypatch):
    c=TestClient(app); as_discord_user(app,monkeypatch,'555')
    r=c.get('/auth/discord/login',follow_redirects=False)
    state=parse_qs(urlparse(r.headers['location']).query)['state'][0]
    assert c.get('/auth/discord/callback',params={'code':'good-code','state':state},follow_redirects=False).status_code==302
    c.cookies.set('relay_oauth',state)
    assert c.get('/auth/discord/callback',params={'code':'good-code','state':state},follow_redirects=False).status_code==400
    c2=TestClient(app); r=c2.get('/auth/discord/login',follow_redirects=False)
    state=parse_qs(urlparse(r.headers['location']).query)['state'][0]
    real=app.state.auth.now; app.state.auth.now=lambda:real()+601
    try: assert c2.get('/auth/discord/callback',params={'code':'good-code','state':state},follow_redirects=False).status_code==400
    finally: app.state.auth.now=real

def test_wrong_issuer_rejected(app,monkeypatch):
    c=TestClient(app); as_discord_user(app,monkeypatch,'555')
    r=c.get('/auth/discord/login',follow_redirects=False)
    state=parse_qs(urlparse(r.headers['location']).query)['state'][0]
    assert c.get('/auth/discord/callback',params={'code':'good-code','state':state,'iss':'https://evil.example'},follow_redirects=False).status_code==400

@pytest.mark.parametrize('value,expected',[('/room/1','/room/1'),('//evil.example','/'),('https://evil.example','/'),('/\\evil','/'),('/x\n','/'),(None,'/')])
def test_return_path_cannot_open_redirect(value,expected):
    assert safe_return_path(value)==expected

def test_cookie_user_reaches_only_sessions_they_belong_to(app,monkeypatch):
    c=TestClient(app)
    sid=bot(c,555,'create').json()['state']['id']; bot(c,777,'join')
    other_sid=bot(c,888,'create',channel='9:9').json()['state']['id']
    anon=TestClient(app)
    assert anon.get(f'/api/sessions/{sid}').status_code==401
    _,me=login(c,app,monkeypatch,uid='555')
    v=c.get(f'/api/sessions/{sid}')
    assert v.status_code==200 and v.json()['is_host']
    assert c.get(f'/api/sessions/{other_sid}').status_code==403  # knowing an id grants nothing
    listed=c.get('/api/me/sessions').json()
    assert [x['id'] for x in listed]==[sid]
    # A different verified user (member, not host) cannot use host actions.
    c2=TestClient(app); _,me2=login(c2,app,monkeypatch,uid='777')
    r=c2.post(f'/api/sessions/{sid}/advance',json={'expected_stage':'lobby'},headers={'X-CSRF-Token':me2['csrf_token'],'Origin':ORIGIN})
    assert r.status_code==403 and 'host' in r.json()['detail']

def test_cookie_mutations_need_csrf_and_allowed_origin(app,monkeypatch):
    c=TestClient(app)
    sid=bot(c,555,'create').json()['state']['id']; bot(c,777,'join')
    _,me=login(c,app,monkeypatch,uid='555')
    url=f'/api/sessions/{sid}/advance'; body={'expected_stage':'lobby'}
    assert c.post(url,json=body).status_code==403
    assert c.post(url,json=body,headers={'X-CSRF-Token':'0'*64}).status_code==403
    assert c.post(url,json=body,headers={'X-CSRF-Token':me['csrf_token'],'Origin':'https://evil.example'}).status_code==403
    ok=c.post(url,json=body,headers={'X-CSRF-Token':me['csrf_token'],'Origin':ORIGIN})
    assert ok.status_code==200 and ok.json()['stage']=='diagnostic'
    # The browser answer goes through the same authoritative state machine as the bot.
    q=concept('compound-change')['diagnostic']
    a=c.post(f'/api/sessions/{sid}/answer',json={'question_id':q['id'],'choice':'A'},headers={'X-CSRF-Token':me['csrf_token'],'Origin':ORIGIN})
    assert a.status_code==200 and a.json()['my_answer']['choice']=='A'

def test_logout_revokes_and_expiry_ends_session(app,monkeypatch):
    c=TestClient(app); _,me=login(c,app,monkeypatch)
    raw=c.cookies.get('relay_session')
    assert c.post('/auth/logout').status_code==403  # CSRF required to log out
    assert c.post('/auth/logout',headers={'X-CSRF-Token':me['csrf_token']}).json()=={'authenticated':False}
    replay=TestClient(app); replay.cookies.set('relay_session',raw)
    assert replay.get('/auth/me').json()['authenticated'] is False
    c3=TestClient(app); login(c3,app,monkeypatch)
    real=app.state.auth.now; app.state.auth.now=lambda:real()+13*3600
    try: assert c3.get('/auth/me').json()['authenticated'] is False
    finally: app.state.auth.now=real

def test_session_ids_stored_hashed(app,monkeypatch):
    c=TestClient(app); login(c,app,monkeypatch)
    raw=c.cookies.get('relay_session')
    with app.state.core.store.connect() as db:
        rows=[dict(r) for r in db.execute('SELECT * FROM web_sessions').fetchall()]
    assert rows and all(raw not in str(r) for r in rows)

def test_login_unavailable_without_config(tmp_path,monkeypatch):
    for k in ('RELAY_ENV','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','RELAY_OAUTH_REDIRECT_URI'): monkeypatch.delenv(k,raising=False)
    monkeypatch.setenv('RELAY_SERVICE_KEY',KEY); monkeypatch.setenv('RELAY_PUBLIC_DEMO','false')
    c=TestClient(make_app(str(tmp_path/'n.sqlite3')))
    assert c.get('/auth/discord/login',follow_redirects=False).status_code==503
    assert c.get('/auth/me').json()=={'authenticated':False,'login_available':False,'demo_mode':False}

def test_exchange_rejects_bad_discord_responses(app):
    import asyncio, httpx
    def handler(request):
        if request.url.path.endswith('/token'): return httpx.Response(200,json={'access_token':'at'})
        if request.url.path.endswith('/revoke'): return httpx.Response(200)
        return httpx.Response(200,json={'id':'not-a-number','username':'x'})
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await app.state.auth.exchange('code',http=http)
    from relay.core import RelayError
    with pytest.raises(RelayError): asyncio.run(go())
    seen=[]
    def ok(request):
        seen.append(request.url.path)
        if request.url.path.endswith('/token'):
            assert b'grant_type=authorization_code' in request.content and request.headers['authorization'].startswith('Basic ')
            return httpx.Response(200,json={'access_token':'at'})
        if request.url.path.endswith('/revoke'): return httpx.Response(200)
        return httpx.Response(200,json={'id':'42','username':'u','global_name':'Global'})
    async def go2():
        async with httpx.AsyncClient(transport=httpx.MockTransport(ok)) as http:
            return await app.state.auth.exchange('code',http=http)
    assert asyncio.run(go2())==('42','Global')
    assert seen[-1].endswith('/revoke')  # access token revoked right after the identity lookup
