import type { Vec2 } from './types';

/** Default waypoints in canvas coordinates (960×540 logical). */
const DEFAULT_PATH: Vec2[] = [
  { x: -40, y: 270 },
  { x: 160, y: 270 },
  { x: 160, y: 120 },
  { x: 420, y: 120 },
  { x: 420, y: 400 },
  { x: 680, y: 400 },
  { x: 680, y: 200 },
  { x: 900, y: 200 },
  { x: 1000, y: 200 },
];

let activePath = DEFAULT_PATH;

export function setActivePath(path: Vec2[]): void {
  activePath = path;
}

export function getActivePath(): Vec2[] {
  return activePath;
}

export const GRID = {
  originX: 40,
  originY: 40,
  cols: 14,
  rows: 8,
  cell: 60,
};

export function gridToWorld(gx: number, gy: number): Vec2 {
  return {
    x: GRID.originX + gx * GRID.cell + GRID.cell / 2,
    y: GRID.originY + gy * GRID.cell + GRID.cell / 2,
  };
}

export function worldToGrid(x: number, y: number): { gx: number; gy: number } | null {
  const gx = Math.floor((x - GRID.originX) / GRID.cell);
  const gy = Math.floor((y - GRID.originY) / GRID.cell);
  if (gx < 0 || gy < 0 || gx >= GRID.cols || gy >= GRID.rows) return null;
  return { gx, gy };
}

export function isPathCell(gx: number, gy: number): boolean {
  const cx = GRID.originX + gx * GRID.cell + GRID.cell / 2;
  const cy = GRID.originY + gy * GRID.cell + GRID.cell / 2;
  const half = GRID.cell * 0.42;
  for (let i = 0; i < activePath.length - 1; i++) {
    const a = activePath[i];
    const b = activePath[i + 1];
    const minX = Math.min(a.x, b.x) - half;
    const maxX = Math.max(a.x, b.x) + half;
    const minY = Math.min(a.y, b.y) - half;
    const maxY = Math.max(a.y, b.y) + half;
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) return true;
  }
  return false;
}

export function pathLength(): number {
  let len = 0;
  for (let i = 0; i < activePath.length - 1; i++) {
    const a = activePath[i];
    const b = activePath[i + 1];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

export function positionOnPath(distance: number): { pos: Vec2; index: number; done: boolean } {
  let remaining = distance;
  for (let i = 0; i < activePath.length - 1; i++) {
    const a = activePath[i];
    const b = activePath[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= seg) {
      const t = remaining / seg;
      return {
        pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        index: i,
        done: false,
      };
    }
    remaining -= seg;
  }
  const last = activePath[activePath.length - 1];
  return { pos: { ...last }, index: activePath.length - 2, done: true };
}
