import type { Chess } from 'chess.js';
import { describePosition } from '../position-text';
import { describeProgress, hasCastled, undevelopedPieces } from '../progress';
import { describeFacts, describeThreats, piecesEnPrise } from '../tactics';
import type { Candidate } from '../types';

/**
 * Strategy A plus exact facts. Code computes what a text model cannot
 * (exchange values, hanging pieces, mate in one, repetition, development)
 * and Jev still chooses the move.
 */
export function buildTacticalRequest(chess: Chess, candidates: Candidate[]) {
  const position = describePosition(chess);
  const side = position.sideToMove;
  const criteria = Object.fromEntries(
    candidates.map((c) => [c.lan, [c.description, describeFacts(c.facts), describeProgress(c.progress)].filter(Boolean).join('. ')]),
  );
  const halfmoveClock = Number(chess.fen().split(' ')[4]);

  return {
    state: {
      task: `You are playing ${side} in a game of chess. Choose the strongest legal move for ${side}. Each option lists exact facts computed by a chess engine: material won or lost after the best capture sequence on the target square, the opponent's most profitable capture in reply, whether the move forces or allows checkmate within two moves, and whether it undoes a recent move, repeats a position, or develops a piece.`,
      position: {
        ...position,
        piecesUnderAttack: describeThreats(piecesEnPrise(chess)),
        undevelopedPieces: undevelopedPieces(chess),
        castled: hasCastled(chess, chess.turn()),
        pliesSinceCaptureOrPawnMove: halfmoveClock,
      },
    },
    questions: {
      bestMove: {
        type: 'choice' as const,
        instructions: `Which legal move is the strongest for ${side}? Priorities in order: deliver checkmate or force it in two; never allow checkmate in one or two; do not lose material; win material; then make progress: develop an undeveloped piece, castle, gain space with a pawn, or create a threat. Never shuffle a piece back and forth and do not repeat positions unless you are losing.`,
        criteria,
      },
    },
  };
}
