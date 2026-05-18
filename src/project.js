import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sanitizeFileSegment } from './downloads.js';

export const DEFAULT_MANIFEST = 'svgicons.json';
export const DEFAULT_LOCKFILE = 'svgicons.lock';
export const DEFAULT_OUTPUT_DIR = 'svgicons-icons';

export function manifestPath(options = {}, cwd = process.cwd()) {
  return resolve(cwd, String(options.manifest || DEFAULT_MANIFEST));
}

export function lockfilePath(options = {}, cwd = process.cwd()) {
  return resolve(cwd, String(options.lockfile || DEFAULT_LOCKFILE));
}

export function createManifest(options = {}) {
  const collection = options.collection && options.collection !== true
    ? String(options.collection)
    : '';

  return {
    version: 1,
    framework: String(options.framework || 'svg'),
    format: String(options.format || 'svg'),
    output: String(options.output || DEFAULT_OUTPUT_DIR),
    icons: [],
    collections: collection ? [{ ref: collection }] : [],
    licensePolicy: {
      allow: [],
      deny: [],
    },
  };
}

export async function readJsonFile(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

export async function writeJsonFile(path, value, { force = true } = {}) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${stableStringify(value)}\n`, {
    flag: force ? 'w' : 'wx',
  });
}

export async function writeTextFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

export function normalizeManifest(manifest) {
  return {
    version: 1,
    framework: manifest.framework || 'svg',
    format: manifest.format || 'svg',
    output: manifest.output || DEFAULT_OUTPUT_DIR,
    icons: Array.isArray(manifest.icons) ? manifest.icons : [],
    collections: Array.isArray(manifest.collections) ? manifest.collections : [],
    licensePolicy: {
      allow: Array.isArray(manifest.licensePolicy?.allow) ? manifest.licensePolicy.allow : [],
      deny: Array.isArray(manifest.licensePolicy?.deny) ? manifest.licensePolicy.deny : [],
    },
  };
}

export function normalizeIconManifestEntry(entry) {
  if (typeof entry === 'string' || typeof entry === 'number') {
    return { ref: String(entry) };
  }

  return {
    ref: String(entry?.ref || entry?.id || '').trim(),
  };
}

export function normalizeCollectionManifestEntry(entry) {
  if (typeof entry === 'string' || typeof entry === 'number') {
    return { ref: String(entry) };
  }

  return {
    ref: String(entry?.ref || entry?.id || entry?.slug || entry?.name || '').trim(),
  };
}

export function lockIconFromIcon(icon) {
  const svg = icon.svg || icon.body || '';
  const iconSet = icon.iconSet || {};
  const ref = `${Number(icon.id)}-${sanitizeFileSegment(icon.name || 'icon')}`;

  return {
    id: Number(icon.id),
    name: String(icon.name || ''),
    ref,
    width: Number(icon.width || 0) || null,
    height: Number(icon.height || 0) || null,
    pageUrl: icon.pageUrl || null,
    svgHash: svg ? `sha256-${sha256(svg)}` : null,
    license: iconSet.license || 'Unknown license',
    licenseUrl: iconSet.licenseUrl || iconSet.license_url || null,
    iconSet: {
      id: iconSet.id || icon.icon_set_id || null,
      name: iconSet.name || null,
      prefix: iconSet.prefix || null,
    },
    svg,
  };
}

export function createLockfile(icons, manifest = {}) {
  const deduped = new Map();

  for (const icon of icons) {
    const locked = lockIconFromIcon(icon);
    if (locked.id) {
      deduped.set(locked.id, locked);
    }
  }

  return {
    version: 1,
    source: {
      manifestVersion: manifest.version || 1,
      framework: manifest.framework || 'svg',
      format: manifest.format || 'svg',
      output: manifest.output || DEFAULT_OUTPUT_DIR,
    },
    icons: [...deduped.values()].sort((a, b) => a.id - b.id),
  };
}

export function svgFilenameForIcon(icon) {
  return `${icon.ref || `${icon.id}-${sanitizeFileSegment(icon.name || 'icon')}`}.svg`;
}

export function buildLicenseReport(lockfile, policy = {}) {
  const allow = normalizeLicenseList(policy.allow);
  const deny = normalizeLicenseList(policy.deny);
  const licenses = new Map();
  const violations = [];

  for (const icon of lockfile.icons || []) {
    const license = icon.license || 'Unknown license';
    const normalized = normalizeLicense(license);
    const current = licenses.get(normalized) || {
      license,
      count: 0,
      icons: [],
    };

    current.count += 1;
    current.icons.push({
      id: icon.id,
      name: icon.name,
      ref: icon.ref,
      iconSet: icon.iconSet?.name || icon.iconSet?.prefix || '',
    });
    licenses.set(normalized, current);

    if (deny.has(normalized)) {
      violations.push({ reason: 'denied', license, icon });
      continue;
    }

    if (allow.size > 0 && !allow.has(normalized)) {
      violations.push({ reason: 'not_allowed', license, icon });
    }
  }

  return {
    ok: violations.length === 0,
    checkedIcons: (lockfile.icons || []).length,
    licenses: [...licenses.values()].sort((a, b) => a.license.localeCompare(b.license)),
    violations: violations.map(({ reason, license, icon }) => ({
      reason,
      license,
      icon: {
        id: icon.id,
        name: icon.name,
        ref: icon.ref,
        iconSet: icon.iconSet,
      },
    })),
  };
}

export function licenseReportToMarkdown(report) {
  const lines = [
    '# Third-party SVG icons',
    '',
    `Checked icons: ${report.checkedIcons}`,
    '',
    '## Licenses',
    '',
    '| License | Icons |',
    '| --- | ---: |',
  ];

  for (const item of report.licenses) {
    lines.push(`| ${escapeMarkdownCell(item.license)} | ${item.count} |`);
  }

  if (report.violations.length > 0) {
    lines.push('', '## Policy violations', '');
    for (const violation of report.violations) {
      lines.push(`- ${violation.icon.ref}: ${violation.license} (${violation.reason})`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function licenseReportToCsv(report) {
  const rows = [['license', 'icons']];
  for (const item of report.licenses) {
    rows.push([item.license, String(item.count)]);
  }

  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

export function stableStringify(value) {
  return JSON.stringify(sortForJson(value), null, 2);
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function sortForJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortForJson);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortForJson(value[key]);
      return result;
    }, {});
}

function normalizeLicenseList(values = []) {
  return new Set(
    values
      .flatMap((value) => String(value || '').split(','))
      .map((value) => normalizeLicense(value))
      .filter(Boolean),
  );
}

function normalizeLicense(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeMarkdownCell(value) {
  return String(value || '').replace(/\|/g, '\\|');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
