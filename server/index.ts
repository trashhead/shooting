import { join, resolve } from 'node:path';
import index from '../client/index.html';
import * as bots from './bot';
import * as game from './game';
import { decode, encode, type ClientMessage } from '../shared/protocol';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = resolve(import.meta.dir, '..', 'public');
const SNAPSHOT_HZ = 20;
const TICK_HZ = 60; // bolt simulation rate
const ROOM = 'game'; // pub/sub topic every connected player subscribes to

type Client = { id: number };
let nextId = 1;

// Sockets by player id, to message one player directly (a hit, a respawn).
const sockets = new Map<number, Bun.ServerWebSocket<Client>>();

const server = Bun.serve<Client>({
  port: PORT,
  development: process.env.NODE_ENV !== 'production',

  routes: {
    '/': index,
  },

  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      if (server.upgrade(req, { data: { id: nextId++ } })) return;
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    // Static assets (models, textures), resolved inside public/ only.
    const path = resolve(join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
    if (!path.startsWith(PUBLIC_DIR)) return new Response('Not found', { status: 404 });
    const file = Bun.file(path);
    if (await file.exists()) return new Response(file);

    return new Response('Not found', { status: 404 });
  },

  websocket: {
    open(ws) {
      const { id } = ws.data;
      console.log(`player ${id} joined`);
      sockets.set(id, ws);
      ws.subscribe(ROOM);
      const { spawn, health } = game.join(id);
      ws.send(encode({ t: 'welcome', id, spawn, health }));
    },

    message(ws, raw) {
      const msg = decode<ClientMessage>(raw);
      if (!msg) return;
      const { id } = ws.data;

      switch (msg.t) {
        case 'ping':
          ws.send(encode({ t: 'pong', time: msg.time }));
          break;

        case 'state': {
          const { x, y, z, yaw, pitch } = msg;
          if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
          game.setPose(id, { x, y, z, yaw, pitch });
          break;
        }

        case 'shoot': {
          const { origin, dir, dist } = msg;
          const valid = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
          if (![origin, dir].every(valid) || !Number.isFinite(dist)) return;
          if (!game.isAlive(id)) return;

          // publish() on a socket skips that socket, so the shooter doesn't get it back.
          ws.publish(ROOM, encode({ t: 'shot', id, origin, dir, dist: Math.min(Math.max(dist, 0), 500) }));

          // Damage is not decided here: the bolt flies (see tick below) and
          // hurts whoever it reaches, when it reaches them.
          game.fire(id, origin, dir);
          break;
        }

        case 'addBot':
          if (bots.canAddBot()) bots.addBot(nextId++);
          break;

        case 'respawn': {
          const result = game.respawn(id);
          if (result) ws.send(encode({ t: 'respawn', ...result }));
          break;
        }
      }
    },

    close(ws) {
      console.log(`player ${ws.data.id} left`);
      sockets.delete(ws.data.id);
      game.leave(ws.data.id);
    },
  },
});

// Fly the bolts. Damage and kills are announced at the moment of impact.
let lastTick = performance.now();
const tick = () => {
  const now = performance.now();
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;

  // Bots only make sense with someone to play against.
  if (sockets.size === 0) bots.removeAllBots();
  bots.updateBots(dt, (id, origin, dir, dist) => {
    server.publish(ROOM, encode({ t: 'shot', id, origin, dir, dist }));
    game.fire(id, origin, dir);
  });

  for (const hit of game.step(dt)) {
    sockets.get(hit.killerId)?.send(encode({ t: 'hitmarker', kill: hit.killed }));
    sockets.get(hit.victimId)?.send(encode({ t: 'damaged', health: hit.health, by: hit.killerId }));
    if (hit.killed) server.publish(ROOM, encode({ t: 'kill', killer: hit.killerId, victim: hit.victimId }));
  }
};

// One broadcast loop for everybody. `--hot` re-runs this module, so clear
// the previous timer or each reload would stack another loop.
const g = globalThis as { __snapshotTimer?: ReturnType<typeof setInterval>; __tickTimer?: ReturnType<typeof setInterval> };
if (g.__snapshotTimer) clearInterval(g.__snapshotTimer);
if (g.__tickTimer) clearInterval(g.__tickTimer);
g.__tickTimer = setInterval(tick, 1000 / TICK_HZ);
g.__snapshotTimer = setInterval(() => {
  if (game.playerCount() === 0) return;
  server.publish(ROOM, encode({ t: 'snapshot', players: game.snapshot() }));
}, 1000 / SNAPSHOT_HZ);

console.log(`shooting server on http://localhost:${server.port}`);
