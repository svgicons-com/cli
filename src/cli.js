import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { join, resolve } from 'node:path';
import {
  clearConfig,
  clearRuntimeOverrides,
  credentialsStatus,
  defaultBaseUrl,
  normalizeBaseUrl,
  readConfig,
  setConfigPathOverride,
  setCredentialOverrides,
  writeConfig,
} from './config.js';
import { callMcpTool, mcpRequest, proApi, proApiDownload } from './api.js';
import {
  assertIconReferenceMatches,
  parseIconLookupReference,
  parseIconReference,
  resolveArchiveDownloadPath,
  resolveIconDownloadPath,
  resolvePngDownloadPath,
  sanitizeFileSegment,
  writeBinaryFile,
  writeIconSvg,
} from './downloads.js';
import { printCollection, printCollectionDetail, printExport, printJson, printScanProposal, printSearchResults } from './format.js';
import {
  buildLicenseReport,
  createLockfile,
  createManifest,
  licenseReportToCsv,
  licenseReportToMarkdown,
  lockIconFromIcon,
  lockfilePath,
  manifestPath,
  normalizeCollectionManifestEntry,
  normalizeIconManifestEntry,
  normalizeManifest,
  readJsonFile,
  svgFilenameForIcon,
  writeJsonFile,
  writeTextFile,
} from './project.js';
import { redact } from './redact.js';
import { exportFailedError, exportNotReadyError, exportTimeoutError, licenseViolationError, usageError } from './errors.js';
import { scanProject } from './scanner.js';

const KNOWN_SCOPES = [
  'search:read',
  'icons:read',
  'collections:read',
  'collections:write',
  'exports:create',
  'mcp:use',
];
const EXPORT_FORMATS = [
  'svg-folder',
  'svg-sprite',
  'json-manifest',
  'license-manifest',
  'react-ts',
  'vue',
  'svelte',
  'solid',
  'blade',
  'storybook',
  'npm-package',
  'png-pack',
  'iconify-json',
];
const FRAMEWORKS = ['svg', 'react-ts', 'vue', 'sprite'];
const COLOR_POLICIES = ['currentColor', 'preserve', 'strip'];
const NAMING_POLICIES = ['kebab', 'pascal', 'camel'];
const PNG_SIZES = [16, 24, 32, 48, 96, 128, 256, 512, 1024];
const PNG_DENSITIES = [1, 2, 3, 4];
const PNG_BACKGROUNDS = ['transparent', 'solid'];
const PNG_COLORS = ['preserve', 'black', 'white', 'custom'];
const PNG_FITS = ['contain'];

