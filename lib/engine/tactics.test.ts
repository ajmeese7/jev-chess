import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { allowsMateIn1, bestCapture, describeFacts, exchangeValue, moveFacts, piecesEnPrise } from './tactics';

function moveNamed(chess: Chess, san: string) {
  const move = chess.moves({ verbose: true }).find((m) => m.san === san);
  if (!move) throw new Error(`${san} is not legal`);
  return move;
}

describe('exchangeValue', () => {
  it('is zero when nothing can be captured on the square', () => {
    expect(exchangeValue(new Chess(), 'e4')).toBe(0);
  });

  it('wins a hanging pawn outright', () => {
    // White knight on f3 can take an undefended pawn on e5.
    const chess = new Chess('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1');
    expect(exchangeValue(chess, 'e5')).toBe(1);
  });

  it('declines a losing capture', () => {
    // Pawn on e5 defended by a pawn on d6; taking with the knight loses 3 for 1.
    const chess = new Chess('4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1');
    expect(exchangeValue(chess, 'e5')).toBe(0);
  });

  it('uses the least valuable attacker first', () => {
    // Pawn on d4 and queen on e2 both attack e5, defended by a pawn. Pawn takes first, pawn recaptures, queen takes: net +1.
    const chess = new Chess('4k3/8/3p4/4p3/3P4/8/4Q3/4K3 w - - 0 1');
    expect(exchangeValue(chess, 'e5')).toBe(1);
  });
});

describe('moveFacts', () => {
  it('flags a queen that can be taken for free', () => {
    const chess = new Chess();
    ['e4', 'e5', 'Qh5', 'Nc6', 'Qxe5+'].forEach((san) => chess.move(san));
    // Black to move; Qxe5+ just captured a pawn defended by the knight: the queen hangs.
    const facts = moveFacts(moveNamed(new Chess('r1bqkbnr/pppp1ppp/2n5/4Q3/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3'), 'Nxe5'));
    expect(facts.exchange).toBe(9);
    expect(describeFacts(facts)).toContain('wins 9');
  });

  it('reports the exchange loss of moving a piece where it is captured', () => {
    // 1. e4 e5 2. Qh5 Nc6 3. Qxe5+ for White: captures a pawn but the knight recaptures the queen.
    const chess = new Chess('r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3');
    const facts = moveFacts(moveNamed(chess, 'Qxe5+'));
    expect(facts.exchange).toBe(1 - 9);
    expect(describeFacts(facts)).toContain('loses 8');
  });

  it('detects a move that allows mate in one', () => {
    // After 1. f3 e5 2. g4, Black has Qh4#.
    const chess = new Chess('rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2');
    expect(moveFacts(moveNamed(chess, 'g4')).allowsMateIn1).toBe(true);
    expect(moveFacts(moveNamed(chess, 'e4')).allowsMateIn1).toBe(false);
  });

  it('does not report the reply capture as a mate threat when the move itself mates', () => {
    const chess = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const facts = moveFacts(moveNamed(chess, 'Qxf7#'));
    expect(facts.allowsMateIn1).toBe(false);
    expect(facts.replyCapture).toBeNull();
  });
});

describe('bestCapture and piecesEnPrise', () => {
  it('finds the most valuable hanging piece for the side to move', () => {
    // White to move; black queen on d5 and pawn on a7 both undefended, knight on c3 attacks d5.
    const chess = new Chess('4k3/p7/8/3q4/8/2N5/8/R3K3 w - - 0 1');
    expect(bestCapture(chess)).toEqual({ square: 'd5', piece: 'queen', gain: 9 });
  });

  it('lists the pieces of the side to move the opponent could win if it were their turn', () => {
    // White to move; White's queen on d5 is attacked by the black knight on c3 and undefended.
    const chess = new Chess('4k3/8/8/3Q4/8/2n5/8/4K3 w - - 0 1');
    expect(piecesEnPrise(chess)).toEqual([{ square: 'd5', piece: 'queen', gain: 9 }]);
  });

  it('is empty in the starting position and when in check', () => {
    expect(piecesEnPrise(new Chess())).toEqual([]);
    const inCheck = new Chess('rnbqkbnr/pppp1ppp/8/4p3/7P/8/PPPPPPP1/RNBQKBNR b KQkq - 0 2');
    inCheck.move('Qh4');
    inCheck.move('Rh3');
    expect(allowsMateIn1(inCheck)).toBe(false);
  });
});
