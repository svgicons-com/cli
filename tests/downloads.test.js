import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertIconReferenceMatches,
  iconDownloadFilename,
  parseIconLookupReference,
  parseIconReference,
  resolveArchiveDownloadPath,
  resolveIconDownloadPath,
  writeBinaryFile,
  writeIconSvg,
} from '../src/downloads.js';

test('icon reference requires id and name', () => {
  assert.deepEqual(parseIconReference('33716-arrow-circle-up-fill'), {
    id: 33716,
    slug: 'arrow-circle-up-fill',
  });

  assert.throws(() => parseIconReference('33716'), /must include id and name/);
  assert.throws(() => parseIconReference('arrow-circle-up-fill'), /must include id and name/);
});

test('icon lookup reference accepts id, id-name, and public URLs', () => {
  assert.deepEqual(parseIconLookupReference('33716'), {
    id: 33716,
    slug: '',
  });

  assert.deepEqual(parseIconLookupReference('33716-arrow-circle-up-fill'), {
    id: 33716,
    slug: 'arrow-circle-up-fill',
  });

  assert.deepEqual(parseIconLookupReference('https://svgicons.com/icon/33716/arrow-circle-up-fill'), {
    id: 33716,
    slug: 'arrow-circle-up-fill',
  });
});

test('icon reference is checked against returned icon metadata', () => {
  assert.doesNotThrow(() => assertIconReferenceMatches('33716-arrow-circle-up-fill', {
    id: 33716,
    name: 'arrow-circle-up-fill',
  }));

  assert.throws(() => assertIconReferenceMatches('33716-arrow-up', {
    id: 33716,
    name: 'arrow-circle-up-fill',
  }), /mismatch/);
});

test('icon download filename is stable and safe', () => {
  assert.equal(iconDownloadFilename({ id: 33716, name: 'arrow-circle-up-fill' }), '33716-arrow-circle-up-fill.svg');
  assert.equal(iconDownloadFilename({ id: 5, name: 'Bad / Name: Icon?' }), '5-bad-name-icon.svg');
});

test('download output resolves folder and explicit svg file targets', () => {
  const root = join(tmpdir(), 'svgicons-cli-download-paths');
  const icon = { id: 33716, name: 'arrow-circle-up-fill' };

  assert.equal(
    resolveIconDownloadPath(undefined, icon, root),
    join(root, '33716-arrow-circle-up-fill.svg'),
  );

  assert.equal(
    resolveIconDownloadPath('icons', icon, root),
    join(root, 'icons', '33716-arrow-circle-up-fill.svg'),
  );

  assert.equal(
    resolveIconDownloadPath('custom.svg', icon, root),
    join(root, 'custom.svg'),
  );
});

test('archive download output resolves folder and explicit zip file targets', () => {
  const root = join(tmpdir(), 'svgicons-cli-archive-paths');

  assert.equal(
    resolveArchiveDownloadPath(undefined, 'dashboard-icons-export-12.zip', root),
    join(root, 'dashboard-icons-export-12.zip'),
  );

  assert.equal(
    resolveArchiveDownloadPath('exports', 'dashboard-icons-export-12.zip', root),
    join(root, 'exports', 'dashboard-icons-export-12.zip'),
  );

  assert.equal(
    resolveArchiveDownloadPath('custom.zip', 'dashboard-icons-export-12.zip', root),
    join(root, 'custom.zip'),
  );
});

test('writeIconSvg refuses overwrite unless force is used', async () => {
  const root = join(tmpdir(), `svgicons-cli-download-${Date.now()}`);
  const path = join(root, 'icon.svg');

  await mkdir(root, { recursive: true });
  await writeFile(path, '<svg />\n');

  try {
    await assert.rejects(
      () => writeIconSvg(path, '<svg><path /></svg>'),
      /File already exists/,
    );

    await writeIconSvg(path, '<svg><path /></svg>', true);
    assert.equal(await readFile(path, 'utf8'), '<svg><path /></svg>\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeBinaryFile refuses overwrite unless force is used', async () => {
  const root = join(tmpdir(), `svgicons-cli-binary-download-${Date.now()}`);
  const path = join(root, 'export.zip');

  await mkdir(root, { recursive: true });
  await writeFile(path, Buffer.from('old'));

  try {
    await assert.rejects(
      () => writeBinaryFile(path, Buffer.from('new')),
      /File already exists/,
    );

    await writeBinaryFile(path, Buffer.from('new'), true);
    assert.equal(await readFile(path, 'utf8'), 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
