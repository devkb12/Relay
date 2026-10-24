"""Mocked transport tests, NOT a live-model accuracy/latency evaluation."""
import asyncio
import json
import pytest
from relay import model

CONTEXT={
    'source_id':'fixture-source',
    'source_text':'Each percentage operates on the current amount, not the original amount.',
    'reviewed_hint':'Which amount is used at each step?'
}

def install_response(monkeypatch, **changes):
    body={
        'possible_misconception':'The group may be using the initial amount twice.',
        'discussion_question':'Which amount is used at each step?',
        'source_id':'fixture-source',
        'evidence_quote':'Each percentage operates on the current amount',
        'needs_review':False
    }
    body.update(changes)
    seen={}
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'candidates':[{'content':{'parts':[{'text':json.dumps(body)}]}}]}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def post(self,url,**kwargs):
            seen.update(url=url,**kwargs)
            return Response()
    monkeypatch.setenv('RELAY_MODEL_PROVIDER','gemini')
    monkeypatch.setenv('GEMINI_API_KEY','synthetic-test-key')
    monkeypatch.setenv('RELAY_MODEL','synthetic-model-id')
    monkeypatch.setattr(model.httpx,'AsyncClient',Client)
    return seen

def test_no_provider_uses_curated_hint(monkeypatch):
    monkeypatch.setenv('RELAY_MODEL_PROVIDER','none')
    assert asyncio.run(model.facilitate(CONTEXT))['mode']=='curated fallback'

def test_unknown_provider_rejected(monkeypatch):
    monkeypatch.setenv('RELAY_MODEL_PROVIDER','unknown')
    with pytest.raises(ValueError): asyncio.run(model.facilitate(CONTEXT))

def test_missing_key_rejected(monkeypatch):
    monkeypatch.setenv('RELAY_MODEL_PROVIDER','gemini')
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    with pytest.raises(ValueError): asyncio.run(model.facilitate(CONTEXT))

def test_schema_and_no_tool_access_in_mock_request(monkeypatch):
    seen=install_response(monkeypatch)
    out=asyncio.run(model.facilitate(CONTEXT))
    assert out['mode'].startswith('live model') # Response path label; transport is mocked here.
    assert 'responseJsonSchema' in seen['json']['generationConfig']
    assert 'tools' not in seen['json']
    assert seen['headers']=={'x-goog-api-key':'synthetic-test-key'}

@pytest.mark.parametrize('changes',[
    {'source_id':'wrong-source'},
    {'evidence_quote':'This sentence is absent from the supplied source.'},
    {'needs_review':True},
    {'discussion_question':'Is the correct numerical answer 75?'},
    {'unexpected':'forbidden extra field'}
])
def test_unsupported_or_leaking_output_rejected(monkeypatch,changes):
    install_response(monkeypatch,**changes)
    with pytest.raises(ValueError): asyncio.run(model.facilitate(CONTEXT))

def test_model_identifier_cannot_change_endpoint(monkeypatch):
    install_response(monkeypatch)
    monkeypatch.setenv('RELAY_MODEL','bad/endpoint?key=bad')
    with pytest.raises(ValueError): asyncio.run(model.facilitate(CONTEXT))


def test_live_provider_requires_explicit_model(monkeypatch):
    install_response(monkeypatch)
    monkeypatch.delenv("RELAY_MODEL", raising=False)
    with pytest.raises(ValueError, match="RELAY_MODEL"):
        asyncio.run(model.facilitate(CONTEXT))
