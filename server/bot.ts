import { BOX_HALF_EXTENT, EYE_HEIGHT, FLOOR_SIZE, PLAYER_RADIUS, SHOT_RANGE } from '../shared/constants';
import type { Vec3 } from '../shared/protocol';
import { BOX_POSITIONS } from '../shared/world';
import { distanceToWorld } from './combat';
import * as game from './game';

// Simple bots: ordinary players in game.ts, driven from here instead of by a
// socket. They wander the map, and shoot at the nearest player they can see
// (a clear line to them, in range), with human-like limits: a reaction delay,
// a limited turn speed and some aim error. They know nothing a human would
// not - they do not see through boxes.
export const MAX_BOTS = 50;

const VIEW_RANGE = 90;
const WANDER_SPEED = 5;
const COMBAT_SPEED = 7;
const TURN_SPEED = 5; // rad/s while aiming
const WANDER_TURN_SPEED = 3;
const REACTION_MIN = 0.35; // s between first seeing someone and firing
const REACTION_RANGE = 0.25;
const FIRE_MIN = 0.35; // s between shots
const FIRE_RANGE = 0.25;
const AIM_TOLERANCE = 0.06; // rad: fire once the aim is this close
const AIM_ERROR_BASE = 0.02; // rad of random aim error, plus a bit more per unit of distance
const AIM_ERROR_PER_UNIT = 0.0004;
const RESPAWN_AFTER = 2; // s dead
const PREFERRED_MIN = 12; // closer than this, back off
const PREFERRED_MAX = 30; // further than this, close in

type Bot = {
  id: number;
  goal: { x: number; z: number } | null;
  stuckTimer: number;
  lastX: number;
  lastZ: number;
  targetId: number | null;
  reaction: number; // s left before it may fire at the current target
  fireCooldown: number;
  strafe: 1 | -1;
  strafeTimer: number;
  deadFor: number;
};

const bots = new Map<number, Bot>();

export const canAddBot = () => bots.size < MAX_BOTS;

export function addBot(id: number) {
  const { spawn } = game.join(id);
  bots.set(id, {
    id,
    goal: null,
    stuckTimer: 0,
    lastX: spawn.x,
    lastZ: spawn.z,
    targetId: null,
    reaction: 0,
    fireCooldown: 0,
    strafe: 1,
    strafeTimer: 0,
    deadFor: 0,
  });
}

export function removeAllBots() {
  for (const id of bots.keys()) game.leave(id);
  bots.clear();
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
// Step an angle toward a target angle, by at most maxStep, the short way round.
// The result is not wrapped: clients expect yaw to be continuous.
const turnToward = (current: number, desired: number, maxStep: number) =>
  current + clamp(wrap(desired - current), -maxStep, maxStep);

function nearBox(x: number, z: number, radius: number) {
  return BOX_POSITIONS.some((b) => Math.abs(x - b.x) < BOX_HALF_EXTENT + radius && Math.abs(z - b.z) < BOX_HALF_EXTENT + radius);
}

function randomGoal() {
  const half = FLOOR_SIZE / 2 - 8;
  for (let i = 0; i < 20; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (!nearBox(x, z, 2)) return { x, z };
  }
  return { x: 0, z: 0 };
}

// Slide out of any box the bot walked into and keep it on the floor (the same
// rules as the client's movement, see client/world/collision.ts).
function collide(pos: { x: number; z: number }) {
  for (const b of BOX_POSITIONS) {
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    if (Math.abs(dx) < BOX_HALF_EXTENT && Math.abs(dz) < BOX_HALF_EXTENT) {
      const pushX = BOX_HALF_EXTENT + PLAYER_RADIUS - Math.abs(dx);
      const pushZ = BOX_HALF_EXTENT + PLAYER_RADIUS - Math.abs(dz);
      if (pushX < pushZ) pos.x = b.x + Math.sign(dx || 1) * (BOX_HALF_EXTENT + PLAYER_RADIUS);
      else pos.z = b.z + Math.sign(dz || 1) * (BOX_HALF_EXTENT + PLAYER_RADIUS);
      continue;
    }
    const diffX = dx - clamp(dx, -BOX_HALF_EXTENT, BOX_HALF_EXTENT);
    const diffZ = dz - clamp(dz, -BOX_HALF_EXTENT, BOX_HALF_EXTENT);
    const distSq = diffX * diffX + diffZ * diffZ;
    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS && distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const push = (PLAYER_RADIUS - dist) / dist;
      pos.x += diffX * push;
      pos.z += diffZ * push;
    }
  }
  const limit = FLOOR_SIZE / 2 - PLAYER_RADIUS;
  pos.x = clamp(pos.x, -limit, limit);
  pos.z = clamp(pos.z, -limit, limit);
}

// How a bot's shot gets out into the world: announced to everyone, then flown
// and judged by game.ts like any other bolt.
export type FireBolt = (id: number, origin: Vec3, dir: Vec3, dist: number) => void;

