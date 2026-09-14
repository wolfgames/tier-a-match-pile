/**
 * Level Completion Overlay Component
 * 
 * Displays level completion celebration with:
 * - Celebration visual (image or fallback)
 * - Clue text reveal
 * - Continue button (after timer)
 * 
 * Features:
 * - Authored in design px on the 390x844 canvas — no breakpoint tiers
 * - GSAP animations (fade + scale entrance)
 * - Keyboard accessible (Enter/Space)
 * - Blocks pointer events when open
 * - Graceful fallback for missing images
 */

import { Show, onMount, onCleanup, createEffect } from 'solid-js';
import gsap from 'gsap';
import { Button } from '~/core/ui';

export interface CompletionOverlayProps {
  /** Whether overlay is visible */
  open: boolean;

  /** Clue text to display */
  clueText: string;

  /** Optional celebration image URL */
  celebrationImageUrl?: string;

  /** Whether continue button should be enabled */
  canContinue: boolean;

  /** Callback when continue button clicked */
  onContinue: () => void;
}

/**
 * Level completion overlay with celebration and clue reveal.
 * 
 * Sized once, in design px, with safe padding and max-width constraints. There are
 * deliberately no `sm:` / `md:` tiers: they fire off the REAL window, while this
 * renders inside the design transform against a fixed 390 px canvas. So on a
 * desktop the tiers fired and swapped in larger type and art for a container that
 * had not changed size, and on a phone they never fired at all. One authored value
 * per property is both simpler and what the design actually specifies.
 * See @wolfgames/components docs/standards/components.md §9.
 *
 * Uses GSAP for smooth entrance animations.
 */
export function CompletionOverlay(props: CompletionOverlayProps) {
  let overlayRef: HTMLDivElement | undefined;
  let celebrationRef: HTMLDivElement | undefined;
  let clueRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;

  // Track active timeline for cleanup
  let activeTimeline: gsap.core.Timeline | null = null;

  // Animate entrance when overlay opens
  createEffect(() => {
    if (!props.open || !overlayRef) {
      // Kill timeline if overlay closes
      if (activeTimeline) {
        activeTimeline.kill();
        activeTimeline = null;
      }
      return;
    }

    // Reset state
    gsap.set(overlayRef, { opacity: 0 });
    if (celebrationRef) {
      gsap.set(celebrationRef, { scale: 0, rotation: -180 });
    }
    if (clueRef) {
      gsap.set(clueRef, { y: 30, opacity: 0 });
    }

    // Animate in sequence
    const timeline = gsap.timeline();
    activeTimeline = timeline;

    // 1. Fade in overlay background
    timeline.to(overlayRef, {
      opacity: 1,
      duration: 0.3,
      ease: 'power2.out',
    });

    // 2. Celebration entrance (scale + rotate)
    if (celebrationRef) {
      timeline.to(
        celebrationRef,
        {
          scale: 1,
          rotation: 0,
          duration: 0.5,
          ease: 'back.out(1.7)',
        },
        '-=0.1' // Slight overlap
      );
    }

    // 3. Clue text slide up
    if (clueRef) {
      timeline.to(
        clueRef,
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
        },
        '-=0.2' // Overlap with celebration
      );
    }
  });

  // Cleanup timeline on component unmount
  onCleanup(() => {
    if (activeTimeline) {
      activeTimeline.kill();
      activeTimeline = null;
    }
  });

  // Animate continue button entrance
  createEffect(() => {
    if (!props.canContinue || !buttonRef) return;

    gsap.fromTo(
      buttonRef,
      { scale: 0.8, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.3,
        ease: 'back.out(1.7)',
      }
    );
  });

  // Keyboard accessibility
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.open) return;

    // Continue on Enter or Space (if button is ready)
    if (props.canContinue && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      props.onContinue();
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  // Focus trap: focus continue button when it appears
  createEffect(() => {
    if (props.canContinue && buttonRef) {
      buttonRef.focus();
    }
  });

  return (
    <Show when={props.open}>
      <div
        ref={overlayRef}
        /* `design-box-span` spans the frame box. `fixed inset-0` here pinned to
           the 390x844 design canvas instead — the transform makes the design root
           the containing block for fixed descendants — so the scrim stopped ~33
           real px short of each edge on a 375x667 screen and left bands.

           Render this as a SIBLING of the screen root, not a child: the utility
           offsets by the bleed measured from the design root, so nesting it inside
           another spanning root applies that offset twice and lands the layer at
           left:-33. A full-bleed layer inside a spanning root wants plain
           `absolute inset-0`. See components.md §9.5.2. */
        class="design-box-span z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        style={{ 'pointer-events': 'all' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-title"
      >
        {/* Content card - mobile-first with safe padding */}
        <div class="safe-area-inset w-full max-w-lg px-4">
          <div class="flex flex-col items-center gap-6">

            {/* Celebration visual */}
            <div ref={celebrationRef} class="flex items-center justify-center">
              <Show
                when={props.celebrationImageUrl}
                fallback={
                  // Fallback: Emoji celebration
                  <div class="w-32 h-32 flex items-center justify-center bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full shadow-2xl">
                    <span class="text-6xl" role="img" aria-label="Celebration">
                      🎉
                    </span>
                  </div>
                }
              >
                <img
                  src={props.celebrationImageUrl}
                  alt="Level complete celebration"
                  class="w-48 h-48 object-contain"
                />
              </Show>
            </div>

            {/* Clue text */}
            <div
              ref={clueRef}
              id="completion-title"
              class="text-center px-4"
            >
              <h2 class="text-2xl font-bold text-white leading-tight mb-2">
                Level Complete!
              </h2>

              <Show when={props.clueText}>
                <p class="text-lg text-gray-200 leading-relaxed max-w-md mx-auto">
                  {props.clueText}
                </p>
              </Show>
            </div>

            {/* Continue button (appears after timer) */}
            <Show when={props.canContinue}>
              <div ref={buttonRef as any}>
                <Button
                  size="lg"
                  onClick={props.onContinue}
                  class="min-w-[200px] shadow-xl"
                  aria-label="Continue to next level"
                >
                  Continue
                </Button>
              </div>
            </Show>

            {/* Loading indicator while waiting for timer */}
            <Show when={!props.canContinue}>
              <div class="flex items-center gap-2 text-gray-400 text-sm">
                <div class="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
