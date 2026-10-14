# Chess architecture — implementation contract

## Runtime
- `apps/web`: React/Vite browser application. Owns presentation, input, game navigation and audio.
- `packages/engine`: reusable pure chess-bot decision logic; chess.js is the canonical move legality source. No browser or WebSocket dependencies.
- `apps/server`: authoritative Node/WebSocket room service. Never trust a client-supplied FEN or turn/color.

## Mode ownership
- Local: browser owns Chess instance and can play both colors.
- Bot: browser owns Chess instance; the bot selects a legal move against a snapshot. Cancel stale asynchronous bot results on reset, undo, or mode changes.
- Online: server owns Chess instance and broadcasts canonical state; browser only proposes moves.

## Protocol v0 (JSON)
Client → server:
- `{ "type": "create" }` — creates an ephemeral room, requester is White.
- `{ "type": "join", "roomId": "ABCDEFGH" }` — joins as Black.
- `{ "type": "move", "from": "e2", "to": "e4", "promotion": "q" }` — move proposal; server checks turn and legality.

Server → client:
- `{ "type": "joined", "roomId": "...", "color": "w", "fen": "..." }`
- `{ "type": "state", "fen": "...", "history": ["e4", "..."], "gameOver": false }`
- `{ "type": "opponent_disconnected" }`
- `{ "type": "error", "message": "..." }`

**Current limitations:** protocol v0 does not support reconnection tokens, clocks, draw/resign, or rematches. Extend protocol explicitly and test backwards compatibility. Room codes are not authentication; keep the service ephemeral and rate-limited before public exposure.

## Integration rules
1. Keep shared contracts stable and document changes in this file.
2. Developer branches are `dev/agent-01` (web) and `dev/agent-02` (server/engine).
3. Integrator merges serially into `main`, runs `npm ci && npm test && npm run build`, and checks user-visible flow.
4. QA tests two WebSocket clients, all special moves, game endings, bot play and mobile layout.
5. Prefer vertical slices over scaffolding unrelated features. Never replace actual gameplay with placeholders.

## Product priorities
P0 Play is required and must feel premium. P1 Analyze is stretch only. Learn is excluded.
