import type { Chess, Color, Move, PieceSymbol, Square } from 'chess.js';
import { pieceName } from './position-text';

/**
 * Facts about whether a move makes progress, computed from the game history.
 * Jev has no memory between calls, so without these it happily shuffles one
 * piece back and forth while the opponent builds an attack.
 */

export type ProgressFacts = {
  /** The piece returns to the square it left on one of the mover's last two moves. */
  undoesRecentMove: boolean;
  /** How many times the resulting position has already occurred in the game (3 is a draw claim). */
  repetitions: number;
  /** A knight or bishop leaves its starting square for the first time. */
  developsPiece: boolean;
};

const HOME_SQUARES: Record<Color, Partial<Record<PieceSymbol, Square[]>>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'] },
};

const RECENT_OWN_MOVES = 2;

/** FEN without the move counters, for repetition comparison. */
function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function progressFacts(chess: Chess, move: Move): ProgressFacts {
  const history = chess.history({ verbose: true });
  const ownMoves = history.filter((m) => m.color === move.color).slice(-RECENT_OWN_MOVES);
  const afterKey = positionKey(move.after);
  const seen = history.filter((m) => positionKey(m.after) === afterKey).length;
  const home = HOME_SQUARES[move.color][move.piece] ?? [];

  return {
    undoesRecentMove: ownMoves.some((m) => m.piece === move.piece && m.from === move.to && m.to === move.from),
    repetitions: seen,
    developsPiece: home.includes(move.from) && !history.some((m) => m.color === move.color && m.from === move.from),
  };
}

/** Knights and bishops of the side to move still on their starting squares. */
export function undevelopedPieces(chess: Chess): string[] {
  const color = chess.turn();
  return Object.entries(HOME_SQUARES[color]).flatMap(([type, squares]) =>
    squares
      .filter((square) => chess.get(square)?.type === type && chess.get(square)?.color === color)
      .map((square) => `${pieceName(type as PieceSymbol)} ${square}`),
  );
}

export function hasCastled(chess: Chess, color: Color): boolean {
  return chess.history({ verbose: true }).some((m) => m.color === color && (m.isKingsideCastle() || m.isQueensideCastle()));
}

export function describeProgress(facts: ProgressFacts): string {
  const parts: string[] = [];
  if (facts.undoesRecentMove) parts.push('undoes your own recent move');
  if (facts.repetitions >= 2) parts.push(`repeats a position already seen ${facts.repetitions} times (draw by repetition)`);
  else if (facts.repetitions === 1) parts.push('repeats a position already seen once');
  if (facts.developsPiece) parts.push('develops a piece');
  return parts.join('; ');
}
