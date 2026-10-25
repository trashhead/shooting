import { MAP } from './world';

// Player-vs-world collision shared by the client's movement and the server's
// bots. A player is an upright circle (x, z, radius) whose feet are at `feetY`.

type Pos = { x: number; z: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// Push the circle out of every solid it walked into. Solids whose top is at or
// below the feet are not in the way - the player is standing on or above them.
export function resolveSolids(pos: Pos, radius: number, feetY: number) {
  for (const s of MAP.solids) {
    if (feetY >= s.y1 - 1e-3) continue;
    const dx = pos.x - s.x;
    const dz = pos.z - s.z;

    // Centre already inside the footprint (big single-frame step): push out
    // along whichever axis is shorter, there's no closest-point direction.
    if (Math.abs(dx) < s.hx && Math.abs(dz) < s.hz) {
      const pushX = s.hx + radius - Math.abs(dx);
      const pushZ = s.hz + radius - Math.abs(dz);
      if (pushX < pushZ) pos.x = s.x + Math.sign(dx || 1) * (s.hx + radius);
      else pos.z = s.z + Math.sign(dz || 1) * (s.hz + radius);
      continue;
    }

    const diffX = dx - clamp(dx, -s.hx, s.hx);
    const diffZ = dz - clamp(dz, -s.hz, s.hz);
    const distSq = diffX * diffX + diffZ * diffZ;
    if (distSq < radius * radius && distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      pos.x += diffX * push;
      pos.z += diffZ * push;
    }
  }
}

// Keep the player on the floor.
export function clampToFloor(pos: Pos, radius: number) {
  const limit = MAP.size / 2 - radius;
  pos.x = clamp(pos.x, -limit, limit);
  pos.z = clamp(pos.z, -limit, limit);
}

// Height of the highest surface under the circle that a player with feet at
// `feetY` is standing on or falling onto (0 = the floor). Surfaces above the
// feet are walls, not ground.
export function groundHeight(pos: Pos, radius: number, feetY: number): number {
  let h = 0;
  for (const s of MAP.solids) {
    if (s.y1 <= h || s.y1 > feetY + 1e-3) continue;
    const diffX = pos.x - s.x - clamp(pos.x - s.x, -s.hx, s.hx);
    const diffZ = pos.z - s.z - clamp(pos.z - s.z, -s.hz, s.hz);
    if (diffX * diffX + diffZ * diffZ <= radius * radius) h = s.y1;
  }
  return h;
}

// Is (x, z) within `radius` of any solid? Used to keep spawns and goals clear.
export function nearSolid(x: number, z: number, radius: number): boolean {
  return MAP.solids.some((s) => Math.abs(x - s.x) < s.hx + radius && Math.abs(z - s.z) < s.hz + radius);
}
