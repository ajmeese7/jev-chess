'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard, type PieceDropHandlerArgs } from 'react-chessboard';
import { STRATEGY_IDS, type MoveDecision, type SideName, type StrategyId } from '@/lib/engine/types';
import { formatMoveHistory } from '@/lib/engine/position-text';
import { gameStatus, legalSan } from '@/lib/game';
import { ThinkingPanel } from './thinking-panel';

const STRATEGY_LABELS: Record<StrategyId, string> = {
  choice: 'A: choose among legal moves',
  position: 'B: evaluate each resulting position',
};

type EngineState = {
  pending: boolean;
  error: string | null;
  /** Seconds until the client retries after a 429 or 503. */
  retryIn: number | null;
  lastDecision: MoveDecision | null;
};

const IDLE_ENGINE: EngineState = { pending: false, error: null, retryIn: null, lastDecision: null };

class RetryLaterError extends Error {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(message);
  }
}

async function requestMove(moves: string[], strategy: StrategyId): Promise<MoveDecision> {
  const response = await fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moves, strategy }),
  });
  const body = await response.json();
  if (response.status === 429 || response.status === 503) {
    throw new RetryLaterError(body.error, Number(body.retryAfterSeconds) || 1);
  }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body as MoveDecision;
}

export function ChessGame() {
  const [moves, setMoves] = useState<string[]>([]);
  const [humanColor, setHumanColor] = useState<SideName>('white');
  const [strategy, setStrategy] = useState<StrategyId>('choice');
  const [engine, setEngine] = useState<EngineState>(IDLE_ENGINE);
  const [attempt, setAttempt] = useState(0);
  const requestedPly = useRef<number | null>(null);

  const chess = useMemo(() => {
    const c = new Chess();
    moves.forEach((san) => c.move(san));
    return c;
  }, [moves]);
  const status = gameStatus(chess);
  const sideToMove: SideName = chess.turn() === 'w' ? 'white' : 'black';
  const isHumanTurn = sideToMove === humanColor && !status.over;

  useEffect(() => {
    if (status.over || sideToMove === humanColor || requestedPly.current === moves.length) return;
    requestedPly.current = moves.length;
    setEngine((prev) => ({ ...prev, pending: true, error: null, retryIn: null }));

    requestMove(moves, strategy)
      .then((decision) => {
        setMoves((prev) => (prev.length === moves.length ? [...prev, decision.san] : prev));
        setEngine({ pending: false, error: null, retryIn: null, lastDecision: decision });
      })
      .catch((error: Error) => {
        requestedPly.current = null;
        const retryIn = error instanceof RetryLaterError ? error.retryAfterSeconds : null;
        setEngine((prev) => ({ ...prev, pending: false, error: error.message, retryIn }));
      });
  }, [moves, humanColor, strategy, sideToMove, status.over, attempt]);

  // Count down after a 429, then re-run the request effect.
  useEffect(() => {
    if (engine.retryIn === null) return;
    const remaining = engine.retryIn;
    const timer = setTimeout(() => {
      if (remaining > 1) {
        setEngine((prev) => ({ ...prev, retryIn: remaining - 1 }));
        return;
      }
      setEngine((prev) => ({ ...prev, retryIn: null, error: null }));
      setAttempt((n) => n + 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [engine.retryIn]);

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!isHumanTurn || engine.pending || !targetSquare) return false;
    const san = legalSan(moves, sourceSquare, targetSquare);
    if (!san) return false;
    setMoves((prev) => [...prev, san]);
    return true;
  }

  function newGame(color: SideName) {
    requestedPly.current = null;
    setHumanColor(color);
    setMoves([]);
    setEngine(IDLE_ENGINE);
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6 md:flex-row">
      <div className="w-full self-start md:w-[480px]">
        <Chessboard
          options={{
            position: chess.fen(),
            boardOrientation: humanColor,
            allowDragging: isHumanTurn && !engine.pending,
            onPieceDrop,
          }}
        />
      </div>

      <aside className="flex flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded border px-3 py-1 text-sm" onClick={() => newGame('white')}>
            New game as White
          </button>
          <button className="rounded border px-3 py-1 text-sm" onClick={() => newGame('black')}>
            New game as Black
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Jev strategy (applies to the next move)</span>
          <select
            className="rounded border bg-transparent px-2 py-1"
            value={strategy}
            onChange={(event) => setStrategy(event.target.value as StrategyId)}
          >
            {STRATEGY_IDS.map((id) => (
              <option key={id} value={id}>
                {STRATEGY_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        <p className="text-sm font-medium">{statusText(status, engine, isHumanTurn)}</p>
        {engine.error && (
          <p className="rounded border border-red-400 bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {engine.error}
            {engine.retryIn !== null ? ` Retrying in ${engine.retryIn}s.` : ''}
            {engine.retryIn === null && !status.over && (
              <button className="ml-2 underline" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            )}
          </p>
        )}

        {engine.lastDecision && <ThinkingPanel decision={engine.lastDecision} />}

        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Moves</h2>
          <p className="font-mono text-sm leading-6 break-words">{formatMoveHistory(moves) || 'No moves yet'}</p>
        </section>
      </aside>
    </div>
  );
}

function statusText(status: ReturnType<typeof gameStatus>, engine: EngineState, isHumanTurn: boolean): string {
  if (status.over) {
    if (status.result === 'checkmate') return `Checkmate. ${status.winner === 'white' ? 'White' : 'Black'} wins.`;
    return status.result === 'stalemate' ? 'Stalemate.' : 'Draw.';
  }
  if (engine.pending) return 'Jev is thinking...';
  return isHumanTurn ? 'Your move' : 'Waiting for Jev';
}
