"""Reviewed-fixture loader. Answer keys never enter public pre-answer projections."""
import json
from pathlib import Path
BANK = json.loads((Path(__file__).resolve().parents[1] / 'data/questions.json').read_text())
CONCEPTS = {x['id']: x for x in BANK['concepts']}

def concept(identifier):
    if identifier not in CONCEPTS:
        raise ValueError('Unknown concept.')
    return CONCEPTS[identifier]

def public_question(item):
    return {key: item[key] for key in ('id', 'prompt', 'options')}
