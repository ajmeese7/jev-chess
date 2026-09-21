/**
 * Play games between two players and append results to bench/results/<label>.jsonl.
 * Usage: pnpm bench --a jev:choice --b stockfish:0@1 --games 10 [--max-plies 200] [--label baseline]
 * Colors alternate each game so both players get equal whites.
 */
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Chess } from 'chess.js';
import { formatMoveHistory } from '../lib/engine/position-text';
import { gameStatus } from '../lib/game';
import { createPlayer, type Player } from './players';

const DEFAULT_GAMES = 1;
const DEFAULT_MAX_PLIES = 200;

const { values } = parseArgs({
  options: {
    a: { type: 'string', default: 'jev:choice' },
    b: { type: 'string', default: 'stockfish:0@1' },
    games: { type: 'string', default: String(DEFAULT_GAMES) },
    'max-plies': { type: 'string', default: String(DEFAULT_MAX_PLIES) },
    label: { type: 'string', default: 'bench' },
  },
});

type Outcome = 'win' | 'draw' | 'loss' | 'unfinished';

type GameRecord = {
  label: string;
  playedAt: string;
  white: string;
  black: string;
  /** From player A's point of view. */
  outcome: Outcome;
  result: string;
  plies: number;
  aInputTokens: number;
  aAvgLatencyMs: number;
  moves: string;
};

async function playGame(white: Player, black: Player, a: Player, maxPlies: number): Promise<GameRecord> {
  const moves: string[] = [];
  let aTokens = 0;
  const aLatencies: number[] = [];

  while (moves.length < maxPlies) {
    const chess = new Chess();
    moves.forEach((san) => chess.move(san));
    if (gameStatus(chess).over) break;

    const player = chess.turn() === 'w' ? white : black;
    const { san, latencyMs, inputTokens } = await player.move(moves);
    if (player === a) {
      aTokens += inputTokens;
      aLatencies.push(latencyMs);
    }
    moves.push(san);
    process.stdout.write(`\r  ply ${moves.length}: ${san} (${player.name}, ${latencyMs} ms)      `);
  }

  const chess = new Chess();
  moves.forEach((san) => chess.move(san));
  const status = gameStatus(chess);
  const aColor = a === white ? 'white' : 'black';
  const outcome: Outcome = !status.over
    ? 'unfinished'
    : status.result !== 'checkmate'
      ? 'draw'
      : status.winner === aColor
        ? 'win'
        : 'loss';
  const result = !status.over ? `unfinished after ${maxPlies} plies` : status.result === 'checkmate' ? `${status.winner} mates` : status.result;

  return {
    label: values.label,
    playedAt: new Date().toISOString(),
    white: white.name,
    black: black.name,
    outcome,
    result,
    plies: moves.length,
    aInputTokens: aTokens,
    aAvgLatencyMs: aLatencies.length ? Math.round(aLatencies.reduce((x, y) => x + y, 0) / aLatencies.length) : 0,
    moves: formatMoveHistory(moves),
  };
}

const a = await createPlayer(values.a);
const b = await createPlayer(values.b);
const games = Number(values.games);
const maxPlies = Number(values['max-plies']);
const outFile = `bench/results/${values.label}.jsonl`;
const tally: Record<Outcome, number> = { win: 0, draw: 0, loss: 0, unfinished: 0 };

console.log(`${a.name} vs ${b.name}, ${games} games, max ${maxPlies} plies, results -> ${outFile}`);
for (let i = 0; i < games; i++) {
  const aIsWhite = i % 2 === 0;
  const record = await playGame(aIsWhite ? a : b, aIsWhite ? b : a, a, maxPlies);
  tally[record.outcome] += 1;
  appendFileSync(outFile, JSON.stringify(record) + '\n');
  console.log(`\ngame ${i + 1}: ${a.name} as ${aIsWhite ? 'white' : 'black'}: ${record.outcome} (${record.result}, ${record.plies} plies, ${record.aInputTokens} tokens, ${record.aAvgLatencyMs} ms avg)`);
}
console.log(`\n${a.name} vs ${b.name}: ${tally.win}W ${tally.draw}D ${tally.loss}L ${tally.unfinished}U over ${games} games`);
process.exit(0);
