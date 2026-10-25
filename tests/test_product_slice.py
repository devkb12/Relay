"""Product slice: allowed_actions agree with the server's own rules; the receipt is evidence-linked
and honest; neither leaks into the shared-screen projection."""
import sqlite3
import pytest
from relay.api import presentation_view
from relay.core import Relay, RelayError, DAY
from relay.store import Store
from relay.bank import concept

C = concept('compound-change')
WRONG = next(k for k in C['diagnostic']['options'] if k != C['diagnostic']['correct'])
CALLS = {
    'answer': lambda r, sid, t, v: r.answer(sid, t, (v['question'] or {}).get('id', 'none'), next(iter(C['diagnostic']['options']))),
    'explain': lambda r, sid, t, v: r.explain(sid, t, 'The second change applies to the new amount.'),
    'source_fallback': lambda r, sid, t, v: r.explain(sid, t, '', source_fallback=True),
    'challenge': lambda r, sid, t, v: r.challenge(sid, t, 'Probe: is the wording clear?'),
    'resolve': lambda r, sid, t, v: r.resolve_challenge(sid, t, 'resume', 'Probe review note, resumed.'),
    'advance': lambda r, sid, t, v: r.advance(sid, t, v['stage']),
    # close_round is only a distinct action while someone has not answered; otherwise it is plain advance.
    'close_round': lambda r, sid, t, v: r.advance(sid, t, v['stage'], 'mark_missing') if v['waiting_on'] else _refuse(),
}


def _refuse():
    raise RelayError('Nothing to close.')


class World:
    def __init__(self, tmp_path):
        self.tmp, self.n, self.t = tmp_path, 0, 1_800_000_000.0
        self.path = str(tmp_path / 'w.sqlite3')
        self.r = Relay(Store(self.path), now=lambda: self.t)

    def clone(self):
        """A throwaway copy of the database, so probing an action never changes the real session."""
        self.n += 1
        dst_path = str(self.tmp / f'probe{self.n}.sqlite3')
        src, dst = sqlite3.connect(self.path), sqlite3.connect(dst_path)
        src.backup(dst); src.close(); dst.close()
        return Relay(Store(dst_path), now=lambda: self.t)

    def agrees(self, sid, people):
        """For every actor and action: allowed => the server accepts it; not allowed => it refuses."""
        for token in people:
            view = self.r.view(sid, token)
            for action, call in CALLS.items():
                entry = view['allowed_actions'][action]
                try:
                    call(self.clone(), sid, token, view); accepted = True
                except RelayError:
                    accepted = False
                assert accepted == entry['allowed'], (view['stage'], action, entry)
                assert (entry['reason'] is None) == entry['allowed']


def test_allowed_actions_match_the_server_at_every_step(tmp_path):
    w = World(tmp_path); r = w.r
    host = r.create('Host'); sid = host['session_id']
    b, c = r.join(sid, 'B'), r.join(sid, 'C')
    people = [host['token'], b['token'], c['token']]
    w.agrees(sid, people)                                   # lobby
    r.advance(sid, host['token'], 'lobby'); w.agrees(sid, people)
    r.answer(sid, host['token'], C['diagnostic']['id'], WRONG, 'confident'); w.agrees(sid, people)
    r.answer(sid, b['token'], C['diagnostic']['id'], WRONG, 'confident'); w.agrees(sid, people)  # 2 of 3: closable
    r.advance(sid, host['token'], 'diagnostic', 'mark_missing'); w.agrees(sid, people)        # discussion, no explanation
    r.challenge(sid, c['token'], 'Is the base stated clearly?'); w.agrees(sid, people)        # paused
    r.resolve_challenge(sid, host['token'], 'resume', 'Checked the source; it is explicit.')
    r.explain(sid, b['token'], 'The second percentage uses the new amount.'); w.agrees(sid, people)
    r.advance(sid, host['token'], 'discussion'); w.agrees(sid, people)                        # transfer
    for p in people: r.answer(sid, p, C['transfer']['id'], C['transfer']['correct'], 'somewhat')
    w.agrees(sid, people)
    r.advance(sid, host['token'], 'transfer'); w.agrees(sid, people)                          # debrief
    w.t += DAY; w.agrees(sid, people)                                                         # delayed check due
    r.withdraw(sid, c['token'])
    assert not any(a['allowed'] for a in r.view(sid, c['token'])['allowed_actions'].values())


def test_waiting_reason_is_specific(tmp_path):
    r = World(tmp_path).r
    host = r.create('Host'); sid = host['session_id']; b = r.join(sid, 'B'); r.join(sid, 'C')
    r.advance(sid, host['token'], 'lobby')
    r.answer(sid, host['token'], C['diagnostic']['id'], WRONG)
    v = r.view(sid, host['token'])
    assert v['waiting_on'] == 2 and v['allowed_actions']['advance']['reason'] == 'Waiting for 2 more answers.'
    assert v['allowed_actions']['close_round']['reason'] == 'At least two responses are needed before closing the round.'
    assert r.view(sid, b['token'])['allowed_actions']['advance']['reason'] == 'The host moves the group forward.'


