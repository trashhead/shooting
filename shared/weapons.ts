// The weapons a player can pick before spawning. Client and server both read
// this, so damage and bolt speed agree on both sides.
export type WeaponId = 'plasma' | 'sniper';

export type WeaponSpec = {
  name: string;
  damage: number;
  headDamage: number; // damage when the head is hit
  fireInterval: number; // s between shots
  auto: boolean; // holding the button keeps firing
  boltSpeed: number; // units/sec; Infinity = hitscan (hits the instant it is fired)
  zoomFov: number | null; // vertical FOV while aiming (right mouse); null = no zoom
};

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  plasma: { name: 'Rail Gun', damage: 10, headDamage: 10, fireInterval: 0.15, auto: true, boltSpeed: 130, zoomFov: null },
  sniper: { name: 'Sniper', damage: 60, headDamage: 100, fireInterval: 0.6, auto: false, boltSpeed: Infinity, zoomFov: 18 },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && v in WEAPONS;
