"""Preview/import this starter into an existing Git checkout without overwriting files.
This script never stages, commits, pushes, installs dependencies, or changes .git.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess
import sys

SKIP_DIRS={'.git','.venv','venv','__pycache__','.pytest_cache','node_modules','.next','artifacts'}

def allowed(path: Path) -> bool:
    if any(p in SKIP_DIRS for p in path.parts): return False
    name=path.name
    if (name=='.env' or name.startswith('.env.')) and name!='.env.example': return False
    if name in {'.DS_Store','Thumbs.db'}: return False
    if any(x in name for x in ('.sqlite','.db-')) or name.endswith(('.db','.log','.pyc','.pem','.key')): return False
    if name.startswith('credentials') and name.endswith('.json'): return False
    return True

def plan_import(source: Path, target: Path):
    source,target=source.resolve(),target.resolve()
    if source==target or source in target.parents or target in source.parents:
        raise ValueError('Extract the source outside the target checkout; do not nest them.')
    pending,identical,conflicts=[],[],[]
    for src in sorted(source.rglob('*')):
        rel=src.relative_to(source)
        if not allowed(rel): continue
        if src.is_symlink(): raise ValueError(f'Symlinks are not imported: {rel}')
        if not src.is_file(): continue
        dest=target/rel
        # Refuse symlinks in the destination file or any intermediate directory.
        probe=dest
        while probe!=target:
            if probe.is_symlink(): raise ValueError(f'Destination contains a symlink: {rel}')
            probe=probe.parent
        if dest.exists():
            if dest.is_file() and dest.read_bytes()==src.read_bytes(): identical.append(rel)
            else: conflicts.append(rel)
        else:
            parent=dest.parent
            while parent!=target:
                if parent.exists() and not parent.is_dir():
                    conflicts.append(rel);break
                parent=parent.parent
            else: pending.append(rel)
    return pending,identical,conflicts

def apply_import(source: Path,target: Path):
    pending,identical,conflicts=plan_import(source,target)
    if conflicts: raise ValueError('Conflicting files: '+', '.join(map(str,conflicts)))
    for rel in pending:
        dest=target/rel
        dest.parent.mkdir(parents=True,exist_ok=True)
        with dest.open('xb') as f: f.write((source/rel).read_bytes())
    return len(pending),len(identical)

def canonical_remote(url: str) -> str:
    url=url.strip().rstrip('/')
    if url.endswith('.git'): url=url[:-4]
    prefixes=('https://github.com/','git@github.com:','ssh://git@github.com/')
    for prefix in prefixes:
        if url.startswith(prefix): return url[len(prefix):].lower()
    return ''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target',type=Path,required=True,help='Existing local devkb12/Relay checkout')
    parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--apply',action='store_true',help='Copy new files after a conflict-free preview')
    args=parser.parse_args()
    source,target=args.source.resolve(),args.target.resolve()
    if not all((source/p).is_file() for p in ('CLAUDE.md','relay/api.py','web/index.html')):
        parser.error('Source must be the extracted starter root.')
    if not target.is_dir(): parser.error('Target must already exist; clone the repository first if needed.')
    try:
        top=subprocess.run(['git','-C',str(target),'rev-parse','--show-toplevel'],check=True,capture_output=True,text=True).stdout.strip()
        if Path(top).resolve()!=target: raise ValueError('Target must be the repository root.')
        remote=subprocess.run(['git','-C',str(target),'remote','get-url','origin'],check=True,capture_output=True,text=True).stdout
        if canonical_remote(remote)!='devkb12/relay': raise ValueError('Origin is not devkb12/Relay. No files imported.')
        pending,identical,conflicts=plan_import(source,target)
        print(f'New files: {len(pending)}; identical: {len(identical)}; conflicts: {len(conflicts)}')
        for p in conflicts: print('CONFLICT:',p)
        if conflicts:
            print('Resolve these individually; this script will not overwrite them.');return 2
        if args.apply:
            count,_=apply_import(source,target)
            print(f'Imported {count} files. No Git commit or push was performed.')
        else:
            print('Preview only. Add --apply to copy new files. Review Git status before committing.')
        return 0
    except (ValueError,OSError,subprocess.CalledProcessError) as exc:
        print('Import stopped:',exc,file=sys.stderr);return 2

if __name__=='__main__': raise SystemExit(main())