export async function run(argv) {
  const { args, options: globalOptions } = extractGlobalOptions(argv);
  clearRuntimeOverrides();

  if (globalOptions.config) {
    setConfigPathOverride(resolve(String(globalOptions.config)));
  }

  setCredentialOverrides({
    baseUrl: globalOptions['base-url'],
    token: globalOptions.token,
  });

  const [command, ...rest] = args;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    await version();
    return;
  }

  if (command === 'login') {
    await login(rest, globalOptions);
    return;
  }

  if (command === 'logout') {
    await logout();
    return;
  }

  if (command === 'auth') {
    await auth(rest, globalOptions);
    return;
  }

  if (command === 'config') {
    await configCommand(rest);
    return;
  }

  if (command === 'doctor') {
    await doctor(rest);
    return;
  }

  if (command === 'check') {
    await checkProject(rest);
    return;
  }

  if (command === 'search') {
    await search(rest);
    return;
  }

  if (command === 'recommend') {
    await recommend(rest);
    return;
  }

  if (command === 'pick') {
    await pick(rest);
    return;
  }

  if (command === 'icon') {
    await icon(rest);
    return;
  }

  if (command === 'download') {
    await iconDownload(rest);
    return;
  }

  if (command === 'collection' || command === 'kit') {
    await collection(rest);
    return;
  }

  if (command === 'export') {
    await exportCommand(rest);
    return;
  }

  if (command === 'init') {
    await initProject(rest);
    return;
  }

  if (command === 'sync') {
    await syncProject(rest);
    return;
  }

  if (command === 'build') {
    await buildProject(rest);
    return;
  }

  if (command === 'update') {
    await updateProject(rest);
    return;
  }

  if (command === 'license') {
    await licenseCommand(rest);
    return;
  }

  if (command === 'scan') {
    await scan(rest);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function login(args, globalOptions = {}) {
  const options = parseOptions(args);
  const rawToken = options.token || globalOptions.token || process.env.SVGICONS_TOKEN || process.env.SVGICONS_API_TOKEN;

  const token = normalizeLoginToken(rawToken);

  const baseUrl = normalizeBaseUrl(options['base-url'] || globalOptions['base-url'] || defaultBaseUrl());
  await writeConfig({
    baseUrl,
    token,
    createdAt: new Date().toISOString(),
  });

  console.log(`Svg/icons CLI token saved for ${baseUrl}.`);
}

function normalizeLoginToken(token) {
  if (!token) {
    throw usageError('Missing token. Use: svgicons login --token "<token>"');
  }

  const value = String(token).trim();

  if (value === '') {
    throw usageError('Missing token. Use: svgicons login --token "<token>"');
  }

  if (/^\d+$/.test(value)) {
    throw usageError('The token looks truncated. Svg/icons Pro API tokens can start with an id prefix like "10|". Wrap the full token in quotes: svgicons auth login --token "10|..."');
  }

  if (value.length < 20) {
    throw usageError('The token value is too short. Copy the full Pro API token from your account page and wrap it in quotes when it contains "|".');
  }

  return value;
}

async function logout() {
  await clearConfig();
  console.log('Svg/icons CLI credentials removed.');
}

async function auth(args, globalOptions = {}) {
  const [subcommand, ...rest] = args;

  if (subcommand === 'login') {
    await login(rest, globalOptions);
    return;
  }

  if (subcommand === 'logout') {
    await logout();
    return;
  }

  if (subcommand === 'status') {
    await authStatus(rest);
    return;
  }

  if (subcommand === 'scopes') {
    const options = parseOptions(rest);
    const payload = { data: KNOWN_SCOPES };

    if (options.json) {
      printJson(payload);
      return;
    }

    console.log('Known Pro API scopes:');
    for (const scope of KNOWN_SCOPES) {
      console.log(`  ${scope}`);
    }
    return;
  }

  throw new Error('Unknown auth command. Use: login, logout, status, scopes.');
}

async function authStatus(args) {
  const options = parseOptions(args);
  const status = await credentialsStatus();
  let remote = null;

  if (status.hasToken) {
    try {
      remote = {
        ok: true,
        payload: await proApi('/api/pro/me'),
      };
    } catch (error) {
      remote = {
        ok: false,
        code: error.code || 'error',
        status: error.status,
        message: error.message,
      };
    }
  }

  const payload = {
    ...status,
    remote,
  };

  if (options.json) {
    printJson(redact(payload));
    return;
  }

  console.log(`Config: ${status.configPath}`);
  console.log(`Base URL: ${status.baseUrl} (${status.baseUrlSource})`);
  console.log(`Token: ${status.hasToken ? `configured (${status.tokenSource})` : 'not configured'}`);
  if (remote) {
    console.log(remote.ok
      ? 'Remote account endpoint: available'
      : `Remote account endpoint: unavailable (${remote.code}${remote.status ? `, HTTP ${remote.status}` : ''})`);
  }
}

async function configCommand(args) {
  const [subcommand, ...rest] = args;

  if (subcommand === 'list') {
    const options = parseOptions(rest);
    const config = await readConfig();
    const status = await credentialsStatus();
    const payload = redact({
      configPath: status.configPath,
      baseUrl: config.baseUrl || null,
      token: config.token || null,
      createdAt: config.createdAt || null,
      effective: {
        baseUrl: status.baseUrl,
        baseUrlSource: status.baseUrlSource,
        hasToken: status.hasToken,
        tokenSource: status.tokenSource,
      },
    });

    if (options.json) {
      printJson(payload);
      return;
    }

    console.log(`Config: ${payload.configPath}`);
    console.log(`baseUrl: ${payload.baseUrl || '(not set)'}`);
    console.log(`token: ${payload.token || '(not set)'}`);
    console.log(`createdAt: ${payload.createdAt || '(not set)'}`);
    console.log(`effective baseUrl: ${payload.effective.baseUrl} (${payload.effective.baseUrlSource})`);
    console.log(`effective token: ${payload.effective.hasToken ? `configured (${payload.effective.tokenSource})` : 'not configured'}`);
    return;
  }

  if (subcommand === 'get') {
    const [key] = rest;
    const config = await readConfig();
    const normalizedKey = normalizeConfigKey(key);

    if (!normalizedKey) {
      throw new Error('Config key is required. Use: token, baseUrl, createdAt.');
    }

    const value = config[normalizedKey];
    console.log(normalizedKey === 'token' && value ? '[redacted]' : value ?? '');
    return;
  }

  if (subcommand === 'set') {
    const [key, ...valueParts] = rest;
    const normalizedKey = normalizeConfigKey(key);
    const value = valueParts.join(' ').trim();

    if (!normalizedKey || !value) {
      throw new Error('Config key and value are required. Example: svgicons config set baseUrl https://svgicons.com');
    }

    const config = await readConfig();
    config[normalizedKey] = normalizedKey === 'baseUrl' ? normalizeBaseUrl(value) : value;
    config.updatedAt = new Date().toISOString();
    await writeConfig(config);
    console.log(`Set ${normalizedKey}.`);
    return;
  }

  throw new Error('Unknown config command. Use: list, get, set.');
}

async function doctor(args) {
  const options = parseOptions(args);
  const checks = [];
  let status;

  try {
    status = await credentialsStatus();
    addCheck(checks, 'config', 'pass', `Using ${status.configPath}`);
    addCheck(checks, 'base-url', 'pass', status.baseUrl);
  } catch (error) {
    addCheck(checks, 'base-url', 'fail', error.message);
  }

  if (status?.hasToken) {
    addCheck(checks, 'token', 'pass', `Configured from ${status.tokenSource}`);
  } else {
    addCheck(checks, 'token', 'warn', 'No token configured. Anonymous search can work; Pro collection/export commands require login.');
  }

  await checkDoctorStep(checks, 'mcp', async () => {
    await mcpRequest('ping', {}, { token: '' });
    return 'MCP endpoint responded to anonymous ping.';
  });

  if (status?.hasToken) {
    await checkDoctorStep(checks, 'pro-api', async () => {
      await proApi('/api/pro/project-kits');
      return 'Pro REST API accepted the current token.';
    });
  } else {
    addCheck(checks, 'pro-api', 'skip', 'Skipped because no token is configured.');
  }

  if (options.json) {
    printJson({ checks });
    return;
  }

  for (const check of checks) {
    console.log(`${check.status.toUpperCase()}\t${check.name}\t${check.message}`);
  }
}

async function checkProject(args) {
  const options = parseOptions(args);

  if (options.help) {
    printCheckHelp();
    return;
  }

  const root = resolve(String(options._[0] || '.'));
  const strict = booleanOption(options.strict, false);
  const result = {
    path: root,
    ok: false,
    strict,
    checks: [],
    warnings: [],
    errors: [],
    summary: {
      passed: 0,
      warnings: 0,
      errors: 0,
      skipped: 0,
    },
  };

  const rootStat = await statOptional(root);
  if (!rootStat) {
    addProjectCheck(result, 'target-path', 'fail', 'Target path does not exist.');
    finalizeCheckResult(result);
    printCheckResult(result, options);
    return;
  }

  if (!rootStat.isDirectory()) {
    addProjectCheck(result, 'target-path', 'fail', 'Target path is not a directory.');
    finalizeCheckResult(result);
    printCheckResult(result, options);
    return;
  }

  addProjectCheck(result, 'target-path', 'pass', 'Target path exists and is a directory.');

  await checkPackageJson(root, result);
  await checkGeneratedArtifacts(root, result);
  await checkJsonManifest(root, 'icons.manifest.json', result, { requireObjectOrArray: true });
  await checkJsonManifest(root, 'license-manifest.json', result, { requireObjectOrArray: false });
  await checkIconsIndex(root, result);

  finalizeCheckResult(result);
  printCheckResult(result, options);
}

async function checkPackageJson(root, result) {
  const path = join(root, 'package.json');

  if (!await statOptional(path)) {
    addProjectCheck(result, 'package-json', 'warn', 'package.json was not found.');
    return;
  }

  try {
    JSON.parse(await readFile(path, 'utf8'));
    addProjectCheck(result, 'package-json', 'pass', 'package.json is valid JSON.');
  } catch (error) {
    addProjectCheck(result, 'package-json', 'fail', `package.json is not valid JSON: ${error.message}`);
  }
}

async function checkGeneratedArtifacts(root, result) {
  const artifacts = [];
  const manifestPath = join(root, 'icons.manifest.json');
  const licensePath = join(root, 'license-manifest.json');
  const iconsIndexPath = join(root, 'src', 'icons', 'index.ts');
  const iconsDir = join(root, 'src', 'icons');

  if (await statOptional(manifestPath)) {
    artifacts.push('icons.manifest.json');
  }

  if (await statOptional(licensePath)) {
    artifacts.push('license-manifest.json');
  }

  if (await statOptional(iconsIndexPath)) {
    artifacts.push('src/icons/index.ts');
  }

  const iconFiles = await listFilesOptional(iconsDir);
  artifacts.push(...iconFiles.filter((file) => file.endsWith('.tsx')).map((file) => `src/icons/${file}`));

  if (artifacts.length === 0) {
    addProjectCheck(result, 'generated-artifacts', 'warn', 'No SVG Icons generated artifacts detected.');
    return;
  }

  addProjectCheck(result, 'generated-artifacts', 'pass', `Detected ${artifacts.length} SVG Icons generated artifact(s).`, {
    artifacts: artifacts.sort(),
  });
}

async function checkJsonManifest(root, filename, result, options = {}) {
  const path = join(root, filename);

  if (!await statOptional(path)) {
    addProjectCheck(result, filename, 'skip', `${filename} was not found.`);
    return;
  }

  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    const reasonableShape = Array.isArray(parsed) || parsed !== null && typeof parsed === 'object';

    if (options.requireObjectOrArray && !reasonableShape) {
      addProjectCheck(result, filename, 'fail', `${filename} must contain a top-level object or array.`);
      return;
    }

    addProjectCheck(result, filename, 'pass', `${filename} is valid JSON.`);
  } catch (error) {
    addProjectCheck(result, filename, 'fail', `${filename} is not valid JSON: ${error.message}`);
  }
}

async function checkIconsIndex(root, result) {
  const iconsDir = join(root, 'src', 'icons');
  const indexPath = join(iconsDir, 'index.ts');

  if (!await statOptional(indexPath)) {
    addProjectCheck(result, 'src-icons-index', 'skip', 'src/icons/index.ts was not found.');
    return;
  }

  const source = await readFile(indexPath, 'utf8');
  const references = simpleLocalExportReferences(source);

  if (references.length === 0) {
    addProjectCheck(result, 'src-icons-index', 'warn', 'src/icons/index.ts did not contain simple local icon export lines to verify.');
    return;
  }

  const missing = [];
  for (const reference of references) {
    if (!await localExportExists(iconsDir, reference)) {
      missing.push(reference);
    }
  }

  if (missing.length > 0) {
    addProjectCheck(result, 'src-icons-index', 'fail', `Missing ${missing.length} icon component file(s) referenced by src/icons/index.ts.`, {
      missing,
    });
    return;
  }

  addProjectCheck(result, 'src-icons-index', 'pass', `Verified ${references.length} local icon export reference(s).`);
}

