import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../src/cli.js';
import { clearRuntimeOverrides } from '../src/config.js';

test('auth login alias stores token without printing it', async () => {
  const root = join(tmpdir(), `svgicons-cli-routing-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });

  try {
    const output = await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'http://127.0.0.1:8000',
    ]));
    const config = JSON.parse(await readFile(configFile, 'utf8'));

    assert.equal(config.baseUrl, 'http://127.0.0.1:8000');
    assert.equal(config.token, 'svgicons_secret_token_1234567890');
    assert.equal(output.includes('svgicons_secret_token_1234567890'), false);
  } finally {
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('auth login rejects a truncated numeric token from an unquoted shell pipe', async () => {
  await assert.rejects(
    () => captureConsole(() => run([
      'auth',
      'login',
      '--token',
      '10',
    ])),
    (error) => error.code === 'usage_error'
      && /token looks truncated/i.test(error.message)
      && /10\|/i.test(error.message),
  );
});

test('version command matches package metadata', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const output = await captureConsole(() => run(['version']));

  assert.equal(output.trim(), pkg.version);
});

test('help output documents implemented release commands', async () => {
  const output = await captureConsole(() => run(['help']));
  const expectedLines = [
    'svgicons auth login --token <token>',
    'svgicons doctor [--json]',
    'svgicons check [path] [--json] [--strict]',
    'svgicons search "arrow left"',
    'svgicons recommend "billing settings dashboard"',
    'svgicons pick "settings gear"',
    'svgicons collection export <collection-id-or-name>',
    'svgicons export download <export-id>',
    'svgicons init [--collection <collection-id-or-name>]',
    'svgicons license check',
    'svgicons scan [path] [--json] [--write-manifest]',
  ];

  for (const line of expectedLines) {
    assert.match(output, new RegExp(escapeRegExp(line)));
  }
});

test('check passes on a directory with valid package and generated artifacts', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-valid-${Date.now()}`);
  await mkdir(root, { recursive: true });

  try {
    await writeValidGeneratedArtifacts(root);
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root, '--json']));
    const payload = JSON.parse(output);

    assert.equal(payload.path, root);
    assert.equal(payload.ok, true);
    assert.equal(payload.strict, false);
    assert.equal(payload.errors.length, 0);
    assert.equal(payload.warnings.length, 0);
    assert.equal(payload.summary.passed >= 5, true);
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('check warns but exits zero when package.json is missing', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-missing-package-${Date.now()}`);
  await mkdir(root, { recursive: true });

  try {
    await writeValidGeneratedArtifacts(root, { packageJson: false });
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root]));

    assert.match(output, /WARN\tpackage-json\tpackage\.json was not found\./);
    assert.match(output, /Final status: ok/);
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('check strict treats warnings as failures', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-strict-${Date.now()}`);
  await mkdir(root, { recursive: true });

  try {
    await writeValidGeneratedArtifacts(root, { packageJson: false });
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root, '--strict', '--json']));
    const payload = JSON.parse(output);

    assert.equal(payload.ok, false);
    assert.equal(payload.strict, true);
    assert.equal(payload.errors.length, 0);
    assert.equal(payload.warnings.some((warning) => warning.check === 'package-json'), true);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('check detects invalid package.json', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-invalid-package-${Date.now()}`);
  await mkdir(root, { recursive: true });

  try {
    await writeValidGeneratedArtifacts(root);
    await writeFile(join(root, 'package.json'), '{ invalid json');
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root, '--json']));
    const payload = JSON.parse(output);

    assert.equal(payload.ok, false);
    assert.equal(payload.errors.some((error) => error.check === 'package-json'), true);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('check detects invalid icons manifest json', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-invalid-icons-manifest-${Date.now()}`);
  await mkdir(root, { recursive: true });

  try {
    await writeValidGeneratedArtifacts(root);
    await writeFile(join(root, 'icons.manifest.json'), '{ invalid json');
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root, '--json']));
    const payload = JSON.parse(output);

    assert.equal(payload.ok, false);
    assert.equal(payload.errors.some((error) => error.check === 'icons.manifest.json'), true);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('check detects invalid license manifest json', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-invalid-license-manifest-${Date.now()}`);
  await mkdir(root, { recursive: true });

  try {
    await writeValidGeneratedArtifacts(root);
    await writeFile(join(root, 'license-manifest.json'), '{ invalid json');
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root, '--json']));
    const payload = JSON.parse(output);

    assert.equal(payload.ok, false);
    assert.equal(payload.errors.some((error) => error.check === 'license-manifest.json'), true);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('check json output includes stable fields', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-json-${Date.now()}`);
  await mkdir(root, { recursive: true });

  try {
    await writeValidGeneratedArtifacts(root);
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root, '--json']));
    const payload = JSON.parse(output);

    assert.equal(payload.path, root);
    assert.equal(typeof payload.ok, 'boolean');
    assert.equal(Array.isArray(payload.checks), true);
    assert.equal(Array.isArray(payload.warnings), true);
    assert.equal(Array.isArray(payload.errors), true);
    assert.equal(typeof payload.summary.passed, 'number');
    assert.equal(typeof payload.summary.warnings, 'number');
    assert.equal(typeof payload.summary.errors, 'number');
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('check detects missing component files referenced by src icons index', async () => {
  const root = join(tmpdir(), `svgicons-cli-check-missing-component-${Date.now()}`);
  await mkdir(join(root, 'src', 'icons'), { recursive: true });

  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
    await writeFile(join(root, 'icons.manifest.json'), JSON.stringify({ icons: [] }));
    await writeFile(join(root, 'license-manifest.json'), JSON.stringify({ licenses: [] }));
    await writeFile(join(root, 'src', 'icons', 'index.ts'), `export { default as SearchIcon } from './SearchIcon';\n`);
    process.exitCode = undefined;

    const output = await captureConsole(() => run(['check', root, '--json']));
    const payload = JSON.parse(output);

    assert.equal(payload.ok, false);
    assert.equal(payload.errors.some((error) => error.check === 'src-icons-index'), true);
    assert.equal(payload.errors.find((error) => error.check === 'src-icons-index').details.missing[0], './SearchIcon');
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  }
});

