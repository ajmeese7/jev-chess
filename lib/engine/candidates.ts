import type { Chess, Move } from 'chess.js';
import { pieceName, sideName } from './position-text';
import type { Candidate } from './types';

export function describeMove(move: Move): string {
  if (move.isKingsideCastle()) return `${move.san}: castles kingside`;
  if (move.isQueensideCastle()) return `${move.san}: castles queenside`;

  const parts = [`${move.san}: ${pieceName(move.piece)} from ${move.from} to ${move.to}`];
  if (move.captured) parts.push(`captures ${sideName(move.color === 'w' ? 'b' : 'w')} ${pieceName(move.captured)}`);
  if (move.isEnPassant()) parts.push('en passant');
  if (move.promotion) parts.push(`promotes to ${pieceName(move.promotion)}`);
  if (move.san.endsWith('#')) parts.push('delivers checkmate');
  else if (move.san.endsWith('+')) parts.push('gives check');
  return parts.join(', ');
}

export function listCandidates(chess: Chess): Candidate[] {
  return chess.moves({ verbose: true }).map((move) => ({
    lan: move.lan,
    san: move.san,
    description: describeMove(move),
    after: move.after,
  }));
}

export function findCandidate(candidates: Candidate[], lan: string): Candidate | undefined {
  return candidates.find((candidate) => candidate.lan === lan);
}