function simpleLocalExportReferences(source) {
  const references = [];
  const pattern = /export\s+(?:\*|\{[^}]+\})\s+from\s+['"](\.\/[^'"]+)['"]/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    references.push(match[1]);
  }

  return [...new Set(references)].sort();
}

async function localExportExists(directory, reference) {
  const relative = reference.replace(/^\.\//, '');
  const candidates = /\.[cm]?[jt]sx?$/.test(relative)
    ? [join(directory, relative)]
    : ['.tsx', '.ts', '.jsx', '.js'].map((extension) => join(directory, `${relative}${extension}`));

  for (const candidate of candidates) {
    if (await statOptional(candidate)) {
      return true;
    }
  }

  return false;
}

async function statOptional(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return null;
    }

    throw error;
  }
}

async function listFilesOptional(path) {
  try {
    return await readdir(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return [];
    }

    throw error;
  }
}

function addProjectCheck(result, name, status, message, details = undefined) {
  const check = {
    name,
    status,
    message,
    ...(details ? { details } : {}),
  };

  result.checks.push(check);

  if (status === 'warn') {
    result.warnings.push({
      check: name,
      message,
      ...(details ? { details } : {}),
    });
  }

  if (status === 'fail') {
    result.errors.push({
      check: name,
      message,
      ...(details ? { details } : {}),
    });
  }
}

function finalizeCheckResult(result) {
  result.summary = {
    passed: result.checks.filter((check) => check.status === 'pass').length,
    warnings: result.warnings.length,
    errors: result.errors.length,
    skipped: result.checks.filter((check) => check.status === 'skip').length,
  };
  result.ok = result.errors.length === 0 && (!result.strict || result.warnings.length === 0);
}

function printCheckResult(result, options) {
  if (options.json) {
    printJson(result);
  } else {
    console.log(`Checked path: ${result.path}`);
    console.log(`Passed checks: ${result.summary.passed}`);
    console.log(`Warnings: ${result.summary.warnings}`);
    console.log(`Errors: ${result.summary.errors}`);
    console.log('');

    for (const check of result.checks) {
      console.log(`${check.status.toUpperCase()}\t${check.name}\t${check.message}`);
    }

    console.log('');
    console.log(`Final status: ${result.ok ? 'ok' : 'failed'}`);
  }

  process.exitCode = result.ok ? undefined : 1;
}

async function search(args) {
  const options = parseOptions(args);
  const query = options._.join(' ').trim();

  if (!query) {
    throw new Error('Search query is required. Example: svgicons search "arrow left"');
  }

  const requestOptions = {};
  if (booleanOption(options.anonymous, false)) {
    requestOptions.token = '';
  }

  const payload = await callMcpTool('search_icons', {
    query,
    limit: numberOption(options.limit, 10),
    offset: numberOption(options.offset, 0),
    category: options.category,
    iconSetPrefix: options['icon-set'],
    includeSvg: booleanOption(options['include-svg'], false),
  }, requestOptions);

  if (options.json) {
    printJson(payload);
    return;
  }

  printSearchResults(payload);
}

async function recommend(args) {
  const options = parseOptions(args);
  const prompt = options._.join(' ').trim();

  if (!prompt) {
    throw usageError('Recommendation prompt is required. Example: svgicons recommend "billing settings dashboard"');
  }

  const concepts = listOption(options.concept || options.concepts);
  const limit = numberOption(options.limit, booleanOption(options['create-collection'], false) ? 16 : 10);

  if (options['create-collection']) {
    const payload = await callMcpTool('generate_icon_kit_for_project', {
      projectName: options['collection-name'] || options.name,
      projectDescription: prompt,
      requiredConcepts: concepts,
      category: options.category,
      maxIcons: limit,
      framework: enumOption(options.framework, 'framework', FRAMEWORKS),
      colorPolicy: enumOption(options['color-policy'], 'color policy', COLOR_POLICIES),
      namingPolicy: enumOption(options['naming-policy'], 'naming policy', NAMING_POLICIES),
    });

    if (options.json) {
      printJson(payload);
      return;
    }

    printRecommendations(payload);
    if (payload.kit) {
      console.log('');
      console.log('Created Icon Collection:');
      printCollection(payload.kit);
    }
    return;
  }

  const payload = await callMcpTool('recommend_icons_for_ui', {
    uiDescription: prompt,
    concepts,
    category: options.category,
    limit,
  });

  if (options.json) {
    printJson(payload);
    return;
  }

  printRecommendations(payload);
}

