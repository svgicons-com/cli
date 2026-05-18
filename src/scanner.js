import { opendir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

const DEFAULT_EXTENSIONS = new Set([
  '.astro',
  '.blade.php',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.md',
  '.scss',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
]);

const EXCLUDED_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'public/build',
  'storage',
  'vendor',
]);

const CONCEPT_PATTERNS = {
  account: ['account', 'profile', 'avatar'],
  analytics: ['analytics', 'chart', 'graph', 'metric', 'report'],
  auth: ['auth', 'login', 'logout', 'password', 'sign in', 'signin'],
  billing: ['billing', 'invoice', 'payment', 'pricing', 'subscription'],
  calendar: ['calendar', 'date', 'schedule'],
  check: ['check', 'success', 'complete', 'done'],
  close: ['close', 'cancel', 'dismiss', 'remove'],
  dashboard: ['dashboard', 'admin', 'overview'],
  download: ['download', 'export'],
  edit: ['edit', 'pencil', 'compose'],
  file: ['file', 'document', 'attachment'],
  home: ['home', 'landing'],
  lock: ['lock', 'security', 'permission', 'private'],
  mail: ['mail', 'email', 'inbox'],
  menu: ['menu', 'navigation', 'navbar', 'sidebar'],
  notification: ['notification', 'alert', 'bell', 'warning'],
  search: ['search', 'filter', 'find'],
  settings: ['settings', 'preferences', 'config', 'gear'],
  trash: ['trash', 'delete', 'remove'],
  upload: ['upload', 'import'],
  user: ['user', 'users', 'member', 'team'],
};

export async function scanProject(inputPath = '.', options = {}) {
  const root = resolve(inputPath);
  const maxFiles = Number(options.maxFiles || 500);
  const files = [];

  await collectFiles(root, files, {
    maxFiles,
    extensions: options.extensions || DEFAULT_EXTENSIONS,
  });

  const concepts = new Map();
  const iconIds = new Set();
  const iconRefs = new Set();
  const iconSetPrefixes = new Set();
  const generatedIconRefs = new Set();
  let bytesRead = 0;
  let generatedImportCount = 0;
  let inlineSvgCount = 0;

  for (const file of files) {
    const text = await readFile(file, 'utf8').catch(() => '');
    bytesRead += Buffer.byteLength(text, 'utf8');
    detectConcepts(`${file}\n${text}`, concepts);
    detectSvgiconsUrls(text, iconIds, iconRefs, iconSetPrefixes);

    const generated = detectGeneratedSvgImports(text);
    generatedImportCount += generated.count;
    for (const ref of generated.refs) {
      generatedIconRefs.add(ref);
      iconIds.add(ref.split('-')[0]);
    }

    inlineSvgCount += detectInlineSvgCount(text);
  }

  const sortedConcepts = [...concepts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const projectName = titleFromRoot(root);

  return {
    root,
    collection: {
      name: options.collectionName || `${projectName} icons`,
      description: `Icon candidates detected from ${projectName} codebase scan.`,
    },
    concepts: sortedConcepts,
    existingIconIds: [...iconIds].sort((a, b) => Number(a) - Number(b)),
    existingIconRefs: [...iconRefs].sort(sortRefsById),
    generatedIconRefs: [...generatedIconRefs].sort(sortRefsById),
    iconSetPrefixes: [...iconSetPrefixes].sort(),
    stats: {
      filesScanned: files.length,
      maxFiles,
      bytesRead,
      generatedImportCount,
      inlineSvgCount,
    },
  };
}

async function collectFiles(directory, files, options) {
  if (files.length >= options.maxFiles) {
    return;
  }

  let entries;
  try {
    entries = await opendir(directory);
  } catch {
    return;
  }

  for await (const entry of entries) {
    if (files.length >= options.maxFiles) {
      break;
    }

    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (isExcludedDirectory(path)) {
        continue;
      }

      await collectFiles(path, files, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!isSupportedFile(path, options.extensions)) {
      continue;
    }

    const info = await stat(path).catch(() => null);
    if (!info || info.size > 256 * 1024) {
      continue;
    }

    files.push(path);
  }
}

function isSupportedFile(path, extensions) {
  if (path.endsWith('.blade.php')) {
    return extensions.has('.blade.php');
  }

  return extensions.has(extname(path).toLowerCase());
}

function isExcludedDirectory(path) {
  const normalized = path.split(sep).join('/');

  return [...EXCLUDED_DIRS].some((dir) => normalized.endsWith(`/${dir}`) || normalized.includes(`/${dir}/`));
}

function detectConcepts(text, concepts) {
  const normalized = text.toLowerCase().replace(/[-_]/g, ' ');

  for (const [concept, needles] of Object.entries(CONCEPT_PATTERNS)) {
    let count = 0;

    for (const needle of needles) {
      const pattern = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'gi');
      count += normalized.match(pattern)?.length || 0;
    }

    if (count > 0) {
      concepts.set(concept, (concepts.get(concept) || 0) + count);
    }
  }
}

function detectSvgiconsUrls(text, iconIds, iconRefs, iconSetPrefixes) {
  for (const match of text.matchAll(/(?:svgicons\.com)?\/icon\/(\d+)\/([a-z0-9._-]+)/gi)) {
    const id = match[1];
    const slug = normalizeSlug(match[2]);
    iconIds.add(id);
    iconRefs.add(`${id}-${slug}`);
  }

  for (const match of text.matchAll(/svgicons\.com\/icon-set\/([a-z0-9-]+)|\/icon-set\/([a-z0-9-]+)/gi)) {
    iconSetPrefixes.add(match[1] || match[2]);
  }
}

function detectGeneratedSvgImports(text) {
  const refs = new Set();
  let count = 0;

  for (const match of text.matchAll(/(?:import\s+[^'"]+\s+from\s+|require\()\s*['"][^'"]*?(\d+)-([a-z0-9._-]+)\.svg['"]/gi)) {
    count++;
    refs.add(`${match[1]}-${normalizeSlug(match[2])}`);
  }

  return { count, refs };
}

function detectInlineSvgCount(text) {
  return [...text.matchAll(/<svg(?:\s|>)/gi)].length;
}

function titleFromRoot(root) {
  return basename(root).replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function sortRefsById(a, b) {
  const aId = Number(String(a).split('-')[0]);
  const bId = Number(String(b).split('-')[0]);

  return aId - bId || String(a).localeCompare(String(b));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
