import type { Spawn } from '../shared/protocol';
import { BOX_HALF_EXTENT, EYE_HEIGHT, FLOOR_SIZE, PLAYER_RADIUS } from '../shared/constants';
import { BOX_POSITIONS } from '../shared/world';

export const SPAWN_MIN_DIST = 50;
export const SPAWN_MAX_DIST = 100;

const EDGE_MARGIN = 6;
const BOX_CLEARANCE = BOX_HALF_EXTENT + PLAYER_RADIUS + 1;
const CANDIDATES = 300;

function blockedByBox(x: number, z: number) {
  return BOX_POSITIONS.some((b) => Math.abs(x - b.x) < BOX_CLEARANCE && Math.abs(z - b.z) < BOX_CLEARANCE);
}

// Pick a spot at least SPAWN_MIN_DIST from every other player and, if the map
// allows, no more than SPAWN_MAX_DIST from the nearest one. When that is
// impossible (crowded map) fall back to the spot farthest from everyone.
export function pickSpawn(others: { x: number; z: number }[]): Spawn {
  const half = FLOOR_SIZE / 2 - EDGE_MARGIN;
  let best: { x: number; z: number; nearest: number } | null = null;
  const inBand: { x: number; z: number }[] = [];

  for (let i = 0; i < CANDIDATES; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (blockedByBox(x, z)) continue;

    const nearest = others.reduce((min, o) => Math.min(min, Math.hypot(x - o.x, z - o.z)), Infinity);
    if (nearest >= SPAWN_MIN_DIST && nearest <= SPAWN_MAX_DIST) inBand.push({ x, z });
    if (!best || nearest > best.nearest) best = { x, z, nearest };
  }

  const pick = inBand.length > 0 ? inBand[Math.floor(Math.random() * inBand.length)] : best ?? { x: 0, z: 0 };
  // Face the middle of the map. Yaw 0 looks down -Z, so forward = (-sin, -cos).
  return { x: pick.x, y: EYE_HEIGHT, z: pick.z, yaw: Math.atan2(pick.x, pick.z) };
}