test('collection list supports json output', async () => {
  const root = join(tmpdir(), `svgicons-cli-collection-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://example.test/api/pro/project-kits');
    assert.equal(init.headers.Authorization, 'Bearer svgicons_secret_token_1234567890');

    return new Response(JSON.stringify({
      data: [
        { id: 12, name: 'Dashboard icons', slug: 'dashboard-icons', iconsCount: 2 },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    const output = await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'list',
      '--json',
    ]));
    const payload = JSON.parse(output);

    assert.equal(payload.data[0].name, 'Dashboard icons');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('search uses configured token unless anonymous is requested', async () => {
  const root = join(tmpdir(), `svgicons-cli-search-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });
  const authorizations = [];

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://example.test/mcp');
    authorizations.push(init.headers.Authorization || '');

    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        structuredContent: {
          data: [],
          meta: { hasMore: false },
        },
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    await captureConsole(() => run(['--config', configFile, 'search', 'settings', '--json']));
    await captureConsole(() => run(['--config', configFile, 'search', 'settings', '--anonymous', '--json']));

    assert.equal(authorizations[0], 'Bearer svgicons_secret_token_1234567890');
    assert.equal(authorizations[1], '');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('export status supports json output', async () => {
  const root = join(tmpdir(), `svgicons-cli-export-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://example.test/api/pro/project-kits/12/exports/55');
    assert.equal(init.headers.Authorization, 'Bearer svgicons_secret_token_1234567890');

    return new Response(JSON.stringify({
      data: {
        id: 55,
        status: 'completed',
        formats: ['svg-folder', 'json-manifest'],
        downloadUrl: 'https://example.test/api/pro/project-kits/12/exports/55/download',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    const output = await captureConsole(() => run([
      '--config',
      configFile,
      'export',
      'status',
      '55',
      '--collection',
      '12',
      '--json',
    ]));
    const payload = JSON.parse(output);

    assert.equal(payload.data.status, 'completed');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('collection export validates options and sends explicit false boolean flags', async () => {
  const root = join(tmpdir(), `svgicons-cli-export-options-${Date.now()}`);
  const configFile = join(root, 'config.json');
  const outputFile = join(root, 'dashboard.zip');
  await mkdir(root, { recursive: true });
  let exportBody = null;

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (url === 'https://example.test/api/pro/project-kits') {
      return jsonResponse({
        data: [
          { id: 12, name: 'Dashboard icons', slug: 'dashboard-icons', iconsCount: 2 },
        ],
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12/exports') {
      exportBody = JSON.parse(init.body);

      return jsonResponse({
        data: {
          id: 55,
          status: 'completed',
          formats: ['svg-folder', 'json-manifest', 'react-ts', 'vue'],
          artifactFilename: 'dashboard.zip',
          downloadUrl: 'https://example.test/api/pro/project-kits/12/exports/55/download',
        },
      }, 202);
    }

    if (url === 'https://example.test/api/pro/project-kits/12/exports/55/download') {
      return new Response(Buffer.from('zip-data'), {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="dashboard.zip"',
        },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    const output = await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'export',
      'Dashboard icons',
      '--formats',
      'react-ts,vue',
      '--color-policy',
      'currentColor',
      '--naming-policy',
      'pascal',
      '--no-size-props',
      '--no-typescript',
      '--default-size',
      '20',
      '--component-suffix',
      'Glyph',
      '--no-title-prop',
      '--no-decorative',
      '--output',
      outputFile,
      '--json',
    ]));
    const payload = JSON.parse(output);

    assert.deepEqual(exportBody, {
      formats: ['react-ts', 'vue'],
      options: {
        colorPolicy: 'currentColor',
        namingPolicy: 'pascal',
        sizeProps: false,
        typescript: false,
        defaultSize: 20,
        titleProp: false,
        decorative: false,
        componentSuffix: 'Glyph',
      },
    });
    assert.equal(payload.outputPath, outputFile);
    assert.equal(await readFile(outputFile, 'utf8'), 'zip-data');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('icon png downloads a server-rendered png with validated id-name reference', async () => {
  const root = join(tmpdir(), `svgicons-cli-icon-png-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });
  let pngBody = null;

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://example.test/api/pro/icons/33716/png-export');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer svgicons_secret_token_1234567890');
    pngBody = JSON.parse(init.body);

    return new Response(Buffer.from('png-data'), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-disposition': 'attachment; filename="arrow-circle-up-fill-512.png"',
      },
    });
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    const output = await captureConsole(() => run([
      '--config',
      configFile,
      'icon',
      'png',
      '33716-arrow-circle-up-fill',
      '--size',
      '512',
      '--density',
      '1',
      '--background',
      'solid',
      '--background-color',
      '#ffffff',
      '--color',
      'black',
      '--padding',
      '12',
      '--output',
      root,
      '--json',
    ]));
    const payload = JSON.parse(output);

    assert.deepEqual(pngBody, {
      iconName: 'arrow-circle-up-fill',
      sizes: [512],
      densities: [1],
      backgroundType: 'solid',
      backgroundColor: '#ffffff',
      iconColorMode: 'black',
      padding: 12,
    });
    assert.equal(payload.outputPath, join(root, 'arrow-circle-up-fill-512.png'));
    assert.equal(await readFile(payload.outputPath, 'utf8'), 'png-data');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('collection export sends png-pack options and accepts framework and iconify-json formats', async () => {
  const root = join(tmpdir(), `svgicons-cli-framework-iconify-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });
  let exportBody = null;

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (url === 'https://example.test/api/pro/project-kits') {
      return jsonResponse({
        data: [
          { id: 12, name: 'Dashboard icons', slug: 'dashboard-icons', iconsCount: 2 },
        ],
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12/exports') {
      exportBody = JSON.parse(init.body);

      return jsonResponse({
        data: {
          id: 55,
          status: 'queued',
          formats: ['svg-folder', 'json-manifest', 'svelte', 'solid', 'blade', 'storybook', 'npm-package', 'png-pack', 'iconify-json'],
          statusUrl: 'https://example.test/api/pro/project-kits/12/exports/55',
          downloadUrl: null,
        },
      }, 202);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    const output = await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'export',
      'Dashboard icons',
      '--formats',
      'svelte,solid,blade,storybook,npm-package,iconify-json,png',
      '--package-name',
      '@svgicons-com/dashboard-icons',
      '--package-version',
      '1.2.3-beta.1',
      '--png-sizes',
      '24,48,512',
      '--png-densities',
      '1,2',
      '--png-background',
      'transparent',
      '--png-color',
      'preserve',
      '--png-padding',
      '16',
      '--no-wait',
      '--json',
    ]));
    const payload = JSON.parse(output);

    assert.deepEqual(exportBody, {
      formats: ['svelte', 'solid', 'blade', 'storybook', 'npm-package', 'iconify-json', 'png-pack'],
      options: {
        packageName: '@svgicons-com/dashboard-icons',
        packageVersion: '1.2.3-beta.1',
        png: {
          sizes: [24, 48, 512],
          densities: [1, 2],
          backgroundType: 'transparent',
          iconColorMode: 'preserve',
          padding: 16,
        },
      },
    });
    assert.equal(payload.data.status, 'queued');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('collection lifecycle commands use detail update remove and delete endpoints', async () => {
  const root = join(tmpdir(), `svgicons-cli-collection-lifecycle-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });
  const patchBodies = [];
  const deletedUrls = [];

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer svgicons_secret_token_1234567890');

    if (url === 'https://example.test/api/pro/project-kits') {
      return jsonResponse({
        data: [
          { id: 12, name: 'Dashboard icons', slug: 'dashboard-icons', iconsCount: 2 },
        ],
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12?per_page=100') {
      return jsonResponse({
        data: {
          id: 12,
          name: 'Dashboard icons',
          slug: 'dashboard-icons',
          iconsCount: 1,
          licenseSummary: [{ license: 'MIT', iconsCount: 1 }],
          iconSetSummary: [{ name: 'Lucide', iconsCount: 1 }],
        },
        icons: {
          data: [{ id: 33716, name: 'arrow-circle-up-fill', iconSet: { name: 'Lucide' } }],
        },
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12' && init.method === 'GET') {
      return jsonResponse({
        data: { id: 12, name: 'Dashboard icons', slug: 'dashboard-icons', iconsCount: 1 },
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12' && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      patchBodies.push(body);

      return jsonResponse({
        data: {
          id: 12,
          name: body.name || 'Dashboard icons',
          slug: 'dashboard-icons',
          description: body.description || '',
          framework: body.framework || 'svg',
          colorPolicy: body.colorPolicy || 'currentColor',
          namingPolicy: body.namingPolicy || 'kebab',
          iconsCount: 1,
        },
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12/icons/33716' && init.method === 'DELETE') {
      deletedUrls.push(url);

      return jsonResponse({
        data: {
          iconId: 33716,
          removed: true,
          kit: { id: 12, name: 'Dashboard icons', iconsCount: 0 },
        },
      });
    }

    if (url === 'https://example.test/api/pro/project-kits/12' && init.method === 'DELETE') {
      deletedUrls.push(url);

      return new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected fetch URL: ${url} ${init.method || 'GET'}`);
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    const showOutput = await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'show',
      'Dashboard icons',
      '--icons',
      '--json',
    ]));
    assert.equal(JSON.parse(showOutput).icons.data[0].id, 33716);

    await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'update',
      'Dashboard icons',
      '--description',
      'Updated from tests',
      '--framework',
      'vue',
      '--json',
    ]));

    await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'rename',
      'Dashboard icons',
      '--name',
      'Billing icons',
      '--json',
    ]));

    await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'remove',
      'Dashboard icons',
      '33716-arrow-circle-up-fill',
      '--json',
    ]));

    await assert.rejects(
      () => captureConsole(() => run([
        '--config',
        configFile,
        'collection',
        'delete',
        'Dashboard icons',
        '--json',
      ])),
      (error) => error.code === 'usage_error' && /requires --yes/.test(error.message),
    );

    const deleteOutput = await captureConsole(() => run([
      '--config',
      configFile,
      'collection',
      'delete',
      'Dashboard icons',
      '--yes',
      '--json',
    ]));

    assert.deepEqual(patchBodies, [
      { description: 'Updated from tests', framework: 'vue' },
      { name: 'Billing icons' },
    ]);
    assert.equal(deletedUrls.includes('https://example.test/api/pro/project-kits/12/icons/33716'), true);
    assert.equal(JSON.parse(deleteOutput).deleted, true);
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('collection export rejects invalid formats before calling the API', async () => {
  await assert.rejects(
    () => run(['collection', 'export', '12', '--formats', 'bad-format']),
    (error) => error.code === 'usage_error' && /Invalid export format/.test(error.message),
  );
});

test('collection export rejects invalid framework options before calling the API', async () => {
  await assert.rejects(
    () => run(['collection', 'export', '12', '--formats', 'react-ts', '--default-size', '0']),
    (error) => error.code === 'usage_error' && /Invalid default component size/.test(error.message),
  );

  await assert.rejects(
    () => run(['collection', 'export', '12', '--formats', 'react-ts', '--component-suffix', 'Bad-Name']),
    (error) => error.code === 'usage_error' && /Invalid component suffix/.test(error.message),
  );

  await assert.rejects(
    () => run(['collection', 'export', '12', '--formats', 'npm-package', '--package-name', 'Bad Package Name']),
    (error) => error.code === 'usage_error' && /Invalid npm package name/.test(error.message),
  );

  await assert.rejects(
    () => run(['collection', 'export', '12', '--formats', 'npm-package', '--package-version', 'latest']),
    (error) => error.code === 'usage_error' && /Invalid npm package version/.test(error.message),
  );
});

test('collection export timeout has a stable error code', async () => {
  const root = join(tmpdir(), `svgicons-cli-export-timeout-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url === 'https://example.test/api/pro/project-kits/12/exports') {
      return jsonResponse({
        data: {
          id: 55,
          status: 'queued',
          formats: ['svg-folder'],
          statusUrl: 'https://example.test/api/pro/project-kits/12/exports/55',
        },
      }, 202);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    await assert.rejects(
      () => captureConsole(() => run([
        '--config',
        configFile,
        'collection',
        'export',
        '12',
        '--timeout',
        '-1',
      ])),
      (error) => error.code === 'export_timeout' && error.details.exportId === 55,
    );
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('collection export failed status has a stable error code', async () => {
  const root = join(tmpdir(), `svgicons-cli-export-failed-${Date.now()}`);
  const configFile = join(root, 'config.json');
  await mkdir(root, { recursive: true });

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url === 'https://example.test/api/pro/project-kits/12/exports') {
      return jsonResponse({
        data: {
          id: 55,
          status: 'failed',
          failureMessage: 'Renderer failed.',
        },
      }, 202);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await captureConsole(() => run([
      '--config',
      configFile,
      'auth',
      'login',
      '--token',
      'svgicons_secret_token_1234567890',
      '--base-url',
      'https://example.test',
    ]));

    await assert.rejects(
      () => captureConsole(() => run([
        '--config',
        configFile,
        'collection',
        'export',
        '12',
      ])),
      (error) => error.code === 'export_failed' && /Renderer failed/.test(error.message),
    );
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('recommend uses MCP recommendation tools and can create a collection', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://svgicons.com/mcp');
    const body = JSON.parse(init.body);
    calls.push(body.params);

    if (body.params.name === 'recommend_icons_for_ui') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            data: [
              {
                concept: 'billing',
                rationale: 'Candidate icon for billing UI meaning.',
                icon: { id: 101, name: 'credit-card', pageUrl: 'https://svgicons.com/icon/101/credit-card' },
              },
            ],
            meta: { access: 'anonymous' },
          },
        },
      });
    }

    if (body.params.name === 'generate_icon_kit_for_project') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            kit: { id: 12, name: 'Billing icons', slug: 'billing-icons', iconsCount: 1 },
            icons: [{ id: 101, name: 'credit-card' }],
            addedIcons: 1,
            meta: { access: 'pro' },
          },
        },
      });
    }

    throw new Error(`Unexpected MCP tool: ${body.params.name}`);
  };

  try {
    const recommendOutput = await captureConsole(() => run([
      'recommend',
      'billing settings dashboard',
      '--concept',
      'billing',
      '--limit',
      '3',
      '--json',
    ]));
    const recommendPayload = JSON.parse(recommendOutput);

    assert.equal(recommendPayload.data[0].icon.name, 'credit-card');
    assert.deepEqual(calls[0].arguments, {
      uiDescription: 'billing settings dashboard',
      concepts: ['billing'],
      limit: 3,
    });

    const createOutput = await captureConsole(() => run([
      'recommend',
      'billing settings dashboard',
      '--create-collection',
      '--collection-name',
      'Billing icons',
      '--framework',
      'react-ts',
      '--json',
    ]));
    const createPayload = JSON.parse(createOutput);

    assert.equal(createPayload.kit.name, 'Billing icons');
    assert.equal(calls[1].arguments.projectName, 'Billing icons');
    assert.equal(calls[1].arguments.framework, 'react-ts');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
  }
});

