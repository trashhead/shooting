import { pingMs, playerId } from '../net/socket';
import { connectedPlayers, playerColor, playerStats } from '../net/remotePlayers';
import { getWeaponState } from '../player/weapon';
import { horizontalSpeed, controls } from '../player/movement';
import { isAlive } from '../player/status';
import { MAX_HEALTH, MOVE_SPEED } from '../../shared/constants';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const crosshair = $('crosshair');
const statusDot = $('statusDot');
const statusText = $('statusText');
const playerCount = $('playerCount');
const health = $('health');
const healthValue = $('healthValue');
const healthFill = $('healthFill');
const healthGhost = $('healthGhost');
const chargeFill = $('chargeFill');
const damage = $('damage');
const scoreboard = $('scoreboard');
const scoreList = $('scoreList');
const hitmarkerEl = $('hitmarker');
const killfeed = $('killfeed');
const death = $('death');
const deathKiller = $('deathKiller');

// ---- shared bits ----
function playerTag(id: number): HTMLElement {
  const tag = document.createElement('span');
  tag.className = 'tag';
  const swatch = document.createElement('i');
  swatch.style.color = swatch.style.background = playerColor(id);
  tag.append(swatch, `Player ${id}`);
  return tag;
}

// ---- health ----
let currentHealth = MAX_HEALTH;

export function setHealth(value: number) {
  const previous = currentHealth;
  currentHealth = Math.max(0, Math.min(MAX_HEALTH, Math.round(value)));
  const pct = (currentHealth / MAX_HEALTH) * 100;

  healthValue.textContent = String(currentHealth);
  healthFill.style.width = `${pct}%`;
  healthGhost.style.width = `${pct}%`;
  health.classList.toggle('low', pct <= 25);
  health.classList.toggle('mid', pct > 25 && pct <= 50);

  if (currentHealth < previous) flashDamage();
}

export function flashDamage() {
  damage.classList.add('hit');
  // Two frames so the browser registers the un-transitioned "on" state first.
  requestAnimationFrame(() => requestAnimationFrame(() => damage.classList.remove('hit')));
}

// ---- hit marker: an X on the crosshair when one of our shots lands ----
export function hitMarker(kill: boolean) {
  hitmarkerEl.classList.remove('show');
  void hitmarkerEl.offsetWidth; // restart the animation if it is already playing
  hitmarkerEl.classList.toggle('kill', kill);
  hitmarkerEl.classList.add('show');
}

// ---- death screen ----
export function showDeath(killerId: number) {
  deathKiller.replaceChildren(playerTag(killerId));
  death.classList.remove('ready');
  death.classList.add('show');
}

export function setRespawnReady() {
  death.classList.add('ready');
}

export function hideDeath() {
  death.classList.remove('show', 'ready');
}

// ---- kill feed ----
const KILLFEED_MAX = 5;
const KILLFEED_LIFETIME_MS = 6000;

export function addKillFeedEntry(killer: number, victim: number) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  if (killer === playerId || victim === playerId) entry.classList.add('mine');
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '›';
  entry.append(playerTag(killer), arrow, playerTag(victim));

  killfeed.prepend(entry);
  while (killfeed.children.length > KILLFEED_MAX) killfeed.lastElementChild?.remove();
  setTimeout(() => entry.classList.add('fade'), KILLFEED_LIFETIME_MS);
  setTimeout(() => entry.remove(), KILLFEED_LIFETIME_MS + 500);
}

// ---- scoreboard (hold Tab) ----
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Tab') return;
  e.preventDefault(); // otherwise Tab moves focus out of the game
  if (!scoreboard.classList.contains('show')) renderScoreboard();
  scoreboard.classList.add('show');
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') scoreboard.classList.remove('show');
});
window.addEventListener('blur', () => scoreboard.classList.remove('show'));

function row(...cells: (string | Node)[]) {
  const li = document.createElement('li');
  li.append(...cells);
  return li;
}

function stat(text: string | number) {
  const el = document.createElement('span');
  el.className = 'stat';
  el.textContent = String(text);
  return el;
}

function renderScoreboard() {
  const entries = connectedPlayers()
    .map((id) => ({ id, ...playerStats(id) }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);

  const head = row(Object.assign(document.createElement('span'), { className: 'who' }), stat('K'), stat('D'));
  head.className = 'head';

  scoreList.replaceChildren(
    head,
    ...entries.map(({ id, kills, deaths }) => {
      const who = document.createElement('span');
      who.className = 'who';
      who.append(playerTag(id));
      if (id === playerId) {
        const you = document.createElement('span');
        you.className = 'you';
        you.textContent = 'you';
        who.append(you);
      }
      const li = row(who, stat(kills), stat(deaths));
      if (id === playerId) li.classList.add('me');
      return li;
    })
  );
}

// ---- per-frame ----
let gap = 6;
let lastCount = -1;
let sinceScoreboard = 0;

export function updateHud(delta: number) {
  // Crosshair opens up with movement and recoil, then eases back.
  const { recoil, cooldown } = getWeaponState();
  const speedFrac = Math.min(1, horizontalSpeed() / MOVE_SPEED);
  const targetGap = 6 + speedFrac * 8 + recoil * 10;
  gap += (targetGap - gap) * (1 - Math.exp(-delta * 20));
  crosshair.style.setProperty('--gap', `${gap.toFixed(2)}px`);
  crosshair.style.opacity = !isAlive() ? '0' : controls.isLocked ? '1' : '0.5';

  // Weapon readiness: dips on each shot and refills over the fire interval.
  chargeFill.style.width = `${((1 - cooldown) * 100).toFixed(0)}%`;

  // Connection pill.
  const online = playerId !== null;
  statusDot.classList.toggle('on', online);
  statusText.textContent = online ? `#${playerId}${pingMs === null ? '' : ` · ${pingMs} ms`}` : 'offline';

  const count = online ? connectedPlayers().length : 1;
  if (count !== lastCount) {
    lastCount = count;
    playerCount.textContent = String(count);
  }

  // Keep an open scoreboard fresh (scores change while it is up).
  if (scoreboard.classList.contains('show')) {
    sinceScoreboard += delta;
    if (sinceScoreboard > 0.25) {
      sinceScoreboard = 0;
      renderScoreboard();
    }
  }
}

setHealth(MAX_HEALTH);
