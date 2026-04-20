#!/usr/bin/env node

/**
 * Hot-Reload Config CLI Command
 *
 * Triggers configuration reload via HTTP POST to /admin/config/reload endpoint
 * Supports custom config paths and displays detailed reload history
 *
 * Usage:
 *   npm run reload-config                           # Use default config
 *   npm run reload-config -- --config /path/to/config.json
 *   npm run reload-config -- --show-history
 *   npm run reload-config -- --server http://localhost:3000
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const DEFAULT_SERVER = 'http://localhost:3000';
const RELOAD_ENDPOINT = '/admin/config/reload';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    server: DEFAULT_SERVER,
    configPath: undefined,
    showHistory: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') {
      options.configPath = args[++i];
    } else if (args[i] === '--server') {
      options.server = args[++i];
    } else if (args[i] === '--show-history') {
      options.showHistory = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              Hot-Reload Config CLI Command                   ║
╚═══════════════════════════════════════════════════════════════╝

Triggers configuration hot-reload via HTTP endpoint.

Usage:
  npm run reload-config [options]

Options:
  --config <path>        Path to config file to load
  --server <url>         Server URL (default: http://localhost:3000)
  --show-history         Display full reload history
  --help, -h             Show this help message

Examples:
  npm run reload-config
  npm run reload-config -- --config ./config.json
  npm run reload-config -- --server http://localhost:3001 --show-history

Environment Variables:
  RELOAD_SERVER          Override server URL
  CONFIG_PATH            Override default config path

Returns:
  0 on success
  1 on error
`);
}

function makeHttpRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const clientModule = url.startsWith('https') ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    const req = clientModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function performReload(options) {
  const url = `${options.server}${RELOAD_ENDPOINT}`;
  const body = options.configPath ? { configPath: options.configPath } : {};

  try {
    console.log(`\nReloading configuration from: ${options.server}`);
    if (options.configPath) {
      console.log(`Using config path: ${options.configPath}`);
    }
    console.log('');

    const response = await makeHttpRequest(url, 'POST', body);

    if (response.statusCode === 200) {
      const data = response.body;

      console.log('✓ Configuration reloaded successfully!\n');

      if (data.changes && Object.keys(data.changes).length > 0) {
        console.log('Changes applied:');
        for (const [key, change] of Object.entries(data.changes)) {
          console.log(`  ${key}:`);
          console.log(`    Old: ${JSON.stringify(change.old)}`);
          console.log(`    New: ${JSON.stringify(change.new)}`);
        }
      } else {
        console.log('No configuration changes detected.');
      }

      if (options.showHistory && data.history) {
        console.log('\nReload History:');
        data.history.forEach((entry, idx) => {
          const status = entry.success ? '✓' : '✗';
          console.log(`  [${idx + 1}] ${entry.timestamp} - ${status}`);
          if (!entry.success && entry.error) {
            console.log(`      Error: ${entry.error}`);
          } else if (entry.changes && Object.keys(entry.changes).length > 0) {
            console.log(`      Changes: ${Object.keys(entry.changes).join(', ')}`);
          }
        });
      }

      console.log('');
      return 0;
    } else {
      const errorMsg = data?.error?.message || response.body || 'Unknown error';
      console.error(`✗ Configuration reload failed (${response.statusCode})`);
      console.error(`  Error: ${errorMsg}\n`);
      return 1;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`✗ Failed to connect to server: ${msg}`);
    console.error(`  Server: ${options.server}\n`);
    return 1;
  }
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return 0;
  }

  // Check environment overrides
  if (process.env.RELOAD_SERVER) {
    options.server = process.env.RELOAD_SERVER;
  }
  if (process.env.CONFIG_PATH && !options.configPath) {
    options.configPath = process.env.CONFIG_PATH;
  }

  const exitCode = await performReload(options);
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