export function updateBots(dt: number, fireBolt: FireBolt) {
  if (bots.size === 0) return;
  const states = game.snapshot();

  for (const bot of bots.values()) {
    const me = states.find((p) => p.id === bot.id);
    if (!me) continue;

    if (!me.alive) {
      bot.deadFor += dt;
      if (bot.deadFor >= RESPAWN_AFTER && game.respawn(bot.id)) {
        bot.deadFor = 0;
        bot.goal = null;
        bot.targetId = null;
      }
      continue;
    }

    bot.fireCooldown -= dt;
    bot.strafeTimer -= dt;

    // ---- perception: the nearest player we have a clear line to ----
    const eye: Vec3 = [me.x, me.y, me.z];
    let target: { id: number; dx: number; dy: number; dz: number; dist: number } | null = null;
    for (const p of states) {
      if (p.id === me.id || !p.alive) continue;
      const dx = p.x - me.x;
      const dy = p.y - 0.4 - me.y; // aim at the chest, not the eye
      const dz = p.z - me.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > VIEW_RANGE || (target && dist >= target.dist)) continue;
      if (distanceToWorld(eye, [dx / dist, dy / dist, dz / dist], dist) < dist - 0.5) continue; // behind a box
      target = { id: p.id, dx, dy, dz, dist };
    }

    const pos = { x: me.x, z: me.z };
    let yaw = me.yaw;
    let pitch = me.pitch;
    let moveX = 0;
    let moveZ = 0;
    let speed = 0;

    if (target) {
      if (bot.targetId !== target.id) {
        bot.targetId = target.id;
        bot.reaction = REACTION_MIN + Math.random() * REACTION_RANGE;
      }
      bot.reaction -= dt;

      // Yaw 0 looks down -Z, so the look direction is (-sin yaw, -cos yaw).
      const desiredYaw = Math.atan2(-target.dx, -target.dz);
      const horizontal = Math.hypot(target.dx, target.dz) || 1;
      const desiredPitch = Math.atan2(target.dy, horizontal);
      const yawError = wrap(desiredYaw - yaw);
      const pitchError = desiredPitch - pitch;
      yaw = turnToward(yaw, desiredYaw, TURN_SPEED * dt);
      pitch = turnToward(pitch, desiredPitch, TURN_SPEED * dt);

      if (bot.reaction <= 0 && bot.fireCooldown <= 0 && Math.abs(yawError) < AIM_TOLERANCE && Math.abs(pitchError) < AIM_TOLERANCE) {
        const spread = AIM_ERROR_BASE + target.dist * AIM_ERROR_PER_UNIT;
        const aimYaw = yaw + (Math.random() * 2 - 1) * spread;
        const aimPitch = pitch + (Math.random() * 2 - 1) * spread;
        const dir: Vec3 = [-Math.sin(aimYaw) * Math.cos(aimPitch), Math.sin(aimPitch), -Math.cos(aimYaw) * Math.cos(aimPitch)];
        const origin: Vec3 = [me.x + dir[0] * 0.6, me.y - 0.1 + dir[1] * 0.6, me.z + dir[2] * 0.6];
        fireBolt(bot.id, origin, dir, distanceToWorld(origin, dir, SHOT_RANGE));
        bot.fireCooldown = FIRE_MIN + Math.random() * FIRE_RANGE;
      }

      // Circle-strafe, and keep a comfortable distance.
      if (bot.strafeTimer <= 0) {
        bot.strafe = Math.random() < 0.5 ? 1 : -1;
        bot.strafeTimer = 0.6 + Math.random() * 1.2;
      }
      const nx = target.dx / horizontal;
      const nz = target.dz / horizontal;
      const range = horizontal > PREFERRED_MAX ? 0.7 : horizontal < PREFERRED_MIN ? -0.7 : 0;
      moveX = -nz * bot.strafe + nx * range;
      moveZ = nx * bot.strafe + nz * range;
      speed = COMBAT_SPEED;
    } else {
      bot.targetId = null;

      // ---- wander between random points ----
      if (!bot.goal || Math.hypot(bot.goal.x - pos.x, bot.goal.z - pos.z) < 2) bot.goal = randomGoal();
      bot.stuckTimer += dt;
      if (bot.stuckTimer >= 1) {
        if (Math.hypot(pos.x - bot.lastX, pos.z - bot.lastZ) < 1.5) bot.goal = randomGoal(); // wedged against a box
        bot.lastX = pos.x;
        bot.lastZ = pos.z;
        bot.stuckTimer = 0;
      }
      const dx = bot.goal.x - pos.x;
      const dz = bot.goal.z - pos.z;
      const len = Math.hypot(dx, dz) || 1;
      moveX = dx / len;
      moveZ = dz / len;
      speed = WANDER_SPEED;
      yaw = turnToward(yaw, Math.atan2(-dx, -dz), WANDER_TURN_SPEED * dt);
      pitch = turnToward(pitch, 0, WANDER_TURN_SPEED * dt);
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 1e-6) {
      pos.x += (moveX / len) * speed * dt;
      pos.z += (moveZ / len) * speed * dt;
      collide(pos);
    }
    game.setPose(bot.id, { x: pos.x, y: EYE_HEIGHT, z: pos.z, yaw, pitch: clamp(pitch, -1.4, 1.4) });
  }
}
