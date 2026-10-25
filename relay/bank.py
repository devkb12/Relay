"""Reviewed-fixture loader. Answer keys never enter public pre-answer projections."""
import json, os
from pathlib import Path
DATA = Path(__file__).resolve().parents[1] / 'data'
BANK = json.loads((DATA / 'questions.json').read_text())
CONCEPTS = {x['id']: x for x in BANK['concepts']}
# The public sample round's pack. Deliberately NOT in CONCEPTS: its keys ship to the browser, so no
# live session may ever use it (create() rejects unknown concept ids).
SAMPLE = json.loads((DATA / 'sample_round.json').read_text(encoding='utf-8'))

# Source-backed packs (data/packs/<name>/pack.json, built by scripts/build_*_pack.py). A pack joins the
# live bank only once its manifest records a human review; drafts stay out of real sessions.
DRAFTS = {}
for _manifest in sorted(DATA.glob('packs/*/manifest.json')):
    _m = json.loads(_manifest.read_text(encoding='utf-8'))
    _c = json.loads((_manifest.parent / 'pack.json').read_text(encoding='utf-8'))
    _c['provenance'] = {'pack_version': _m['version'], 'review_status': _m['review']['status'],
                        'license': _m['source']['license'], 'snapshot_sha256': _m['snapshot']['sha256']}
    (CONCEPTS if _m['review']['status'] == 'reviewed' else DRAFTS)[_c['id']] = _c

def drafts_allowed():
    """Local testing only: a draft pack can be tried before review. Never in production."""
    return (os.getenv('RELAY_ALLOW_DRAFT_PACKS', '').lower() == 'true'
            and os.getenv('RELAY_ENV', '').strip().lower() != 'production')

def available():
    return list(CONCEPTS.values()) + (list(DRAFTS.values()) if drafts_allowed() else [])

def concept(identifier):
    if identifier in DRAFTS and not drafts_allowed():
        raise ValueError('This pack is a draft awaiting human review.')
    if identifier not in CONCEPTS and identifier not in DRAFTS:
        raise ValueError('Unknown concept.')
    return CONCEPTS.get(identifier) or DRAFTS[identifier]

def public_question(item):
    return {key: item[key] for key in ('id', 'prompt', 'options')}
