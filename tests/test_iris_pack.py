"""The Iris pack: numbers come from the frozen, checksummed snapshot; drafts stay out of live sessions."""
import json, statistics
from pathlib import Path
import pytest
from relay import bank
from relay.core import Relay, RelayError
from relay.store import Store
from scripts import build_iris_pack as b

PACK = Path(b.PACK)


def test_committed_pack_is_exactly_what_the_build_produces():
    concept, manifest = b.build()
    assert json.loads((PACK / 'pack.json').read_text(encoding='utf-8')) == concept
    assert json.loads((PACK / 'manifest.json').read_text(encoding='utf-8')) == manifest
    assert manifest['source']['license'] == 'CC BY 4.0' and manifest['snapshot']['sha256'] == b.SHA256


def test_every_number_shown_is_independently_recomputed():
    rows = b.load()
    def r(a, c, s=None):
        sub = [x for x in rows if s is None or x['species'] == s]
        return round(statistics.correlation([x[a] for x in sub], [x[c] for x in sub]), 2)
    c = json.loads((PACK / 'pack.json').read_text(encoding='utf-8'))
    minus = lambda v: f'{v:.2f}'.replace('-', '−')
    assert f"r = {minus(r('petal_length', 'petal_width'))}" in c['diagnostic']['prompt']
    assert f"r = {minus(r('sepal_length', 'sepal_width'))}" in c['transfer']['prompt']
    for s in ('setosa', 'versicolor', 'virginica'):
        assert minus(r('sepal_length', 'sepal_width', s)) in c['transfer']['prompt']
    assert r('sepal_length', 'sepal_width') < 0 < min(r('sepal_length', 'sepal_width', s) for s in ('setosa', 'versicolor', 'virginica'))
    mean = lambda s: sum(x['petal_length'] for x in rows if x['species'] == s) / 50
    assert f'{mean("setosa"):.2f} cm' in c['retention']['prompt'] and f'{mean("versicolor"):.2f} cm' in c['retention']['prompt']
    for phase in ('diagnostic', 'transfer', 'retention'):
        item = c[phase]
        assert item['correct'] in item['options'] and item['correct'] not in item['misconceptions']
        assert set(item['misconceptions']) == set(item['options']) - {item['correct']}


def test_a_tampered_snapshot_is_refused(tmp_path, monkeypatch):
    bad = tmp_path / 'bezdekIris.data'
    bad.write_bytes(b.SNAPSHOT.read_bytes().replace(b'5.1,3.5', b'9.9,3.5', 1))
    monkeypatch.setattr(b, 'SNAPSHOT', bad)
    with pytest.raises(SystemExit, match='checksum'):
        b.load()


def test_a_draft_pack_cannot_start_a_live_session(tmp_path, monkeypatch):
    assert 'iris-correlation' in bank.DRAFTS and 'iris-correlation' not in bank.CONCEPTS
    r = Relay(Store(str(tmp_path / 'd.sqlite3')))
    monkeypatch.delenv('RELAY_ALLOW_DRAFT_PACKS', raising=False)
    with pytest.raises(ValueError, match='draft awaiting human review'):
        r.create('Host', 'iris-correlation')
    assert 'iris-correlation' not in [c['id'] for c in bank.available()]
    monkeypatch.setenv('RELAY_ALLOW_DRAFT_PACKS', 'true'); monkeypatch.setenv('RELAY_ENV', 'production')
    with pytest.raises(ValueError):
        r.create('Host', 'iris-correlation')


def test_allowed_draft_runs_a_full_round_with_keys_hidden_until_reflect(tmp_path, monkeypatch):
    monkeypatch.setenv('RELAY_ALLOW_DRAFT_PACKS', 'true'); monkeypatch.setenv('RELAY_ENV', 'local')
    r = Relay(Store(str(tmp_path / 'i.sqlite3')))
    host = r.create('Host', 'iris-correlation'); sid = host['session_id']; b2 = r.join(sid, 'B')
    r.advance(sid, host['token'], 'lobby')
    v = r.view(sid, b2['token'])
    assert 'correct' not in v['question'] and 'Fisher' not in json.dumps(v['question'])
    for p in (host, b2): r.answer(sid, p['token'], 'iris-d1', 'A', 'confident')
    r.advance(sid, host['token'], 'diagnostic')
    v = r.view(sid, b2['token'])
    assert 'CC BY 4.0' in v['source']['source_text'] and v['source']['source_id'] == 'uci-iris-53'
    r.explain(sid, b2['token'], 'Correlation describes this sample, not a cause.')
    r.advance(sid, host['token'], 'discussion')
    for p in (host, b2): r.answer(sid, p['token'], 'iris-t1', 'A', 'somewhat')
    r.advance(sid, host['token'], 'transfer')
    rc = r.view(sid, b2['token'])['receipt']
    assert rc['initial']['status'] == 'incorrect' and rc['fresh']['status'] == 'correct'
    assert rc['source']['source_id'] == 'uci-iris-53'
