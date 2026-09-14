import { For, createSignal, createEffect, onCleanup } from 'solid-js';
import type { Database } from '@adobe/data/ecs';
import { readEntityPosition, type InspectorEntity } from './bridge';

/** Colors assigned to entities for visual identification */
const ENTITY_COLORS = [
  '#4caf50', '#2196f3', '#ff9800', '#e91e63',
  '#9c27b0', '#00bcd4', '#ffeb3b', '#ff5722',
  '#8bc34a', '#3f51b5', '#f44336', '#009688',
];

export function entityColor(id: number): string {
  return ENTITY_COLORS[id % ENTITY_COLORS.length];
}

export type OverlayProps = {
  entities: InspectorEntity[];
  expandedEntities: Set<number>;
  entityRefs: Map<number, HTMLElement>;
  canvasRef?: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Database<any, any, any, any, any, any, any, any>;
};

type Line = {
  id: number;
  rowX: number;
  rowTop: number;
  rowBottom: number;
  entityX: number;
  entityY: number;
  color: string;
};

export function InspectorOverlay(props: OverlayProps) {
  const [lines, setLines] = createSignal<Line[]>([]);

  const computeLines = () => {
    const result: Line[] = [];

    // Find the game viewport container
    const ref = props.canvasRef
      ?? document.querySelector('canvas')
      ?? document.querySelector('.fixed.inset-0 > .relative.overflow-hidden')
      ?? document.getElementById('app');

    const refRect = ref
      ? ref.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth - 320, height: window.innerHeight };

    for (const numId of props.expandedEntities) {
      const entity = props.entities.find(e => e.id === numId);
      if (!entity) continue;

      const pos = readEntityPosition(props.db, numId);
      if (!pos) continue;

      const entityScreenX = refRect.left + pos[0];
      const entityScreenY = refRect.top + pos[1];

      const rowEl = props.entityRefs.get(numId);
      if (!rowEl) continue;

      const rowRect = rowEl.getBoundingClientRect();
      const rowX = rowRect.left;
      const rowTop = rowRect.top;
      const rowBottom = rowRect.bottom;

      result.push({
        id: numId,
        rowX,
        rowTop,
        rowBottom,
        entityX: entityScreenX,
        entityY: entityScreenY,
        color: entityColor(numId),
      });
    }

    setLines(result);
  };

  let rafId: number;
  const tick = () => {
    computeLines();
    rafId = requestAnimationFrame(tick);
  };

  createEffect(() => {
    if (props.expandedEntities.size > 0) {
      rafId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafId);
      setLines([]);
    }
  });

  onCleanup(() => cancelAnimationFrame(rafId));

  return (
    <svg
      style={{
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        'pointer-events': 'none',
        'z-index': '99998',
      }}
    >
      <For each={lines()}>
        {(line) => {
          const dx = Math.abs(line.rowX - line.entityX);
          const cp = Math.max(dx * 0.55, 80);

          // Top curve: leaves accordion top-left horizontally, arrives at entity
          // Bottom curve: returns from entity to accordion bottom-left horizontally
          const d = () =>
            `M ${line.rowX},${line.rowTop}` +
            ` C ${line.rowX - cp},${line.rowTop} ${line.entityX + cp * 0.3},${line.entityY} ${line.entityX},${line.entityY}` +
            ` C ${line.entityX + cp * 0.3},${line.entityY} ${line.rowX - cp},${line.rowBottom} ${line.rowX},${line.rowBottom}` +
            ` Z`;

          return (
            <>
              <path
                d={d()}
                fill={line.color}
                fill-opacity="0.08"
                stroke={line.color}
                stroke-width="1"
                stroke-opacity="0.5"
              />
              <circle
                cx={line.entityX}
                cy={line.entityY}
                r="6"
                fill="none"
                stroke={line.color}
                stroke-width="1.5"
                opacity="0.9"
              />
              <circle
                cx={line.entityX}
                cy={line.entityY}
                r="2"
                fill={line.color}
                opacity="0.9"
              />
              <text
                x={line.entityX + 10}
                y={line.entityY - 8}
                fill={line.color}
                font-size="10"
                font-family="ui-monospace, monospace"
                opacity="0.8"
              >
                #{line.id}
              </text>
            </>
          );
        }}
      </For>
    </svg>
  );
}
