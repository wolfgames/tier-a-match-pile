import { useScreen } from '~/core/systems/screens';
import { Button } from '~/core/ui/Button';
import { getGameWorld } from '~/game/mygame/world';

export function ResultsScreen() {
  const { goto } = useScreen();

  // Read the final score straight from the app-scoped ECS world — the single
  // source of truth. It's final by the time this screen shows; a plain read is
  // correct (no signals clipboard). The next run resets on game-screen init.
  const score = getGameWorld().resources.score;

  const handlePlayAgain = () => {
    goto('game');
  };

  const handleMainMenu = () => {
    goto('start');
  };

  return (
    // Fully-DOM screen: `design-box-span` so it fills the frame rather than the
    // canvas, and `pointer-events-auto` to take its events back — GameShell passes
    // them through for the sake of the gameplay screen's canvas.
    <div class="design-box-span pointer-events-auto flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-black px-6">
      <h1 class="text-3xl font-bold text-white mb-2">
        Game Over
      </h1>

      <div class="text-center mb-8">
        <p class="text-white/60 text-sm mb-1">Score</p>
        <p class="text-5xl font-bold text-white">
          {score}
        </p>
      </div>

      <div class="flex gap-4">
        <Button onClick={handlePlayAgain}>
          Play Again
        </Button>
        <Button variant="secondary" onClick={handleMainMenu}>
          Main Menu
        </Button>
      </div>
    </div>
  );
}
