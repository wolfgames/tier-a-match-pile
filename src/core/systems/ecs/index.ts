// Core @adobe/data ECS
export { Database, Store, Entity } from '@adobe/data/ecs';
export type { SystemFunction, SystemDeclaration } from '@adobe/data/ecs';

// Math types for component schemas
export { Vec2, Vec3, Vec4, F32, U32, I32 } from '@adobe/data/math';

// Observables
export { Observe } from '@adobe/data/observe';

// Inspector bridge — games set/clear the active database + dev actions
export {
  activeDb,
  setActiveDb,
  activeInspectorActions,
  setActiveInspectorActions,
  type InspectorAction,
} from './DbBridge';
