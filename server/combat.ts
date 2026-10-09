import { BOX_HALF_EXTENT } from '../shared/constants';
import { BOX_POSITIONS } from '../shared/world';

// Ray tests for server-side hit detection. A ray is origin `o` + t * unit
// direction `d`; each function returns the distance t of the first hit, or
// null for a miss.
type V = readonly [number, number, number];

// Upright cylinder: circle (cx, cz, r) in the ground plane between heights y0..y1.
export function rayCylinder(o: V, d: V, cx: number, cz: number, r: number, y0: number, y1: number): number | null {
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-9) return null; // shooting straight up/down
  const ox = o[0] - cx;
  const oz = o[2] - cz;
  const b = 2 * (ox * d[0] + oz * d[2]);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const root = Math.sqrt(disc);
  let t = (-b - root) / (2 * a);
  if (t < 0) t = (-b + root) / (2 * a); // origin inside the cylinder
  if (t < 0) return null;

  const y = o[1] + d[1] * t;
  return y >= y0 && y <= y1 ? t : null;
}

// Axis-aligned box (slab method).
export function rayBox(o: V, d: V, min: V, max: V): number | null {
  let tMin = 0;
  let tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    const t1 = (min[i] - o[i]) / d[i];
    const t2 = (max[i] - o[i]) / d[i];
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMax < tMin) return null;
  }
  return tMin;
}

// Distance to the nearest thing that blocks shots (the boxes and the floor),
// or `maxDist` if the ray reaches that far unobstructed.
export function distanceToWorld(o: V, d: V, maxDist: number): number {
  let nearest = maxDist;
  if (d[1] < 0) nearest = Math.min(nearest, -o[1] / d[1]); // floor at y = 0
  for (const b of BOX_POSITIONS) {
    const t = rayBox(
      o,
      d,
      [b.x - BOX_HALF_EXTENT, 0, b.z - BOX_HALF_EXTENT],
      [b.x + BOX_HALF_EXTENT, BOX_HALF_EXTENT * 2, b.z + BOX_HALF_EXTENT]
    );
    if (t !== null && t < nearest) nearest = t;
  }
  return nearest;
}
