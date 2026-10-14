# Release checklist

## Mandatory Play
- [ ] Local white/black turns and illegal move rejection
- [ ] Castling on both sides and castling-through-check rejection
- [ ] En passant, promotion choice, check, checkmate, stalemate
- [ ] Threefold repetition, fifty-move rule, insufficient material
- [ ] Undo, new game, flip board, move history, game-over banner
- [ ] Bot returns only legal moves at each level; game never freezes
- [ ] Bot reset/undo cancels stale pending move
- [ ] Online room create/join, two browser clients, turn enforcement
- [ ] Invalid remote move rejected without desync
- [ ] Disconnect/reconnect, clocks, resignation, rematch
- [ ] Keyboard focus, mobile touch, readable contrast, reduced-motion support
- [ ] No console errors, production build and automated tests pass

## Stretch Analyze
- [ ] PGN export/import and FEN import/export
- [ ] Move replay and timeline
- [ ] Engine evaluation with bounded compute
- [ ] Move-quality indicators and principal variations

## Explicit non-goals
No Learn mode, puzzles, tutorials, accounts, social feed, tournaments, monetization or persistent game database.
