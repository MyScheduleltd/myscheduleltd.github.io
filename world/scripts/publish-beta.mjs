import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// One public channel. The PS2 copy at /beta/ps2/ was retired on 2026-10-17
// (owner): it had become a byte-for-byte duplicate of /beta/. The target is
// still named every time, so a bare `build:beta` cannot copy anything.
const channel = process.argv[3];
if (process.argv.length !== 4 || process.argv[2] !== '--channel' || channel !== 'beta') {
  console.error('Channel must be explicit: --channel beta. No files were copied.');
  process.exit(1);
}
const source = fileURLToPath(new URL('../dist/', import.meta.url));
const target = fileURLToPath(new URL('../../docs/beta/', import.meta.url));
await mkdir(target, { recursive: true });
// Retain older hashed assets so cached entry pages and dynamic imports keep working.
await cp(source, target, { recursive: true, force: true });
console.log(`Prepared ${channel} channel: ${target}`);
