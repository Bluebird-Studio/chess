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

The web app runs on Vite (typically http://localhost:5173). WebSocket server listens on port 8080.

## Structure

- `apps/web` — React chess interface and local play
- `apps/server` — authoritative WebSocket multiplayer room service (integration with UI in progress)
- `packages/engine` — original bot algorithms over chess.js legal moves

## Roadmap

1. Foundation: local play, rules, move history, premium responsive board
2. Multiplayer: server-backed matches, invitations, clocks, reconnect and lifecycle
3. Bots: random, greedy, minimax, alpha-beta, stronger engine search, optional Stockfish

See `AGENTS.md` for development assignments and the deadline.
