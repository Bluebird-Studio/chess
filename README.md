# Bluebird Chess

A polished chess experience with local play, online multiplayer, and original progressively stronger bots.

## Development

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm run dev
npm run dev:server
npm test
npm run build
```

The web app runs on Vite (typically http://localhost:5173). The authoritative WebSocket server listens on port 8080. Open **Online**, create a room, and share the eight-character code with a second browser. Both clients must be able to reach the server.

For separate frontend/backend hosts, set `VITE_CHESS_WS_URL=wss://your-host/chess` when building the frontend, and configure the reverse proxy to forward WebSocket connections to port 8080. The default URL is `ws(s)://<browser-host>:8080`. On HTTPS sites, use a valid `wss://` endpoint. Room state is ephemeral and no accounts are required.

## Structure

- `apps/web` — React chess interface and local play
- `apps/server` — authoritative WebSocket multiplayer room service with reconnectable seats
- `packages/engine` — original bot algorithms over chess.js legal moves

## Roadmap

1. Play foundation: local play, rules, move history, premium responsive board
2. Play multiplayer: server-backed matches, invitations, clocks, reconnect and lifecycle
3. Play bots: random, greedy, minimax, alpha-beta, stronger engine search, optional Stockfish

4. Analyze (stretch): game replay, PGN/FEN, evaluation, move quality.

Learning features are deliberately out of scope. See `SCOPE.md` and `AGENTS.md` for priorities and the deadline.
