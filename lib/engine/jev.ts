import type { Candidate } from './types';

/**
 * Direct client for the AI Gateway evaluation endpoint. The AI SDK's `experimental_evaluate`
 * rejects valid Jev responses ("did not select a highest-probability option") because it checks the
 * argmax with a 1e-6 tolerance while the gateway rounds probabilities to 0.01, so we skip it.
 */
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';

export const JEV_MODEL_ID = 'typesafe-ai/jev';

/** Measured 2026-09-20 from x-ratelimit-limit-requests on a 429; the cap is per key, shared by every player. */
export const JEV_REQUESTS_PER_MINUTE = 30;

/** Steady-state latency is under 3 s; a stalled request once took 60 s, which is unplayable. */
const JEV_TIMEOUT_MS = 20_000;

/** Used when the gateway's 429 has no Retry-After header. */
const DEFAULT_RETRY_AFTER_SECONDS = 5;

/** Gateway 5xx responses (seen: 503 "Service temporarily unavailable") clear quickly. */
const SERVER_ERROR_RETRY_SECONDS = 3;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JevState = string | JsonValue[] | { [key: string]: JsonValue };

export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'boolean'; instructions: string; criteria?: { true?: string; false?: string } };

export type JevAnswer =
  | { type: 'choice'; choice: string; probabilities?: Record<string, number> }
  | { type: 'score'; score: number; probabilities?: Record<string, number> }
  | { type: 'boolean'; probability: number };

export type JevUsage = { inputTokens: number | undefined; outputTokens: number | undefined };

export type JevResult = { answers: Record<string, JevAnswer>; usage: JevUsage };

export class JevRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Jev is rate limited, retry after ${retryAfterSeconds}s`);
    this.name = 'JevRateLimitError';
  }
}

export class JevRequestError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Gateway returned ${status}: ${body.slice(0, 300)}`);
    this.name = 'JevRequestError';
  }

  get isRetryable(): boolean {
    return this.status >= 500;
  }
}

function apiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error('AI_GATEWAY_API_KEY is not set');
  return key;
}

/** One round trip to Jev. No retries: a 429 carries a ~20 s Retry-After, and callers surface the wait instead. */
export async function askJev(state: JevState, questions: Record<string, JevQuestion>): Promise<JevResult> {
  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: JEV_MODEL_ID, state, questions }),
    signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
  });

  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'));
    throw new JevRateLimitError(Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_AFTER_SECONDS);
  }
  if (!response.ok) throw new JevRequestError(response.status, await response.text());

  const body = (await response.json()) as { answers?: unknown; usage?: { inputTokens?: number; outputTokens?: number } };
  if (typeof body.answers !== 'object' || body.answers === null) {
    throw new JevRequestError(response.status, 'response has no answers object');
  }
  return {
    answers: body.answers as Record<string, JevAnswer>,
    usage: { inputTokens: body.usage?.inputTokens, outputTokens: body.usage?.outputTokens },
  };
}

/** Seconds to wait before retrying if `error` is transient (rate limit or gateway 5xx), otherwise null. */
export function retryAfterSeconds(error: unknown): number | null {
  if (error instanceof JevRateLimitError) return error.retryAfterSeconds;
  if (error instanceof JevRequestError && error.isRetryable) return SERVER_ERROR_RETRY_SECONDS;
  return null;
}

/** Pull the answer for `id` and check it has the expected shape; the gateway is a system boundary. */
export function expectAnswer<T extends JevAnswer['type']>(
  answers: Record<string, JevAnswer>,
  id: string,
  type: T,
): Extract<JevAnswer, { type: T }> {
  const answer = answers[id];
  if (!answer || answer.type !== type) throw new JevRequestError(200, `answer "${id}" is missing or not a ${type}`);
  return answer as Extract<JevAnswer, { type: T }>;
}

export function booleanAnswers(answers: Record<string, JevAnswer>, candidates: Candidate[]) {
  return Object.fromEntries(candidates.map((c) => [c.lan, expectAnswer(answers, c.lan, 'boolean')]));
}
