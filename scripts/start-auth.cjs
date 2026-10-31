const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const authServiceUrl = new URL(process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8001');
const authPort = authServiceUrl.port || (authServiceUrl.protocol === 'https:' ? '443' : '80');
const localPython = path.join(
  root,
  'backend',
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python',
);
const activePython = process.env.VIRTUAL_ENV
  ? path.join(
    process.env.VIRTUAL_ENV,
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python',
  )
  : null;
const python = existsSync(localPython)
  ? localPython
  : activePython && existsSync(activePython)
    ? activePython
    : process.env.PYTHON || 'python';

const migration = spawnSync(
  python,
  ['-m', 'alembic', '-c', 'backend/alembic.ini', 'upgrade', 'head'],
  { cwd: root, stdio: 'inherit' },
);

if (migration.error || migration.status !== 0) {
  if (migration.error) console.error(`Could not start Python: ${migration.error.message}`);
  console.error('Install backend dependencies with: python -m pip install -r backend/requirements.txt');
  process.exit(migration.status || 1);
}

const service = spawn(
  python,
  [
    '-m',
    'uvicorn',
    'backend.app.main:app',
    '--host',
    authServiceUrl.hostname,
    '--port',
    authPort,
    ...(process.argv.includes('--reload') ? ['--reload'] : []),
  ],
  { cwd: root, stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => service.kill(signal));
}

service.on('error', (error) => {
  console.error(`Could not start the authentication service: ${error.message}`);
  process.exitCode = 1;
});

service.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
