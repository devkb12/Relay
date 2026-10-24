"""Create an isolated local environment. Installs packages only with --install.
No services are started, no credentials are printed, and no Git changes are pushed.
"""
from __future__ import annotations
import argparse,os,secrets,subprocess,sys,venv
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install',action='store_true',help='Install requirements in .venv')
    args=parser.parse_args()
    if sys.version_info<(3,11): parser.error('Use Python 3.11 or newer.')
    root=Path(__file__).resolve().parents[1]
    env=root/'.venv'
    exe=env/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if not exe.exists(): venv.EnvBuilder(with_pip=True).create(env)
    dotenv=root/'.env'
    if not dotenv.exists():
        text=(root/'.env.example').read_text().replace('RELAY_SERVICE_KEY=\n','RELAY_SERVICE_KEY='+secrets.token_urlsafe(48)+'\n')
        with dotenv.open('x') as f: f.write(text)
        if os.name!='nt': dotenv.chmod(0o600)
        print('Created a local .env with a private service key. No secret was printed.')
    else: print('Kept the existing .env unchanged.')
    if args.install:
        subprocess.run([str(exe),'-m','pip','install','-r',str(root/'requirements.txt')],cwd=root,check=True)
    print('Environment ready. Live model and messages remain off in the new default .env.')
    print('Tests:',str(exe),'-m pytest')
    print('Local server:',str(exe),'-m uvicorn relay.api:app --reload --host 127.0.0.1')
    print('Do not deploy the local demo publicly before implementing the documented security boundary.')

if __name__=='__main__': main()
