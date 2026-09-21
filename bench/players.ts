import { Chess } from 'chess.js';
import { chooseMove } from '../lib/engine';
import { JEV_REQUESTS_PER_MINUTE, retryAfterSeconds } from '../lib/engine/jev';
import { isStrategyId } from '../lib/engine/types';
import { Stockfish } from './stockfish';

export type PlayerMove = { san: string; latencyMs: number; inputTokens: number };

export type Player = {
  name: string;
  move: (sans: string[]) => Promise<PlayerMove>;
};

/** Stay just under the gateway's per-key request cap so games do not stall on 429s. */
const MIN_MS_BETWEEN_JEV_CALLS = Math.ceil((60_000 / JEV_REQUESTS_PER_MINUTE) * 1.05);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let lastJevCallAt = 0;

function replay(sans: string[]): Chess {
  const chess = new Chess();
  sans.forEach((san) => chess.move(san));
  return chess;
}

export function jevPlayer(strategy: string): Player {
  if (!isStrategyId(strategy)) throw new Error(`Unknown Jev strategy "${strategy}"`);
  return {
    name: `jev:${strategy}`,
    async move(sans) {
      for (;;) {
        await sleep(Math.max(0, lastJevCallAt + MIN_MS_BETWEEN_JEV_CALLS - Date.now()));
        lastJevCallAt = Date.now();
        try {
          const decision = await chooseMove(sans, strategy);
          return { san: decision.san, latencyMs: decision.latencyMs, inputTokens: decision.usage.inputTokens ?? 0 };
        } catch (error) {
          const wait = retryAfterSeconds(error);
          if (wait === null) throw error;
          process.stdout.write(`\r  ${(error as Error).name}, waiting ${wait}s      `);
          await sleep(wait * 1000);
        }
      }
    },
  };
}

export async function stockfishPlayer(skill: number, depth: number): Promise<Player> {
  const engine = await Stockfish.create();
  await engine.setSkill(skill);
  return {
    name: `stockfish:${skill}@${depth}`,
    async move(sans) {
      const chess = replay(sans);
      const startedAt = performance.now();
      const uci = await engine.bestMove(chess.fen(), depth);
      const san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
      return { san, latencyMs: Math.round(performance.now() - startedAt), inputTokens: 0 };
    },
  };
}

export function randomPlayer(): Player {
  return {
    name: 'random',
    async move(sans) {
      const legal = replay(sans).moves();
      return { san: legal[Math.floor(Math.random() * legal.length)], latencyMs: 0, inputTokens: 0 };
    },
  };
}

/** Player spec: jev:<strategy> | stockfish:<skill>@<depth> | random */
export async function createPlayer(spec: string): Promise<Player> {
  if (spec === 'random') return randomPlayer();
  const [kind, rest] = spec.split(':');
  if (kind === 'jev' && rest) return jevPlayer(rest);
  if (kind === 'stockfish' && rest) {
    const [skill, depth] = rest.split('@').map(Number);
    if (Number.isInteger(skill) && Number.isInteger(depth)) return stockfishPlayer(skill, depth);
  }
  throw new Error(`Unknown player "${spec}", expected jev:<choice|position>, stockfish:<skill>@<depth>, or random`);
}
