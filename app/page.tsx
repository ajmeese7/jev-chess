import { ChessGame } from '@/components/chess-game';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <header className="flex w-full max-w-5xl flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Jev Chess</h1>
        <p className="text-sm text-zinc-500">
          Every move is chosen by{' '}
          <a className="underline" href="https://vercel.com/ai-gateway/models/jev" target="_blank" rel="noreferrer">
            Jev
          </a>
          , a yes/no evaluation model with no search. chess.js only enforces the rules. Expect blunders.
        </p>
      </header>
      <ChessGame />
    </main>
  );
}
