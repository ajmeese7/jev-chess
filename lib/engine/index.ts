import { Chess } from 'chess.js';
import { listCandidates } from './candidates';
import { askJev, booleanAnswers, expectAnswer } from './jev';
import { buildChoiceRequest, decideFromChoice } from './strategies/choice';
import { buildPositionRequest, decideFromPosition } from './strategies/position';
import { buildTacticalRequest } from './strategies/tactical';
import type { Candidate, MoveDecision, StrategyId } from './types';

export class IllegalMoveError extends Error {
  constructor(san: string, ply: number) {
    super(`Illegal move "${san}" at ply ${ply + 1}`);
    this.name = 'IllegalMoveError';
  }
}

export class GameOverError extends Error {
  constructor() {
    super('The game is already over');
    this.name = 'GameOverError';
  }
}

/** Replay a SAN move list from the starting position. Throws IllegalMoveError on the first bad move. */
export function replayMoves(sans: string[]): Chess {
  const chess = new Chess();
  sans.forEach((san, ply) => {
    try {
      chess.move(san);
    } catch {
      throw new IllegalMoveError(san, ply);
    }
  });
  return chess;
}

/** Ask Jev for the next move in the game described by `sans`. */
export async function chooseMove(sans: string[], strategy: StrategyId): Promise<MoveDecision> {
  const chess = replayMoves(sans);
  if (chess.isGameOver()) throw new GameOverError();

  const candidates = listCandidates(chess);
  if (candidates.length === 1) return forcedMove(candidates[0], candidates, strategy);

  const startedAt = performance.now();
  const { winner, distribution, usage } = await runStrategy(chess, candidates, strategy);

  return {
    san: winner.san,
    lan: winner.lan,
    strategy,
    distribution,
    candidates,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

async function runStrategy(chess: Chess, candidates: Candidate[], strategy: StrategyId) {
  if (strategy === 'choice' || strategy === 'tactical') {
    const build = strategy === 'choice' ? buildChoiceRequest : buildTacticalRequest;
    const { state, questions } = build(chess, candidates);
    const result = await askJev(state, questions);
    return { ...decideFromChoice(expectAnswer(result.answers, 'bestMove', 'choice'), candidates), usage: result.usage };
  }
  const { state, questions } = buildPositionRequest(chess, candidates);
  const result = await askJev(state, questions);
  return { ...decideFromPosition(booleanAnswers(result.answers, candidates), candidates), usage: result.usage };
}

/** Only one legal move: there is no decision for Jev to make, so skip the round trip. */
function forcedMove(only: Candidate, candidates: Candidate[], strategy: StrategyId): MoveDecision {
  return {
    san: only.san,
    lan: only.lan,
    strategy,
    distribution: { [only.lan]: 1 },
    candidates,
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
  };
}
