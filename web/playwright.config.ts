import { defineConfig, devices } from '@playwright/test';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Browser checks. Starts two servers:
 *  - a temporary local FastAPI from this repo's relay/ (RELAY_PUBLIC_DEMO=true, model none, delivery off)
 *  - the built Next.js app on 127.0.0.1, proxying to that backend
 * RELAY_PYTHON must point at a Python with requirements.txt installed (default: ../.venv).
 */
const repo = resolve(__dirname, '..');
const python = process.env.RELAY_PYTHON ?? join(repo, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const db = join(tmpdir(), `relay-e2e-${process.pid}.sqlite3`);
const API = 'http://127.0.0.1:8765';
const WEB = 'http://127.0.0.1:3300';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: WEB, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `"${python}" -m uvicorn relay.api:app --host 127.0.0.1 --port 8765`,
      cwd: repo,
      url: `${API}/ready`,
      reuseExistingServer: false,
      env: {
        RELAY_DB: db, RELAY_SERVICE_KEY: 'e2e-' + 'k'.repeat(40), RELAY_PUBLIC_DEMO: 'true', RELAY_ENV: 'local',
        RELAY_MODEL_PROVIDER: 'none', RELAY_DELIVERY_ENABLED: 'false', RELAY_SERVE_WEB: 'false',
      },
    },
    {
      command: 'npx next start -H 127.0.0.1 -p 3300',
      url: WEB,
      reuseExistingServer: false,
      env: { RELAY_API_BASE_URL: API, NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    // The live loop again on a phone: station strip, sticky action bar, no rail.
    { name: 'phone', testMatch: /live-loop\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
