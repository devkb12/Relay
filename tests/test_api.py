import json
from pathlib import Path
from fastapi.testclient import TestClient
from relay.api import make_app
import pytest

@pytest.fixture
def client(tmp_path,monkeypatch):
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
