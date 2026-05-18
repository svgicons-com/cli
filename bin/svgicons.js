#!/usr/bin/env node

import { run } from '../src/cli.js';
import { serializeError } from '../src/errors.js';

run(process.argv.slice(2)).catch((error) => {
  if (process.argv.includes('--json')) {
    console.error(JSON.stringify(serializeError(error), null, 2));
  } else {
    console.error(error?.message || String(error));
  }
  process.exitCode = 1;
});
