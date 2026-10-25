import { BOX_HALF_EXTENT } from './constants';
import { ACTIVE_MAP, type MapName } from './config';

// Maps are lists of solid axis-aligned boxes. They are built from fixed data
// (or a fixed seed), so client and server derive the same world without ever
// sending it over the wire.

// A box: centre (x, z), half extents (hx, hz) and the heights it spans.
export type Solid = { x: number; z: number; hx: number; hz: number; y0: number; y1: number };

export type SpawnZone = { x: number; z: number; hx: number; hz: number };

export type MapDef = {
  size: number; // the floor is size x size, centred on the origin
  solids: Solid[];
  // When set, players spawn in these zones (alternating between them) instead
  // of anywhere on the floor.
  spawnZones?: SpawnZone[];
  // Look of the floor and the solids.
  floor: 'grass' | 'concrete';
  solidColors: number[];
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- field: an open field with 60 randomly scattered 2x2x2 boxes ----
function buildField(): MapDef {
  const size = 200;
  const rand = mulberry32(1337);
  const half = size / 2 - 5;
  const solids: Solid[] = [];
  for (let i = 0; i < 60; i++) {
    let x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;
    if (Math.abs(x) < 4 && Math.abs(z) < 4) x += 6; // keep the middle clear
    solids.push({ x, z, hx: BOX_HALF_EXTENT, hz: BOX_HALF_EXTENT, y0: 0, y1: BOX_HALF_EXTENT * 2 });
  }
  return { size, solids, floor: 'grass', solidColors: [0xcc4444, 0x4444cc, 0xcccc44, 0x44cccc, 0xcc44cc] };
}

// ---- arena: a small 2v2 map ----
// Long axis is Z. Teams spawn at opposite ends (+Z / -Z), behind low walls.
// Jump height is about 1.67, so steps are 1.4 high: a 1.4 block can be jumped
// onto from the ground and a 2.8 block from a 1.4 block.
//
//   spawn  ░░░░░░  z = -34
//          low walls with a gap, pillars
//   lane   crates, low side walls
//   flank high ground (x = +-26), reached by steps
//   centre raised plateau with cover, steps on both z sides
//   ...mirrored for the other team
function buildArena(): MapDef {
  const size = 80;
  const STEP = 1.4;
  const solids: Solid[] = [];
  const add = (x: number, z: number, hx: number, hz: number, h: number) => {
    solids.push({ x, z, hx, hz, y0: 0, y1: h });
  };
  // Mirror across X and Z (skipping duplicates for pieces on an axis).
  const mirror = (x: number, z: number, hx: number, hz: number, h: number) => {
    for (const sx of x === 0 ? [1] : [1, -1]) for (const sz of z === 0 ? [1] : [1, -1]) add(x * sx, z * sz, hx, hz, h);
  };

  // Perimeter walls, just outside the playable floor.
  const edge = size / 2 + 0.5;
  add(0, edge, edge + 0.5, 0.5, 8);
  add(0, -edge, edge + 0.5, 0.5, 8);
  add(edge, 0, 0.5, edge - 0.5, 8);
  add(-edge, 0, 0.5, edge - 0.5, 8);

  // Spawn courtyards: a low wall with a gap in the middle, and pillars.
  mirror(6, 27, 4, 0.5, STEP);
  mirror(13, 30, 1, 1, 4);
  mirror(20, 24, 1.5, 1.5, 2.8);

  // Centre plateau (2.8 high) with steps on both z sides and cover on top.
  add(0, 0, 8, 6, STEP * 2);
  mirror(0, 7.5, 5, 1.5, STEP);
  mirror(4, 0, 0.5, 2.5, STEP * 4);

  // Flank high ground (2.8 high), one per side, with steps on the inner and
  // outer faces. A low wall on top gives cover.
  mirror(26, 0, 5, 10, STEP * 2);
  mirror(19.5, 0, 1.5, 4, STEP);
  mirror(26, 11.5, 3, 1.5, STEP);
  mirror(28, 3, 0.5, 3, STEP * 3);

  // Lane cover: jumpable crates, taller blocks and low side walls.
  mirror(15, 12, 1, 1, STEP);
  mirror(15, 15, 1, 1, STEP * 2);
  mirror(11, 18, 1.5, 1.5, STEP * 2);
  mirror(35, 12, 1, 4, STEP);
  mirror(36, 22, 1.5, 1.5, STEP * 2);

  const spawnZones: SpawnZone[] = [
    { x: 0, z: 33, hx: 9, hz: 3 },
    { x: 0, z: -33, hx: 9, hz: 3 },
  ];
  return { size, solids, spawnZones, floor: 'concrete', solidColors: [0x5c6670, 0x4f7a8f, 0x7a6a58, 0x6d7f5a] };
}

const builders: Record<MapName, () => MapDef> = { field: buildField, arena: buildArena };

export const MAP: MapDef = builders[ACTIVE_MAP]();
