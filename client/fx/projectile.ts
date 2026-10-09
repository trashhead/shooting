import * as THREE from 'three';
import { scene } from '../core/scene';
import { BOLT_SPEED } from '../../shared/constants';

// The visible laser bolt fired by the weapon (player/shooting.ts). Hit
// detection itself stays instant (an ordinary raycast at the moment of
// firing, same as before) - this is purely the travel-time visual: a fast
// but not infinitely-fast pulse that covers the muzzle-to-impact distance
// over a short, real duration instead of registering the hit immediately.
const PROJECTILE_SPEED = BOLT_SPEED; // units/sec - crosses a ~30-unit room in ~0.23s

const CORE_LENGTH = 1.1;
const CORE_RADIUS = 0.035;
const GLOW_LENGTH = 1.4;
const GLOW_RADIUS = 0.11;

const coreGeometry = new THREE.CylinderGeometry(CORE_RADIUS, CORE_RADIUS, CORE_LENGTH, 8, 1, true);
const coreMaterial = new THREE.MeshBasicMaterial({
  color: 0xdfefff,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});

const glowGeometry = new THREE.CylinderGeometry(GLOW_RADIUS, GLOW_RADIUS, GLOW_LENGTH, 8, 1, true);
const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0x3aa0ff,
  transparent: true,
  opacity: 0.35,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
});

// A handful of tiny sparkle points trailing right behind the bolt for the
// "shimmer" - a lightweight pool in the same spirit as the blood particles
// (fx/blood.ts), just blue, short-lived, and with no gravity.
const MAX_SPARKLES = 90;
const sparklePositions = new Float32Array(MAX_SPARKLES * 3).fill(-9999);
const sparkleLife = new Float32Array(MAX_SPARKLES);
let nextSparkle = 0;

function createSparkleTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(220,240,255,1)');
  gradient.addColorStop(0.4, 'rgba(120,190,255,0.8)');
  gradient.addColorStop(1, 'rgba(80,160,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const sparkleGeometry = new THREE.BufferGeometry();
sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
const sparklePoints = new THREE.Points(
  sparkleGeometry,
  new THREE.PointsMaterial({
    map: createSparkleTexture(),
    size: 0.16,
    color: 0x9ad4ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
);
sparklePoints.renderOrder = 15;
sparklePoints.frustumCulled = false; // buffer is mutated in place, see fx/blood.ts
scene.add(sparklePoints);

function spawnSparkle(position: THREE.Vector3) {
  const i = nextSparkle;
  nextSparkle = (nextSparkle + 1) % MAX_SPARKLES;
  sparklePositions[i * 3] = position.x + (Math.random() - 0.5) * 0.15;
  sparklePositions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.15;
  sparklePositions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.15;
  sparkleLife[i] = 0.12 + Math.random() * 0.15;
}

interface Projectile {
  group: THREE.Group;
  light: THREE.PointLight;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  distanceTraveled: number;
  targetDistance: number;
  age: number;
  onArrive: (() => void) | null;
}

const projectiles: Projectile[] = [];
const UP_AXIS = new THREE.Vector3(0, 1, 0);

export function spawnProjectile(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  targetDistance: number,
  onArrive: (() => void) | null
) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  group.add(core, glow);
  group.quaternion.setFromUnitVectors(UP_AXIS, direction);
  group.frustumCulled = false;
  scene.add(group);

  const light = new THREE.PointLight(0x4db2ff, 4, 6, 2);
  scene.add(light);

  projectiles.push({
    group,
    light,
    origin: origin.clone(),
    direction: direction.clone(),
    distanceTraveled: 0,
    targetDistance,
    age: 0,
    onArrive,
  });
}

const tipPosition = new THREE.Vector3();

export function updateProjectiles(delta: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.age += delta;
    p.distanceTraveled += PROJECTILE_SPEED * delta;

    if (p.distanceTraveled >= p.targetDistance) {
      p.onArrive?.();
      scene.remove(p.group, p.light);
      projectiles.splice(i, 1);
      continue;
    }

    tipPosition.copy(p.origin).addScaledVector(p.direction, p.distanceTraveled);
    // The mesh's own length trails behind the tip, so the leading edge lands
    // exactly on the impact point at the same moment onArrive fires.
    p.group.position.copy(tipPosition).addScaledVector(p.direction, -GLOW_LENGTH / 2);
    p.light.position.copy(tipPosition);

    // A gentle shimmer - the outer glow pulses in scale over time.
    const pulse = 1 + Math.sin(p.age * 40) * 0.12;
    p.group.children[1].scale.set(pulse, 1, pulse);

    spawnSparkle(tipPosition);
  }

  const positions = sparkleGeometry.attributes.position.array as Float32Array;
  let anySparkleActive = false;
  for (let i = 0; i < MAX_SPARKLES; i++) {
    if (sparkleLife[i] <= 0) continue;
    anySparkleActive = true;
    sparkleLife[i] -= delta;
    if (sparkleLife[i] <= 0) positions[i * 3 + 1] = -9999;
  }
  if (anySparkleActive) sparkleGeometry.attributes.position.needsUpdate = true;
}
