# Product scope and acceptance criteria — 24-hour experiment

Deadline: 2026-10-16 00:43 Europe/Bucharest. The project is **Play + Analyze**, with strict priority: **Play must ship polished and functional; Analyze is a stretch goal. Learn is explicitly excluded.**

## P0 — PLAY (mandatory, no compromise)
- Correct chess rules and endings: check, checkmate, stalemate, insufficient material, repetition, fifty-move rule, castling, en passant, promotion choice, resignation and draw.
- Excellent responsive interface: professional cohesive visual design, beautiful board and pieces, drag-and-drop plus click-to-move, legal-move feedback, last-move and check indicators, animations, sound toggle, keyboard/accessibility basics, mobile support, reliable undo/reset.
- Local two-player and bot games; sensible game controls, move history, clear result and rematch.
- Multiplayer: authoritative WebSocket server, room codes/invites, valid turn enforcement, two clients synchronized, disconnect/reconnect handling, clocks and rematch when feasible. Keep it ephemeral; **no accounts, profiles or persistent backend**.
- Real variety in original bot algorithms: random, greedy, heuristic, minimax, alpha-beta/iterative deepening. Stockfish is optional reference opponent, not a substitute. No fake difficulty labels.
- Test key gameplay paths in a browser and ensure build and CI pass.

## P1 — ANALYZE (stretch)
- Move-by-move game replay, PGN/FEN import/export, evaluation bar, candidate engine lines, move quality/blunder hints. Implement incrementally; never sacrifice P0.
- If deeper search is too expensive in the browser, use a worker or bounded analysis with responsive cancellation.

## Explicitly out of scope for this experiment
Learning features (puzzles, lessons, opening trainers, endgame exercises), accounts/auth, social feeds, tournaments, monetization, Elo leaderboards, permanent game databases, elaborate microservices, a full chess platform, complex deployment infrastructure.

## Engineering execution
- Frontend owner: polished board, UX, local game and integration.
- Backend/bot owner: network protocol, multiplayer, original bot ladder and tests.
- Integrator: merge branches into main serially and make the integrated application run.
- QA: verify two-player gameplay, multiplayer and bots; fix high-severity defects.
- Auditor: identify only actionable blockers and feature gaps; don't stall progress.
- Each iteration must produce real working code or verified integration/test results; push commits. Do not add speculative abstractions. 
- Prioritize P0 relentlessly. After P0 works end to end, P1 only.