async function pick(args) {
  const options = parseOptions(args);
  const query = options._.join(' ').trim();

  if (!query) {
    throw usageError('Pick query is required. Use a non-interactive query, for example: svgicons pick "settings gear"');
  }

  if (booleanOption(options.interactive, false)) {
    assertInteractivePickAllowed(options);
  }

  const payload = await callMcpTool('search_icons', {
    query,
    limit: numberOption(options.limit, 10),
    offset: 0,
    category: options.category,
    iconSetPrefix: options['icon-set'],
    includeSvg: false,
  });
  const icons = payload.data || [];

  if (icons.length === 0) {
    throw usageError(`No icons found for "${query}".`);
  }

  const selected = await selectPickedIcon(icons, options);
  const result = {
    query,
    selected,
  };

  if (options.add) {
    const collectionId = await resolveCollectionId(options.add);
    const added = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}/icons/bulk`, {
      method: 'POST',
      body: {
        icon_ids: [Number(selected.id)],
      },
    });
    result.added = added.data;
  }

  if (booleanOption(options.download, false)) {
    const strictReference = `${selected.id}-${sanitizeFileSegment(selected.name || 'icon')}`;
    const icon = await fetchIcon(strictReference, true);
    const outputPath = resolveIconDownloadPath(options.output || options.o, icon);

    await writeIconSvg(outputPath, icon.svg, booleanOption(options.force, false));
    result.outputPath = outputPath;
  }

  if (options.json) {
    printJson(result);
    return;
  }

  console.log(`Picked ${selected.id}\t${selected.name}`);
  if (selected.pageUrl) {
    console.log(`  ${selected.pageUrl}`);
  }
  if (result.added) {
    console.log(`Added to collection: ${options.add}`);
  }
  if (result.outputPath) {
    console.log(`Downloaded SVG: ${result.outputPath}`);
  }
}

function assertInteractivePickAllowed(options) {
  if (booleanOption(options.ci, false) || !stdin.isTTY || !stdout.isTTY) {
    throw usageError('Interactive pick requires an interactive terminal. Omit --interactive to select the first result deterministically.');
  }
}

async function selectPickedIcon(icons, options) {
  if (!booleanOption(options.interactive, false)) {
    return icons[0];
  }

  console.log('Select an icon:');
  icons.forEach((icon, index) => {
    const set = icon.iconSet?.name ? ` - ${icon.iconSet.name}` : '';
    console.log(`  ${index + 1}. ${icon.id}\t${icon.name}${set}`);
  });

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await rl.question('Pick icon number [1], or q to cancel: ');
      const value = answer.trim().toLowerCase();

      if (value === '') {
        return icons[0];
      }

      if (value === 'q' || value === 'quit' || value === 'cancel') {
        throw usageError('Pick cancelled.');
      }

      const index = Number(value);
      if (Number.isInteger(index) && index >= 1 && index <= icons.length) {
        return icons[index - 1];
      }

      console.log(`Enter a number from 1 to ${icons.length}, or q to cancel.`);
    }
  } finally {
    rl.close();
  }
}

async function icon(args) {
  const [subcommand, ...rest] = args;

  if (subcommand === 'show') {
    await iconShow(rest);
    return;
  }

  if (subcommand === 'raw') {
    await iconRaw(rest);
    return;
  }

  if (subcommand === 'url') {
    await iconUrl(rest);
    return;
  }

  if (subcommand === 'open') {
    await iconOpen(rest);
    return;
  }

  if (subcommand === 'download') {
    await iconDownload(rest);
    return;
  }

  if (subcommand === 'png') {
    await iconPng(rest);
    return;
  }

  throw new Error('Unknown icon command. Use: show, raw, url, open, download, png.');
}

async function iconShow(args) {
  const options = parseOptions(args);
  const [iconReference] = options._;
  const icon = await fetchIcon(iconReference, booleanOption(options['include-svg'], false));

  if (options.json) {
    printJson({ icon });
    return;
  }

  printIcon(icon);
}

async function iconRaw(args) {
  const options = parseOptions(args);
  const [iconReference] = options._;
  const icon = await fetchIcon(iconReference, true);

  if (!icon.svg) {
    throw new Error('The icon response did not include SVG markup.');
  }

  console.log(icon.svg);
}

async function iconUrl(args) {
  const options = parseOptions(args);
  const [iconReference] = options._;
  const icon = await fetchIcon(iconReference, false);

  console.log(icon.pageUrl || '');
}

async function iconOpen(args) {
  const options = parseOptions(args);
  const [iconReference] = options._;
  const icon = await fetchIcon(iconReference, false);

  if (!icon.pageUrl) {
    throw new Error('The icon response did not include a page URL.');
  }

  openUrl(icon.pageUrl);
  console.log(`Opened ${icon.pageUrl}`);
}

async function iconDownload(args) {
  const options = parseOptions(args);
  const [iconReference] = options._;

  const reference = parseIconReference(iconReference);

  const payload = await callMcpTool('get_icon', {
    id: reference.id,
    includeSvg: true,
  });

  const icon = payload.icon;
  assertIconReferenceMatches(iconReference, icon);

  const outputPath = resolveIconDownloadPath(options.output || options.o, icon);
  await writeIconSvg(outputPath, icon?.svg, booleanOption(options.force, false));

  if (options.json) {
    printJson({
      icon: {
        id: icon.id,
        name: icon.name,
        pageUrl: icon.pageUrl,
      },
      outputPath,
    });
    return;
  }

  console.log(`Downloaded ${icon.id} ${icon.name}`);
  console.log(`  ${outputPath}`);
}

async function iconPng(args) {
  const options = parseOptions(args);
  const [iconReference] = options._;
  const reference = parseIconReference(iconReference);
  const payload = buildIconPngPayload(reference, options);
  const download = await proApiDownload(`/api/pro/icons/${encodeURIComponent(reference.id)}/png-export`, {
    method: 'POST',
    body: payload,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const outputPath = resolvePngDownloadPath(options.output || options.o, download.filename, process.cwd());

  await writeBinaryFile(outputPath, download.bytes, booleanOption(options.force, false));

  if (options.json) {
    printJson({
      icon: {
        id: reference.id,
        name: reference.slug,
      },
      outputPath,
      contentType: download.contentType,
      filename: download.filename,
      options: payload,
    });
    return;
  }

  console.log(`Downloaded PNG export`);
  console.log(`  ${outputPath}`);
}

async function collection(args) {
  const [subcommand, ...rest] = args;

  if (subcommand === 'list') {
    const options = parseOptions(rest);
    const payload = await proApi('/api/pro/project-kits');

    if (options.json) {
      printJson(payload);
      return;
    }

    for (const collection of payload.data || []) {
      printCollection(collection);
    }
    return;
  }

  if (subcommand === 'create') {
    await collectionCreate(rest);
    return;
  }

  if (subcommand === 'show') {
    await collectionShow(rest);
    return;
  }

  if (subcommand === 'rename') {
    await collectionRename(rest);
    return;
  }

  if (subcommand === 'update') {
    await collectionUpdate(rest);
    return;
  }

  if (subcommand === 'add') {
    await collectionAdd(rest);
    return;
  }

  if (subcommand === 'remove') {
    await collectionRemove(rest);
    return;
  }

  if (subcommand === 'delete') {
    await collectionDelete(rest);
    return;
  }

  if (subcommand === 'export') {
    await collectionExport(rest);
    return;
  }

  throw new Error('Unknown collection command. Use: list, create, show, rename, update, add, remove, delete, export.');
}

async function collectionCreate(args) {
  const options = parseOptions(args);
  const name = options.name || options._.join(' ').trim();

  if (!name) {
    throw new Error('Collection name is required. Example: svgicons collection create --name "Dashboard icons"');
  }

  const payload = await createKitApi({
    name,
    description: options.description || '',
    framework: enumOption(options.framework, 'framework', FRAMEWORKS),
    colorPolicy: enumOption(options['color-policy'], 'color policy', COLOR_POLICIES),
    namingPolicy: enumOption(options['naming-policy'], 'naming policy', NAMING_POLICIES),
  });

  if (options.json) {
    printJson(payload);
    return;
  }

  printCollection(payload.data);
}

async function collectionShow(args) {
  const options = parseOptions(args);
  const [collectionReference] = options._;

  if (!collectionReference) {
    throw new Error('Collection reference is required. Example: svgicons collection show "Dashboard icons"');
  }

  const collectionId = await resolveCollectionId(collectionReference);
  const query = booleanOption(options.icons, false) ? '?per_page=100' : '';
  const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}${query}`);

  if (options.json) {
    printJson(payload);
    return;
  }

  printCollectionDetail(payload, {
    icons: booleanOption(options.icons, false),
  });
}

async function collectionRename(args) {
  const options = parseOptions(args);
  const [collectionReference] = options._;
  const name = options.name || options._.slice(1).join(' ').trim();

  if (!collectionReference || !name) {
    throw new Error('Collection reference and --name are required. Example: svgicons collection rename "Dashboard icons" --name "Billing icons"');
  }

  await collectionPatch(collectionReference, { name }, options);
}

async function collectionUpdate(args) {
  const options = parseOptions(args);
  const [collectionReference] = options._;

  if (!collectionReference) {
    throw new Error('Collection reference is required. Example: svgicons collection update "Dashboard icons" --description "Product UI icons"');
  }

  const body = {
    ...(options.name ? { name: options.name } : {}),
    ...(options.description !== undefined ? { description: options.description === true ? '' : String(options.description) } : {}),
    ...(options.framework !== undefined ? { framework: enumOption(options.framework, 'framework', FRAMEWORKS) } : {}),
    ...(options['color-policy'] !== undefined ? { colorPolicy: enumOption(options['color-policy'], 'color policy', COLOR_POLICIES) } : {}),
    ...(options['naming-policy'] !== undefined ? { namingPolicy: enumOption(options['naming-policy'], 'naming policy', NAMING_POLICIES) } : {}),
  };

  if (Object.keys(body).length === 0) {
    throw usageError('At least one update option is required: --name, --description, --framework, --color-policy, or --naming-policy.');
  }

  await collectionPatch(collectionReference, body, options);
}

async function collectionPatch(collectionReference, body, options) {
  const collectionId = await resolveCollectionId(collectionReference);
  const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}`, {
    method: 'PATCH',
    body,
  });

  if (options.json) {
    printJson(payload);
    return;
  }

  printCollection(payload.data);
}

async function collectionAdd(args) {
  const options = parseOptions(args);
  const [collectionReference, ...iconIds] = options._;

  if (!collectionReference || iconIds.length === 0) {
    throw new Error('Collection reference and at least one icon id are required. Example: svgicons collection add "Dashboard icons" 33716');
  }

  const collectionId = await resolveCollectionId(collectionReference);
  const iconIdValues = iconIds.map((iconReference) => parseIconLookupReference(iconReference).id);
  const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}/icons/bulk`, {
    method: 'POST',
    body: {
      icon_ids: iconIdValues,
    },
  });

  if (options.json) {
    printJson(payload);
    return;
  }

  console.log(`Added ${payload.data.createdCount || 0} icon(s); ${payload.data.existingCount || 0} already present.`);
  if (payload.data.kit) {
    printCollection(payload.data.kit);
  }
}

