import { camera } from '../core/scene';
import { onMessage, playerId, send } from '../net/socket';
import { addKillFeedEntry, hideDeath, hitMarker, setHealth, setRespawnReady, showDeath } from '../hud/hud';
import { respawnAt } from './movement';
import { isAlive, setAlive } from './status';
import { EYE_HEIGHT, PLAYER_RADIUS, RESPAWN_DELAY_MS } from '../../shared/constants';
import { groundHeight } from '../../shared/collision';

// Life cycle of the local player, driven entirely by what the server says:
// spawn, take damage, die, respawn.
let canRespawn = false;

function die(killerId: number) {
  setAlive(false);
  canRespawn = false;
  // drop to the ground (or platform) where we fell
  camera.position.y = groundHeight(camera.position, PLAYER_RADIUS, camera.position.y - EYE_HEIGHT) + 0.4;
  showDeath(killerId);
  setTimeout(() => {
    if (isAlive()) return; // already respawned somehow
    canRespawn = true;
    setRespawnReady();
  }, RESPAWN_DELAY_MS);
}

onMessage((msg) => {
  switch (msg.t) {
    case 'welcome':
    case 'respawn':
      respawnAt(msg.spawn.x, msg.spawn.y, msg.spawn.z, msg.spawn.yaw);
      setAlive(true);
      canRespawn = false;
      setHealth(msg.health);
      hideDeath();
      break;
    case 'damaged':
      setHealth(msg.health);
      break;
    case 'hitmarker':
      hitMarker(msg.kill);
      break;
    case 'kill':
      addKillFeedEntry(msg.killer, msg.victim);
      if (msg.victim === playerId) die(msg.killer);
      break;
  }
});

// Any click respawns once the death screen says so. (Holding fire while
// dying must not respawn you instantly - hence the delay above.)
document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && !isAlive() && canRespawn) send({ t: 'respawn' });
});
