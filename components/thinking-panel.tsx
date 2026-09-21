import type { MoveDecision } from '@/lib/engine/types';

const TOP_N = 8;

export function ThinkingPanel({ decision }: { decision: MoveDecision }) {
  const ranked = decision.candidates
    .map((c) => ({ ...c, probability: decision.distribution[c.lan] ?? 0 }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, TOP_N);
  const max = ranked[0]?.probability || 1;
  const label = decision.strategy === 'choice' ? 'P(best move)' : 'P(win after move)';

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Jev played {decision.san}</h2>
        <span className="text-xs text-zinc-500">
          {decision.latencyMs} ms · {decision.usage.inputTokens ?? '?'} tokens
        </span>
      </header>
      <p className="text-xs text-zinc-500">
        {label}, top {ranked.length} of {decision.candidates.length} legal moves
      </p>
      <ol className="flex flex-col gap-1 font-mono text-sm">
        {ranked.map((c) => (
          <li key={c.lan} className="flex items-center gap-2">
            <span className={`w-14 ${c.lan === decision.lan ? 'font-bold' : ''}`}>{c.san}</span>
            <div className="h-3 flex-1 rounded bg-zinc-200 dark:bg-zinc-800">
              <div
                className={`h-3 rounded ${c.lan === decision.lan ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                style={{ width: `${(c.probability / max) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs">{(c.probability * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
