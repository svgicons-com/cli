import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../src/cli.js';
import { clearRuntimeOverrides } from '../src/config.js';

test('project init sync and build create deterministic local svg output', async () => {
  const root = join(tmpdir(), `svgicons-cli-project-${Date.now()}`);
  const manifestPath = join(root, 'svgicons.json');
  const lockfilePath = join(root, 'svgicons.lock');
  const outputDir = join(root, 'icons');
  await mkdir(root, { recursive: true });

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://example.test/mcp');
    const body = JSON.parse(init.body);
    const args = body.params.arguments;

    assert.equal(body.params.name, 'get_icon');
    assert.equal(args.includeSvg, true);

    return jsonResponse({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        structuredContent: {
          icon: {
            id: args.id,
            name: 'arrow-circle-up-fill',
            width: 24,
            height: 24,
            svg: '<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>',
            iconSet: {
              id: 4,
              name: 'Test Icons',
              prefix: 'test-icons',
              license: 'MIT',
              licenseUrl: 'https://example.test/license',
            },
          },
        },
      },
    });
  };

  try {
    await captureConsole(() => run([
      'init',
      '--manifest',
      manifestPath,
      '--output',
      outputDir,
      '--json',
    ]));

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.icons.push({ ref: '33716-arrow-circle-up-fill' });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    await captureConsole(() => run([
      '--base-url',
      'https://example.test',
      'sync',
      '--manifest',
      manifestPath,
      '--lockfile',
      lockfilePath,
      '--json',
    ]));

    const firstLock = await readFile(lockfilePath, 'utf8');
    const lockfile = JSON.parse(firstLock);
    assert.equal(lockfile.icons[0].ref, '33716-arrow-circle-up-fill');
    assert.equal(lockfile.icons[0].license, 'MIT');
    assert.match(lockfile.icons[0].svgHash, /^sha256-/);

    await captureConsole(() => run([
      'build',
      '--manifest',
      manifestPath,
      '--lockfile',
      lockfilePath,
      '--json',
    ]));
    await captureConsole(() => run([
      'build',
      '--manifest',
      manifestPath,
      '--lockfile',
      lockfilePath,
      '--json',
    ]));

    assert.equal(await readFile(join(outputDir, '33716-arrow-circle-up-fill.svg'), 'utf8'), `${lockfile.icons[0].svg}\n`);
    assert.equal(await readFile(lockfilePath, 'utf8'), firstLock);
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('project sync can lock icons from an icon collection', async () => {
  const root = join(tmpdir(), `svgicons-cli-project-collection-${Date.now()}`);
  const manifestPath = join(root, 'svgicons.json');
  const lockfilePath = join(root, 'svgicons.lock');
  await mkdir(root, { recursive: true });
  await writeFile(manifestPath, JSON.stringify({
    version: 1,
    format: 'svg',
    output: 'icons',
    icons: [],
    collections: [{ ref: 'Dashboard icons' }],
  }, null, 2), 'utf8');

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer svgicons_secret_token_1234567890');

    if (url === 'https://example.test/api/pro/project-kits') {
      return jsonResponse({
        data: [
          { id: 12, name: 'Dashboard icons', slug: 'dashboard-icons', iconsCount: 1 },
        ],
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12?per_page=100&page=1') {
      return jsonResponse({
        data: { id: 12, name: 'Dashboard icons' },
        icons: {
          current_page: 1,
          last_page: 1,
          data: [
            {
              id: 240297,
              name: 'adjust',
              width: 24,
              height: 24,
              body: '<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
              iconSet: {
                id: 8,
                name: 'Collection Icons',
                prefix: 'collection-icons',
                license: 'Apache 2.0',
                licenseUrl: 'https://example.test/apache',
              },
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await captureConsole(() => run([
      '--base-url',
      'https://example.test',
      '--token',
      'svgicons_secret_token_1234567890',
      'sync',
      '--manifest',
      manifestPath,
      '--lockfile',
      lockfilePath,
      '--json',
    ]));

    const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'));
    assert.equal(lockfile.icons.length, 1);
    assert.equal(lockfile.icons[0].ref, '240297-adjust');
    assert.equal(lockfile.icons[0].license, 'Apache 2.0');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('license check and export use local lockfile policy data', async () => {
  const root = join(tmpdir(), `svgicons-cli-license-${Date.now()}`);
  const lockfilePath = join(root, 'svgicons.lock');
  const exportPath = join(root, 'THIRD_PARTY_ICONS.md');
  await mkdir(root, { recursive: true });
  await writeFile(lockfilePath, JSON.stringify({
    version: 1,
    icons: [
      { id: 1, name: 'ok', ref: '1-ok', license: 'MIT', iconSet: { name: 'MIT Set' }, svg: '<svg />' },
      { id: 2, name: 'blocked', ref: '2-blocked', license: 'GPL', iconSet: { name: 'GPL Set' }, svg: '<svg />' },
    ],
  }, null, 2), 'utf8');

  const output = await captureConsole(() => run([
    'license',
    'check',
    '--lockfile',
    lockfilePath,
    '--deny',
    'GPL',
    '--json',
  ]));
  const report = JSON.parse(output);

  assert.equal(report.ok, false);
  assert.equal(report.violations[0].icon.ref, '2-blocked');

  await assert.rejects(
    () => captureConsole(() => run([
      'license',
      'check',
      '--lockfile',
      lockfilePath,
      '--deny',
      'GPL',
      '--fail',
    ])),
    (error) => error.code === 'license_violation' && error.details.checkedIcons === 2,
  );

  await captureConsole(() => run([
    'license',
    'export',
    '--lockfile',
    lockfilePath,
    '--format',
    'markdown',
    '--output',
    exportPath,
  ]));

  const markdown = await readFile(exportPath, 'utf8');
  assert.match(markdown, /Third-party SVG icons/);
  assert.match(markdown, /\| MIT \| 1 \|/);
});

async function captureConsole(callback) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));

  try {
    await callback();
    return lines.join('\n');
  } finally {
    console.log = originalLog;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
