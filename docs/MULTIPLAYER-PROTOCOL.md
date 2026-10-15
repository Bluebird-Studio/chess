# Multiplayer WebSocket protocol (P0 Play)

The server is authoritative. Each client sends JSON objects over WebSocket (default port 8080).
The server owns chess legality, turn order, result and room membership.

## Entering a room

- `{"type":"create"}` creates a room as White.
- `{"type":"join","roomId":"AB12CD34"}` joins as Black, only if the Black seat has never been claimed.
- Both return `{"type":"joined","roomId":"AB12CD34","color":"w"|"b","token":"<opaque-secret>","fen":"..."}`.
- **Store the token privately in the client session**. Never show it in an invite link or send it to the opponent. Room codes are shareable; tokens are not.
- `{"type":"reconnect","roomId":"AB12CD34","token":"<opaque-secret>"}` reclaims the exact seat, replaces its previous socket and returns `joined` with `reconnected:true` followed by `state`. Invalid tokens are rejected. A room survives both players disconnecting for 10 minutes, then expires.
- The client should retry reconnection on transient disconnects using its own token, not issue `join` again.

## Game actions

- `{"type":"move","from":"e2","to":"e4","promotion":"q"}`: only the player whose turn it is can move; server validates legal moves. Promotion defaults to queen if omitted.
- `{"type":"resign"}`: broadcast `{"type":"result","winner":"white"|"black","reason":"resignation"}`.
- `{"type":"offer_draw"}`: broadcasts `{"type":"draw_offered","color":"w"|"b"}`. Only the opposing player may accept or decline it with `{"type":"accept_draw"}` or `{"type":"decline_draw"}`. Acceptance broadcasts `{"type":"result","winner":"draw","reason":"agreement"}`; a move or disconnect cancels a pending offer.
- `{"type":"rematch"}`: after a terminal position or resignation, each player must request it. Server broadcasts `rematch_requested`; after both agree, it broadcasts a fresh `state` with `rematch:true`.
- `state` includes `fen`, SAN `history`, `gameOver`, optional `result`, and optional `drawOffer` (`"w"` or `"b"`). The client should render from this server state rather than apply optimistic authoritative moves.
- Disconnect notifications: `opponent_disconnected`, `opponent_reconnected`.
- Invalid operations can produce `{"type":"error","message":"..."}`. A move from the wrong side is ignored.

Clocks and frontend WebSocket integration are still pending. No persistent user accounts or games are stored.
