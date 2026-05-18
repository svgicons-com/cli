import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearConfig,
  clearRuntimeOverrides,
  configPath,
  credentials,
  setConfigPathOverride,
  setCredentialOverrides,
  writeConfig,
} from '../src/config.js';

test('config uses override directory and loads stored credentials', async () => {
  const root = join(tmpdir(), `svgicons-cli-config-${Date.now()}`);
  await mkdir(root, { recursive: true });
  process.env.SVGICONS_CLI_CONFIG_DIR = root;
  delete process.env.SVGICONS_TOKEN;
  delete process.env.SVGICONS_API_TOKEN;
  delete process.env.SVGICONS_BASE_URL;

  try {
    assert.equal(configPath(), join(root, 'config.json'));

    await writeConfig({
      baseUrl: 'https://example.test',
      token: 'test-token',
    });

    assert.deepEqual(await credentials(), {
      baseUrl: 'https://example.test',
      token: 'test-token',
    });

    await clearConfig();
    assert.deepEqual(await credentials(), {
      baseUrl: 'https://svgicons.com',
      token: '',
    });
  } finally {
    clearRuntimeOverrides();
    delete process.env.SVGICONS_CLI_CONFIG_DIR;
    await rm(root, { recursive: true, force: true });
  }
});

test('command credential overrides take priority over env and stored config', async () => {
  const root = join(tmpdir(), `svgicons-cli-config-override-${Date.now()}`);
  const path = join(root, 'custom-config.json');
  await mkdir(root, { recursive: true });
  process.env.SVGICONS_TOKEN = 'env-token';
  process.env.SVGICONS_BASE_URL = 'https://env.example.test';

  try {
    setConfigPathOverride(path);
    await writeConfig({
      baseUrl: 'https://stored.example.test',
      token: 'stored-token',
    });
    setCredentialOverrides({
      baseUrl: 'https://command.example.test',
      token: 'command-token',
    });

    assert.deepEqual(await credentials(), {
      baseUrl: 'https://command.example.test',
      token: 'command-token',
    });
  } finally {
    clearRuntimeOverrides();
    delete process.env.SVGICONS_TOKEN;
    delete process.env.SVGICONS_BASE_URL;
    await rm(root, { recursive: true, force: true });
  }
});
