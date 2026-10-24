"""Explicit migration step: python -m relay.migrate (Railway pre-deploy command)."""

from dotenv import load_dotenv
from .store import Store, default_db

if __name__ == '__main__':
    load_dotenv()
    store = Store(default_db(), auto_migrate=True)
    print(f'{store.backend} schema at version {store.schema_version()}.')
