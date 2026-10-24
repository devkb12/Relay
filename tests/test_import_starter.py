from pathlib import Path
import pytest
from scripts.import_starter import allowed,plan_import,apply_import,canonical_remote

@pytest.fixture
def roots(tmp_path):
    source=tmp_path/'source';target=tmp_path/'target';source.mkdir();target.mkdir()
    return source,target

def test_secrets_and_runtime_files_are_excluded():
    for p in ['.env','.env.local','.git/config','.venv/a.py','db.sqlite3','student.db','artifacts/run.log','credentials.json']:
        assert not allowed(Path(p))
    for p in ['.env.example','.github/workflows/tests.yml','relay/api.py','CLAUDE.md']:
        assert allowed(Path(p))

def test_import_copies_only_new_safe_files(roots):
    s,t=roots;(s/'README.md').write_text('hello');(s/'.env').write_text('private')
    assert apply_import(s,t)==(1,0)
    assert (t/'README.md').read_text()=='hello'
    assert not (t/'.env').exists()

def test_preview_does_not_write(roots):
    s,t=roots;(s/'README.md').write_text('hello')
    assert plan_import(s,t)[0]==[Path('README.md')]
    assert list(t.iterdir())==[]

def test_conflict_prevents_all_writes(roots):
    s,t=roots;(s/'README.md').write_text('incoming');(t/'README.md').write_text('teammate')
    (s/'new.py').write_text('pass')
    with pytest.raises(ValueError): apply_import(s,t)
    assert (t/'README.md').read_text()=='teammate'
    assert not (t/'new.py').exists()

def test_identical_files_are_idempotent(roots):
    s,t=roots;(s/'README.md').write_text('same');(t/'README.md').write_text('same')
    assert apply_import(s,t)==(0,1)

def test_nested_import_refused(roots):
    s,t=roots
    with pytest.raises(ValueError): plan_import(s,s/'nested')
    with pytest.raises(ValueError): plan_import(s,s)

def test_remote_forms_and_wrong_host():
    for u in ['https://github.com/devkb12/Relay.git','git@github.com:devkb12/Relay.git','ssh://git@github.com/devkb12/Relay.git']:
        assert canonical_remote(u)=='devkb12/relay'
    assert canonical_remote('https://example.com/devkb12/Relay.git')==''
