import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import type { Database } from '@adobe/data/ecs';
import { activeInspectorActions } from '~/core/systems/ecs';
import { isPanelOpen, setIsPanelOpen } from '../TuningPanel';
import {
  readEntities, readResources, readSystems, readArchetypes,
  getEntityPosition, getEntityName,
  type InspectorEntity, type InspectorResource, type InspectorSystem,
} from './bridge';
import { InspectorOverlay, entityColor } from './Overlay';
import { s } from './styles';

export type InspectorProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Database<any, any, any, any, any, any, any, any>;
};

export function Inspector(props: InspectorProps) {
  const [filter, setFilter] = createSignal('');
  const [sections, setSections] = createSignal<Set<string>>(new Set(['entities']));
  const [expandedEntities, setExpandedEntities] = createSignal<Set<number>>(new Set());
  const [expandedArchetypes, setExpandedArchetypes] = createSignal<Set<string>>(new Set());

  // Snapshot state from the database
  const [entities, setEntities] = createSignal<InspectorEntity[]>([]);
  const [resources, setResources] = createSignal<InspectorResource[]>([]);
  const [systems, setSystems] = createSignal<InspectorSystem[]>([]);
  const [archetypes, setArchetypes] = createSignal<Record<string, string[]>>({});

  const entityRefs = new Map<number, HTMLElement>();

  // Snapshot database state. Only update signals when data actually changed
  // to avoid replacing DOM nodes mid-click (Solid's <For> uses referential identity).
  let lastJson = '';
  const refresh = () => {
    const next = readEntities(props.db);
    const json = JSON.stringify(next.map(e => e.id + e.archetype + e.fields.map(f => f.value).join()));
    if (json !== lastJson) {
      lastJson = json;
      setEntities(next);
    }
    setResources(readResources(props.db));
    setSystems(readSystems(props.db));
    setArchetypes(readArchetypes(props.db));
  };

  let intervalId: ReturnType<typeof setInterval>;
  onMount(() => {
    refresh();
    // Poll at 2fps — enough for live updates, won't interfere with clicks
    intervalId = setInterval(() => {
      if (isPanelOpen()) refresh();
    }, 500);
  });
  onCleanup(() => clearInterval(intervalId));

  // Also refresh when panel opens
  // (using a createEffect would need solid tracking on isPanelOpen —
  //  but isPanelOpen is from core/dev which uses its own signal)

  // ── Helpers ─────────────────────────────────────────────────────

  const toggleSection = (name: string) => {
    setSections(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleEntity = (id: number) => {
    setExpandedEntities(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleArchetype = (name: string) => {
    setExpandedArchetypes(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const filteredEntities = () => {
    const f = filter().toLowerCase();
    return entities().filter(e => {
      if (!f) return true;
      return e.archetype.toLowerCase().includes(f)
        || getEntityName(e).toLowerCase().includes(f)
        || String(e.id).includes(f)
        || e.fields.some(field => field.name.toLowerCase().includes(f));
    });
  };

  const copySnapshot = () => {
    const data = props.db.toData();
    const json = JSON.stringify(data, null, 2);
    navigator.clipboard?.writeText(json);
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Show when={isPanelOpen()}>
      <InspectorOverlay
        entities={entities()}
        expandedEntities={expandedEntities()}
        entityRefs={entityRefs}
        db={props.db}
      />

      <div style={s.panel}>
        {/* Header */}
        <div style={s.header}>
          <span>Inspector</span>
          <button style={s.closeBtn} onClick={() => setIsPanelOpen(false)}>x</button>
        </div>

        {/* Dev actions registered by the active game (e.g. an auto-player bot) */}
        <Show when={activeInspectorActions().length > 0}>
          <div style={s.actionBar}>
            <For each={activeInspectorActions()}>
              {(action) => (
                <button style={s.actionBtn} onClick={() => action.run()}>
                  {action.label()}
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Search */}
        <div style={s.searchWrap}>
          <input
            type="text"
            placeholder="Filter..."
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            style={s.search}
          />
        </div>

        {/* Scrollable content */}
        <div style={s.content}>

          {/* ── Entities accordion ──────────────────────────── */}
          <div style={s.section}>
            <div style={s.accordionHeader} onClick={() => toggleSection('entities')}>
              <span style={s.chevron(sections().has('entities'))}>{'\u25B6'}</span>
              <span>Entities</span>
              <span style={s.badge}>{entities().length}</span>
            </div>
            <Show when={sections().has('entities')}>
              <Show when={filteredEntities().length > 0} fallback={<div style={s.empty}>No entities</div>}>
                <For each={filteredEntities()}>
                  {(entity) => {
                    const isOpen = () => expandedEntities().has(entity.id);
                    const color = entityColor(entity.id);
                    const name = getEntityName(entity);
                    return (
                      <div>
                        <div
                          ref={(el) => entityRefs.set(entity.id, el)}
                          style={s.entityAccordion}
                          onClick={() => toggleEntity(entity.id)}
                        >
                          <span style={s.chevronSmall(isOpen())}>{'\u25B6'}</span>
                          <div style={s.dot(color)} />
                          <span style={{ ...s.entityId, color }}>#{entity.id}</span>
                          <span style={{ 'font-size': '11px', 'font-weight': '600', color }}>{name}</span>
                          <span style={s.badge}>{entity.archetype}</span>
                        </div>
                        <Show when={isOpen()}>
                          <EntityFields entity={entity} color={color} db={props.db} onRefresh={refresh} />
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </div>

          {/* ── Archetypes accordion ────────────────────────── */}
          <div style={s.section}>
            <div style={s.accordionHeader} onClick={() => toggleSection('archetypes')}>
              <span style={s.chevron(sections().has('archetypes'))}>{'\u25B6'}</span>
              <span>Archetypes</span>
              <span style={s.badge}>{Object.keys(archetypes()).length}</span>
            </div>
            <Show when={sections().has('archetypes')}>
              <For each={Object.entries(archetypes())}>
                {([archName, components]) => {
                  const archEntities = () => entities().filter(e => e.archetype === archName);
                  return (
                    <div>
                      <div style={s.typeRow} onClick={() => toggleArchetype(archName)}>
                        <span style={s.chevronSmall(expandedArchetypes().has(archName))}>{'\u25B6'}</span>
                        <span style={s.componentName}>{archName}</span>
                        <span style={s.badge}>{archEntities().length}</span>
                      </div>
                      <Show when={expandedArchetypes().has(archName)}>
                        <div style={{ padding: '2px 12px 4px 32px', 'font-size': '10px', color: '#666' }}>
                          {components.join(', ')}
                        </div>
                        <For each={archEntities()}>
                          {(entity) => (
                            <div
                              style={s.entityRow}
                              onClick={() => { setSections(p => new Set([...p, 'entities'])); setExpandedEntities(p => new Set([...p, entity.id])); }}
                            >
                              <div style={s.dot(entityColor(entity.id))} />
                              <span style={{ ...s.entityId, color: entityColor(entity.id) }}>#{entity.id}</span>
                              <span style={{ 'font-size': '11px' }}>{getEntityName(entity)}</span>
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>

          {/* ── Resources accordion ─────────────────────────── */}
          <div style={s.section}>
            <div style={s.accordionHeader} onClick={() => toggleSection('resources')}>
              <span style={s.chevron(sections().has('resources'))}>{'\u25B6'}</span>
              <span>Resources</span>
              <span style={s.badge}>{resources().length}</span>
            </div>
            <Show when={sections().has('resources')}>
              <For each={resources()}>
                {(res) => (
                  <div style={s.fieldRow}>
                    <span style={s.fieldLabel}>{res.name}</span>
                    <span style={s.fieldValue}>{String(res.value)}</span>
                  </div>
                )}
              </For>
            </Show>
          </div>

          {/* ── Systems accordion ───────────────────────────── */}
          <div style={s.section}>
            <div style={s.accordionHeader} onClick={() => toggleSection('systems')}>
              <span style={s.chevron(sections().has('systems'))}>{'\u25B6'}</span>
              <span>Systems</span>
              <span style={s.badge}>{systems().length}</span>
            </div>
            <Show when={sections().has('systems')}>
              <Show when={systems().length > 0} fallback={<div style={s.empty}>No systems</div>}>
                <For each={systems()}>
                  {(sys) => (
                    <div style={s.systemRow}>
                      <span style={{ 'font-size': '11px', color: sys.enabled ? '#e0e0e0' : '#666' }}>
                        {sys.name}
                      </span>
                      <div style={s.dot(sys.enabled ? '#4caf50' : '#666')} />
                    </div>
                  )}
                </For>
              </Show>
            </Show>
          </div>

        </div>

        {/* Footer */}
        <div style={s.footer}>
          <span>{entities().length} entities | {systems().length} systems</span>
          <button style={s.footerBtn} onClick={copySnapshot}>Copy JSON</button>
        </div>
      </div>
    </Show>
  );
}

// ── Entity Fields (inline accordion) ────────────────────────────────

function EntityFields(props: {
  entity: InspectorEntity;
  color: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Database<any, any, any, any, any, any, any, any>;
  onRefresh: () => void;
}) {
  return (
    <div style={{ 'border-left': `2px solid ${props.color}33`, 'margin-left': '16px' }}>
      <For each={props.entity.fields}>
        {(field) => (
          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>{field.name}</span>
            <Show when={field.type === 'number'} fallback={
              <Show when={field.type === 'boolean'} fallback={
                <Show when={field.type === 'vec2'} fallback={
                  <span style={s.fieldValue}>{JSON.stringify(field.value)}</span>
                }>
                  <span style={s.fieldValue}>
                    [{(field.value as number[]).map(v => v.toFixed(0)).join(', ')}]
                  </span>
                </Show>
              }>
                <span style={{ ...s.fieldValue, color: field.value ? '#4caf50' : '#666' }}>
                  {String(field.value)}
                </span>
              </Show>
            }>
              <input
                type="number"
                value={field.value as number}
                step={0.1}
                onInput={(e) => {
                  const val = parseFloat(e.currentTarget.value);
                  if (!isNaN(val)) {
                    // In @adobe/data, mutations go through transactions.
                    // For dev inspector live-editing, we read-only display for now.
                    // TODO: wire generic update transaction
                    void val;
                  }
                }}
                style={s.input}
              />
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
