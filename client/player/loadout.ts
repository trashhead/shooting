import { WEAPONS, WEAPON_IDS, isWeaponId, type WeaponId } from '../../shared/weapons';
import { isAlive } from './status';
import { controls } from './movement';

// Which weapon the player will use, picked on the start screen (and again on
// the death screen, before respawning). Remembered between visits.
const STORAGE_KEY = 'shooting.weapon';

function loadSaved(): WeaponId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isWeaponId(saved)) return saved;
  } catch {}
  return 'plasma';
}

let selected: WeaponId = loadSaved();
const listeners: ((id: WeaponId) => void)[] = [];

export const getWeaponId = () => selected;
export const onWeaponChange = (fn: (id: WeaponId) => void) => listeners.push(fn);

// Changing is allowed before the first spawn and while dead, never from the
// pause menu in the middle of a life.
let started = false;
controls.addEventListener('lock', () => (started = true));
const canChange = () => !started || !isAlive();

export function selectWeapon(id: WeaponId) {
  if (id === selected || !canChange()) return;
  selected = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
  render();
  for (const fn of listeners) fn(id);
}

// ---- UI: cards on the start screen, a one-line hint on the death screen ----
const picker = document.getElementById('weaponPicker') as HTMLDivElement;
const deathPicks = document.getElementById('deathWeapons') as HTMLDivElement;

const cards = WEAPON_IDS.map((id, i) => {
  const spec = WEAPONS[id];
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'pick';
  card.innerHTML =
    `<kbd>${i + 1}</kbd><span class="pick-name">${spec.name}</span>` +
    `<span class="pick-stats">${spec.damage} dmg · ${(1 / spec.fireInterval).toFixed(1)}/s` +
    `${spec.zoomFov ? ' · zoom' : ''}</span>`;
  // Picking must not count as "click to play" (the overlay's click starts the game).
  card.addEventListener('click', (event) => {
    event.stopPropagation();
    selectWeapon(id);
  });
  picker.append(card);
  return card;
});

function render() {
  picker.classList.toggle('locked', !canChange());
  WEAPON_IDS.forEach((id, i) => cards[i].classList.toggle('selected', id === selected));
  deathPicks.replaceChildren(
    ...WEAPON_IDS.map((id, i) => {
      const el = document.createElement('span');
      el.className = id === selected ? 'selected' : '';
      el.textContent = `${i + 1}  ${WEAPONS[id].name}`;
      return el;
    })
  );
}
render();

document.addEventListener('keydown', (event) => {
  const match = /^Digit([1-9])$/.exec(event.code);
  if (!match) return;
  const id = WEAPON_IDS[Number(match[1]) - 1];
  if (id) selectWeapon(id);
});

// Grey the cards out while the pause menu can't change the weapon.
controls.addEventListener('unlock', render);
