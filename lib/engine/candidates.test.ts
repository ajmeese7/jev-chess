import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { findCandidate, listCandidates } from './candidates';

describe('listCandidates', () => {
  it('returns 20 legal moves keyed by LAN in the starting position', () => {
    const candidates = listCandidates(new Chess());
    expect(candidates).toHaveLength(20);
    expect(findCandidate(candidates, 'g1f3')?.description).toBe('Nf3: knight from g1 to f3');
    expect(candidates.every((c) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(c.lan))).toBe(true);
  });

  it('describes captures, checks, and mate', () => {
    const chess = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const candidates = listCandidates(chess);
    expect(findCandidate(candidates, 'h5f7')?.description).toBe(
      'Qxf7#: queen from h5 to f7, captures black pawn, delivers checkmate',
    );
    expect(findCandidate(candidates, 'c4f7')?.description).toBe(
      'Bxf7+: bishop from c4 to f7, captures black pawn, gives check',
    );
  });

  it('describes castling and promotion', () => {
    const castling = listCandidates(new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
    expect(findCandidate(castling, 'e1g1')?.description).toBe('O-O: castles kingside');
    expect(findCandidate(castling, 'e1c1')?.description).toBe('O-O-O: castles queenside');

    const promotion = listCandidates(new Chess('8/P6k/8/8/8/8/8/4K3 w - - 0 1'));
    expect(findCandidate(promotion, 'a7a8q')?.description).toBe('a8=Q: pawn from a7 to a8, promotes to queen');
  });
});
