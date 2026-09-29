# Jev Chess

A chess engine that asks [Jev](https://vercel.com/ai-gateway/models/jev) to choose each move through Vercel AI Gateway. `chess.js` enforces the rules; Jev evaluates the options. The engine does not search ahead, so expect mistakes.

## Strategies

Choose a strategy in the game interface:

- **Choice:** Jev selects from the legal moves.
- **Position:** Jev evaluates the position after each legal move.
- **Tactical:** Jev selects from legal moves described with computed tactical and progress facts.
- **Composite:** combines the tactical choice with positional scores.

Each move uses one gateway request, except when only one legal move is available.

## Run locally

Requirements: Node.js and pnpm.

```sh
pnpm install
cp .env.example .env.local
```

Add an AI Gateway key to `.env.local`:

```dotenv
AI_GATEWAY_API_KEY=vck_...
```

Start the app:

```sh
pnpm dev
```

`pnpm smoke` makes a live gateway request for each strategy. Other available commands:

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm bench --a jev:tactical --b stockfish:0@1 --games 10 --label my-run
```

The benchmark writes one JSON record per game to `bench/results/<label>.jsonl`.

## Rate limits

The app can apply a per-IP limit with Upstash Redis. Gateway limits are separate and shared by requests using the same AI Gateway key. The app reports gateway rate-limit responses and retries after the delay supplied by the gateway. Changing the app's per-IP limit does not raise the gateway limit; ask Vercel whether the shared limit for your account can be raised.

## Project layout

```text
app/api/move/route.ts       Move API
components/chess-game.tsx   Board, controls, and move requests
components/thinking-panel.tsx  Jev's probabilities for the last move
lib/engine/                 Position descriptions, strategies, and gateway client
lib/rate-limit.ts           Optional Upstash per-IP limit
scripts/smoke.mts           Live gateway check
bench/                      Strategy benchmark harness
```

## References

Cool similar projects I have found:
- https://github.com/dperezcabrera/system-one-chess
- https://dev.to/maximsaplin/typesafe-jev-played-chess-and-landed-next-to-reasoning-models-28ga
  - https://github.com/maxim-saplin/llm_chess
