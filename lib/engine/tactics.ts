import { Chess, type Color, type Move, type Square } from 'chess.js';
import { PIECE_VALUES, pieceName } from './position-text';

/**
 * Exact tactical facts computed in code so Jev does not have to simulate
 * captures in its head. All values are in pawns from the mover's point of view.
 */

export type CaptureThreat = { square: Square; piece: string; gain: number };

export type MoveFacts = {
  /** Net material from the move after the best capture sequence on its target square. Negative means the moved piece is lost for less. */
  exchange: number;
  /** The opponent's most profitable capture after this move, if any. */
  replyCapture: CaptureThreat | null;
  allowsMateIn1: boolean;
  /** The opponent has a check after which every reply allows mate in one. */
  allowsMateIn2: boolean;
  /** This move is a check after which every reply allows mate in one. */
  forcesMateIn2: boolean;
};

function opponentOf(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/**
 * Static exchange value for the side to move capturing on `square`: try the
 * least valuable legal attacker first, let the opponent respond the same way,
 * and decline when capturing loses. Never negative. Mutates and restores `chess`.
 */
export function exchangeValue(chess: Chess, square: Square): number {
  const target = chess.get(square);
  if (!target) return 0;
  const attackers = chess
    .attackers(square, chess.turn())
    .map((from) => ({ from, value: PIECE_VALUES[chess.get(from)!.type] }))
    .sort((a, b) => a.value - b.value);

  for (const attacker of attackers) {
    try {
      chess.move({ from: attacker.from, to: square, promotion: 'q' });
    } catch {
      continue; // pinned or otherwise illegal, try the next attacker
    }
    const gain = Math.max(0, PIECE_VALUES[target.type] - exchangeValue(chess, square));
    chess.undo();
    return gain;
  }
  return 0;
}

/** The opponent's best capture (by exchange value) in the position after `after`. */
export function bestCapture(after: Chess): CaptureThreat | null {
  const attacker = after.turn();
  let best: CaptureThreat | null = null;
  for (const cell of after.board().flat()) {
    if (!cell || cell.color === attacker || after.attackers(cell.square, attacker).length === 0) continue;
    const gain = exchangeValue(after, cell.square);
    if (gain > 0 && (best === null || gain > best.gain)) best = { square: cell.square, piece: pieceName(cell.type), gain };
  }
  return best;
}

export function allowsMateIn1(after: Chess): boolean {
  return after.moves().some((san) => san.endsWith('#'));
}

/** Every legal reply for the side to move leaves the opponent a mate in one. Mutates and restores `chess`. */
function everyReplyAllowsMate(chess: Chess): boolean {
  const replies = chess.moves({ verbose: true });
  return (
    replies.length > 0 &&
    replies.every((reply) => {
      chess.move(reply);
      const mated = allowsMateIn1(chess);
      chess.undo();
      return mated;
    })
  );
}

/** The side to move has a checking move that forces mate next move. Quiet mates in two are not searched. */
export function hasForcedMateIn2(chess: Chess): boolean {
  return chess
    .moves({ verbose: true })
    .filter((m) => m.san.endsWith('+'))
    .some((check) => {
      chess.move(check);
      const forced = everyReplyAllowsMate(chess);
      chess.undo();
      return forced;
    });
}

export function moveFacts(move: Move): MoveFacts {
  const after = new Chess(move.after);
  const captured = move.captured ? PIECE_VALUES[move.captured] : 0;
  const promotionBonus = move.promotion ? PIECE_VALUES[move.promotion] - PIECE_VALUES.p : 0;
  const mated = after.isCheckmate();
  const mateIn1 = !mated && allowsMateIn1(after);
  const givesCheck = move.san.endsWith('+');
  return {
    exchange: captured + promotionBonus - (mated ? 0 : exchangeValue(after, move.to)),
    replyCapture: mated ? null : bestCapture(after),
    allowsMateIn1: mateIn1,
    allowsMateIn2: !mated && !mateIn1 && hasForcedMateIn2(after),
    forcesMateIn2: givesCheck && !mateIn1 && everyReplyAllowsMate(after),
  };
}

/**
 * Pieces of the side to move that the opponent could win material on if it were
 * their turn. Empty when the mover is in check (the check is the threat).
 */
export function piecesEnPrise(chess: Chess): CaptureThreat[] {
  if (chess.isCheck()) return [];
  const flipped = new Chess(passTurn(chess.fen()));
  const attacker = flipped.turn();
  return flipped
    .board()
    .flat()
    .filter((cell): cell is NonNullable<typeof cell> => cell !== null && cell.color === opponentOf(attacker))
    .filter((cell) => flipped.attackers(cell.square, attacker).length > 0)
    .map((cell) => ({ square: cell.square, piece: pieceName(cell.type), gain: exchangeValue(flipped, cell.square) }))
    .filter((threat) => threat.gain > 0)
    .sort((a, b) => b.gain - a.gain);
}

/** FEN with the other side to move and no en passant square. */
function passTurn(fen: string): string {
  const [placement, turn, castling, , halfmove, fullmove] = fen.split(' ');
  return [placement, turn === 'w' ? 'b' : 'w', castling, '-', halfmove, fullmove].join(' ');
}

export function describeFacts(facts: MoveFacts): string {
  const parts: string[] = [];
  if (facts.exchange > 0) parts.push(`wins ${facts.exchange} in material`);
  else if (facts.exchange < 0) parts.push(`loses ${-facts.exchange} in material on the target square`);
  else parts.push('material even');
  if (facts.replyCapture) {
    parts.push(`then the opponent can take the ${facts.replyCapture.piece} on ${facts.replyCapture.square} for +${facts.replyCapture.gain}`);
  }
  if (facts.forcesMateIn2) parts.push('forces checkmate in two');
  if (facts.allowsMateIn1) parts.push('allows checkmate in one');
  if (facts.allowsMateIn2) parts.push('allows a forced checkmate in two');
  return parts.join('; ');
}

export function describeThreats(threats: CaptureThreat[]): string {
  if (threats.length === 0) return 'none';
  return threats.map((t) => `${t.piece} on ${t.square} can be taken for +${t.gain}`).join('; ');
}
