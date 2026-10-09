import * as THREE from 'three';
import { scene } from '../core/scene';
import { BOX_HALF_EXTENT, FLOOR_SIZE } from '../../shared/constants';
import { BOX_POSITIONS } from '../../shared/world';

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

export const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshStandardMaterial({ map: createGrassTexture(), roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Boxes. The layout is seeded and shared (shared/world.ts) so the server
// knows where they are too, e.g. to keep spawns out of them.
export const boxes: THREE.Mesh[] = [];
const boxColors = [0xcc4444, 0x4444cc, 0xcccc44, 0x44cccc, 0xcc44cc];
const boxGeometry = new THREE.BoxGeometry(BOX_HALF_EXTENT * 2, BOX_HALF_EXTENT * 2, BOX_HALF_EXTENT * 2);

BOX_POSITIONS.forEach(({ x, z }, i) => {
  const box = new THREE.Mesh(boxGeometry, new THREE.MeshStandardMaterial({ color: boxColors[i % boxColors.length] }));
  box.position.set(x, BOX_HALF_EXTENT, z);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  boxes.push(box);
});
