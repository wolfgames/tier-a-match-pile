/**
 * Bridge between @adobe/data Database and the Inspector UI.
 *
 * The Inspector needs a flat view of entities, their component values,
 * archetype membership, and system info. This bridge reads the Database
 * and presents it in a format the Inspector can render.
 */
import type { Database } from '@adobe/data/ecs';
import { Entity } from '@adobe/data/ecs';

/** A component field with name, value, and type info */
export type FieldInfo = {
  name: string;
  value: unknown;
  type: 'number' | 'boolean' | 'string' | 'vec2' | 'vec3' | 'array' | 'unknown';
};

/** An entity as seen by the Inspector */
export type InspectorEntity = {
  id: number;
  archetype: string;
  fields: FieldInfo[];
};

/** System info for the Inspector */
export type InspectorSystem = {
  name: string;
  enabled: boolean;
};

/** Resource info for the Inspector */
export type InspectorResource = {
  name: string;
  value: unknown;
  type: string;
};

/**
 * Read all entities from a Database for Inspector display.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readEntities(db: Database<any, any, any, any, any, any, any, any>): InspectorEntity[] {
  const entities: InspectorEntity[] = [];

  // Get all archetypes from the database
  const archetypeNames = Object.keys(db.archetypes);

  for (const archName of archetypeNames) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arch = (db.archetypes as any)[archName];
    if (!arch) continue;

    // Get component names for this archetype
    const componentNames: string[] = [...(arch.components ?? [])];

    // Select all entities in this archetype
    const entityIds = db.select(componentNames);

    for (const entityId of entityIds) {
      const data = db.read(entityId);
      if (!data) continue;

      const fields: FieldInfo[] = [];
      for (const compName of componentNames) {
        const value = (data as Record<string, unknown>)[compName];
        fields.push({
          name: compName,
          value,
          type: inferType(value),
        });
      }

      entities.push({
        id: entityId as number,
        archetype: archName,
        fields,
      });
    }
  }

  return entities;
}

/**
 * Read all resources from a Database.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readResources(db: Database<any, any, any, any, any, any, any, any>): InspectorResource[] {
  const resources: InspectorResource[] = [];
  const res = db.resources;
  if (res && typeof res === 'object') {
    for (const [name, value] of Object.entries(res)) {
      resources.push({ name, value, type: typeof value });
    }
  }
  return resources;
}

/**
 * Read system info from a Database.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readSystems(db: Database<any, any, any, any, any, any, any, any>): InspectorSystem[] {
  const systems: InspectorSystem[] = [];
  if (db.system?.functions) {
    for (const [name, fn] of Object.entries(db.system.functions)) {
      systems.push({ name, enabled: fn !== null });
    }
  }
  return systems;
}

/**
 * Get all archetype names and their component lists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readArchetypes(db: Database<any, any, any, any, any, any, any, any>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [name, arch] of Object.entries(db.archetypes)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result[name] = [...((arch as any).components ?? [])];
  }
  return result;
}

/**
 * Read an entity's position directly from the database (live, no caching).
 * Used by the Overlay to get up-to-date positions every frame.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readEntityPosition(db: Database<any, any, any, any, any, any, any, any>, entityId: number): [number, number] | null {
  const data = db.read(entityId as unknown as Entity);
  if (!data) return null;
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.position) && rec.position.length >= 2) {
    return [rec.position[0] as number, rec.position[1] as number];
  }
  if (typeof rec.x === 'number' && typeof rec.y === 'number') {
    return [rec.x, rec.y];
  }
  return null;
}

/**
 * Get the position of an entity if it has a position-like component.
 */
export function getEntityPosition(entity: InspectorEntity): [number, number] | null {
  const posField = entity.fields.find(f => f.name === 'position');
  if (posField && Array.isArray(posField.value) && posField.value.length >= 2) {
    return [posField.value[0], posField.value[1]];
  }
  // Fallback: look for x/y fields
  const x = entity.fields.find(f => f.name === 'x');
  const y = entity.fields.find(f => f.name === 'y');
  if (x && y && typeof x.value === 'number' && typeof y.value === 'number') {
    return [x.value, y.value];
  }
  return null;
}

/**
 * Get a display name for an entity.
 */
export function getEntityName(entity: InspectorEntity): string {
  const keyField = entity.fields.find(f => f.name === 'spriteKey' || f.name === 'key' || f.name === 'name');
  if (keyField && typeof keyField.value === 'string' && keyField.value) {
    return keyField.value;
  }
  return entity.archetype;
}

function inferType(value: unknown): FieldInfo['type'] {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) {
    if (value.length === 2) return 'vec2';
    if (value.length === 3) return 'vec3';
    return 'array';
  }
  return 'unknown';
}