async function collectionRemove(args) {
  const options = parseOptions(args);
  const [collectionReference, ...iconReferences] = options._;

  if (!collectionReference || iconReferences.length === 0) {
    throw new Error('Collection reference and at least one icon id are required. Example: svgicons collection remove "Dashboard icons" 33716');
  }

  const collectionId = await resolveCollectionId(collectionReference);
  const results = [];

  for (const iconReference of iconReferences) {
    const iconId = parseIconLookupReference(iconReference).id;
    const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}/icons/${encodeURIComponent(iconId)}`, {
      method: 'DELETE',
    });

    results.push(payload.data);
  }

  if (options.json) {
    printJson({ data: results });
    return;
  }

  for (const result of results) {
    console.log(`${result.removed ? 'removed' : 'not present'}: ${result.iconId}`);
  }
}

async function collectionDelete(args) {
  const options = parseOptions(args);
  const [collectionReference] = options._;

  if (!collectionReference) {
    throw new Error('Collection reference is required. Example: svgicons collection delete "Dashboard icons" --yes');
  }

  const collectionId = await resolveCollectionId(collectionReference);
  let collection = { id: collectionId, name: collectionReference };

  try {
    const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}`);
    collection = payload.data || collection;
  } catch {
    // Keep delete usable even if the detail endpoint is unavailable after ID resolution.
  }

  await confirmDeleteCollection(collection, options);
  await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}`, {
    method: 'DELETE',
  });

  if (options.json) {
    printJson({ deleted: true, collection: { id: collection.id, name: collection.name } });
    return;
  }

  console.log(`Deleted collection ${collection.id} ${collection.name}.`);
}

async function collectionExport(args) {
  const options = parseOptions(args);
  const [collectionReference] = options._;

  if (!collectionReference) {
    throw new Error('Collection reference is required. Example: svgicons collection export "Dashboard icons"');
  }

  const collectionId = await resolveCollectionId(collectionReference);
  const exportOptions = buildExportOptions(options);
  const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}/exports`, {
    method: 'POST',
    body: {
      formats: exportOptions.formats,
      options: exportOptions.options,
    },
  });

  if (options.json) {
    if (booleanOption(options['no-wait'], false)) {
      printJson(payload);
      return;
    }

    const completed = await waitForExport(collectionId, payload.data, options);
    const outputPath = await downloadExport(collectionId, completed, options);
    printJson({
      data: completed,
      outputPath,
    });
    return;
  }

  if (booleanOption(options['no-wait'], false)) {
    printExport(payload.data);
    return;
  }

  printExport(payload.data);
  const completed = await waitForExport(collectionId, payload.data, options, true);
  const outputPath = await downloadExport(collectionId, completed, options);

  console.log(`Downloaded export ZIP`);
  console.log(`  ${outputPath}`);
}

async function exportCommand(args) {
  const [subcommand, ...rest] = args;

  if (subcommand === 'status') {
    await exportStatus(rest);
    return;
  }

  if (subcommand === 'download') {
    await exportDownload(rest);
    return;
  }

  throw new Error('Unknown export command. Use: status, download.');
}

async function exportStatus(args) {
  const options = parseOptions(args);
  const [exportId] = options._;
  const collectionReference = options.collection;

  if (!exportId || !collectionReference) {
    throw new Error('Export id and --collection are required. Example: svgicons export status 55 --collection "Dashboard icons"');
  }

  const collectionId = await resolveCollectionId(collectionReference);
  const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}/exports/${encodeURIComponent(exportId)}`);

  if (options.json) {
    printJson(payload);
    return;
  }

  printExport(payload.data);
}

async function exportDownload(args) {
  const options = parseOptions(args);
  const [exportId] = options._;
  const collectionReference = options.collection;

  if (!exportId || !collectionReference) {
    throw new Error('Export id and --collection are required. Example: svgicons export download 55 --collection "Dashboard icons"');
  }

  const collectionId = await resolveCollectionId(collectionReference);
  const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}/exports/${encodeURIComponent(exportId)}`);
  const outputPath = await downloadExport(collectionId, payload.data, options);

  if (options.json) {
    printJson({
      data: payload.data,
      outputPath,
    });
    return;
  }

  console.log(`Downloaded export ZIP`);
  console.log(`  ${outputPath}`);
}

