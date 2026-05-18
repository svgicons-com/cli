import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clearRuntimeOverrides, writeConfig } from '../src/config.js';
import { proApi } from '../src/api.js';

test('proApi normalizes missing scope errors', async () => {
  const root = join(tmpdir(), `svgicons-cli-api-${Date.now()}`);
  await mkdir(root, { recursive: true });
  process.env.SVGICONS_CLI_CONFIG_DIR = root;
  delete process.env.SVGICONS_TOKEN;
  delete process.env.SVGICONS_API_TOKEN;
  delete process.env.SVGICONS_BASE_URL;

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    message: 'This token is missing the collections:read scope.',
    requiredScopes: ['collections:read'],
    missingScope: 'collections:read',
  }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });

  try {
    await writeConfig({
      baseUrl: 'https://example.test',
      token: 'svgicons_secret_token_1234567890',
    });

    await assert.rejects(
      () => proApi('/api/pro/project-kits'),
      (error) => error.code === 'missing_scope'
        && error.status === 403
        && error.details.missingScope === 'collections:read',
    );
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    delete process.env.SVGICONS_CLI_CONFIG_DIR;
    await rm(root, { recursive: true, force: true });
  }
});
