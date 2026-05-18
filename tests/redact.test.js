import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, redactString } from '../src/redact.js';

test('redact masks authorization headers and token fields', () => {
  assert.equal(
    redactString('Authorization: Bearer svgicons_secret_token_1234567890'),
    'Authorization: Bearer [redacted]',
  );

  assert.deepEqual(redact({
    token: 'svgicons_secret_token_1234567890',
    nested: {
      Authorization: 'Bearer svgicons_secret_token_1234567890',
      safe: 'value',
    },
  }), {
    token: '[redacted]',
    nested: {
      Authorization: '[redacted]',
      safe: 'value',
    },
  });
});
