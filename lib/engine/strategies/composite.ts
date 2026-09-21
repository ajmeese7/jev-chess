import type { Chess } from 'chess.js';
import type { JevAnswer, JevQuestion } from '../jev';
import type { Candidate } from '../types';
import { argmax } from './choice';
import { buildTacticalRequest } from './tactical';

/**
 * Strategy D: the tactical choice question plus one positional score per
 * candidate, combined with a weight we control. TypeSafe's composite scoring
 * pattern: narrow questions, weights in code.
 */

/** Weight of the positional score (0 to 1) against the choice probability (0 to 1). */
export const POSITIONAL_WEIGHT = 0.5;

export const POSITIONAL_RUNGS = [
  'worsens the position (exposes the king, misplaces a piece, weakens pawns)',
  'no real change',
  'small improvement (slightly better square or more space)',
  'clear improvement (develops with tempo, castles, seizes the center, opens lines toward the enemy king, creates a threat)',
] as const;

const MAX_RUNG = POSITIONAL_RUNGS.length - 1;

export function scoreKey(lan: string): string {
  return `positional_${lan}`;
}

export function buildCompositeRequest(chess: Chess, candidates: Candidate[]) {
  const tactical = buildTacticalRequest(chess, candidates);
  const side = tactical.state.position.sideToMove;
  const scoreQuestions = Object.fromEntries(
    candidates.map((c) => [
      scoreKey(c.lan),
      {
        type: 'score' as const,
        instructions: `Ignoring material (already accounted for), how much does ${c.san} (option "${c.lan}") improve ${side}'s position?`,
        criteria: [...POSITIONAL_RUNGS],
      },
    ]),
  );

  const questions: Record<string, JevQuestion> = { ...tactical.questions, ...scoreQuestions };
  return {
    state: {
      ...tactical.state,
      candidates: Object.entries(tactical.questions.bestMove.criteria).map(([lan, text]) => ({ option: lan, facts: text })),
    },
    questions,
  };
}

export function decideFromComposite(answers: Record<string, JevAnswer>, candidates: Candidate[]) {
  const choice = answers.bestMove;
  const probabilities = choice?.type === 'choice' ? (choice.probabilities ?? { [choice.choice]: 1 }) : {};
  const distribution = Object.fromEntries(
    candidates.map((c) => {
      const score = answers[scoreKey(c.lan)];
      const positional = score?.type === 'score' ? score.score / MAX_RUNG : 0;
      return [c.lan, (probabilities[c.lan] ?? 0) + POSITIONAL_WEIGHT * positional];
    }),
  );
  return { winner: argmax(distribution, candidates), distribution };
}
