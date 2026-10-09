# shooting

Multiplayer shooter. Bun backend (static files + WebSocket), three.js frontend.

```
bun install
bun run dev        # http://localhost:3000
bun run typecheck
```

- `server/`  Bun server: serves the client, upgrades `/ws` to a WebSocket.
- `client/`  three.js frontend (bundled by Bun straight from `client/index.html`).
- `shared/`  Code both sides import (wire protocol, movement constants).
- `public/`  Static assets, served under `/assets/...`.

Multiplayer works: the server places players, relays poses and shots, flies the bolts and
decides damage, deaths and respawns. Clients only send input and draw what the server says.

## Docker

```
docker compose up --build        # http://localhost:3000
# or
docker build -t shooting .
docker run --rm -p 3000:3000 shooting
```

The image runs `NODE_ENV=production bun server/index.ts` as the non-root `bun` user;
Bun bundles the client when the server starts. `PORT` (default 3000) is configurable.
The game state is in memory, so run a single replica. Behind a reverse proxy, forward
WebSocket upgrades on `/ws`.
