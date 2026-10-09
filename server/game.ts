import { BOLT_SPEED, EYE_HEIGHT, HEAD_ABOVE_EYE, HIT_RADIUS, MAX_HEALTH, RESPAWN_DELAY_MS, SHOT_DAMAGE, SHOT_RANGE } from '../shared/constants';
import type { PlayerState, Spawn, Vec3 } from '../shared/protocol';
import { distanceToWorld, rayCylinder } from './combat';
import { pickSpawn } from './spawn';

// The authoritative game state. index.ts owns the sockets and calls in here;
// results come back as plain data for it to deliver.
type Player = PlayerState & { health: number; diedAt: number };
const players = new Map<number, Player>();

const alivePositions = (exceptId?: number) => [...players.values()].filter((p) => p.alive && p.id !== exceptId);

export function join(id: number): { spawn: Spawn; health: number } {
  const spawn = pickSpawn(alivePositions());
  // Registered at its spawn right away, so the next joiner keeps its
  // distance even before this client reports a pose.
  players.set(id, { id, ...spawn, pitch: 0, alive: true, kills: 0, deaths: 0, health: MAX_HEALTH, diedAt: 0 });
  return { spawn, health: MAX_HEALTH };
}

export function leave(id: number) {
  players.delete(id);
}

export function isAlive(id: number) {
  return players.get(id)?.alive === true;
}

export function setPose(id: number, pose: { x: number; y: number; z: number; yaw: number; pitch: number }) {
  const p = players.get(id);
  if (p?.alive) Object.assign(p, pose); // the dead stay where they fell
}

// ---- bolts: simulated in flight, damage lands on arrival ----
type Bolt = {
  owner: number;
  pos: Vec3;
  dir: Vec3;
  travelled: number;
  maxDist: number; // how far it can fly before a box/the floor/max range stops it
};
const bolts: Bolt[] = [];

const MUZZLE_SLACK = 4; // how far the claimed muzzle may be from the shooter's known position

export function fire(id: number, origin: Vec3, dir: Vec3) {
  const shooter = players.get(id);
  if (!shooter?.alive) return;

  const len = Math.hypot(...dir);
  if (len < 0.5) return;
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];

  // Trust the claimed muzzle only if it is near where we think the shooter
  // is (the muzzle sits ~1 unit off the eye), else start from the eye.
  const eye: Vec3 = [shooter.x, shooter.y, shooter.z];
  const near = Math.hypot(origin[0] - eye[0], origin[1] - eye[1], origin[2] - eye[2]) < MUZZLE_SLACK;
  const o = near ? origin : eye;

  bolts.push({ owner: id, pos: [...o], dir: d, travelled: 0, maxDist: distanceToWorld(o, d, SHOT_RANGE) });
}

export type HitResult = { killerId: number; victimId: number; health: number; killed: boolean };

// Advance every bolt by `dt` seconds. Each step is swept along the bolt's
// path, so a fast bolt can't skip over a player between two ticks.
export function step(dt: number): HitResult[] {
  const results: HitResult[] = [];

  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    const stepLen = Math.min(BOLT_SPEED * dt, b.maxDist - b.travelled);

    let hitT = Infinity;
    let victim: Player | null = null;
    for (const p of players.values()) {
      if (!p.alive || p.id === b.owner) continue;
      const t = rayCylinder(b.pos, b.dir, p.x, p.z, HIT_RADIUS, p.y - EYE_HEIGHT, p.y + HEAD_ABOVE_EYE);
      if (t !== null && t <= stepLen && t < hitT) {
        hitT = t;
        victim = p;
      }
    }

    if (victim) {
      results.push(applyDamage(b.owner, victim));
      bolts.splice(i, 1);
      continue;
    }

    b.pos = [b.pos[0] + b.dir[0] * stepLen, b.pos[1] + b.dir[1] * stepLen, b.pos[2] + b.dir[2] * stepLen];
    b.travelled += stepLen;
    if (b.travelled >= b.maxDist - 1e-6) bolts.splice(i, 1); // hit a wall / ran out of range
  }
  return results;
}

function applyDamage(killerId: number, victim: Player): HitResult {
  victim.health = Math.max(0, victim.health - SHOT_DAMAGE);
  const killed = victim.health === 0;
  if (killed) {
    victim.alive = false;
    victim.deaths++;
    victim.diedAt = Date.now();
    const killer = players.get(killerId); // may have left while the bolt was in the air
    if (killer) killer.kills++;
  }
  return { killerId, victimId: victim.id, health: victim.health, killed };
}

export function respawn(id: number): { spawn: Spawn; health: number } | null {
  const p = players.get(id);
  if (!p || p.alive || Date.now() - p.diedAt < RESPAWN_DELAY_MS) return null;
  const spawn = pickSpawn(alivePositions(id));
  Object.assign(p, spawn, { pitch: 0, alive: true, health: MAX_HEALTH });
  return { spawn, health: MAX_HEALTH };
}

export function snapshot(): PlayerState[] {
  return [...players.values()].map(({ id, x, y, z, yaw, pitch, alive, kills, deaths }) => ({
    id, x, y, z, yaw, pitch, alive, kills, deaths,
  }));
}

export function playerCount() {
  return players.size;
}
