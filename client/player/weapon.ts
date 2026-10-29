import * as THREE from 'three';
import { camera, renderer } from '../core/scene';
import { controls } from './movement';
import { boxes, floor } from '../world/world';
import { spawnProjectile } from '../fx/projectile';
import { playShootSound } from '../fx/audio';
import { send } from '../net/socket';
import { remoteBodies } from '../net/remotePlayers';
import { isAlive } from './status';
import { loadSniperModel, loadWeaponModel } from './weaponModel';
import { getWeaponId, onWeaponChange } from './loadout';
import { WEAPONS, type WeaponId } from '../../shared/weapons';

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
const MUZZLE_LOCAL_OFFSETS: Record<WeaponId, THREE.Vector3> = {
  plasma: new THREE.Vector3(0.4, -0.32, -1.05),
  sniper: new THREE.Vector3(0.3, -0.3, -1.35),
};
// Where each model rests in the camera, and its recoil-free z.
const REST_POSITIONS: Record<WeaponId, THREE.Vector3> = {
  plasma: new THREE.Vector3(0.4, -0.32, WEAPON_REST_Z),
  sniper: new THREE.Vector3(0.3, -0.3, -0.72),
};

const models: Partial<Record<WeaponId, THREE.Object3D>> = {};
let currentWeapon: WeaponId = getWeaponId();

function showCurrentModel() {
  weaponGroup.clear();
  const model = models[currentWeapon];
  weaponGroup.add(model ? model.clone() : placeholder);
  weaponGroup.position.copy(REST_POSITIONS[currentWeapon]);
}

loadWeaponModel()
  .then((model) => {
    models.plasma = model;
    showCurrentModel();
  })
  .catch((err) => console.error('Failed to load weapon model', err));
loadSniperModel()
  .then((model) => {
    models.sniper = model;
    showCurrentModel();
  })
  .catch((err) => console.error('Failed to load sniper model', err));

onWeaponChange((id) => {
  currentWeapon = id;
  setAiming(false);
  showCurrentModel();
});
showCurrentModel();

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

  camera.localToWorld(muzzleOrigin.copy(MUZZLE_LOCAL_OFFSETS[currentWeapon]));
  boltDirection.copy(targetPoint).sub(muzzleOrigin).normalize();
  spawnProjectile(muzzleOrigin, boltDirection, muzzleOrigin.distanceTo(targetPoint), null, WEAPONS[currentWeapon].boltSpeed);

  send({
    t: 'shoot',
    origin: [muzzleOrigin.x, muzzleOrigin.y, muzzleOrigin.z],
    dir: [boltDirection.x, boltDirection.y, boltDirection.z],
    dist: muzzleOrigin.distanceTo(targetPoint),
    weapon: currentWeapon,
  });

  recoil = 1;
  playShootSound();
}

// Holding the button auto-fires (weapons with `auto`); updateWeapon paces the repeats.
let isFiring = false;
let fireCooldown = 0;

// ---- aiming down the scope (right mouse) ----
const baseFov = camera.fov;
const basePointerSpeed = controls.pointerSpeed;
const scopeEl = document.getElementById('scope') as HTMLDivElement;
let aiming = false;
let zoom = 0; // 0 = hip, 1 = fully zoomed

function setAiming(on: boolean) {
  aiming = on && WEAPONS[currentWeapon].zoomFov !== null;
}

document.addEventListener('mousedown', (event) => {
  if (!controls.isLocked || !isAlive()) return;
  if (event.button === 0) {
    isFiring = true;
    if (fireCooldown <= 0) {
      shoot();
      fireCooldown = WEAPONS[currentWeapon].fireInterval;
    }
  } else if (event.button === 2) {
    setAiming(true);
  }
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) isFiring = false;
  else if (event.button === 2) setAiming(false);
});
controls.addEventListener('unlock', () => {
  isFiring = false;
  setAiming(false);
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

// For the HUD: recoil kick (1 right after a shot, easing to 0) and how far
// through the fire interval we are (1 = just fired, 0 = ready).
export function getWeaponState() {
  return { recoil, cooldown: fireCooldown / WEAPONS[currentWeapon].fireInterval, weaponId: currentWeapon, zoom };
}

export function updateWeapon(delta: number) {
  const spec = WEAPONS[currentWeapon];
  if (!isAlive()) setAiming(false);

  recoil = Math.max(0, recoil - delta * 6);
  weaponGroup.position.z = REST_POSITIONS[currentWeapon].z + recoil * 0.15;

  // Ease the zoom in/out; the scope overlay replaces the held weapon at the end.
  const target = aiming ? 1 : 0;
  const previousZoom = zoom;
  zoom += (target - zoom) * (1 - Math.exp(-delta * 18));
  if (Math.abs(target - zoom) < 0.005) zoom = target;
  if (zoom !== previousZoom || (zoom === 0 && camera.fov !== baseFov)) {
    const zoomFov = spec.zoomFov ?? baseFov;
    camera.fov = baseFov + (zoomFov - baseFov) * zoom;
    camera.updateProjectionMatrix();
    // Look sensitivity follows the field of view, so aiming stays controllable.
    controls.pointerSpeed = basePointerSpeed * (camera.fov / baseFov);
  }
  const scoped = zoom > 0.9;
  scopeEl.classList.toggle('show', scoped);
  weaponGroup.visible = !scoped;

  fireCooldown = Math.max(0, fireCooldown - delta);
  if (isFiring && spec.auto && fireCooldown <= 0 && controls.isLocked && isAlive()) {
    shoot();
    fireCooldown = spec.fireInterval;
  }
}
