import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { describeProgress, hasCastled, progressFacts, undevelopedPieces } from './progress';

function candidate(chess: Chess, san: string) {
  const move = chess.moves({ verbose: true }).find((m) => m.san === san);
  if (!move) throw new Error(`${san} is not legal`);
  return move;
}

function play(sans: string[]): Chess {
  const chess = new Chess();
  sans.forEach((san) => chess.move(san));
  return chess;
}

describe('progressFacts', () => {
  it('flags moving a piece straight back where it came from', () => {
    const chess = play(['e4', 'e5', 'Bc4', 'Nc6', 'Bd5', 'Nf6']);
    expect(progressFacts(chess, candidate(chess, 'Bc4')).undoesRecentMove).toBe(true);
    expect(progressFacts(chess, candidate(chess, 'Bb3')).undoesRecentMove).toBe(false);
  });

  it('counts how often the resulting position has occurred', () => {
    const chess = play(['Nf3', 'Nf6', 'Ng1', 'Ng8']);
    // Nf3 again reproduces the position after the first Nf3.
    expect(progressFacts(chess, candidate(chess, 'Nf3')).repetitions).toBe(1);
    expect(progressFacts(chess, candidate(chess, 'e4')).repetitions).toBe(0);
    expect(describeProgress(progressFacts(chess, candidate(chess, 'Nf3')))).toContain('seen once');
  });

  it('recognizes development only for a first move off the home square', () => {
    const chess = play(['e4', 'e5', 'Nf3', 'Nc6', 'Ng1', 'Nf6']);
    expect(progressFacts(chess, candidate(chess, 'Nf3')).developsPiece).toBe(false);
    expect(progressFacts(chess, candidate(chess, 'Bc4')).developsPiece).toBe(true);
    expect(progressFacts(chess, candidate(chess, 'Nc3')).developsPiece).toBe(true);
  });
});

describe('undevelopedPieces and hasCastled', () => {
  it('lists minor pieces still at home for the side to move', () => {
    const chess = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(undevelopedPieces(chess)).toEqual(['knight g8', 'bishop c8', 'bishop f8']);
  });

  it('detects castling from the history', () => {
    const chess = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']);
    expect(hasCastled(chess, 'w')).toBe(true);
    expect(hasCastled(chess, 'b')).toBe(false);
  });
});