def finished(tmp_path, fresh_choice, members=3):
    r = World(tmp_path).r
    host = r.create('Host'); sid = host['session_id']
    people = [host] + [r.join(sid, n) for n in 'BCD'[:members - 1]]
    r.advance(sid, host['token'], 'lobby')
    for p in people: r.answer(sid, p['token'], C['diagnostic']['id'], WRONG, 'confident')
    r.advance(sid, host['token'], 'diagnostic')
    r.explain(sid, people[1]['token'], 'The second percentage uses the new amount.')
    r.advance(sid, host['token'], 'discussion')
    for p in people: r.answer(sid, p['token'], C['transfer']['id'], fresh_choice)
    r.advance(sid, host['token'], 'transfer')
    return r, sid, people


def test_receipt_links_evidence_and_never_claims_mastery(tmp_path):
    r, sid, people = finished(tmp_path, C['transfer']['correct'])
    rc = r.view(sid, people[1]['token'])['receipt']
    assert rc['initial']['status'] == 'incorrect' and rc['fresh']['status'] == 'correct'
    assert rc['initial']['prompt'] == C['diagnostic']['prompt'] and rc['fresh']['question_id'] == C['transfer']['id']
    assert rc['explanations'] == {'shared': 1, 'mine': 1, 'source_fallback': False}
    assert rc['next_step']['kind'] == 'try_later' and rc['next_step']['policy'] == 'receipt-v1'
    assert rc['next_step']['evidence'] == [C['diagnostic']['id'], C['transfer']['id'], C['source_id']]
    policy_text = (rc['next_step']['text'] + ' '.join(rc['limits'])).lower()
    assert 'mastery' not in policy_text and '%' not in policy_text and 'score' not in policy_text
    assert r.view(sid, people[0]['token'])['receipt']['explanations']['mine'] == 0


def test_receipt_next_step_follows_the_fresh_outcome(tmp_path):
    wrong_fresh = next(k for k in C['transfer']['options'] if k != C['transfer']['correct'])
    r, sid, people = finished(tmp_path / 'a', wrong_fresh)
    step = r.view(sid, people[0]['token'])['receipt']['next_step']
    assert step['kind'] == 'revisit_source' and C['source_title'] in step['text']
    r, sid, people = finished(tmp_path / 'b', 'SKIP')
    rc = r.view(sid, people[0]['token'])['receipt']
    assert rc['fresh']['status'] == 'skipped' and rc['fresh']['choice'] is None and rc['next_step']['kind'] == 'no_fresh_answer'


def test_discarded_item_receipt_counts_nothing(tmp_path):
    r = World(tmp_path).r
    host = r.create('Host'); sid = host['session_id']; b = r.join(sid, 'B')
    r.advance(sid, host['token'], 'lobby')
    r.challenge(sid, b['token'], 'The question is ambiguous.')
    r.resolve_challenge(sid, host['token'], 'discard', 'Ambiguous wording; withdrawn.')
    rc = r.view(sid, b['token'])['receipt']
    assert rc['initial']['status'] == rc['fresh']['status'] == 'invalidated'
    assert rc['initial']['reviewed_answer'] is None and rc['next_step']['kind'] == 'discarded'
    assert rc['delayed_check']['opted_in'] is False


def test_two_person_group_results_stay_suppressed_but_receipt_is_private(tmp_path):
    r, sid, people = finished(tmp_path, C['transfer']['correct'], members=2)
    v = r.view(sid, people[0]['token'])
    assert v['group'] is None and v['receipt']['fresh']['status'] == 'correct'


def test_presentation_view_never_carries_private_projection(tmp_path):
    r, sid, people = finished(tmp_path, C['transfer']['correct'])
    shared = presentation_view(r.view(sid, people[0]['token']))
    for private in ('receipt', 'allowed_actions', 'my_results', 'my_answer', 'me', 'waiting_on'):
        assert private not in shared


def test_bot_links_the_exact_session_and_never_a_credential(monkeypatch):
    from relay import bot
    monkeypatch.setattr(bot, 'WEB', 'https://relay.example.edu')
    assert bot.room_link('AbC123xyz') == 'https://relay.example.edu/room/AbC123xyz'
    embed = bot.group_embed({'id': 'AbC123xyz', 'concept': {'title': 'T'}, 'stage': 'lobby', 'members': []})
    field = next(f for f in embed.fields if f.name == 'On the web')
    assert '/room/AbC123xyz' in field.value and 'token' not in field.value.lower()
    for unsafe in ('', 'javascript:alert(1)', 'ftp://x', 'http://evil.example'):
        monkeypatch.setattr(bot, 'WEB', unsafe)
        assert bot.room_link('AbC123xyz') is None


def test_relative_sqlite_path_is_one_database_whatever_the_working_directory(tmp_path, monkeypatch):
    from relay.store import default_db, REPO
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('RELAY_DB', 'relay.sqlite3')
    monkeypatch.chdir(tmp_path)
    assert default_db() == str(REPO / 'relay.sqlite3')
    absolute = str(tmp_path / 'x.sqlite3')
    monkeypatch.setenv('RELAY_DB', absolute)
    assert default_db() == absolute
    monkeypatch.setenv('RELAY_DB', 'postgresql://u@h/db')
    assert default_db() == 'postgresql://u@h/db'
