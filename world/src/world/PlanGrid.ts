/**
 * Plan-view buckets for boxes asked about point by point, many times a frame.
 *
 * The follow camera walks a line from the attendee to the lens in quarter-unit
 * steps and asks, at every step, which colliders and paving it is inside; each
 * body asks the same of the paving under its feet. Scanning every box for every
 * question was the world's largest share of a phone's frame after three.js's
 * own (2026-10-23). A box is filed under each cell its plan footprint touches,
 * so a question looks only at the few boxes near the point. The answers are
 * exactly the full scan's: the caller still applies its own test to each box.
 */
export class PlanGrid<T> {
  private readonly cells = new Map<number, T[]>();
  /** Boxes too wide to file cell by cell; looked at by every question. */
  private readonly wide: T[] = [];

  constructor(private readonly cell = 4, private readonly maxCells = 4096) {}

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  add(item: T, minX: number, maxX: number, minZ: number, maxZ: number): void {
    const x0 = Math.floor(minX / this.cell), x1 = Math.floor(maxX / this.cell);
    const z0 = Math.floor(minZ / this.cell), z1 = Math.floor(maxZ / this.cell);
    if (![x0, x1, z0, z1].every(Number.isFinite) || (x1 - x0 + 1) * (z1 - z0 + 1) > this.maxCells) {
      this.wide.push(item);
      return;
    }
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const key = this.key(cx, cz);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(item);
      else this.cells.set(key, [item]);
    }
  }

  clear(): void {
    this.cells.clear();
    this.wide.length = 0;
  }

  /** Whether any box filed near the point passes the test. */
  some(x: number, z: number, test: (item: T) => boolean): boolean {
    for (const item of this.wide) if (test(item)) return true;
    const bucket = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (bucket) for (const item of bucket) if (test(item)) return true;
    return false;
  }

  /** Every box filed near the point. */
  forEach(x: number, z: number, visit: (item: T) => void): void {
    for (const item of this.wide) visit(item);
    const bucket = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (bucket) for (const item of bucket) visit(item);
  }
}
