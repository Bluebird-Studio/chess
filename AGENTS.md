# Chess — 24-hour implementation brief

Deadline: 2026-10-16 00:43 Europe/Bucharest. Prioritize a playable, elegant, modern, polished experience. Every coding iteration must make concrete feature progress and push code. Avoid speculative abstractions and endless audits.

## Product checkpoints
1. Chess foundation: complete legal rules (including check, checkmate, stalemate, castling, en passant, promotion), local two-player play, undo, move list, clear game-over state, responsive polished UI.
2. Online multiplayer: authoritative WebSocket game server, room code/invite, turn enforcement, synchronized moves, reconnection, clocks, resign/draw.
3. Bots: original random, capture-greedy, material/positional heuristic, minimax, alpha-beta + iterative deepening/transposition table; optional Stockfish UCI as highest-level opponent. Expose a meaningful difficulty ladder.

## Technical baseline
TypeScript monorepo with npm workspaces. React + Vite frontend, Node.js WebSocket backend, shared pure rules/game module. Prefer chess.js for correct rules; write original AI search engines against legal moves. Keep dependency count modest. Never copy third-party chess engine source without complying with its license.

## Visual quality bar
Premium minimalist chess interface, crisp typography, responsive layout, elegant board colors, accessible contrast, restrained motion, intuitive game controls, readable move list, polished empty/loading/error/win states. Avoid generic default component styling.

## Parallel work
Developer 1 owns frontend, interaction and design; Developer 2 owns server, bots and shared logic. Coordinate interfaces through source and short docs. Work in agent-specific branches (dev/agent-01 and dev/agent-02). Push each iteration. Integrator merges into main after targeted checks, resolves conflicts, and improves broken integration. QA exercises user flows and reports reproducible defects; GitHub auditor checks code/CI and missing features without blocking coding.

## Execution
Controller: Incus container named controller. Worker allocation: incus exec controller -- agent-controller claim --owner NAME; release using owner and returned lease. Workers: agent-01 and agent-02. Git clones: /home/agent/chess. Host Remote Desktop Commander device: server. Connect using incus exec controller -- runuser -u agent -- ssh agent@WORKER_IP 'COMMAND'. Always reserve a worker first. Each run: fetch, work, build/test relevant change, commit, push, release. If blocked, switch to useful feature work. No agent may force-push main or destroy others' changes. Main merges serialized by integrator.
