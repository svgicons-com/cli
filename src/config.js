import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir, platform } from 'node:os';

const DEFAULT_BASE_URL = 'https://svgicons.com';
let configPathOverride = '';
let credentialOverrides = {};

export function defaultBaseUrl() {
  return process.env.SVGICONS_BASE_URL || DEFAULT_BASE_URL;
}

export function configPath() {
  if (configPathOverride) {
    return configPathOverride;
  }

  if (process.env.SVGICONS_CLI_CONFIG_DIR) {
    return join(process.env.SVGICONS_CLI_CONFIG_DIR, 'config.json');
  }

  const home = homedir();
  const os = platform();

  if (os === 'win32') {
    const base = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(base, 'svgicons', 'cli', 'config.json');
  }

  if (os === 'darwin') {
    return join(home, 'Library', 'Application Support', 'svgicons', 'cli', 'config.json');
  }

  const base = process.env.XDG_CONFIG_HOME || join(home, '.config');
  return join(base, 'svgicons', 'cli', 'config.json');
}

export async function readConfig() {
  try {
    const raw = await readFile(configPath(), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {};
    }

    throw new Error(`Unable to read Svg/icons CLI config: ${error.message}`);
  }
}

export async function writeConfig(config) {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function clearConfig() {
  await rm(configPath(), { force: true });
}

export async function credentials() {
  const config = await readConfig();
  const envToken = process.env.SVGICONS_TOKEN || process.env.SVGICONS_API_TOKEN;
  const baseUrl = credentialOverrides.baseUrl
    || process.env.SVGICONS_BASE_URL
    || config.baseUrl
    || DEFAULT_BASE_URL;
  const token = credentialOverrides.token !== undefined
    ? credentialOverrides.token
    : envToken || config.token || '';

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    token,
  };
}

export async function credentialsStatus() {
  const config = await readConfig();
  const envToken = process.env.SVGICONS_TOKEN || process.env.SVGICONS_API_TOKEN;
  const envBaseUrl = process.env.SVGICONS_BASE_URL;
  const hasTokenOverride = credentialOverrides.token !== undefined;
  const baseUrl = credentialOverrides.baseUrl || envBaseUrl || config.baseUrl || DEFAULT_BASE_URL;
  const token = hasTokenOverride ? credentialOverrides.token : envToken || config.token || '';

  return {
    configPath: configPath(),
    baseUrl: normalizeBaseUrl(baseUrl),
    baseUrlSource: credentialOverrides.baseUrl
      ? 'command'
      : envBaseUrl
        ? 'environment'
        : config.baseUrl
          ? 'config'
          : 'default',
    hasToken: Boolean(token),
    tokenSource: hasTokenOverride
      ? 'command'
      : envToken
        ? 'environment'
        : config.token
          ? 'config'
          : 'none',
    createdAt: config.createdAt || null,
  };
}

export function setConfigPathOverride(path) {
  configPathOverride = path ? String(path) : '';
}

export function setCredentialOverrides(overrides = {}) {
  credentialOverrides = {
    ...credentialOverrides,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  };
}

export function clearRuntimeOverrides() {
  configPathOverride = '';
  credentialOverrides = {};
}

export function normalizeBaseUrl(value) {
  const baseUrl = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('Base URL must start with http:// or https://');
  }

  return baseUrl;
}
