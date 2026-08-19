import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children = [
  // Watch the API as well as the Vite client. This prevents the browser from
  // hot-reloading a new admin UI against an older route set.
  // The client looks for the service on 8787 in development. The service reads
  // PORT as well as FESTIVAL_PORT, so an ambient PORT — set by a hosting shell,
  // an editor's run configuration, or anything else that owns a port — silently
  // moves the service somewhere the client never looks, and the world comes up
  // in offline mode with nothing to say why. Pin it unless it is set on purpose.
  spawn(process.execPath, ['--watch', 'server/index.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, FESTIVAL_PORT: process.env.FESTIVAL_PORT ?? '8787' },
  }),
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
