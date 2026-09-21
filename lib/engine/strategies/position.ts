import { Chess } from 'chess.js';
import { describePieces, describePosition, listPlacements, sideName } from '../position-text';
import type { Candidate, SideName } from '../types';
import { argmax } from './choice';

/**
 * Strategy B: play every legal move, show Jev each resulting position, and ask
 * one boolean per candidate: "will the mover win from here?". All candidates go
 * in a single call (one shared state, N questions). We play the max.
 */
export function buildPositionRequest(chess: Chess, candidates: Candidate[]) {
  const position = describePosition(chess);
  const side = position.sideToMove;

  return {
    state: {
      task: `${capitalize(side)} is choosing a move. Each candidate below shows the position that results from playing it.`,
      position,
      candidates: candidates.map((c) => ({ move: c.lan, ...describeResultingPosition(c, side) })),
    },
    questions: Object.fromEntries(
      candidates.map((c) => [
        c.lan,
        {
          type: 'boolean' as const,
          instructions: `After ${side} plays ${c.san} (candidate "${c.lan}"), will ${side} go on to win this game with reasonable play from both sides?`,
          criteria: {
            true: `${capitalize(side)} is winning or clearly better after ${c.san}.`,
            false: `${capitalize(side)} is equal, worse, or losing after ${c.san}.`,
          },
        },
      ]),
    ),
  };
}

function describeResultingPosition(candidate: Candidate, mover: SideName) {
  const after = new Chess(candidate.after);
  const placements = listPlacements(after);
  const pieces = describePieces(placements);
  const opponent = sideName(after.turn());
  return {
    description: candidate.description,
    piecesAfter: pieces,
    [`${opponent}InCheck`]: after.isCheck(),
    isCheckmate: after.isCheckmate(),
    isStalemate: after.isStalemate(),
    isDraw: after.isDraw(),
    mover,
  };
}

export type BooleanAnswers = Record<string, { probability: number }>;

export function decideFromPosition(answers: BooleanAnswers, candidates: Candidate[]) {
  const distribution = Object.fromEntries(candidates.map((c) => [c.lan, answers[c.lan]?.probability ?? 0]));
  return { winner: argmax(distribution, candidates), distribution };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
