import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import type { SideName } from './types';

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PIECE_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export type PiecePlacement = { square: Square; type: PieceSymbol; color: Color };

export type PositionDescription = {
  sideToMove: SideName;
  moveNumber: number;
  board: string;
  fen: string;
  pieces: Record<SideName, string[]>;
  material: Record<SideName, number>;
  inCheck: boolean;
  moveHistory: string;
};

export function sideName(color: Color): SideName {
  return color === 'w' ? 'white' : 'black';
}

export function pieceName(type: PieceSymbol): string {
  return PIECE_NAMES[type];
}

export function listPlacements(chess: Chess): PiecePlacement[] {
  return chess
    .board()
    .flat()
    .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
    .map((cell) => ({ square: cell.square, type: cell.type, color: cell.color }));
}

function byPieceOrder(a: PiecePlacement, b: PiecePlacement): number {
  return PIECE_ORDER.indexOf(a.type) - PIECE_ORDER.indexOf(b.type) || a.square.localeCompare(b.square);
}

/** Human-readable piece list per side, kings first: ["king e1", "queen d1", ...]. */
export function describePieces(placements: PiecePlacement[]): Record<SideName, string[]> {
  const sorted = [...placements].sort(byPieceOrder);
  const label = (p: PiecePlacement) => `${PIECE_NAMES[p.type]} ${p.square}`;
  return {
    white: sorted.filter((p) => p.color === 'w').map(label),
    black: sorted.filter((p) => p.color === 'b').map(label),
  };
}

/** Total material in pawn units per side (king excluded). */
export function materialCount(placements: PiecePlacement[]): Record<SideName, number> {
  const sum = (color: Color) =>
    placements.filter((p) => p.color === color).reduce((total, p) => total + PIECE_VALUES[p.type], 0);
  return { white: sum('w'), black: sum('b') };
}

/** Numbered SAN history: "1. e4 e5 2. Nf3". Empty string for the starting position. */
export function formatMoveHistory(sans: string[]): string {
  return sans
    .map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san))
    .join(' ');
}

export function describePosition(chess: Chess): PositionDescription {
  const placements = listPlacements(chess);
  return {
    sideToMove: sideName(chess.turn()),
    moveNumber: chess.moveNumber(),
    board: chess.ascii(),
    fen: chess.fen(),
    pieces: describePieces(placements),
    material: materialCount(placements),
    inCheck: chess.isCheck(),
    moveHistory: formatMoveHistory(chess.history()),
  };
}