async function waitForExport(collectionId, exportJob, options, verbose = false) {
  const timeoutSeconds = numberOption(options.timeout, 180);
  const pollIntervalSeconds = numberOption(options['poll-interval'], 2);
  const startedAt = Date.now();
  let current = exportJob;

  while (Date.now() - startedAt <= timeoutSeconds * 1000) {
    if (current.status === 'completed') {
      return current;
    }

    if (current.status === 'failed') {
      throw exportFailedError(current);
    }

    if (verbose) {
      console.log(`Waiting for export ${current.id}: ${current.status}`);
    }

    await sleep(Math.max(1, pollIntervalSeconds) * 1000);
    const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}/exports/${encodeURIComponent(current.id)}`);
    current = payload.data;
  }

  throw exportTimeoutError(exportJob, timeoutSeconds);
}

async function downloadExport(collectionId, exportJob, options) {
  if (!exportJob.downloadUrl) {
    throw exportNotReadyError(exportJob);
  }

  const downloadPath = `/api/pro/project-kits/${encodeURIComponent(collectionId)}/exports/${encodeURIComponent(exportJob.id)}/download`;
  const download = await proApiDownload(downloadPath);
  const outputPath = resolveArchiveDownloadPath(options.output || options.o, download.filename || exportJob.artifactFilename);

  await writeBinaryFile(outputPath, download.bytes, booleanOption(options.force, false));

  return outputPath;
}

async function initProject(args) {
  const options = parseOptions(args);
  const path = manifestPath(options);
  const manifest = createManifest({
    collection: options.collection,
    framework: enumOption(options.framework, 'framework', FRAMEWORKS),
    format: enumOption(options.format, 'format', ['svg', 'react-ts', 'vue']),
    output: options.output || options.o,
  });

  try {
    await writeJsonFile(path, manifest, {
      force: booleanOption(options.force, false),
    });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw usageError(`Manifest already exists: ${path}. Use --force to overwrite it.`);
    }

    throw error;
  }

  if (options.json) {
    printJson({ manifestPath: path, manifest });
    return;
  }

  console.log(`Created ${path}`);
}

async function syncProject(args) {
  const options = parseOptions(args);
  const paths = projectPaths(options);
  const manifest = normalizeManifest(await readProjectJson(paths.manifest, 'manifest'));

  if (options.collection && options.collection !== true) {
    const nextRef = String(options.collection);
    const exists = manifest.collections.some((entry) => normalizeCollectionManifestEntry(entry).ref === nextRef);
    if (!exists) {
      manifest.collections.push({ ref: nextRef });
      await writeJsonFile(paths.manifest, manifest);
    }
  }

  const icons = await collectManifestIcons(manifest);
  const lockfile = createLockfile(icons, manifest);
  await writeJsonFile(paths.lockfile, lockfile);

  if (options.json) {
    printJson({ lockfilePath: paths.lockfile, iconsCount: lockfile.icons.length });
    return;
  }

  console.log(`Synced ${lockfile.icons.length} icon(s) into ${paths.lockfile}`);
}

async function buildProject(args) {
  const options = parseOptions(args);
  const paths = projectPaths(options);
  const manifest = normalizeManifest(await readProjectJson(paths.manifest, 'manifest'));
  const lockfile = await readProjectJson(paths.lockfile, 'lockfile');
  const format = options.format || manifest.format || 'svg';

  if (format !== 'svg') {
    throw usageError('Local build currently supports format svg. Use collection export for React TypeScript, Vue, Svelte, or Solid component ZIPs.');
  }

  const outputDir = resolve(String(options.output || options.o || manifest.output));
  let written = 0;

  for (const icon of lockfile.icons || []) {
    if (!icon.svg) {
      throw usageError(`Locked icon ${icon.ref || icon.id} does not include SVG markup. Run: svgicons sync`);
    }

    const outputPath = join(outputDir, svgFilenameForIcon(icon));
    await mkdir(resolve(outputDir), { recursive: true });
    await writeFile(outputPath, icon.svg.endsWith('\n') ? icon.svg : `${icon.svg}\n`, 'utf8');
    written++;
  }

  if (options.json) {
    printJson({ outputDir, written });
    return;
  }

  console.log(`Built ${written} SVG file(s) into ${outputDir}`);
}

async function updateProject(args) {
  const options = parseOptions(args);
  const [subcommand] = options._;

  if (subcommand !== '--check' && subcommand !== 'check' && options.check === undefined) {
    throw new Error('Unknown update command. Use: svgicons update --check');
  }

  const paths = projectPaths(options);
  const lockfile = await readProjectJson(paths.lockfile, 'lockfile');
  const changes = [];

  for (const locked of lockfile.icons || []) {
    const remote = await fetchIcon(locked.ref || String(locked.id), true);
    const current = lockIconFromIcon(remote);
    if (current.svgHash !== locked.svgHash) {
      changes.push({
        id: locked.id,
        ref: locked.ref,
        currentHash: locked.svgHash,
        remoteHash: current.svgHash,
      });
    }
  }

  const payload = {
    ok: changes.length === 0,
    checkedIcons: (lockfile.icons || []).length,
    changes,
  };

  if (options.json) {
    printJson(payload);
    return;
  }

  console.log(changes.length === 0
    ? `All ${payload.checkedIcons} locked icon(s) are up to date.`
    : `${changes.length} locked icon(s) changed upstream.`);
}

async function licenseCommand(args) {
  const [subcommand, ...rest] = args;

  if (subcommand === 'check') {
    await licenseCheck(rest);
    return;
  }

  if (subcommand === 'export') {
    await licenseExport(rest);
    return;
  }

  throw new Error('Unknown license command. Use: check, export.');
}

async function licenseCheck(args) {
  const options = parseOptions(args);
  const paths = projectPaths(options);
  const lockfile = await readProjectJson(paths.lockfile, 'lockfile');
  const manifest = await readOptionalManifest(paths.manifest);
  const report = buildLicenseReport(lockfile, {
    allow: csvOption(options.allow) || manifest.licensePolicy?.allow || [],
    deny: csvOption(options.deny) || manifest.licensePolicy?.deny || [],
  });

  if (options.json) {
    printJson(report);
  } else {
    printLicenseReport(report);
  }

  if (booleanOption(options.fail, false) && !report.ok) {
    throw licenseViolationError(report);
  }
}

async function licenseExport(args) {
  const options = parseOptions(args);
  const paths = projectPaths(options);
  const lockfile = await readProjectJson(paths.lockfile, 'lockfile');
  const manifest = await readOptionalManifest(paths.manifest);
  const report = buildLicenseReport(lockfile, manifest.licensePolicy || {});
  const format = options.format || 'markdown';
  let content;

  if (format === 'markdown' || format === 'md') {
    content = licenseReportToMarkdown(report);
  } else if (format === 'json') {
    content = `${JSON.stringify(report, null, 2)}\n`;
  } else if (format === 'csv') {
    content = licenseReportToCsv(report);
  } else {
    throw usageError('Invalid license export format. Allowed values: markdown, json, csv');
  }

  if (options.output || options.o) {
    const outputPath = resolve(String(options.output || options.o));
    await writeTextFile(outputPath, content);
    if (options.json) {
      printJson({ outputPath, format });
      return;
    }

    console.log(`Wrote ${outputPath}`);
    return;
  }

  console.log(content.trimEnd());
}

async function scan(args) {
  const options = parseOptions(args);
  const root = options._[0] || '.';
  const proposal = await scanProject(root, {
    maxFiles: numberOption(options['max-files'], 500),
    collectionName: options['collection-name'] || options['kit-name'],
    extensions: extensionSet(options.extensions),
  });
  let manifestResult = null;

  if (options['write-manifest']) {
    manifestResult = await writeScanManifest(proposal, options);
  }

  if (options['create-collection'] || options['create-kit']) {
    const payload = await createKitApi({
      name: proposal.collection.name,
      description: proposal.collection.description,
    });
    const iconIds = iconIdsFromScanProposal(proposal);
    const added = iconIds.length > 0
      ? await proApi(`/api/pro/project-kits/${encodeURIComponent(payload.data.id)}/icons/bulk`, {
        method: 'POST',
        body: {
          icon_ids: iconIds,
        },
      })
      : { data: { createdCount: 0, existingCount: 0 } };

    if (options.json) {
      printJson({
        proposal,
        manifest: manifestResult,
        created: payload.data,
        added: added.data,
      });
      return;
    }

    printScanProposal(proposal, { modified: Boolean(manifestResult) });
    if (manifestResult) {
      console.log('');
      console.log(`Updated manifest: ${manifestResult.manifestPath}`);
      console.log(`Added icon refs: ${manifestResult.addedIcons}`);
    }
    console.log('');
    console.log('Created Icon Collection:');
    printCollection(payload.data);
    console.log(`Added ${added.data.createdCount || 0} icon(s); ${added.data.existingCount || 0} already present.`);
    return;
  }

  if (options.json) {
    printJson(manifestResult ? { proposal, manifest: manifestResult } : proposal);
    return;
  }

  printScanProposal(proposal, { modified: Boolean(manifestResult) });
  if (manifestResult) {
    console.log('');
    console.log(`Updated manifest: ${manifestResult.manifestPath}`);
    console.log(`Added icon refs: ${manifestResult.addedIcons}`);
  }
}

async function writeScanManifest(proposal, options) {
  const path = manifestPath(options);
  let manifest;

  try {
    manifest = normalizeManifest(await readJsonFile(path));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    manifest = createManifest({
      collection: options.collection,
      framework: enumOption(options.framework, 'framework', FRAMEWORKS),
      format: enumOption(options.format, 'format', ['svg', 'react-ts', 'vue']),
      output: options.output || options.o,
    });
  }

  const existingRefs = new Set(
    (manifest.icons || [])
      .map((entry) => normalizeIconManifestEntry(entry).ref)
      .filter(Boolean),
  );
  const detectedRefs = scanIconRefs(proposal);
  let addedIcons = 0;

  for (const ref of detectedRefs) {
    if (existingRefs.has(ref)) {
      continue;
    }

    manifest.icons.push({ ref });
    existingRefs.add(ref);
    addedIcons++;
  }

  await writeJsonFile(path, manifest);

  return {
    manifestPath: path,
    addedIcons,
    totalIcons: manifest.icons.length,
  };
}

function scanIconRefs(proposal) {
  return [...new Set([
    ...(proposal.existingIconRefs || []),
    ...(proposal.generatedIconRefs || []),
  ])].sort((a, b) => Number(String(a).split('-')[0]) - Number(String(b).split('-')[0]) || String(a).localeCompare(String(b)));
}

function iconIdsFromScanProposal(proposal) {
  return [...new Set([
    ...(proposal.existingIconIds || []),
    ...scanIconRefs(proposal).map((ref) => String(ref).split('-')[0]),
  ])]
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);
}

function projectPaths(options) {
  return {
    manifest: manifestPath(options),
    lockfile: lockfilePath(options),
  };
}

async function readProjectJson(path, label) {
  try {
    return await readJsonFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw usageError(`Missing ${label}: ${path}. ${label === 'manifest' ? 'Run: svgicons init' : 'Run: svgicons sync'}`);
    }

    throw error;
  }
}

async function readOptionalManifest(path) {
  try {
    return normalizeManifest(await readJsonFile(path));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return normalizeManifest({});
    }

    throw error;
  }
}

async function collectManifestIcons(manifest) {
  const icons = [];

  for (const entry of manifest.icons || []) {
    const { ref } = normalizeIconManifestEntry(entry);
    if (!ref) {
      continue;
    }

    icons.push(await fetchIcon(ref, true));
  }

  for (const entry of manifest.collections || []) {
    const { ref } = normalizeCollectionManifestEntry(entry);
    if (!ref) {
      continue;
    }

    icons.push(...await collectCollectionIcons(ref));
  }

  return icons;
}

async function collectCollectionIcons(reference) {
  const collectionId = await resolveCollectionId(reference);
  const icons = [];
  let page = 1;
  let lastPage = 1;

  do {
    const payload = await proApi(`/api/pro/project-kits/${encodeURIComponent(collectionId)}?per_page=100&page=${page}`);
    icons.push(...(payload.icons?.data || []));
    lastPage = Number(payload.icons?.last_page || page);
    page++;
  } while (page <= lastPage);

  return icons;
}

function printLicenseReport(report) {
  console.log(`Checked icons: ${report.checkedIcons}`);
  console.log(`Status: ${report.ok ? 'ok' : 'violations found'}`);

  if (report.licenses.length > 0) {
    console.log('');
    console.log('Licenses:');
    for (const item of report.licenses) {
      console.log(`  ${item.license}: ${item.count}`);
    }
  }

  if (report.violations.length > 0) {
    console.log('');
    console.log('Violations:');
    for (const violation of report.violations) {
      console.log(`  ${violation.icon.ref}: ${violation.license} (${violation.reason})`);
    }
  }
}

async function createKitApi(body) {
  return proApi('/api/pro/project-kits', {
    method: 'POST',
    body,
  });
}

async function fetchIcon(iconReference, includeSvg = false) {
  const reference = parseIconLookupReference(iconReference);
  const payload = await callMcpTool('get_icon', {
    id: reference.id,
    includeSvg,
  });
  const icon = payload.icon || payload.data || payload;

  if (reference.slug && sanitizeFileSegment(icon?.name || '') !== reference.slug) {
    throw new Error(`Icon reference mismatch. Expected ${reference.id}-${reference.slug}, got ${icon?.id || 'unknown'}-${sanitizeFileSegment(icon?.name || '')}.`);
  }

  return icon;
}

async function resolveCollectionId(reference) {
  const value = String(reference || '').trim();

  if (/^\d+$/.test(value)) {
    return value;
  }

  const payload = await proApi('/api/pro/project-kits');
  const collections = payload.data || [];
  const normalized = value.toLowerCase();
  const slugMatches = collections.filter((collection) => String(collection.slug || '').toLowerCase() === normalized);
  const nameMatches = collections.filter((collection) => String(collection.name || '').toLowerCase() === normalized);
  const matches = slugMatches.length > 0 ? slugMatches : nameMatches;

  if (matches.length === 1) {
    return String(matches[0].id);
  }

  if (matches.length > 1) {
    throw new Error(`Collection reference is ambiguous: ${reference}`);
  }

  throw new Error(`Collection not found: ${reference}`);
}

async function confirmDeleteCollection(collection, options) {
  if (booleanOption(options.yes, false)) {
    return;
  }

  if (booleanOption(options.ci, false) || !stdin.isTTY || !stdout.isTTY) {
    throw usageError('Deleting a collection requires --yes in CI or non-interactive shells.');
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`Delete collection "${collection.name}" (${collection.id})? Type DELETE to confirm: `);
    if (answer.trim() !== 'DELETE') {
      throw usageError('Collection deletion cancelled.');
    }
  } finally {
    rl.close();
  }
}

async function version() {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(raw);

  console.log(pkg.version);
}

function parseOptions(args) {
  const options = { _: [] };

  for (let index = 0; index < args.length; index++) {
    const value = args[index];

    if (!value.startsWith('--')) {
      options._.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    const key = rawKey.trim();

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options[key] = next;
      index++;
      continue;
    }

    options[key] = true;
  }

  return options;
}

function extractGlobalOptions(argv) {
  const options = {};
  const args = [];
  const globalKeys = new Set(['config', 'profile', 'base-url', 'token']);

  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];

    if (!value.startsWith('--')) {
      args.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    if (!globalKeys.has(rawKey)) {
      args.push(value);
      continue;
    }

    if (inlineValue !== undefined) {
      options[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options[rawKey] = next;
      index++;
      continue;
    }

    options[rawKey] = true;
  }

  return { args, options };
}

function normalizeConfigKey(key) {
  const normalized = String(key || '').trim();

  if (normalized === 'base-url' || normalized === 'baseUrl') {
    return 'baseUrl';
  }

  if (['token', 'createdAt'].includes(normalized)) {
    return normalized;
  }

  return '';
}

function addCheck(checks, name, status, message, details = undefined) {
  checks.push({
    name,
    status,
    message,
    ...(details ? { details } : {}),
  });
}

async function checkDoctorStep(checks, name, callback) {
  try {
    addCheck(checks, name, 'pass', await callback());
  } catch (error) {
    addCheck(checks, name, 'fail', error.message, {
      code: error.code,
      status: error.status,
    });
  }
}

function printIcon(icon) {
  console.log(`${icon.id}\t${icon.name}`);
  if (icon.iconSet?.name) {
    console.log(`  set: ${icon.iconSet.name}`);
  }
  if (icon.width || icon.height) {
    console.log(`  size: ${icon.width || '?'}x${icon.height || '?'}`);
  }
  if (icon.category) {
    console.log(`  category: ${icon.category}`);
  }
  if (icon.pageUrl) {
    console.log(`  ${icon.pageUrl}`);
  }
}

function printRecommendations(payload) {
  const recommendations = payload.data || payload.icons || [];

  if (recommendations.length === 0) {
    console.log('No icon recommendations found.');
    return;
  }

  console.log('Recommended icons:');
  for (const recommendation of recommendations) {
    const icon = recommendation.icon || recommendation;
    const concept = recommendation.concept ? ` (${recommendation.concept})` : '';
    const set = icon.iconSet?.name ? ` - ${icon.iconSet.name}` : '';

    console.log(`${icon.id}\t${icon.name}${concept}${set}`);
    if (recommendation.rationale) {
      console.log(`  ${recommendation.rationale}`);
    }
    if (icon.pageUrl) {
      console.log(`  ${icon.pageUrl}`);
    }
  }

  if (payload.meta?.note) {
    console.log('');
    console.log(payload.meta.note);
  }
}

function openUrl(url) {
  const platform = process.platform;
  const command = platform === 'win32'
    ? 'cmd'
    : platform === 'darwin'
      ? 'open'
      : 'xdg-open';
  const args = platform === 'win32'
    ? ['/c', 'start', '', url]
    : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function numberOption(value, fallback) {
  if (value === undefined || value === true || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanOption(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (value === true) {
    return true;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  return Boolean(value);
}

function csvOption(value) {
  if (!value || value === true) {
    return undefined;
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function listOption(value) {
  if (!value || value === true) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function extensionSet(value) {
  const values = listOption(value);

  if (values.length === 0) {
    return undefined;
  }

  return new Set(values.map((item) => item.startsWith('.') ? item.toLowerCase() : `.${item.toLowerCase()}`));
}

function buildExportOptions(options) {
  const formats = exportFormatsOption(options.formats);
  const png = buildCollectionPngOptions(options);
  const includesPng = formats?.includes('png-pack') || Object.keys(png).length > 0;
  const normalizedFormats = includesPng && formats === undefined
    ? ['png-pack']
    : formats;

  return {
    formats: normalizedFormats,
    options: {
      colorPolicy: enumOption(options['color-policy'], 'color policy', COLOR_POLICIES),
      namingPolicy: enumOption(options['naming-policy'], 'naming policy', NAMING_POLICIES),
      sizeProps: booleanFlagPair(options, 'size-props', 'no-size-props'),
      typescript: booleanFlagPair(options, 'typescript', 'no-typescript'),
      defaultSize: boundedIntegerOption(options['default-size'], 'default component size', 1, 1024),
      titleProp: booleanFlagPair(options, 'title-prop', 'no-title-prop'),
      decorative: booleanFlagPair(options, 'decorative', 'no-decorative'),
      componentSuffix: identifierOption(options['component-suffix'], 'component suffix'),
      packageName: packageNameOption(options['package-name']),
      packageVersion: packageVersionOption(options['package-version']),
      png: includesPng ? png : undefined,
    },
  };
}

function buildIconPngPayload(reference, options) {
  return {
    iconName: reference.slug,
    sizes: integerCsvOption(options.sizes ?? options.size, 'PNG size', PNG_SIZES, [512]),
    densities: integerCsvOption(options.densities ?? options.density, 'PNG density', PNG_DENSITIES, [1]),
    backgroundType: enumOption(options.background, 'PNG background', PNG_BACKGROUNDS),
    backgroundColor: options['background-color'],
    iconColorMode: enumOption(options.color, 'PNG icon color mode', PNG_COLORS),
    iconColor: options['icon-color'],
    padding: integerOption(options.padding, 'PNG padding'),
    fit: enumOption(options.fit, 'PNG fit mode', PNG_FITS),
    filename: options.filename,
    zip: booleanOption(options.zip, undefined),
  };
}

function buildCollectionPngOptions(options) {
  return stripUndefined({
    sizes: integerCsvOption(options['png-sizes'] ?? options['png-size'], 'PNG size', PNG_SIZES, undefined),
    densities: integerCsvOption(options['png-densities'] ?? options['png-density'], 'PNG density', [1, 2, 3], undefined),
    backgroundType: enumOption(options['png-background'], 'PNG background', PNG_BACKGROUNDS),
    backgroundColor: options['png-background-color'],
    iconColorMode: enumOption(options['png-color'], 'PNG icon color mode', PNG_COLORS),
    iconColor: options['png-icon-color'],
    padding: integerOption(options['png-padding'], 'PNG padding'),
    fit: enumOption(options['png-fit'], 'PNG fit mode', PNG_FITS),
  });
}

function exportFormatsOption(value) {
  const values = csvOption(value);

  if (!values) {
    return undefined;
  }

  const normalized = values.map((item) => item === 'png' ? 'png-pack' : item);
  const invalid = normalized.filter((item) => !EXPORT_FORMATS.includes(item));
  if (invalid.length > 0) {
    throw usageError(`Invalid export format: ${invalid.join(', ')}. Allowed values: ${EXPORT_FORMATS.join(', ')}, png`);
  }

  return [...new Set(normalized)];
}

function integerCsvOption(value, label, allowed, fallback) {
  const values = csvOption(value);

  if (!values) {
    return fallback;
  }

  const parsed = values.map((item) => Number(item));
  const invalid = parsed.filter((item) => !Number.isInteger(item) || !allowed.includes(item));

  if (invalid.length > 0) {
    throw usageError(`Invalid ${label}: ${invalid.join(', ')}. Allowed values: ${allowed.join(', ')}`);
  }

  return [...new Set(parsed)];
}

function integerOption(value, label) {
  if (value === undefined || value === true || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw usageError(`Invalid ${label}: ${value}. Expected an integer.`);
  }

  return parsed;
}

function boundedIntegerOption(value, label, min, max) {
  const parsed = integerOption(value, label);

  if (parsed === undefined) {
    return undefined;
  }

  if (parsed < min || parsed > max) {
    throw usageError(`Invalid ${label}: ${value}. Allowed range: ${min}-${max}.`);
  }

  return parsed;
}

function identifierOption(value, label) {
  if (value === undefined || value === true || value === '') {
    return undefined;
  }

  const parsed = String(value);
  if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(parsed)) {
    throw usageError(`Invalid ${label}: ${value}. Use 1-32 letters or numbers, starting with a letter.`);
  }

  return parsed;
}

function packageNameOption(value) {
  if (value === undefined || value === true || value === '') {
    return undefined;
  }

  const parsed = String(value);
  if (parsed.length > 214 || parsed.toLowerCase() !== parsed || !/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/.test(parsed)) {
    throw usageError(`Invalid npm package name: ${value}. Use a lowercase npm package name such as svgicons-dashboard or @svgicons-com/dashboard.`);
  }

  return parsed;
}

function packageVersionOption(value) {
  if (value === undefined || value === true || value === '') {
    return undefined;
  }

  const parsed = String(value);
  if (parsed.length > 64 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(parsed)) {
    throw usageError(`Invalid npm package version: ${value}. Use a semver-like version such as 1.0.0 or 1.0.0-beta.1.`);
  }

  return parsed;
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function enumOption(value, label, allowed) {
  if (value === undefined || value === true || value === '') {
    return undefined;
  }

  if (!allowed.includes(String(value))) {
    throw usageError(`Invalid ${label}: ${value}. Allowed values: ${allowed.join(', ')}`);
  }

  return String(value);
}

function enumCsvOption(value, label, allowed) {
  const values = csvOption(value);

  if (!values) {
    return undefined;
  }

  const invalid = values.filter((item) => !allowed.includes(item));
  if (invalid.length > 0) {
    throw usageError(`Invalid ${label}: ${invalid.join(', ')}. Allowed values: ${allowed.join(', ')}`);
  }

  return [...new Set(values)];
}

function booleanFlagPair(options, positiveKey, negativeKey) {
  if (options[negativeKey] !== undefined) {
    return false;
  }

  return booleanOption(options[positiveKey], undefined);
}

function printHelp() {
  console.log(`Svg/icons CLI

Usage:
  svgicons auth login --token <token> [--base-url https://svgicons.com]
  svgicons auth status [--json]
  svgicons login --token <token> [--base-url https://svgicons.com]
  svgicons config list|get|set
  svgicons doctor [--json]
  svgicons check [path] [--json] [--strict]
  svgicons version
  svgicons search "arrow left" [--limit 10] [--json]
  svgicons recommend "billing settings dashboard" [--create-collection] [--json]
  svgicons pick "settings gear" [--interactive] [--add "Dashboard icons"] [--download]
  svgicons icon show <icon-ref> [--json]
  svgicons icon raw <icon-ref>
  svgicons icon url <icon-ref>
  svgicons icon open <icon-ref>
  svgicons icon download <icon-id-name> [--output ./icons] [--force]
  svgicons icon png <icon-id-name> [--size 512] [--density 1,2] [--output ./icons] [--force]
  svgicons collection list [--json]
  svgicons collection create --name "Dashboard icons"
  svgicons collection show <collection-id-or-name> [--icons] [--json]
  svgicons collection rename <collection-id-or-name> --name "Billing icons"
  svgicons collection update <collection-id-or-name> [--description "..."]
  svgicons collection add <collection-id-or-name> <icon-id...>
  svgicons collection remove <collection-id-or-name> <icon-id...>
  svgicons collection delete <collection-id-or-name> [--yes]
  svgicons collection export <collection-id-or-name> [--formats react-ts,vue,svelte,solid,blade,storybook,npm-package,png-pack,iconify-json] [--default-size 24] [--component-suffix Icon] [--package-name svgicons-dashboard] [--package-version 0.1.0] [--title-prop|--no-title-prop] [--decorative|--no-decorative] [--no-size-props] [--no-typescript] [--output ./exports]
  svgicons export status <export-id> --collection <collection-id-or-name>
  svgicons export download <export-id> --collection <collection-id-or-name> [--output ./exports]
  svgicons init [--collection <collection-id-or-name>] [--output svgicons-icons]
  svgicons sync [--collection <collection-id-or-name>]
  svgicons build [--ci]
  svgicons update --check
  svgicons license check [--allow MIT,Apache-2.0] [--deny GPL] [--fail]
  svgicons license export --format markdown|json|csv --output THIRD_PARTY_ICONS.md
  svgicons scan [path] [--json] [--write-manifest] [--create-collection]

Environment:
  SVGICONS_TOKEN or SVGICONS_API_TOKEN can provide the token without writing config.
  SVGICONS_BASE_URL can target local or staging instances.
`);
}

function printCheckHelp() {
  console.log(`Svg/icons local check

Usage:
  svgicons check [path] [--json] [--strict]

Options:
  --json     Print machine-readable JSON.
  --strict   Treat warnings as failures.
  --help     Show this help.

This command is read-only. It checks local generated artifacts without calling svgicons.com or running external build tools.
`);
}
