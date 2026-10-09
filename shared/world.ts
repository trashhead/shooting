import { FLOOR_SIZE } from './constants';

// The box layout is generated from a fixed seed, so client and server derive
// the same positions without ever sending them over the wire.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BOX_COUNT = 60;

export const BOX_POSITIONS: { x: number; z: number }[] = (() => {
  const rand = mulberry32(1337);
  const half = FLOOR_SIZE / 2 - 5;
  const positions = [];
  for (let i = 0; i < BOX_COUNT; i++) {
    let x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;
    if (Math.abs(x) < 4 && Math.abs(z) < 4) x += 6; // keep the middle clear
    positions.push({ x, z });
  }
  return positions;
})();
