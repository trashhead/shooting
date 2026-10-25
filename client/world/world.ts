import * as THREE from 'three';
import { scene } from '../core/scene';
import { MAP } from '../../shared/world';

const FLOOR_SIZE = MAP.size;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(60, 90, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 250;
sun.shadow.camera.left = -FLOOR_SIZE / 2;
sun.shadow.camera.right = FLOOR_SIZE / 2;
sun.shadow.camera.top = FLOOR_SIZE / 2;
sun.shadow.camera.bottom = -FLOOR_SIZE / 2;
scene.add(sun);

// Floor: tileable canvas "grass" so movement is visible.
function createGrassTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a7d3a';
  ctx.fillRect(0, 0, size, size);
  const colors = ['#2f6b2f', '#4a8f4a', '#356e35', '#549954', '#2a5f2a'];
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 2 + Math.random() * 5;
    const angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_SIZE / 6, FLOOR_SIZE / 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Floor for the arena: grey concrete slabs with seams, one tile per 8 units.
function createConcreteTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8a8f98';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(40,44,52,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_SIZE / 8, FLOOR_SIZE / 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshStandardMaterial({ map: MAP.floor === 'grass' ? createGrassTexture() : createConcreteTexture(), roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Solids (boxes, walls, platforms). The layout is shared (shared/world.ts) so
// the server knows where they are too, e.g. to stop bolts and keep spawns clear.
export const boxes: THREE.Mesh[] = [];

MAP.solids.forEach((s, i) => {
  const height = s.y1 - s.y0;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(s.hx * 2, height, s.hz * 2),
    new THREE.MeshStandardMaterial({ color: MAP.solidColors[i % MAP.solidColors.length] })
  );
  box.position.set(s.x, s.y0 + height / 2, s.z);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  boxes.push(box);
});
