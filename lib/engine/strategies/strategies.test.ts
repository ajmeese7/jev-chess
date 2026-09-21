import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { listCandidates } from '../candidates';
import { buildChoiceRequest, decideFromChoice } from './choice';
import { buildPositionRequest, decideFromPosition } from './position';

const chess = new Chess();
const candidates = listCandidates(chess);

describe('choice strategy', () => {
  it('builds one choice question with every legal move as an option', () => {
    const { questions, state } = buildChoiceRequest(chess, candidates);
    expect(Object.keys(questions.bestMove.criteria)).toHaveLength(20);
    expect(questions.bestMove.criteria.e2e4).toBe('e4: pawn from e2 to e4');
    expect(state.position.sideToMove).toBe('white');
  });

  it('plays the returned choice and zero-fills missing probabilities', () => {
    const { winner, distribution } = decideFromChoice(
      { choice: 'e2e4', probabilities: { e2e4: 0.6, d2d4: 0.4 } },
      candidates,
    );
    expect(winner.san).toBe('e4');
    expect(distribution.d2d4).toBe(0.4);
    expect(distribution.g1f3).toBe(0);
    expect(Object.keys(distribution)).toHaveLength(20);
  });

  it('falls back to argmax when the choice is not a legal move', () => {
    const { winner } = decideFromChoice({ choice: 'zz', probabilities: { g1f3: 0.9, e2e4: 0.1 } }, candidates);
    expect(winner.san).toBe('Nf3');
  });
});

describe('position strategy', () => {
  it('builds one boolean question per candidate with the resulting position in state', () => {
    const { questions, state } = buildPositionRequest(chess, candidates);
    expect(Object.keys(questions)).toHaveLength(20);
    expect(questions.e2e4.type).toBe('boolean');
    expect(state.candidates.find((c) => c.move === 'e2e4')?.piecesAfter.white).toContain('pawn e4');
  });

  it('flags checkmate in the resulting position', () => {
    const mateIn1 = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const { state } = buildPositionRequest(mateIn1, listCandidates(mateIn1));
    expect(state.candidates.find((c) => c.move === 'h5f7')?.isCheckmate).toBe(true);
  });

  it('plays the candidate with the highest win probability', () => {
    const { winner, distribution } = decideFromPosition({ e2e4: { probability: 0.7 }, d2d4: { probability: 0.9 } }, candidates);
    expect(winner.san).toBe('d4');
    expect(distribution.g1f3).toBe(0);
  });
});
