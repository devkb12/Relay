"""Canonical sample-round snapshots, produced by the real core so the browser's sample engine can be
checked against them (web/tests/unit/sample.test.ts). The sample pack is registered only for the
duration of this export; live sessions can never use it. No network, no real people."""
from __future__ import annotations
import tempfile
from pathlib import Path

SID, CHALLENGE = 'sample-round', 'sample-challenge'
NOW = 1_793_131_200.0  # 2026-10-24T20:00:00Z, the same clock the contract fixtures use

PATHS = {
    'agree-then-understand': [
        ['advance'], ['peers'], ['answer', 'A', 'confident'], ['advance'], ['peers'],
        ['explain', 'The second change works on the new total, so 25% of 100 comes off.'],
        ['advance'], ['peers'], ['answer', 'C', 'somewhat'], ['advance']],
    'right-first-close-round': [
        ['advance'], ['answer', 'B', 'unsure'], ['peers'], ['advance'], ['peers'], ['advance'],
        ['peer', 'Ari'], ['peer', 'Cy'], ['answer', 'B', 'confident'], ['advance', 'mark_missing']],
    'skip-and-challenge': [
        ['advance'], ['peers'], ['answer', 'SKIP', 'unsure'], ['advance'],
        ['challenge', 'Does "the new total" mean after the songs were added?'],
        ['resolve', 'resume', 'Checked the sample note: the second change uses the new total.'],
        ['peers'], ['advance'], ['peers'], ['answer', 'SKIP', 'unsure'], ['advance']],
    'discard': [
        ['advance'], ['peer', 'Ari'],
        ['challenge', 'Two of the options could both be read as correct.'],
        ['resolve', 'discard', 'Withdrawn for this sample: the wording needs another review.']],
}


def run(core, sample, path):
    """Play one path as 'You' (the host) with the scripted fictional peers."""
    c = sample['concept']
    you = core.create(sample['you'], c['id']); sid = you['session_id']
    peers = {p['name']: core.join(sid, p['name']) for p in sample['peers']}
    done = set()

    def view():
        v = core.view(sid, you['token'])
        v['id'] = SID
        if v.get('challenge'): v['challenge']['id'] = CHALLENGE
        return v

    def peer(name, stage):
        if (name, stage) in done: return
        done.add((name, stage))
        if stage in ('diagnostic', 'transfer'):
            step = next(p for p in sample['peers'] if p['name'] == name)[stage]
            core.answer(sid, peers[name]['token'], c[stage]['id'], step['choice'], step['confidence'])
        elif stage == 'discussion':
            for e in sample['explanations']:
                if e['by'] == name: core.explain(sid, peers[name]['token'], e['text'])

    def scripted(stage):
        if stage in ('diagnostic', 'transfer'):
            return [p['name'] for p in sorted(sample['peers'], key=lambda p: p[stage]['after_ms'])]
        if stage == 'discussion':
            return [e['by'] for e in sorted(sample['explanations'], key=lambda e: e['after_ms'])]
        return []

    steps = [{'op': None, 'view': view()}]
    for op in path:
        stage = core.view(sid, you['token'])['stage']
        kind = op[0]
        if kind == 'advance': core.advance(sid, you['token'], stage, op[1] if len(op) > 1 else 'wait')
        elif kind == 'answer': core.answer(sid, you['token'], c[stage]['id'], op[1], op[2])
        elif kind == 'explain': core.explain(sid, you['token'], op[1])
        elif kind == 'challenge': core.challenge(sid, you['token'], op[1])
        elif kind == 'resolve': core.resolve_challenge(sid, you['token'], op[1], op[2])
        elif kind == 'peers':
            for name in scripted(stage): peer(name, stage)
        elif kind == 'peer': peer(op[1], stage)
        else: raise ValueError(op)
        steps.append({'op': op, 'view': view()})
    return steps


def export(write, root):
    from relay import bank
    from relay.core import Relay
    from relay.store import Store
    sample = bank.SAMPLE; cid = sample['concept']['id']
    assert cid not in bank.CONCEPTS, 'the sample pack must never be a live concept'
    bank.CONCEPTS[cid] = sample['concept']
    try:
        with tempfile.TemporaryDirectory() as td:
            out = {}
            for i, (name, path) in enumerate(PATHS.items()):
                core = Relay(Store(str(Path(td) / f'sample{i}.sqlite3')), now=lambda: NOW)
                out[name] = run(core, sample, path)
            pack_hash = out['discard'][0]['view']['pack_hash']
    finally:
        del bank.CONCEPTS[cid]
    write(root / 'contracts/fixtures/sample-pack.json', dict(sample, pack_hash=pack_hash, now=NOW))
    write(root / 'contracts/fixtures/sample-paths.json', out)
