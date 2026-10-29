// Wire protocol: JSON messages tagged by `t`. Add message types here and
// both sides get them type-checked.

import type { WeaponId } from './weapons';

export type Vec3 = [number, number, number];

// Where a player (re)appears: eye position and yaw.
export type Spawn = { x: number; y: number; z: number; yaw: number };

// A player's pose and score. x/y/z is the eye position (what the camera sees
// from), yaw/pitch the look direction in radians.
export type PlayerState = {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  alive: boolean;
  kills: number;
  deaths: number;
};

export type ClientMessage =
  | { t: 'ping'; time: number }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number }
  // A fired bolt: where it leaves the muzzle, its unit direction, and how far
  // the shooter saw it fly. The server flies its own copy at BOLT_SPEED and
  // applies damage only when that reaches someone.
  | { t: 'shoot'; origin: Vec3; dir: Vec3; dist: number; weapon: WeaponId }
  | { t: 'respawn' }
  // Ask the server to add a computer-controlled player (it caps how many).
  | { t: 'addBot' };

export type ServerMessage =
  | { t: 'welcome'; id: number; spawn: Spawn; health: number }
  | { t: 'pong'; time: number }
  // Everyone currently in the game (including the receiver - clients skip themselves).
  | { t: 'snapshot'; players: PlayerState[] }
  // Someone else's shot (the shooter never gets its own back).
  | { t: 'shot'; id: number; origin: Vec3; dir: Vec3; dist: number; weapon: WeaponId }
  // You were hit.
  | { t: 'damaged'; health: number; by: number }
  // You hit someone (`kill` if it finished them).
  | { t: 'hitmarker'; kill: boolean; head: boolean }
  // Broadcast to everyone when a player dies.
  | { t: 'kill'; killer: number; victim: number; head: boolean }
  // You are alive again.
  | { t: 'respawn'; spawn: Spawn; health: number };

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decode<T extends ClientMessage | ServerMessage>(data: string | Buffer | ArrayBuffer): T | null {
  try {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
