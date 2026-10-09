import { decode, encode, type ClientMessage, type ServerMessage } from '../../shared/protocol';

// Thin WebSocket wrapper: auto-reconnects and exposes typed send/handlers.
// Multiplayer state sync builds on this; for now it only tracks latency.
export let playerId: number | null = null;
export let pingMs: number | null = null;

let ws: WebSocket | null = null;
const handlers = new Set<(msg: ServerMessage) => void>();

export function onMessage(handler: (msg: ServerMessage) => void) {
  handlers.add(handler);
}

export function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(encode(msg));
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.addEventListener('message', (event) => {
    const msg = decode<ServerMessage>(event.data);
    if (!msg) return;
    if (msg.t === 'welcome') playerId = msg.id;
    if (msg.t === 'pong') pingMs = Math.round(performance.now() - msg.time);
    handlers.forEach((handler) => handler(msg));
  });

  ws.addEventListener('close', () => {
    playerId = null;
    pingMs = null;
    setTimeout(connect, 1000);
  });
}

connect();
setInterval(() => send({ t: 'ping', time: performance.now() }), 2000);
