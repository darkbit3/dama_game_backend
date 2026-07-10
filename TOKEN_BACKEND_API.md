# Dama — Token Backend Integration Guide

Your server must expose **one endpoint**:

```
POST {your_backend_url}/dama
Content-Type: application/json
```

Dama calls this endpoint for every game event. The request body always contains an `action` field
that tells you what happened. You respond with `{ "ok": true }` (or action-specific data shown below).

---

## Actions Reference

### 1. `get_balance` — Fetch player balance on login

Called when a player logs into the Dama game to sync their live balance.

**Request:**
```json
{
  "action":   "get_balance",
  "phone":    "0911234567",
  "username": "Abebe"
}
```

**Response (required):**
```json
{
  "balance":  1500,
  "username": "Abebe"
}
```
- `balance` — integer, the player's current balance in your system
- `username` — optional, you can override the display name

---

### 2. `deduct` — Bet placed, deduct from player balance

Called when a game starts and the bet is locked in. Deduct `amount` from the player's balance.

**Request:**
```json
{
  "action":   "deduct",
  "phone":    "0911234567",
  "username": "Abebe",
  "playerId": "abc123",
  "amount":   100,
  "gameId":   "game_xyz"
}
```

**Response:**
```json
{ "ok": true }
```

---

### 3. `credit` — Winner payout

Called when the game ends and this player won. Add `amount` to their balance.

**Request:**
```json
{
  "action":   "credit",
  "phone":    "0911234567",
  "username": "Abebe",
  "playerId": "abc123",
  "amount":   180,
  "fee":      20,
  "gameId":   "game_xyz"
}
```
- `amount` — what the winner receives (pot minus the 10% fee)
- `fee` — the 10% commission Dama kept

**Response:**
```json
{ "ok": true }
```

---

### 4. `loss` — Loser notification

Called when this player lost the game. No money movement needed (already deducted at start).
Informational only — use it to update your UI or logs.

**Request:**
```json
{
  "action":   "loss",
  "phone":    "0922345678",
  "username": "Bekele",
  "playerId": "def456",
  "amount":   0,
  "fee":      20,
  "gameId":   "game_xyz"
}
```

**Response:**
```json
{ "ok": true }
```

---

### 5. `refund` — Draw refund

Called when the game ends in a draw. Refund `amount` to this player (bet minus 5% fee).

**Request:**
```json
{
  "action":   "refund",
  "phone":    "0911234567",
  "username": "Abebe",
  "playerId": "abc123",
  "amount":   95,
  "fee":      10,
  "gameId":   "game_xyz"
}
```
- `amount` — what each player gets back (bet − 5%)
- `fee` — the 5% commission Dama kept from this player

**Response:**
```json
{ "ok": true }
```

---

### 6. `owner_fee` — Your commission / profit / loss ⭐ NEW

Called after every game settlement to tell you exactly how much you earned or paid out as the token owner (house).

**`amount` is positive when you earn, negative when you pay out.**

