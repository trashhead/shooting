import { send } from '../net/socket';

// B asks the server to add a bot (the server caps how many there can be).
document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyB' && !event.repeat) send({ t: 'addBot' });
});
