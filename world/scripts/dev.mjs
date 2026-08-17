import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children = [
  // Watch the API as well as the Vite client. This prevents the browser from
  // hot-reloading a new admin UI against an older route set.
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { cwd: root, stdio: 'inherit', env: process.env }),
  // Vite automatically advances to 5174, 5175, and so on when another local
  // project already owns 5173. The festival service accepts loopback origins
  // during development, so the live features continue to work on that port.
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], { cwd: root, stdio: 'inherit', env: process.env }),
];

let stopping = false;
const stop = (signal = 'SIGTERM') => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
};

for (const child of children) {
  child.once('exit', (code) => {
    if (!stopping && code) process.exitCode = code;
    stop();
  });
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
