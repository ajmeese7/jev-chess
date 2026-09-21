/**
 * Live check against the gateway: runs both strategies on a busy middlegame
 * position and prints what Jev picked. Usage: pnpm smoke
 */
import { chooseMove } from '../lib/engine';
import { STRATEGY_IDS } from '../lib/engine/types';

// Italian Game with plenty of legal moves for White (typically 35+).
const MOVES = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+', 'Nc3', 'Nxe4', 'O-O', 'Bxc3'];

for (const strategy of STRATEGY_IDS) {
  const decision = await chooseMove(MOVES, strategy);
  const ranked = decision.candidates
    .map((c) => ({ san: c.san, p: decision.distribution[c.lan] ?? 0 }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 5)
    .map((c) => `${c.san} ${(c.p * 100).toFixed(1)}%`)
    .join(', ');
  console.log(`[${strategy}] played ${decision.san} in ${decision.latencyMs} ms, ${decision.usage.inputTokens} input tokens`);
  console.log(`  ${decision.candidates.length} legal moves; top 5: ${ranked}`);
}
