/** Player identity singleton. See `README.md` for the design. */

export {
  getPlayerIdentityService,
  getResolvedIdentityService,
  getResolvedPlayerId,
  resolvePlayerId,
} from './identity';
export { getOrCreateLocalPlayerId } from './localId';
