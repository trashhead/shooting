import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { camera, renderer } from '../core/scene';
import { controls } from './movement';
import { boxes, floor } from '../world/world';
import { spawnProjectile } from '../fx/projectile';
import { playShootSound } from '../fx/audio';
import { send } from '../net/socket';
import { remoteBodies } from '../net/remotePlayers';
import { isAlive } from './status';

// Held weapon: a placeholder box until the sci-fi model (Collada, no rig,
// own PBR textures) finishes loading.
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

const textureLoader = new THREE.TextureLoader();
new ColladaLoader()
  .loadAsync('/assets/weapon/model.dae')
  .then((collada) => {
    const model = collada.scene;
    // The source barrel faces backward. Rotate first, then measure and
    // recenter: an offset computed before the rotation would end up rotated too.
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(0.85 / Math.max(size.x, size.y, size.z));
    model.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    model.position.sub(center);

    const material = new THREE.MeshStandardMaterial({
      map: textureLoader.load('/assets/weapon/albedo.jpg'),
      normalMap: textureLoader.load('/assets/weapon/normal.png'),
      metalnessMap: textureLoader.load('/assets/weapon/metallic.jpg'),
      roughnessMap: textureLoader.load('/assets/weapon/roughness.jpg'),
      aoMap: textureLoader.load('/assets/weapon/ao.jpg'),
      emissiveMap: textureLoader.load('/assets/weapon/emissive.jpg'),
      emissive: new THREE.Color(0x2299ff),
      emissiveIntensity: 1.5,
      metalness: 1,
      roughness: 1,
    });
    material.map!.colorSpace = THREE.SRGBColorSpace;
    material.emissiveMap!.colorSpace = THREE.SRGBColorSpace;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
        // aoMap reads the uv1 set; the model only has one.
        if (child.geometry.attributes.uv && !child.geometry.attributes.uv1) {
          child.geometry.setAttribute('uv1', child.geometry.attributes.uv);
        }
      }
    });

    weaponGroup.remove(placeholder);
    weaponGroup.add(model);
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
