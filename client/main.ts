import * as THREE from 'three';
import { camera, renderer, scene } from './core/scene';
import './world/world';
import { playerId, send } from './net/socket';
import { updateRemotePlayers } from './net/remotePlayers';
import { updateMovement } from './player/movement';
import './player/life';
import './player/bots';
import { updateWeapon } from './player/weapon';
import { updateProjectiles } from './fx/projectile';
import { updateHud } from './hud/hud';

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  // Clamp so a backgrounded tab doesn't produce one giant physics step.
  const delta = Math.min(clock.getDelta(), 0.1);

  updateMovement(delta);
  updateWeapon(delta);
  updateProjectiles(delta);
  updateRemotePlayers(delta);
  trackYaw();
  updateHud(delta);

  renderer.render(scene, camera);
}

// Yaw/pitch must be read with the same Euler order the mouse-look uses
// (YXZ). camera.rotation is XYZ, which only matches while facing roughly
// forward and flips pitch/yaw once the player turns around.
//
// The yaw also wraps at +-PI, which makes a fast spin ambiguous to the
// receiver (which way round did it go between two snapshots?), so the
// per-frame change is accumulated into a continuous angle and that is sent.
const look = new THREE.Euler(0, 0, 0, 'YXZ');
let unwrappedYaw = 0;
let lastYaw = 0;
function trackYaw() {
  look.setFromQuaternion(camera.quaternion, 'YXZ');
  const d = look.y - lastYaw;
  unwrappedYaw += Math.atan2(Math.sin(d), Math.cos(d));
  lastYaw = look.y;
}

animate();

// Dev only: `bun --hot` restarts the whole server (and rebuilds the bundle)
// when server code changes. A page that stays open across that ends up with a
// half-updated module graph, so reload it whenever the HMR socket reconnects.
if (import.meta.hot) {
  let dropped = false;
  import.meta.hot.on('bun:ws:disconnect', () => (dropped = true));
  import.meta.hot.on('bun:ws:connect', () => {
    if (dropped) location.reload();
  });
}

// Report our pose to the server 20x/s. Runs from the moment the page loads
// (not only while the mouse is locked) so the player is visible to others
// as soon as they open the game. `send` is a no-op while disconnected.
setInterval(() => {
  // Not before the server has told us where we spawn, or we'd report the
  // default start position and overwrite it.
  if (playerId === null) return;
  send({
    t: 'state',
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
    yaw: unwrappedYaw,
    pitch: look.x,
  });
}, 50);
