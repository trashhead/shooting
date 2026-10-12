import * as THREE from 'three';
import { camera, renderer } from '../core/scene';
import { controls } from './movement';
import { boxes, floor } from '../world/world';
import { spawnProjectile } from '../fx/projectile';
import { playShootSound } from '../fx/audio';
import { send } from '../net/socket';
import { remoteBodies } from '../net/remotePlayers';
import { isAlive } from './status';
import { loadWeaponModel } from './weaponModel';

// Held weapon: a placeholder box until the sci-fi model (weaponModel.ts)
// finishes loading.
const WEAPON_REST_Z = -0.62;
const weaponGroup = new THREE.Group();
weaponGroup.position.set(0.4, -0.32, WEAPON_REST_Z);
weaponGroup.rotation.x = -0.05;
camera.add(weaponGroup);

const placeholder = new THREE.Mesh(
  new THREE.BoxGeometry(0.15, 0.15, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x222222 })
);
weaponGroup.add(placeholder);

// Where the bolt visually starts, in camera space - independent of the
// weapon mesh and of the recoil kick.
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0.4, -0.32, -1.05);

loadWeaponModel()
  .then((model) => {
    weaponGroup.remove(placeholder);
    weaponGroup.add(model.clone());
  })
  .catch((err) => console.error('Failed to load weapon model', err));

// Hit detection is an instant raycast at fire time; the visible bolt
// (fx/projectile.ts) just takes real travel time to reach that point.
const MAX_SHOT_RANGE = 250;
const raycaster = new THREE.Raycaster();
const shootDirection = new THREE.Vector3();
const muzzleOrigin = new THREE.Vector3();
const targetPoint = new THREE.Vector3();
const boltDirection = new THREE.Vector3();
const worldTargets: THREE.Object3D[] = [floor, ...boxes];
let recoil = 0;

function shoot() {
  camera.getWorldDirection(shootDirection);
  raycaster.set(camera.position, shootDirection);
  raycaster.far = MAX_SHOT_RANGE;
  const hit = raycaster.intersectObjects([...worldTargets, ...remoteBodies()], false)[0];

  if (hit) targetPoint.copy(hit.point);
  else targetPoint.copy(camera.position).addScaledVector(shootDirection, MAX_SHOT_RANGE);

  camera.localToWorld(muzzleOrigin.copy(MUZZLE_LOCAL_OFFSET));
  boltDirection.copy(targetPoint).sub(muzzleOrigin).normalize();
  spawnProjectile(muzzleOrigin, boltDirection, muzzleOrigin.distanceTo(targetPoint), null);

  send({
    t: 'shoot',
    origin: [muzzleOrigin.x, muzzleOrigin.y, muzzleOrigin.z],
    dir: [boltDirection.x, boltDirection.y, boltDirection.z],
    dist: muzzleOrigin.distanceTo(targetPoint),
  });

  recoil = 1;
  playShootSound();
}

// Holding the button auto-fires; updateWeapon paces the repeats.
const FIRE_INTERVAL = 0.15;
let isFiring = false;
let fireCooldown = 0;

document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && controls.isLocked && isAlive()) {
    isFiring = true;
    if (fireCooldown <= 0) {
      shoot();
      fireCooldown = FIRE_INTERVAL;
    }
  }
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) isFiring = false;
});
controls.addEventListener('unlock', () => {
  isFiring = false;
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

// For the HUD: recoil kick (1 right after a shot, easing to 0) and how far
// through the fire interval we are (1 = just fired, 0 = ready).
export function getWeaponState() {
  return { recoil, cooldown: fireCooldown / FIRE_INTERVAL };
}

export function updateWeapon(delta: number) {
  recoil = Math.max(0, recoil - delta * 6);
  weaponGroup.position.z = WEAPON_REST_Z + recoil * 0.15;

  fireCooldown = Math.max(0, fireCooldown - delta);
  if (isFiring && fireCooldown <= 0 && controls.isLocked && isAlive()) {
    shoot();
    fireCooldown = FIRE_INTERVAL;
  }
}
