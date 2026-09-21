# Jev Chess

A chess engine where every move is chosen by [Jev](https://vercel.com/ai-gateway/models/jev), TypeSafe AI's yes/no evaluation model, called through Vercel AI Gateway's `/v1/evaluate` endpoint. The AI SDK is not used: its `experimental_evaluate` rejects valid Jev responses when rounded probabilities tie (see `lib/engine/jev.ts`). There is no search and no hand-written evaluation. `chess.js` enforces the rules, Jev picks the move.

## How it decides

Two strategies, switchable per move in the UI. Both are a single round trip to Jev.

- **A: choice over legal moves** (`lib/engine/strategies/choice.ts`). One `choice` question whose options are the legal moves, described in prose ("Nxe5: knight from f3 to e5, captures black pawn"). Jev returns a distribution over moves and we play the argmax. Roughly 2k input tokens per move.
- **B: evaluate each resulting position** (`lib/engine/strategies/position.ts`). Every legal move is played on a scratch board, the resulting positions all go into one state, and one `boolean` question per candidate asks "will the mover win from here?". We play the max. Roughly 4k to 8k input tokens per move.

Only exception to "Jev decides everything": when there is exactly one legal move we skip the call, because there is nothing to decide.

Board representation sent to Jev: ASCII board, FEN, a piece list per side ("king e1, queen d1, ..."), material count, whether the mover is in check, and the numbered move history.

## Run locally

```sh
pnpm install
cp .env.example .env.local   # add AI_GATEWAY_API_KEY=vck_...
pnpm dev
```

`pnpm smoke` runs both strategies once on a busy middlegame and prints what Jev picked, the latency, and the token count. Run this first after setting the key.

`pnpm selfplay --white choice --black random --games 3` plays full games and prints results, plies, tokens, and latency. Players are `choice`, `position`, or `random`. It paces itself to the gateway's 30 requests/minute, so a full game takes a few minutes.

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Deploy

Verified 2026-09-21. Everything below is run from this directory. The live site is https://jev-chess-engine.vercel.app (Vercel project `jev-chess-engine` in team `aaron-meeses-projects`).

### First deploy

```sh
vercel login                                                             # once per machine, opens a browser
vercel link --yes --project jev-chess-engine --scope aaron-meeses-projects
printf '%s' "$AI_GATEWAY_API_KEY" | vercel env add AI_GATEWAY_API_KEY production   # or paste the vck_ key interactively
printf 'off' | vercel env add RATE_LIMIT production                      # see "Rate limiting" below
vercel --prod --yes
```

`vercel link` writes `.vercel/project.json` (gitignored). Do not run a bare `vercel link` and accept whatever project it suggests: on 2026-09-21 it picked the existing `ajmeese7` project, and a green build would have replaced that site with this one. Always pass `--project jev-chess-engine`. Check with `cat .vercel/project.json` if in doubt.

The pnpm 12 install on Vercel fails with `ERR_PNPM_IGNORED_BUILDS` unless `esbuild` (pulled in by `tsx`) is allowed to run its build script. That is set in `pnpm-workspace.yaml` (`allowBuilds: esbuild: true`) and needs no action.

### Every later deploy

```sh
vercel --prod --yes
```

### Subdomain

```sh
vercel domains add chess.meese.dev jev-chess-engine
```

If `meese.dev` DNS is hosted on Vercel this is complete. Otherwise the command prints the record to create at the DNS host: a CNAME for `chess` pointing to `cname.vercel-dns.com`. Certificates are issued automatically once the record resolves.

### Rate limiting

`RATE_LIMIT=off` deploys without the per-IP limiter. The gateway's own cap (next section) already bounds how fast anyone can spend credits, so this is acceptable for a POC shared with a handful of people.

To turn the per-IP limiter on, the project needs an Upstash Redis database **connected to it**. Creating the database is not enough; connecting is what injects the env vars. Done 2026-09-21 as follows:

1. Create the database: `vercel integration add upstash` from this directory, or in the dashboard under **Storage**, **Create Database**, **Upstash for Redis**. **Name**: any label (`jev-chess-ratelimit` is the one in use). **Region**: `us-east-1`. **Plan**: Free.
2. Connect it to the project. The creation flow does not always ask, so run this explicitly:

   ```sh
   vercel integration-resource connect jev-chess-ratelimit jev-chess-engine --yes
   ```

   Confirm with `vercel integration list --all`: the `Projects` column must say `jev-chess-engine`, not `–`.
3. `vercel env ls` now shows `KV_REST_API_URL` and `KV_REST_API_TOKEN` (plus `KV_URL`, `REDIS_URL`, and a read-only token the app does not use). `lib/rate-limit.ts` reads the `KV_*` pair, or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` if you configured Upstash by hand.
4. `vercel env rm RATE_LIMIT production --yes` then `vercel --prod --yes`.
5. Check it: fire 40 quick requests at `/api/move` from one machine and the last few must return 429 with a `Retry-After` header.

The limit is 30 engine moves per IP per minute.

## Gateway rate limit (the real constraint)

Measured 2026-09-20: the gateway caps this key at **30 requests per minute** and 250k tokens per minute for Jev (`x-ratelimit-limit-requests: 30`). The 429 body says "upstream provider is experiencing high demand", which is misleading; it is a per-key cap. One player never notices, but the 30 moves/min are shared by everyone on the site, so expect waits above roughly 5 to 10 concurrent players.

How the app handles it: the engine makes no SDK retries (a retry would hold a serverless function open for the ~20 s `Retry-After`), the API returns 429 with `Retry-After`, and the client shows a countdown and retries on its own. The self-play harness paces itself to stay under the cap. If Vercel raises the limit for the key, bump `JEV_REQUESTS_PER_MINUTE` in `lib/engine/jev.ts`.

## Cost

Jev bills input tokens only, $0.042 per million on the gateway. At a few thousand tokens per move, $5 covers on the order of a thousand full games. The gateway ran a free launch promo through 2026-09-25.

## Layout

```
app/api/move/route.ts        POST { moves: SAN[], strategy } -> MoveDecision
components/chess-game.tsx    board, controls, engine request loop
components/thinking-panel.tsx  Jev's probability bars for the last move
lib/engine/                  position text, candidates, strategies, Jev call
lib/rate-limit.ts            Upstash sliding window per IP
scripts/smoke.mts             one-shot live check
scripts/selfplay.mts          strategy comparison harness
```
