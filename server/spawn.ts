import type { Spawn } from '../shared/protocol';
import { EYE_HEIGHT, PLAYER_RADIUS } from '../shared/constants';
import { nearSolid } from '../shared/collision';
import { MAP } from '../shared/world';

export const SPAWN_MIN_DIST = 50;
export const SPAWN_MAX_DIST = 100;

const EDGE_MARGIN = 6;
const SOLID_CLEARANCE = PLAYER_RADIUS + 1;
const CANDIDATES = 300;
const ZONE_MIN_DIST = 6; // on zone maps, stay this far from anyone already there

type Point = { x: number; z: number };

// Face the middle of the map. Yaw 0 looks down -Z, so forward = (-sin, -cos).
const facingCentre = (p: Point): Spawn => ({ x: p.x, y: EYE_HEIGHT, z: p.z, yaw: Math.atan2(p.x, p.z) });

// Maps with spawn zones put players on opposite sides: each spawn goes to the
// zone with the fewest players in it, so a 2v2 splits into two teams of two.
function pickZoneSpawn(others: Point[]): Spawn {
  const zones = MAP.spawnZones!;
  const inZone = (z: (typeof zones)[number], p: Point) => Math.abs(p.x - z.x) <= z.hx + 6 && Math.abs(p.z - z.z) <= z.hz + 6;
  const counts = zones.map((z) => others.filter((o) => inZone(z, o)).length);
  const fewest = Math.min(...counts);
  const choices = zones.filter((_, i) => counts[i] === fewest);
  const zone = choices[Math.floor(Math.random() * choices.length)];

  let best: (Point & { nearest: number }) | null = null;
  for (let i = 0; i < CANDIDATES; i++) {
    const x = zone.x + (Math.random() * 2 - 1) * zone.hx;
    const z = zone.z + (Math.random() * 2 - 1) * zone.hz;
    if (nearSolid(x, z, SOLID_CLEARANCE)) continue;
    const nearest = others.reduce((min, o) => Math.min(min, Math.hypot(x - o.x, z - o.z)), Infinity);
    if (!best || nearest > best.nearest) best = { x, z, nearest };
    if (nearest >= ZONE_MIN_DIST) break;
  }
  return facingCentre(best ?? { x: zone.x, z: zone.z });
}

// Pick a spot at least SPAWN_MIN_DIST from every other player and, if the map
// allows, no more than SPAWN_MAX_DIST from the nearest one. When that is
// impossible (crowded map) fall back to the spot farthest from everyone.
export function pickSpawn(others: Point[]): Spawn {
  if (MAP.spawnZones) return pickZoneSpawn(others);

  const half = MAP.size / 2 - EDGE_MARGIN;
  let best: { x: number; z: number; nearest: number } | null = null;
  const inBand: { x: number; z: number }[] = [];

  for (let i = 0; i < CANDIDATES; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (nearSolid(x, z, SOLID_CLEARANCE)) continue;

    const nearest = others.reduce((min, o) => Math.min(min, Math.hypot(x - o.x, z - o.z)), Infinity);
    if (nearest >= SPAWN_MIN_DIST && nearest <= SPAWN_MAX_DIST) inBand.push({ x, z });
    if (!best || nearest > best.nearest) best = { x, z, nearest };
  }

  return facingCentre(inBand.length > 0 ? inBand[Math.floor(Math.random() * inBand.length)] : best ?? { x: 0, z: 0 });
}
