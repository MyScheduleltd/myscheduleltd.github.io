import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Owner approved both channels on 2026-09-14; require an explicit target.
const channel = process.argv[3];
if (process.argv.length !== 4 || process.argv[2] !== '--channel' || !['beta', 'ps2'].includes(channel)) {
  console.error('Channel must be explicit: --channel beta or --channel ps2. No files were copied.');
  process.exit(1);
}
const source = fileURLToPath(new URL('../dist/', import.meta.url));
const target = fileURLToPath(new URL(channel === 'ps2' ? '../../docs/beta/ps2/' : '../../docs/beta/', import.meta.url));
await mkdir(target, { recursive: true });
// Retain older hashed assets so cached entry pages and dynamic imports keep working.
await cp(source, target, { recursive: true, force: true });
console.log(`Prepared ${channel} channel: ${target}`);
