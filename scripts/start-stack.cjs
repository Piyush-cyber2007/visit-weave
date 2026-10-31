const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8001';
const healthUrl = new URL('/health', authServiceUrl);
const auth = spawn(process.execPath, ['scripts/start-auth.cjs'], {
  cwd: root,
  stdio: 'inherit',
});

let api;
let shuttingDown = false;

function stop(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = code;
  if (api && api.exitCode === null) api.kill();
  if (auth.exitCode === null) auth.kill();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}

auth.on('error', (error) => {
  console.error(`Could not start authentication: ${error.message}`);
  stop(1);
});

auth.on('exit', (code) => {
  if (!shuttingDown) {
    console.error('Authentication service stopped.');
    stop(code || 1);
  }
});

async function waitForAuth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (shuttingDown) return;
    if (auth.exitCode !== null) throw new Error('Authentication service exited before becoming ready.');
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Authentication service did not become ready at ${healthUrl}.`);
}

waitForAuth()
  .then(() => {
    if (shuttingDown) return;
    api = spawn(process.execPath, ['--env-file=../.env', 'src/index.js'], {
      cwd: path.join(root, 'server'),
      stdio: 'inherit',
    });
    api.on('error', (error) => {
      console.error(`Could not start the API server: ${error.message}`);
      stop(1);
    });
    api.on('exit', (code) => {
      if (!shuttingDown) stop(code || 0);
    });
  })
  .catch((error) => {
    console.error(error.message);
    stop(1);
  });
