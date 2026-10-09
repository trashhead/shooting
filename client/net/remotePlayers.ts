import * as THREE from 'three';
import { camera, scene } from '../core/scene';
import { onMessage, playerId } from './socket';
import { spawnProjectile } from '../fx/projectile';
import { playShootSound } from '../fx/audio';
import { EYE_HEIGHT, PLAYER_RADIUS } from '../../shared/constants';
import type { PlayerState } from '../../shared/protocol';

// Other players, drawn as a capsule body with a head that pitches and a
// little "gun" box. Snapshots arrive at ~20 Hz, so each avatar eases toward
// its latest target pose every frame instead of teleporting.
type Remote = {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Group;
  arm: THREE.Group;
  target: PlayerState;
};

const remotes = new Map<number, Remote>();
// Latest score for everyone (ourselves included), straight from the snapshots.
const stats = new Map<number, { kills: number; deaths: number }>();

export function playerStats(id: number) {
  return stats.get(id) ?? { kills: 0, deaths: 0 };
}

// Body meshes of living remote players, so our visible bolt can stop on them.
export function remoteBodies(): THREE.Object3D[] {
  return [...remotes.values()].filter((r) => r.group.visible).map((r) => r.body);
}
const bodyGeometry = new THREE.CapsuleGeometry(PLAYER_RADIUS, EYE_HEIGHT - PLAYER_RADIUS * 2 - 0.2, 4, 12);
const headGeometry = new THREE.SphereGeometry(0.25, 16, 12);
const gunGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.6);
const armGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.5);
const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });

function colorFor(id: number) {
  return new THREE.Color().setHSL((id * 0.137) % 1, 0.7, 0.5);
}

// CSS colour for a player id - the same one their avatar is drawn with.
export function playerColor(id: number): string {
  return '#' + colorFor(id).getHexString();
}

// Ids of everyone in the game, ourselves included, in join order.
export function connectedPlayers(): number[] {
  const ids = [...remotes.keys()];
  if (playerId !== null) ids.push(playerId);
  return ids.sort((a, b) => a - b);
}

function createRemote(state: PlayerState): Remote {
  const material = new THREE.MeshStandardMaterial({ color: colorFor(state.id) });

  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry, material);
  // Group origin is the eye; the body hangs below it down to the feet.
  body.position.y = -EYE_HEIGHT / 2 - 0.1;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Group();
  head.add(new THREE.Mesh(headGeometry, material));
  group.add(head);

  // Right arm + gun hang off a shoulder pivot (below the eye) and pitch
  // together, so the gun stays attached to a hand instead of floating.
  const arm = new THREE.Group();
  arm.position.set(0.3, -0.4, 0);
  const upper = new THREE.Mesh(armGeometry, material);
  upper.position.z = -0.2;
  const gun = new THREE.Mesh(gunGeometry, gunMaterial);
  gun.position.set(0, 0, -0.5);
  arm.add(upper, gun);
  group.add(arm);

  group.position.set(state.x, state.y, state.z);
  group.rotation.y = state.yaw;
  scene.add(group);
  return { group, body, head, arm, target: state };
}

const shotOrigin = new THREE.Vector3();
const shotDirection = new THREE.Vector3();
const HEARD_RANGE = 80; // beyond this a shot is silent

onMessage((msg) => {
  if (msg.t === 'shot') {
    shotOrigin.set(...msg.origin);
    shotDirection.set(...msg.dir).normalize();
    spawnProjectile(shotOrigin, shotDirection, msg.dist, null);
    const volume = 1 - shotOrigin.distanceTo(camera.position) / HEARD_RANGE;
    if (volume > 0.02) playShootSound(volume);
    return;
  }
  if (msg.t !== 'snapshot') return;

  const seen = new Set<number>();
  for (const state of msg.players) {
    stats.set(state.id, { kills: state.kills, deaths: state.deaths });
    if (state.id === playerId) continue;
    seen.add(state.id);
    let remote = remotes.get(state.id);
    if (remote) remote.target = state;
    else remotes.set(state.id, (remote = createRemote(state)));
    remote.group.visible = state.alive; // the dead disappear until they respawn
  }

  for (const [id, remote] of remotes) {
    if (seen.has(id)) continue;
    scene.remove(remote.group);
    remotes.delete(id);
    stats.delete(id);
  }
});

export function updateRemotePlayers(delta: number) {
  const k = 1 - Math.exp(-delta * 18); // frame-rate independent smoothing
  for (const { group, head, arm, target } of remotes.values()) {
    group.position.x += (target.x - group.position.x) * k;
    group.position.y += (target.y - group.position.y) * k;
    group.position.z += (target.z - group.position.z) * k;
    // Yaw arrives unwrapped (continuous), so a plain lerp turns the right way
    // even through full spins.
    group.rotation.y += (target.yaw - group.rotation.y) * k;
    head.rotation.x += (target.pitch - head.rotation.x) * k;
    arm.rotation.x = head.rotation.x;
  }
}
