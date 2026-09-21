import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const MOVES_PER_WINDOW = 30;
const WINDOW = '1 m';

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

let limiter: Ratelimit | null | undefined;

function createLimiter(): Ratelimit | null {
  if (process.env.RATE_LIMIT === 'off') {
    console.warn('[rate-limit] RATE_LIMIT=off, every request is allowed');
    return null;
  }
  // The Vercel Marketplace Upstash integration uses the KV_* names; a direct Upstash setup uses UPSTASH_*.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Rate limiting is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or RATE_LIMIT=off to deploy without it',
      );
    }
    console.warn('[rate-limit] Upstash env vars not set, rate limiting disabled for local development');
    return null;
  }
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(MOVES_PER_WINDOW, WINDOW),
    prefix: 'jev-chess',
  });
}

export async function checkRateLimit(identifier: string): Promise<RateLimitVerdict> {
  if (limiter === undefined) limiter = createLimiter();
  if (limiter === null) return { allowed: true };

  const { success, reset } = await limiter.limit(identifier);
  if (success) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
