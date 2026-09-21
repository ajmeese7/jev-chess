import { describe, expect, it } from 'vitest';
import { IllegalMoveError, chooseMove, replayMoves } from './index';

describe('replayMoves', () => {
  it('replays a legal line', () => {
    expect(replayMoves(['e4', 'e5']).fen()).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  });

  it('reports the offending ply on an illegal move', () => {
    expect(() => replayMoves(['e4', 'e4'])).toThrow(new IllegalMoveError('e4', 1));
  });
});

describe('chooseMove', () => {
  it('rejects a finished game before contacting Jev', async () => {
    await expect(chooseMove(['f3', 'e5', 'g4', 'Qh4#'], 'choice')).rejects.toThrow('The game is already over');
  });

  it('plays a forced move without contacting Jev', async () => {
    const decision = await chooseMove(['e4', 'f5', 'Qh5+'], 'position');
    expect(decision.san).toBe('g6');
    expect(decision.latencyMs).toBe(0);
    expect(decision.distribution).toEqual({ g7g6: 1 });
  });
});
