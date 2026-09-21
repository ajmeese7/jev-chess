import { GameOverError, IllegalMoveError, chooseMove } from '@/lib/engine';
import { JEV_REQUESTS_PER_MINUTE, JevRateLimitError, retryAfterSeconds } from '@/lib/engine/jev';
import { STRATEGY_IDS, isStrategyId, type StrategyId } from '@/lib/engine/types';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

const MAX_PLIES = 600;
const MAX_SAN_LENGTH = 10;

type MoveRequest = { moves: string[]; strategy: StrategyId };

function parseRequest(body: unknown): MoveRequest | string {
  if (typeof body !== 'object' || body === null) return 'Body must be a JSON object';
  const { moves, strategy } = body as Record<string, unknown>;
  if (!Array.isArray(moves)) return '"moves" must be an array of SAN strings';
  if (moves.length > MAX_PLIES) return `"moves" may contain at most ${MAX_PLIES} plies`;
  if (!moves.every((m) => typeof m === 'string' && m.length > 0 && m.length <= MAX_SAN_LENGTH)) {
    return 'Every entry in "moves" must be a non-empty SAN string';
  }
  if (!isStrategyId(strategy)) return `"strategy" must be one of ${STRATEGY_IDS.join(', ')}`;
  return { moves, strategy };
}

/** 429 for rate limits, 503 for transient gateway failures; the client retries both after `Retry-After`. */
function retryLater(message: string, seconds: number, status: 429 | 503 = 429) {
  return Response.json({ error: message, retryAfterSeconds: seconds }, { status, headers: { 'Retry-After': String(seconds) } });
}

export async function POST(request: Request) {
  let verdict;
  try {
    verdict = await checkRateLimit(clientIp(request));
  } catch (error) {
    // Misconfiguration (no Upstash vars and no RATE_LIMIT=off). Say so instead of a bare 500.
    console.error('[api/move] rate limiter unavailable', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: `Server misconfigured: ${message}` }, { status: 500 });
  }
  if (!verdict.allowed) return retryLater('Too many moves from your address, slow down', verdict.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be valid JSON' }, { status: 400 });
  }
  const parsed = parseRequest(body);
  if (typeof parsed === 'string') return Response.json({ error: parsed }, { status: 400 });

  try {
    const decision = await chooseMove(parsed.moves, parsed.strategy);
    return Response.json(decision);
  } catch (error) {
    if (error instanceof IllegalMoveError || error instanceof GameOverError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const seconds = retryAfterSeconds(error);
    if (seconds !== null && error instanceof JevRateLimitError) {
      return retryLater(`Jev is at its rate limit (${JEV_REQUESTS_PER_MINUTE} moves per minute, shared by everyone playing)`, seconds);
    }
    if (seconds !== null) {
      console.warn('[api/move] transient gateway failure', error);
      return retryLater('The AI Gateway hiccupped', seconds, 503);
    }
    console.error('[api/move] Jev request failed', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: `Jev could not pick a move: ${message}` }, { status: 502 });
  }
}
