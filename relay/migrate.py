"""Explicit migration step: python -m relay.migrate (Railway pre-deploy command)."""


from .store import Store, default_db, load_local_env

if __name__ == '__main__':
    load_local_env()
    store = Store(default_db(), auto_migrate=True)
    print(f'{store.backend} schema at version {store.schema_version()}.')
