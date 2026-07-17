import { credentials } from './config.js';
import { httpError, invalidJsonError, mcpError, missingTokenError, networkError } from './errors.js';

let rpcId = 1;

export async function callMcpTool(name, args = {}, options = {}) {
  const response = await mcpRequest('tools/call', {
    name,
    arguments: args,
  }, options);

  const result = response.result || {};
  const content = result.structuredContent || parseMcpText(result.content);

  if (result.isError || content?.error) {
    throw mcpError(content?.error?.message || 'MCP tool returned an error', {
      tool: name,
      error: content?.error,
    });
  }

  return content;
}

export async function mcpRequest(method, params = {}, options = {}) {
  const creds = await credentials();
  const token = options.token ?? creds.token;
  const baseUrl = options.baseUrl ?? creds.baseUrl;

  const response = await request(`${baseUrl}/mcp`, {
    method: 'POST',
    token,
    body: {
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params,
    },
  });

  if (response.error) {
    throw mcpError(response.error.message || 'MCP request failed', {
      code: response.error.code,
      data: response.error.data,
    });
  }

  return response;
}

export async function proApi(path, options = {}) {
  const creds = await credentials();
  const token = options.token ?? creds.token;
  const baseUrl = options.baseUrl ?? creds.baseUrl;

  if (!token) {
    throw missingTokenError();
  }

  return request(`${baseUrl}${path}`, {
    ...options,
    token,
  });
}

export async function proApiDownload(pathOrUrl, options = {}) {
  const creds = await credentials();
  const token = options.token ?? creds.token;
  const baseUrl = options.baseUrl ?? creds.baseUrl;

  if (!token) {
    throw missingTokenError();
  }

  const url = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${baseUrl}${pathOrUrl}`;

  let response;

  try {
    const headers = {
      Accept: 'image/png, application/zip, application/octet-stream',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'svgicons-cli/0.1.1',
      ...options.headers,
    };
    const init = {
      method: options.method || 'GET',
      headers,
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      init.body = typeof options.body === 'string' || options.body instanceof Buffer
        ? options.body
        : JSON.stringify(options.body);
    }

    response = await fetch(url, {
      ...init,
    });
  } catch (error) {
    throw networkError(error, url);
  }

  if (!response.ok) {
    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    throw httpError(response.status, url, data);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    filename: filenameFromContentDisposition(response.headers.get('content-disposition')),
    contentType: response.headers.get('content-type'),
  };
}

async function request(url, options = {}) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'svgicons-cli/0.1.1',
    ...options.headers,
  };

  const init = {
    method: options.method || 'GET',
    headers,
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw networkError(error, url);
  }

  const text = await response.text();
  const data = text ? safeJson(text, url) : {};

  if (!response.ok) {
    throw httpError(response.status, url, data);
  }

  return data;
}

function filenameFromContentDisposition(header) {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
  }

  const asciiMatch = header.match(/filename="?([^";]+)"?/i);
  if (asciiMatch) {
    return asciiMatch[1].trim();
  }

  return null;
}

function safeJson(text, url) {
  try {
    return JSON.parse(text);
  } catch {
    throw invalidJsonError(url);
  }
}

function parseMcpText(content) {
  const firstText = Array.isArray(content)
    ? content.find((item) => item?.type === 'text')?.text
    : '';

  if (!firstText) {
    return {};
  }

  try {
    return JSON.parse(firstText);
  } catch {
    return {};
  }
}
