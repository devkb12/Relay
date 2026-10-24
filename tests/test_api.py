import json
from pathlib import Path
from fastapi.testclient import TestClient
from relay.api import make_app
import pytest

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.delenv('RELAY_ENV',raising=False)
    monkeypatch.setenv('RELAY_SERVICE_KEY','test-key-'+'x'*40)
    monkeypatch.setenv('RELAY_PUBLIC_DEMO','true')
    monkeypatch.setenv('RELAY_MODEL_PROVIDER','none')
    monkeypatch.setenv('RELAY_DELIVERY_ENABLED','false')
    return TestClient(make_app(str(tmp_path/'api.sqlite3')))

def test_health_and_ui(client):
    assert client.get('/health').json()['ok']
    assert client.get('/').status_code==200
    assert 'answer autopilot' in client.get('/static/app.js').text or client.get('/static/app.js').status_code==200

def test_session_authentication(client):
    info=client.post('/api/sessions',json={'name':'Rithik'}).json()
    path='/api/sessions/'+info['session_id']
    assert client.get(path).status_code==401
    assert client.get(path,headers={'Authorization':'Bearer wrong'}).status_code==403
    assert client.get(path,headers={'Authorization':'Bearer '+info['token']}).status_code==200

def test_internal_requires_secret(client):
    assert client.post('/internal/automation/tick',json={'dry_run':True}).status_code==403

def test_automation_disabled_means_dry_run(client):
    r=client.post('/internal/automation/tick',json={'dry_run':False},headers={'X-Relay-Key':'test-key-'+'x'*40})
    assert r.json()['dry_run']

def test_discord_binding_and_host_permissions(client):
    headers={'X-Relay-Key':'test-key-'+'x'*40}
    base={'channel':'1:2','name':'Rithik','user_id':'123'}
    assert client.post('/internal/discord',headers=headers,json={**base,'action':'create','data':{}}).status_code==200
    other={**base,'name':'Dev','user_id':'456'}
    assert client.post('/internal/discord',headers=headers,json={**other,'action':'view'}).status_code==403
    assert client.post('/internal/discord',headers=headers,json={**other,'action':'join'}).status_code==200
    assert client.post('/internal/discord',headers=headers,json={**other,'action':'advance','data':{'expected_stage':'lobby'}}).status_code==403

def test_public_creation_can_be_disabled(client,monkeypatch):
    monkeypatch.setenv('RELAY_PUBLIC_DEMO','false')
    assert client.post('/api/sessions',json={'name':'Rithik'}).status_code==403

def test_production_disables_demo_even_if_flag_is_true(client,monkeypatch):
    monkeypatch.setenv('RELAY_ENV','production')
    assert client.post('/api/sessions',json={'name':'Rithik'}).status_code==403
    assert client.post('/api/sessions/anything/join',json={'name':'Dev'}).status_code==403
    assert client.get('/health').status_code==200

def test_production_requires_strong_service_key(tmp_path,monkeypatch):
    monkeypatch.setenv('RELAY_ENV','production')
    monkeypatch.setenv('RELAY_SERVICE_KEY','short')
    with pytest.raises(RuntimeError):
        make_app(str(tmp_path/'prod.sqlite3'))

def test_sessions_survive_api_restart(tmp_path,monkeypatch):
    key='test-key-'+'x'*40
    monkeypatch.delenv('RELAY_ENV',raising=False)
    monkeypatch.setenv('RELAY_SERVICE_KEY',key)
    monkeypatch.setenv('RELAY_PUBLIC_DEMO','true')
    db=str(tmp_path/'volume'/'relay.sqlite3')
    headers={'X-Relay-Key':key}
    base={'channel':'1:2','name':'Rithik','user_id':'123'}
    first=TestClient(make_app(db))
    created=first.post('/internal/discord',headers=headers,json={**base,'action':'create','data':{}}).json()['state']
    first.post('/internal/discord',headers=headers,json={**base,'name':'Dev','user_id':'456','action':'join'})
    local=first.post('/api/sessions',json={'name':'Kanha'}).json()
    # A new app instance on the same file stands in for a Railway redeploy with a volume.
    second=TestClient(make_app(db))
    after=second.post('/internal/discord',headers=headers,json={**base,'action':'view'}).json()['state']
    assert after['id']==created['id'] and len(after['members'])==2
    r=second.get('/api/sessions/'+local['session_id'],headers={'Authorization':'Bearer '+local['token']})
    assert r.status_code==200

def test_validation(client):
    assert client.post('/api/sessions',json={'name':''}).status_code==422


def test_n8n_files_static_shape():
    files=list((Path(__file__).resolve().parents[1]/'n8n').glob('*.json'))
    assert len(files)>=3
    for path in files:
        flow=json.loads(path.read_text())
        names={node['name'] for node in flow['nodes']}
        assert flow['active'] is False
        assert flow['settings']['timezone']=='America/Phoenix'
        for name,links in flow['connections'].items():
            assert name in names
            for branch in links.get('main',[]):
                for edge in branch:assert edge['node'] in names
        for node in flow['nodes']:
            if node['type']=='n8n-nodes-base.httpRequest':
                assert node['parameters']['authentication']=='genericCredentialType'
