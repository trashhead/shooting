import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { camera, renderer } from '../core/scene';
import { clampToFloor, groundHeight, resolveSolids } from '../../shared/collision';
import { audioCtx } from '../fx/audio';
import { isAlive } from './status';
import { DAMPING, EYE_HEIGHT, GRAVITY, JUMP_SPEED, MOVE_SPEED, PLAYER_RADIUS, SNEAK_SPEED } from '../../shared/constants';

export const controls = new PointerLockControls(camera, renderer.domElement);
const overlay = document.getElementById('overlay') as HTMLDivElement;

overlay.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  // Not controls.lock(): it fires requestPointerLock() without handling its
  // promise. Chrome rejects that for ~1s after the player pressed Esc, which
  // surfaced as an "Unhandled Promise Rejection". The controls still get the
  // normal pointerlockchange events, so they pick the lock up either way. If
  // it is refused the overlay simply stays up and the next click works.
  Promise.resolve(renderer.domElement.requestPointerLock()).catch(() => {});
});
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

const move = { forward: false, backward: false, left: false, right: false, sneak: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let velocityY = 0;
let canJump = true;

function setKey(code: string, down: boolean) {
  switch (code) {
    case 'KeyW': case 'ArrowUp': move.forward = down; break;
    case 'KeyS': case 'ArrowDown': move.backward = down; break;
    case 'KeyA': case 'ArrowLeft': move.left = down; break;
    case 'KeyD': case 'ArrowRight': move.right = down; break;
    case 'ShiftLeft': case 'ShiftRight': move.sneak = down; break;
    case 'Space':
      if (down && canJump) {
        velocityY = JUMP_SPEED;
        canJump = false;
      }
      break;
  }
}
document.addEventListener('keydown', (e) => setKey(e.code, true));
document.addEventListener('keyup', (e) => setKey(e.code, false));

// Put the player at a spawn point (eye position + yaw) with no leftover motion.
export function respawnAt(x: number, y: number, z: number, yaw: number) {
  camera.position.set(x, y, z);
  camera.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
  velocity.set(0, 0, 0);
  velocityY = 0;
}

// Current horizontal speed (units/sec), for the HUD crosshair.
export function horizontalSpeed() {
  return Math.hypot(velocity.x, velocity.z);
}

export function updateMovement(delta: number) {
  if (!controls.isLocked || !isAlive()) return;
  const speed = move.sneak ? SNEAK_SPEED : MOVE_SPEED;

  velocity.x -= velocity.x * DAMPING * delta;
  velocity.z -= velocity.z * DAMPING * delta;

  direction.z = Number(move.forward) - Number(move.backward);
  direction.x = Number(move.right) - Number(move.left);
  direction.normalize();

  if (move.forward || move.backward) velocity.z -= direction.z * speed * delta * 10;
  if (move.left || move.right) velocity.x -= direction.x * speed * delta * 10;

  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);

  const feetY = camera.position.y - EYE_HEIGHT;
  clampToFloor(camera.position, PLAYER_RADIUS);
  resolveSolids(camera.position, PLAYER_RADIUS, feetY);

  // Fall onto the highest surface under us that our feet were above. Only
  // standing on something allows a jump, so walking off a ledge does not.
  velocityY -= GRAVITY * delta;
  camera.position.y += velocityY * delta;
  const ground = groundHeight(camera.position, PLAYER_RADIUS, feetY);
  if (camera.position.y - EYE_HEIGHT <= ground) {
    camera.position.y = ground + EYE_HEIGHT;
    if (velocityY < 0) velocityY = 0;
  }
  canJump = camera.position.y - EYE_HEIGHT <= ground + 1e-3;
}
