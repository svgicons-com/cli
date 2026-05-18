import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';

export function parseIconReference(reference) {
  const value = String(reference || '').trim();
  const match = value.match(/^(\d+)-([a-z0-9][a-z0-9._-]*)$/i);

  if (!match) {
    throw new Error('Icon reference must include id and name, for example: 33716-arrow-circle-up-fill');
  }

  return {
    id: Number(match[1]),
    slug: sanitizeFileSegment(match[2]),
  };
}

export function parseIconLookupReference(reference) {
  const value = String(reference || '').trim();

  if (!value) {
    throw new Error('Icon reference is required.');
  }

  const urlMatch = value.match(/\/icon\/(\d+)(?:\/([^/?#]+))?/i);
  if (urlMatch) {
    return {
      id: Number(urlMatch[1]),
      slug: urlMatch[2] ? sanitizeFileSegment(decodeURIComponent(urlMatch[2])) : '',
    };
  }

  const idSlugMatch = value.match(/^(\d+)(?:-([a-z0-9][a-z0-9._-]*))?$/i);
  if (idSlugMatch) {
    return {
      id: Number(idSlugMatch[1]),
      slug: idSlugMatch[2] ? sanitizeFileSegment(idSlugMatch[2]) : '',
    };
  }

  throw new Error('Icon reference must be an id, id-name, or svgicons.com icon URL.');
}

export function assertIconReferenceMatches(reference, icon) {
  const expected = parseIconReference(reference);
  const actualSlug = sanitizeFileSegment(icon?.name || '');

  if (Number(icon?.id) !== expected.id || actualSlug !== expected.slug) {
    throw new Error(`Icon reference mismatch. Expected ${expected.id}-${expected.slug}, got ${icon?.id || 'unknown'}-${actualSlug || 'unknown'}.`);
  }

  return expected;
}

export function iconDownloadFilename(icon) {
  const id = Number(icon?.id);
  const name = sanitizeFileSegment(icon?.name || 'icon');

  return `${Number.isFinite(id) && id > 0 ? id : 'icon'}-${name}.svg`;
}

export function resolveIconDownloadPath(output, icon, cwd = process.cwd()) {
  const filename = iconDownloadFilename(icon);

  if (!output || output === true) {
    return resolve(cwd, filename);
  }

  const target = isAbsolute(String(output))
    ? String(output)
    : resolve(cwd, String(output));

  if (extname(target).toLowerCase() === '.svg') {
    return target;
  }

  return join(target, filename);
}

export function resolveArchiveDownloadPath(output, filename, cwd = process.cwd()) {
  const safeFilename = sanitizeFileName(filename || 'svgicons-collection-export.zip', 'zip');

  if (!output || output === true) {
    return resolve(cwd, safeFilename);
  }

  const target = isAbsolute(String(output))
    ? String(output)
    : resolve(cwd, String(output));

  if (extname(target).toLowerCase() === '.zip') {
    return target;
  }

  return join(target, safeFilename);
}

export function resolvePngDownloadPath(output, filename, cwd = process.cwd()) {
  const safeFilename = sanitizeFileName(filename || 'svgicons-icon.png', 'png');

  if (!output || output === true) {
    return resolve(cwd, safeFilename);
  }

  const target = isAbsolute(String(output))
    ? String(output)
    : resolve(cwd, String(output));

  const extension = extname(target).toLowerCase();
  if (extension === '.png' || extension === '.zip') {
    return target;
  }

  return join(target, safeFilename);
}

export async function writeIconSvg(path, svg, force = false) {
  if (!svg || typeof svg !== 'string') {
    throw new Error('The icon response did not include SVG markup.');
  }

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(path, svg.endsWith('\n') ? svg : `${svg}\n`, {
      flag: force ? 'w' : 'wx',
    });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`File already exists: ${path}. Use --force to overwrite it.`);
    }

    throw error;
  }

  return path;
}

export async function writeBinaryFile(path, bytes, force = false) {
  if (!bytes || bytes.length === 0) {
    throw new Error('The download response did not include file data.');
  }

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(path, bytes, {
      flag: force ? 'w' : 'wx',
    });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`File already exists: ${path}. Use --force to overwrite it.`);
    }

    throw error;
  }

  return path;
}

export function sanitizeFileSegment(value) {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[ ._-]+|[ ._-]+$/g, '')
    .slice(0, 120);

  return cleaned || 'icon';
}

export function sanitizeFileName(value, fallbackExtension) {
  const extension = fallbackExtension ? `.${fallbackExtension.replace(/^\./, '')}` : '';
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[ ._-]+|[ ._-]+$/g, '')
    .slice(0, 160);

  if (!cleaned) {
    return `download${extension}`;
  }

  if (extension && extname(cleaned).toLowerCase() !== extension.toLowerCase()) {
    return `${cleaned}${extension}`;
  }

  return cleaned;
}
