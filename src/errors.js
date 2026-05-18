import { redactString } from './redact.js';

export class CliError extends Error {
  constructor(code, message, details = {}) {
    super(redactString(message));
    this.name = 'CliError';
    this.code = code;
    this.status = details.status;
    this.details = details;
  }
}

export function missingTokenError() {
  return new CliError(
    'missing_token',
    'A Pro API token is required. Run: svgicons login --token <token>',
  );
}

export function networkError(error, url) {
  return new CliError('network_error', `Unable to reach ${url}: ${error?.message || error}`, { url });
}

export function invalidJsonError(url) {
  return new CliError('invalid_json', `Invalid JSON response from ${url}`, { url });
}

export function httpError(status, url, data = {}) {
  const message = data?.message || data?.error?.message || `HTTP ${status} from ${url}`;
  const code = classifyHttpError(status, message, data);

  return new CliError(code, message, {
    status,
    url,
    requiredScopes: data?.requiredScopes,
    missingScope: data?.missingScope,
    pricingUrl: data?.pricingUrl,
  });
}

export function mcpError(message, details = {}) {
  return new CliError('mcp_error', message || 'MCP request failed', details);
}

export function usageError(message, details = {}) {
  return new CliError('usage_error', message, details);
}

export function exportFailedError(exportJob, message = '') {
  return new CliError(
    'export_failed',
    message || exportJob?.failureMessage || `Collection export ${exportJob?.id || ''} failed.`.trim(),
    { exportId: exportJob?.id, status: exportJob?.status },
  );
}

export function exportTimeoutError(exportJob, timeoutSeconds) {
  return new CliError(
    'export_timeout',
    `Timed out waiting for export ${exportJob?.id}. Use --timeout <seconds> or --no-wait.`,
    { exportId: exportJob?.id, timeoutSeconds },
  );
}

export function exportNotReadyError(exportJob) {
  return new CliError(
    'export_not_ready',
    'The completed export did not provide a download URL.',
    { exportId: exportJob?.id, status: exportJob?.status },
  );
}

export function licenseViolationError(report) {
  return new CliError(
    'license_violation',
    `${report.violations.length} icon license violation(s) found.`,
    {
      checkedIcons: report.checkedIcons,
      violations: report.violations,
    },
  );
}

export function serializeError(error) {
  return {
    error: {
      code: error?.code || 'error',
      message: redactString(error?.message || String(error)),
      status: error?.status,
      details: error?.details,
    },
  };
}

function classifyHttpError(status, message, data) {
  const text = String(message || '').toLowerCase();

  if (status === 401) {
    return 'auth_required';
  }

  if (status === 403) {
    if (data?.missingScope || text.includes('missing') && text.includes('scope')) {
      return 'missing_scope';
    }

    if (text.includes('email verification') || text.includes('unverified')) {
      return 'email_unverified';
    }

    if (text.includes('pro plan') || text.includes('pro subscription') || text.includes('requires pro')) {
      return 'pro_required';
    }

    return 'forbidden';
  }

  if (status === 404) {
    return 'not_found';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  return 'http_error';
}
