import type { Chess } from 'chess.js';
import { describePosition } from '../position-text';
import type { Candidate } from '../types';

/**
 * Strategy A: one `choice` question whose options are the legal moves.
 * Jev returns a normalized distribution over moves; we play the argmax.
 */
export function buildChoiceRequest(chess: Chess, candidates: Candidate[]) {
  const position = describePosition(chess);
  const side = position.sideToMove;
  const criteria = Object.fromEntries(candidates.map((c) => [c.lan, c.description]));

  return {
    state: {
      task: `You are playing ${side} in a game of chess. Choose the strongest legal move for ${side}.`,
      position,
    },
    questions: {
      bestMove: {
        type: 'choice' as const,
        instructions: `Which legal move is the strongest for ${side} in this position? Weigh material, king safety, piece activity, and immediate tactics (captures, checks, threats, and what the opponent can capture in reply).`,
        criteria,
      },
    },
  };
}

export type ChoiceAnswer = { choice: string; probabilities?: Record<string, number> };

export function decideFromChoice(answer: ChoiceAnswer, candidates: Candidate[]) {
  const distribution = normalizeDistribution(answer.probabilities ?? { [answer.choice]: 1 }, candidates);
  const winner = candidates.find((c) => c.lan === answer.choice) ?? argmax(distribution, candidates);
  return { winner, distribution };
}

function normalizeDistribution(probabilities: Record<string, number>, candidates: Candidate[]) {
  return Object.fromEntries(candidates.map((c) => [c.lan, probabilities[c.lan] ?? 0]));
}

export function argmax(distribution: Record<string, number>, candidates: Candidate[]): Candidate {
  return candidates.reduce((best, c) => (distribution[c.lan] > distribution[best.lan] ? c : best), candidates[0]);
}