test('pick selects the first search result and can download it', async () => {
  const root = join(tmpdir(), `svgicons-cli-pick-${Date.now()}`);
  const outputDir = join(root, 'icons');
  await mkdir(root, { recursive: true });
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://svgicons.com/mcp');
    const body = JSON.parse(init.body);

    if (body.params.name === 'search_icons') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            data: [
              { id: 240297, name: 'adjust', pageUrl: 'https://svgicons.com/icon/240297/adjust' },
              { id: 240298, name: 'adjust-alt' },
            ],
            meta: { hasMore: false },
          },
        },
      });
    }

    if (body.params.name === 'get_icon') {
      assert.deepEqual(body.params.arguments, {
        id: 240297,
        includeSvg: true,
      });

      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          structuredContent: {
            icon: {
              id: 240297,
              name: 'adjust',
              svg: '<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>',
            },
          },
        },
      });
    }

    throw new Error(`Unexpected MCP tool: ${body.params.name}`);
  };

  try {
    const output = await captureConsole(() => run([
      'pick',
      'adjust sliders',
      '--download',
      '--output',
      outputDir,
      '--json',
    ]));
    const payload = JSON.parse(output);

    assert.equal(payload.selected.id, 240297);
    assert.equal(await readFile(join(outputDir, '240297-adjust.svg'), 'utf8'), '<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>\n');
  } finally {
    global.fetch = originalFetch;
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
});

