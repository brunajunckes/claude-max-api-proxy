#!/usr/bin/env node

/**
 * AIOX CLI Wrapper for Hermes
 * Entry point that delegates to .aiox-core/cli
 * Loaded via: npm run cli [command]
 */

const path = require('path');
const { run } = require('../.aiox-core/cli/index.js');

// Pass all arguments to the AIOX CLI
run(process.argv).catch((error) => {
  console.error('AIOX CLI Error:', error.message);
  process.exit(1);
});