| `type` | Scenario | `amount` sign |
|---|---|---|
| `pvp_win_fee` | PvP game — winner decided | + (you earn 10% of pot) |
| `pvp_draw_fee` | PvP game — draw | + (you earn 5%×2 of bets) |
| `ai_win_fee` | AI game commission portion | + |
| `ai_profit` | AI wins — player lost bet | + (you keep the player's bet) |
| `ai_loss` | Player beats AI — you pay out | − (you pay net: fee − bet) |
| `ai_draw_fee` | AI game draw fee | + |

**Request (PvP win example):**
```json
{
  "action":  "owner_fee",
  "amount":  20,
  "type":    "pvp_win_fee",
  "gameId":  "game_xyz"
}
```

**Request (player beats AI — you pay out):**
```json
{
  "action":        "owner_fee",
  "amount":        -80,
  "type":          "ai_loss",
  "gameId":        "game_xyz",
  "humanPlayerId": "abc123"
}
```

**Request (AI wins — you collect):**
```json
{
  "action":        "owner_fee",
  "amount":        120,
  "type":          "ai_profit",
  "gameId":        "game_xyz",
  "humanPlayerId": "abc123"
}
```

**Response:**
```json
{ "ok": true }
```

---

### 7. `ping` — Connectivity check

Called by the Dama admin panel to verify your server is reachable.

**Request:**
```json
{ "action": "ping" }
```

**Response:**
```json
{ "ok": true }
```

---

## Complete Game Flow Examples

### PvP game — Player A wins (bet = 100 each)

```
pot = 200,  fee = 20 (10%),  winnerPayout = 180

→ deduct   { phone: A, amount: 100, gameId }   (game starts)
→ deduct   { phone: B, amount: 100, gameId }   (game starts)

→ credit   { phone: A, amount: 180, fee: 20, gameId }   (A wins)
→ loss     { phone: B, amount: 0,   fee: 20, gameId }   (B loses)
→ owner_fee { amount: 20, type: "pvp_win_fee", gameId }  (your commission)
```

### PvP game — Draw (bet = 100 each)

```
feeEach = 5 (5%),  refund = 95,  totalFee = 10

→ deduct   { phone: A, amount: 100, gameId }
→ deduct   { phone: B, amount: 100, gameId }

→ refund   { phone: A, amount: 95, fee: 10, gameId }
→ refund   { phone: B, amount: 95, fee: 10, gameId }
→ owner_fee { amount: 10, type: "pvp_draw_fee", gameId }
```

### AI game — Player wins (bet = 100)

```
pot = 200,  fee = 20 (10%),  winnerPayout = 180
ownerNet = fee − bet = 20 − 100 = −80  (you backed the AI, you pay out)

→ deduct   { phone: player, amount: 100, gameId }   (start-bet)

→ credit   { phone: player, amount: 180, fee: 20, gameId }   (player wins)
→ owner_fee { amount: −80, type: "ai_loss", gameId, humanPlayerId }
```

### AI game — AI wins (bet = 100)

```
ownerCollects = bet = 100  (player's lost bet)
fee = 20  (commission on top)

→ deduct   { phone: player, amount: 100, gameId }   (start-bet)

→ loss     { phone: player, amount: 0, fee: 20, gameId }
→ owner_fee { amount: 100, type: "ai_profit",  gameId, humanPlayerId }
→ owner_fee { amount: 20,  type: "ai_win_fee", gameId, humanPlayerId }
```

### AI game — Draw (bet = 100)

```
feeEach = 5,  refund = 95,  totalFee = 10

→ deduct   { phone: player, amount: 100, gameId }

→ refund   { phone: player, amount: 95, fee: 10, gameId }
→ owner_fee { amount: 10, type: "ai_draw_fee", gameId }
```

---

## Dama API Endpoints You Call

These are the endpoints your frontend/integration calls on the **Dama backend**:

### Start a bet (AI game)
```
POST /api/games/start-bet
Authorization: Bearer <api_token>

Body:
{
  "gameId":    "your-unique-game-id",
  "playerId":  "player-db-id",
  "phone":     "0911234567",
  "betAmount": 100,
  "mode":      "ai",
  "player2Id": "ai-bot-id"
}

Response:
{
  "ok": true,
  "data": {
    "game":   { ...gameRow },
    "betLog": {
      "status":      "success",
      "backendUrl":  "https://your.server/api",
      "requestBody": { ... },
      "responseBody":{ ... }
    }
  }
}
```

### Finish an AI bet game (triggers settlement + owner callbacks)
```
POST /api/games/finish-ai-bet
Authorization: Bearer <api_token>

Body:
{
  "gameId":     "your-unique-game-id",
  "humanId":    "player-db-id",
  "aiId":       "ai-bot-db-id",
  "result":     "win",        // "win" | "loss" | "draw" — from HUMAN perspective
  "durationSec": 120,
  "moveCount":   34
}

Response:
{
  "ok": true,
  "data": {
    "game":   { ...finishedGameRow },
    "player": { ...updatedPlayerRow },
    "settlement": {
      "result":       "win",
      "winnerPayout": 180,
      "fee":          20,
      "refund":       0,
      "ownerDelta":   -80
    }
  }
}
```

### Start a PvP bet
```
POST /api/games/start-bet
Authorization: Bearer <api_token>

Body:
{
  "gameId":    "your-unique-game-id",
  "playerId":  "player1-db-id",
  "phone":     "0911234567",
  "betAmount": 100,
  "mode":      "pvp",
  "player2Id": "player2-db-id"
}
```
> PvP game-over settlement happens automatically via WebSocket `game_over` message.
> The `settlement` object is included in the `game_over` WS event sent to both players.

### WebSocket `game_over` event (what frontend receives)
```json
{
  "type":     "game_over",
  "winnerId": "abc123",
  "reason":   "normal",
  "settlement": {
    "winnerPayout": 180,
    "fee":          20,
    "refund":       0,
    "ownerDelta":   20
  }
}
```

---

## Transaction Types Saved in Dama DB

Every settlement writes to `token_owner_transactions`:

| `type` | Description | `amount` |
|---|---|---|
| `pvp_win_fee` | 10% commission from PvP win | positive |
| `pvp_draw_fee` | 5%×2 commission from PvP draw | positive |
| `ai_win_fee` | 10% commission from AI game | positive |
| `ai_profit` | Player's lost bet collected by owner | positive |
| `ai_loss` | Net payout when player beats AI | **negative** |
| `ai_draw_fee` | 5%×2 commission from AI draw | positive |

Query via admin API:
```
GET /api/admin/owner-transactions?token_id=1&from=2025-01-01&to=2025-12-31
Authorization: Bearer <admin_jwt>
```

Query owner balance:
```
GET /api/admin/owner-balances
Authorization: Bearer <admin_jwt>
```

---

## Notes

- All callbacks are **fire-and-forget** — Dama logs failures but never blocks game flow if your server is down.
- All callbacks have a **5-second timeout**.
- Phone numbers are normalized (leading zeros kept, `+251` prefix stripped) before sending.
- `amount` values are always integers (ETB, no decimals).
- Your server should respond with any `2xx` HTTP status to indicate success.
- If you return `4xx` or `5xx`, Dama logs the error but the game continues normally.
