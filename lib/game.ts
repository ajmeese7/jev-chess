import { Chess } from 'chess.js';
import type { SideName } from './engine/types';

export type GameStatus =
  | { over: false }
  | { over: true; result: 'checkmate'; winner: SideName }
  | { over: true; result: 'stalemate' | 'draw' };

export function gameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) return { over: true, result: 'checkmate', winner: chess.turn() === 'w' ? 'black' : 'white' };
  if (chess.isStalemate()) return { over: true, result: 'stalemate' };
  if (chess.isDraw()) return { over: true, result: 'draw' };
  return { over: false };
}

/** Returns the SAN for a from/to move if it is legal in the position reached by `sans`, else null. Pawns promote to queen. */
export function legalSan(sans: string[], from: string, to: string): string | null {
  const chess = new Chess();
  sans.forEach((san) => chess.move(san));
  try {
    return chess.move({ from, to, promotion: 'q' }).san;
  } catch {
    return null;
  }
}

export function fenAfter(sans: string[]): string {
  const chess = new Chess();
  sans.forEach((san) => chess.move(san));
  return chess.fen();
}
