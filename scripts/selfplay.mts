/**
 * Self-play harness for comparing strategies.
 * Usage: pnpm selfplay --white choice --black random --games 3 --max-plies 200
 */
import { parseArgs } from 'node:util';
import { Chess } from 'chess.js';
import { chooseMove } from '../lib/engine';
import { JEV_REQUESTS_PER_MINUTE, retryAfterSeconds } from '../lib/engine/jev';
import { formatMoveHistory } from '../lib/engine/position-text';
import { isStrategyId, type StrategyId } from '../lib/engine/types';
import { gameStatus } from '../lib/game';

type Player = StrategyId | 'random';

const DEFAULT_GAMES = 1;
const DEFAULT_MAX_PLIES = 200;
/** Stay just under the gateway's per-key request cap so games do not stall on 429s. */
const MIN_MS_BETWEEN_CALLS = Math.ceil((60_000 / JEV_REQUESTS_PER_MINUTE) * 1.05);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let lastCallAt = 0;

async function chooseMovePaced(moves: string[], strategy: StrategyId) {
  for (;;) {
    await sleep(Math.max(0, lastCallAt + MIN_MS_BETWEEN_CALLS - Date.now()));
    lastCallAt = Date.now();
    try {
      return await chooseMove(moves, strategy);
    } catch (error) {
      const retryAfter = retryAfterSeconds(error);
      if (retryAfter === null) throw error;
      process.stdout.write(`\r  ${(error as Error).name}, waiting ${retryAfter}s      `);
      await sleep(retryAfter * 1000);
    }
  }
}

const { values } = parseArgs({
  options: {
    white: { type: 'string', default: 'choice' },
    black: { type: 'string', default: 'random' },
    games: { type: 'string', default: String(DEFAULT_GAMES) },
    'max-plies': { type: 'string', default: String(DEFAULT_MAX_PLIES) },
  },
});

function parsePlayer(value: string): Player {
  if (value === 'random' || isStrategyId(value)) return value;
  throw new Error(`Unknown player "${value}", expected choice, position, or random`);
}

const white = parsePlayer(values.white);
const black = parsePlayer(values.black);
const games = Number(values.games);
const maxPlies = Number(values['max-plies']);

type GameStats = { result: string; plies: number; tokens: number; jevMs: number[] };

async function playGame(): Promise<GameStats> {
  const moves: string[] = [];
  let tokens = 0;
  const jevMs: number[] = [];

  while (moves.length < maxPlies) {
    const chess = new Chess();
    moves.forEach((san) => chess.move(san));
    const status = gameStatus(chess);
    if (status.over) return { result: describe(status), plies: moves.length, tokens, jevMs };

    const player = chess.turn() === 'w' ? white : black;
    if (player === 'random') {
      const legal = chess.moves();
      moves.push(legal[Math.floor(Math.random() * legal.length)]);
      continue;
    }
    const decision = await chooseMovePaced(moves, player).catch((error: unknown) => {
      console.error(`\nJev failed at ply ${moves.length + 1} after: ${formatMoveHistory(moves)}`);
      throw error;
    });
    tokens += decision.usage.inputTokens ?? 0;
    jevMs.push(decision.latencyMs);
    moves.push(decision.san);
    process.stdout.write(`\r  ply ${moves.length}: ${decision.san} (${decision.latencyMs} ms)      `);
  }
  console.log(`\n  ${formatMoveHistory(moves)}`);
  return { result: `unfinished after ${maxPlies} plies`, plies: moves.length, tokens, jevMs };
}

function describe(status: ReturnType<typeof gameStatus>): string {
  if (!status.over) return 'ongoing';
  return status.result === 'checkmate' ? `checkmate, ${status.winner} wins` : status.result;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [`${error.name}: ${error.message}`];
  const details = error as Error & { statusCode?: number; responseBody?: string; errors?: unknown[]; cause?: unknown };
  if (details.statusCode) parts.push(`status ${details.statusCode}`);
  if (details.responseBody) parts.push(`body ${String(details.responseBody).slice(0, 500)}`);
  if (details.errors) parts.push(...details.errors.map((e) => `  attempt: ${describeError(e)}`));
  if (details.cause) parts.push(`  cause: ${describeError(details.cause)}`);
  return parts.join('\n');
}

console.log(`white=${white} black=${black} games=${games} max-plies=${maxPlies}`);
try {
  for (let i = 1; i <= games; i++) {
    console.log(`game ${i}`);
    const stats = await playGame();
    const avgMs = stats.jevMs.length ? Math.round(stats.jevMs.reduce((a, b) => a + b, 0) / stats.jevMs.length) : 0;
    console.log(`\n  ${stats.result} in ${stats.plies} plies, ${stats.tokens} input tokens, avg Jev latency ${avgMs} ms`);
  }
} catch (error) {
  console.error(describeError(error));
  process.exit(1);
}