test('pick interactive refuses to prompt in ci mode', async () => {
  await assert.rejects(
    () => captureConsole(() => run([
      'pick',
      'settings gear',
      '--interactive',
      '--ci',
    ])),
    (error) => error.code === 'usage_error' && /interactive terminal/i.test(error.message),
  );
});

test('scan write-manifest updates the local manifest only when explicitly requested', async () => {
  const root = join(tmpdir(), `svgicons-cli-scan-manifest-${Date.now()}`);
  const manifestPath = join(root, 'svgicons.json');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'Dashboard.tsx'), `
    export function Dashboard() {
      return <a href="https://svgicons.com/icon/33716/arrow-circle-up-fill">Arrow</a>;
    }
  `);

  try {
    const output = await captureConsole(() => run([
      'scan',
      root,
      '--manifest',
      manifestPath,
      '--write-manifest',
      '--json',
    ]));
    const payload = JSON.parse(output);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    assert.equal(payload.manifest.addedIcons, 1);
    assert.deepEqual(manifest.icons, [{ ref: '33716-arrow-circle-up-fill' }]);
  } finally {
    clearRuntimeOverrides();
    await rm(root, { recursive: true, force: true });
  }
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function writeValidGeneratedArtifacts(root, options = {}) {
  if (options.packageJson !== false) {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo-icons', version: '1.0.0' }));
  }

  await writeFile(join(root, 'icons.manifest.json'), JSON.stringify({ icons: [{ name: 'SearchIcon' }] }));
  await writeFile(join(root, 'license-manifest.json'), JSON.stringify({ licenses: [{ license: 'MIT' }] }));
  await mkdir(join(root, 'src', 'icons'), { recursive: true });
  await writeFile(join(root, 'src', 'icons', 'SearchIcon.tsx'), 'export function SearchIcon() { return null; }\n');
  await writeFile(join(root, 'src', 'icons', 'index.ts'), `export { SearchIcon } from './SearchIcon';\n`);
}
