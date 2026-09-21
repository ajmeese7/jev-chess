import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type Engine = {
  sendCommand: (command: string) => void;
  listener?: (line: string) => void;
};

/** Minimal UCI driver for the stockfish npm package (WASM, lite single-threaded build). */
export class Stockfish {
  private constructor(private readonly engine: Engine) {}

  static async create(): Promise<Stockfish> {
    const init = require('stockfish') as (flavor: string) => Promise<Engine>;
    // The WASM loader sets the global `fetch` to null when it runs under Node, which breaks our gateway client.
    const fetch = globalThis.fetch;
    const stockfish = new Stockfish(await init('lite-single'));
    globalThis.fetch = fetch;
    await stockfish.command('uci', 'uciok');
    await stockfish.command('isready', 'readyok');
    return stockfish;
  }

  /** 0 (weakest) to 20. */
  async setSkill(level: number): Promise<void> {
    this.engine.sendCommand(`setoption name Skill Level value ${level}`);
    await this.command('isready', 'readyok');
  }

  /** Best move in UCI form (e2e4, e7e8q) for a FEN, searched to a fixed depth. */
  async bestMove(fen: string, depth: number): Promise<string> {
    this.engine.sendCommand(`position fen ${fen}`);
    const line = await this.command(`go depth ${depth}`, 'bestmove');
    return line.split(' ')[1];
  }

  /** Send a command and resolve with the first output line starting with `until`. */
  private command(command: string, until: string): Promise<string> {
    return new Promise((resolve) => {
      this.engine.listener = (line) => {
        if (line.startsWith(until)) {
          this.engine.listener = undefined;
          resolve(line);
        }
      };
      this.engine.sendCommand(command);
    });
  }
}
