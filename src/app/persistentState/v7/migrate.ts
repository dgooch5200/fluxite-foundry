import * as V6 from "../v6/state";
import * as V7 from "./state";

// v6 -> v7: add the structure-3d and emitters structures to device class
// documents

/**
 * Migrates state from V6 to V7.
 *
 * Changes:
 * - Device class documents gain empty `structure3DNodes`, `emitterGroups` and
 *   `emitters` tables. The optional `structure3D` and `emittersStructure` are
 *   left absent.
 */
export function migrateV6toV7(
  state: V6.AppPersistentState,
): V7.AppPersistentState {
  return {
    ...state,
    documents: Object.fromEntries(
      Object.entries(state.documents).map(([id, document]) => [
        id,
        { ...document, structure3DNodes: {}, emitterGroups: {}, emitters: {} },
      ]),
    ),
  };
}
