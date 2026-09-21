import type { Chess } from 'chess.js';
import { describePosition } from '../position-text';
import { describeFacts, describeThreats, piecesEnPrise } from '../tactics';
import type { Candidate } from '../types';

/**
 * Strategy A plus exact tactical facts. Code computes what a text model cannot
 * (exchange values, hanging pieces, mate in one) and Jev still chooses the move.
 */
export function buildTacticalRequest(chess: Chess, candidates: Candidate[]) {
  const position = describePosition(chess);
  const side = position.sideToMove;
  const criteria = Object.fromEntries(candidates.map((c) => [c.lan, `${c.description}. ${describeFacts(c.facts)}`]));

  return {
    state: {
      task: `You are playing ${side} in a game of chess. Choose the strongest legal move for ${side}. Each option lists exact facts computed by a chess engine: material won or lost after the best capture sequence on the target square, the opponent's most profitable capture in reply, and whether the move allows checkmate in one.`,
      position: { ...position, piecesUnderAttack: describeThreats(piecesEnPrise(chess)) },
    },
    questions: {
      bestMove: {
        type: 'choice' as const,
        instructions: `Which legal move is the strongest for ${side}? Priorities in order: deliver checkmate; never allow checkmate in one; do not lose material; win material; then improve the position (develop pieces, castle early, control the center, keep the king safe, avoid repeating moves).`,
        criteria,
      },
    },
  };
}
