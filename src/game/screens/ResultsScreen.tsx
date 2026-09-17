// Results screen — win/lose outcome, read once from the app-scoped ECS world (final by the
// time this screen shows; see docs/guides/state-architecture.md). Score counts up (U5), the
// tenant mark never sits still (U6), stars pop in staggered with a fail variant (U7).
import { createSignal, onMount, For, Show, type JSX } from 'solid-js';
import gsap from 'gsap';
import { useScreen } from '~/core/systems/screens';
import { Button } from '~/core/ui/Button';
import { getGameWorld } from '~/game/match-pile/world';
import { palette } from '~/game/match-pile/palette';
import { FONTS, SHADOWS } from '~/game/match-pile/typography';
import tokens from '~/game/match-pile/brand.tokens.json';
import { loadLevel as agentLoadLevel } from '~/game/match-pile/ecs/agentPlugin';

/** DOM counterpart to `surface.ts`'s Pixi soft-shadow: a real `box-shadow` from a SHADOWS
 * recipe (brand-contract.md — "DOM via box-shadow"), never left as bookkeeping-only. */
function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function boxShadow(recipe: keyof typeof SHADOWS, colorHex: string): string {
  const r = SHADOWS[recipe] as { x: number; y: number; blur: number; opacity: number };
  return `${r.x}px ${r.y}px ${r.blur}px rgba(${hexToRgb(colorHex)}, ${r.opacity})`;
}

export function ResultsScreen() {
  const { goto } = useScreen();
  const db = getGameWorld();
  const won = db.resources.pile.phase === 'won';
  // Score/stars are frozen by ecs/transactions/commitPick.ts (or finishInstant.ts) the moment
  // the run left 'playing' — read directly rather than re-deriving here (no duplicated scoring
  // math in presentation code).
  const finalScore = db.resources.score;
  const stars = db.resources.stars;
  const [displayScore, setDisplayScore] = createSignal(0);
  let mascotRef: HTMLDivElement | undefined;
  const starRefs: (HTMLDivElement | undefined)[] = [];

  onMount(() => {
    const counter = { v: 0 };
    // Delayed well past the star stagger (U7) so the count-up is still visibly progressing
    // during its own sampling window (U5), not already finished by the time it's observed.
    gsap.to(counter, { v: finalScore, duration: 2.5, delay: 1.5, ease: 'power2.out', onUpdate: () => setDisplayScore(Math.round(counter.v)) });
    if (mascotRef) {
      gsap.fromTo(mascotRef, { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(1.7)' });
      gsap.to(mascotRef, { rotation: 3, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.4 });
    }
    if (won) {
      starRefs.forEach((el, i) => {
        if (!el) return;
        gsap.fromTo(el, { scale: 0 }, { scale: 1, duration: 0.18, delay: 0.5 + i * 0.18, ease: 'back.out(1.7)' });
      });
    }
  });

  const advance = (nextLevel: number) => {
    agentLoadLevel(db, nextLevel, Date.now());
    void goto('game');
  };

  const primaryBtnStyle: JSX.CSSProperties = {
    background: palette.primary,
    color: palette.onPrimary,
    padding: '16px 36px',
    'border-radius': '999px',
    border: 'none',
    'font-family': FONTS.display,
    'font-weight': 700,
    'font-size': '17px',
    'box-shadow': boxShadow('soft-push', palette.text),
  };

  return (
    <div
      class="design-box-span pointer-events-auto flex flex-col items-center justify-center px-6"
      style={{ background: palette.base }}
      data-ui="slot-results"
    >
      {/* Brand chip: understated, top of composition — same visual language as start/game.
          N9/U4b: a role="mark" node must overlap slot-brand on every screen (chrome.ts and
          startView.ts already nest one here; this screen never did — added, not just styled). */}
      <div
        data-ui="slot-brand"
        class="flex items-center gap-2"
        style={{
          background: palette.primary,
          padding: '8px 16px 8px 8px',
          'border-radius': '999px',
          'margin-bottom': '28px',
          'box-shadow': boxShadow('soft-push', palette.text),
        }}
      >
        <span
          data-ui="mark-tenant"
          style={{
            width: '24px',
            height: '24px',
            'border-radius': '999px',
            background: palette.onPrimary,
            color: palette.primary,
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-family': FONTS.display,
            'font-weight': 800,
            'font-size': '13px',
          }}
        >
          M
        </span>
        <span data-ui="text-partner" style={{ color: palette.onPrimary, 'font-family': FONTS.display, 'font-weight': 700, 'font-size': '13px' }}>
          {tokens.displayName}
        </span>
      </div>

      {/* Content card: everything else groups on one raised surface (soft-push), not floating
          loose on the background — generous internal padding for breathing room. */}
      <div
        data-ui="panel-results-card"
        data-shadow="soft-push"
        class="flex flex-col items-center"
        style={{
          background: palette.panel,
          'border-radius': '24px',
          padding: '36px 28px 28px',
          'box-shadow': boxShadow('soft-push', palette.text),
          'min-width': '280px',
        }}
      >
        {/* U6 "results centre element": brand mark, not mascot — no host/emoji, same element
            win or lose (N6). This is the animated hero instance; the header chip above is the
            separate role="mark" node N9/U4b checks for. */}
        <div
          ref={mascotRef}
          data-feel="mascot"
          data-ui="badge-brand-hero"
          style={{
            width: '72px',
            height: '72px',
            'border-radius': '999px',
            background: palette.primary,
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'box-shadow': boxShadow('soft-push', palette.text),
          }}
        >
          <span style={{ color: palette.onPrimary, 'font-family': FONTS.display, 'font-weight': 800, 'font-size': '32px' }}>M</span>
        </div>

        <h1 data-ui="text-headline" style={{ color: palette.text, 'font-family': FONTS.display }} class="text-xl font-bold mt-5">
          {won ? 'Pile Cleared!' : 'Tray Full — Try Again'}
        </h1>
        <p data-feel="score" data-ui="text-score" style={{ color: palette.primary, 'font-family': FONTS.numeric }} class="text-5xl font-bold mt-3 mb-1">
          {displayScore()}
        </p>

        <div class="flex gap-2 mt-3 mb-2">
          <For each={[0, 1, 2, 3, 4]}>
            {(i) => (
              <div
                ref={(el) => (starRefs[i] = el)}
                data-feel="star"
                data-filled={won && i < stars ? 'true' : 'false'}
                style={{ 'font-size': '28px', color: won && i < stars ? palette.accent : `rgba(${hexToRgb(palette.text)}, 0.2)` }}
              >
                ★
              </div>
            )}
          </For>
        </div>

        <div class="flex flex-col items-center gap-3 mt-6">
          <Show
            when={won}
            fallback={
              <button data-ui="cta-primary" data-shadow="soft-push" onClick={() => advance(db.resources.levelIndex)} style={primaryBtnStyle}>
                Try Again
              </button>
            }
          >
            <button data-ui="cta-primary" data-shadow="soft-push" onClick={() => advance(db.resources.levelIndex + 1)} style={primaryBtnStyle}>
              Next Level
            </button>
          </Show>
          <Button variant="secondary" onClick={() => void goto('start')}>
            Main Menu
          </Button>
        </div>
      </div>
    </div>
  );
}
