import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject } from '../src/scanner.js';

test('scanner proposes concepts and reads existing svgicons URLs without modifying files', async () => {
  const root = join(tmpdir(), `svgicons-cli-scan-${Date.now()}`);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'Dashboard.tsx'), `
    export function Dashboard() {
      return <nav aria-label="settings navigation">
        <a href="https://svgicons.com/icon/33716/arrow-circle-up-fill">Arrow</a>
        <span>billing invoice analytics search upload download</span>
      </nav>
    }
  `);

  try {
    const proposal = await scanProject(root);

    assert.equal(proposal.stats.filesScanned, 1);
    assert.ok(proposal.concepts.some((concept) => concept.name === 'dashboard'));
    assert.ok(proposal.concepts.some((concept) => concept.name === 'billing'));
    assert.deepEqual(proposal.existingIconIds, ['33716']);
    assert.deepEqual(proposal.existingIconRefs, ['33716-arrow-circle-up-fill']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanner detects generated svg imports and inline svg blocks', async () => {
  const root = join(tmpdir(), `svgicons-cli-scan-generated-${Date.now()}`);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'Settings.tsx'), `
    import SettingsIcon from '../icons/240297-adjust.svg';

    export function Settings() {
      return <svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z" /></svg>;
    }
  `);

  try {
    const proposal = await scanProject(root);

    assert.deepEqual(proposal.generatedIconRefs, ['240297-adjust']);
    assert.equal(proposal.stats.generatedImportCount, 1);
    assert.equal(proposal.stats.inlineSvgCount, 1);
    assert.deepEqual(proposal.existingIconIds, ['240297']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
