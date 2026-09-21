import type { ProgressFacts } from './progress';
import type { MoveFacts } from './tactics';

export const STRATEGY_IDS = ['choice', 'position', 'tactical', 'composite'] as const;

export type StrategyId = (typeof STRATEGY_IDS)[number];

export function isStrategyId(value: unknown): value is StrategyId {
  return typeof value === 'string' && (STRATEGY_IDS as readonly string[]).includes(value);
}

export type SideName = 'white' | 'black';

export type Candidate = {
  /** Long algebraic notation, e.g. g1f3 or e7e8q. Used as the question/option key because it is always alphanumeric. */
  lan: string;
  san: string;
  description: string;
  /** FEN after the move is played. */
  after: string;
  facts: MoveFacts;
  progress: ProgressFacts;
};

export type MoveDecision = {
  san: string;
  lan: string;
  strategy: StrategyId;
  /**
   * Probability per candidate LAN as reported by Jev.
   * For `choice` and `tactical` it is a distribution over moves (sums to ~1).
   * For `position` each value is an independent win probability for the resulting position.
   * For `composite` it is choice probability plus weighted positional score (0 to 1.5).
   */
  distribution: Record<string, number>;
  candidates: Candidate[];
  usage: { inputTokens: number | undefined; outputTokens: number | undefined };
  latencyMs: number;
};
