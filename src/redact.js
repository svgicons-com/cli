const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api[_-]?key|bearer)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const TOKEN_LIKE_PATTERN = /\b(?:sk|pk|whsec|svgicons)_[A-Za-z0-9._~+/=-]{12,}\b/g;

export const REDACTED = '[redacted]';

export function redact(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (typeof value === 'object') {
    return redactObject(value);
  }

  return value;
}

export function redactObject(value) {
  const output = {};

  for (const [key, item] of Object.entries(value || {})) {
    output[key] = SECRET_KEY_PATTERN.test(key) && item
      ? REDACTED
      : redact(item);
  }

  return output;
}

export function redactString(value) {
  return String(value)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(TOKEN_LIKE_PATTERN, REDACTED);
}
