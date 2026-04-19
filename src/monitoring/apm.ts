import apm from 'elastic-apm-node';

export function initializeAPM() {
  apm.start({
    serviceName: 'vps-core',
    serverUrl: 'http://localhost:8200',
    environment: process.env.NODE_ENV || 'development'
  });
}

export function captureTransaction(name: string, callback: Function) {
  const transaction = apm.startTransaction(name);
  try {
    callback();
  } finally {
    transaction.end();
  }
}
