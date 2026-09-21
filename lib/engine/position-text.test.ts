import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { describePieces, describePosition, formatMoveHistory, listPlacements, materialCount } from './position-text';

describe('formatMoveHistory', () => {
  it('returns empty string for no moves', () => {
    expect(formatMoveHistory([])).toBe('');
  });

  it('numbers white moves and appends black replies', () => {
    expect(formatMoveHistory(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
  });
});

describe('materialCount', () => {
  it('counts 39 per side in the starting position', () => {
    expect(materialCount(listPlacements(new Chess()))).toEqual({ white: 39, black: 39 });
  });

  it('excludes kings and reflects missing pieces', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    expect(materialCount(listPlacements(chess))).toEqual({ white: 9, black: 0 });
  });
});

describe('describePieces', () => {
  it('lists kings first and drops empty squares', () => {
    const pieces = describePieces(listPlacements(new Chess('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')));
    expect(pieces).toEqual({ white: ['king e1', 'pawn e2'], black: ['king e8'] });
  });
});

describe('describePosition', () => {
  it('reports side to move, check, and history', () => {
    const chess = new Chess();
    ['e4', 'f5', 'Qh5+'].forEach((san) => chess.move(san));
    const position = describePosition(chess);
    expect(position.sideToMove).toBe('black');
    expect(position.inCheck).toBe(true);
    expect(position.moveHistory).toBe('1. e4 f5 2. Qh5+');
    expect(position.moveNumber).toBe(2);
    expect(position.board).toContain('+------------------------+');
  });
});
