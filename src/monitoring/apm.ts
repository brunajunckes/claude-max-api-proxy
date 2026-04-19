/**
 * APM Provider (Elastic APM / Datadog compatible)
 * Graceful fallback if APM service unavailable
 */

let apmClient: any = null;

export function initializeAPM() {
  try {
    // Try to load elastic-apm-node if available
    const apm = require('elastic-apm-node');
    apm.start({
      serviceName: process.env.SERVICE_NAME || 'claude-max-api-proxy',
      serverUrl: process.env.APM_SERVER_URL || 'http://localhost:8200',
      environment: process.env.NODE_ENV || 'development',
      logLevel: 'warn'
    });
    apmClient = apm;
    console.log('[APM] Elastic APM initialized');
  } catch (err) {
    // APM optional - just log
    console.log('[APM] APM not available (optional)');
  }
}

export function captureTransaction(name: string, fn: () => void) {
  if (!apmClient) {
    fn();
    return;
  }

  const transaction = apmClient.startTransaction(name);
  try {
    fn();
  } finally {
    transaction.end();
  }
}

export function captureError(error: Error) {
  if (apmClient) {
    apmClient.captureError(error);
  }
}

export function isAPMEnabled(): boolean {
  return !!apmClient;
}
