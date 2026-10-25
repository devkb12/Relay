import next from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  // Legacy FastAPI-served UI stays plain JS and is checked by `node --check web/app.js` in CI.
  { ignores: ['app.js', 'index.html', 'style.css', '.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  ...next,
  ...nextTs,
];

export default config;
