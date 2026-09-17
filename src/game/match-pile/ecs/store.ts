// what_in: nothing.
// what_out: `GameStore` — the type every transaction file imports for its `store` parameter,
//           built directly from the resources schema (not from plugin.ts) to avoid a circular
//           type reference (plugin.ts → transactions → GameStore → plugin.ts).
import type { Store } from '~/core/systems/ecs';
import type { FromSchemas } from '@adobe/data/schema';
import { resources } from './resources';

export type GameStore = Store<{}, FromSchemas<typeof resources>>;
