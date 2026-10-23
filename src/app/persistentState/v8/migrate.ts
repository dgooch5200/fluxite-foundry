import * as V7 from "../v7/state";
import * as V8 from "./state";

// v7 -> v8: add the structure-3d structure to device class documents

/**
 * Migrates state from V7 to V8.
 *
 * Changes:
 * - Device class documents gain an empty `structure3DNodes` table. The
 *   optional `structure3D` is left absent.
 */
export function migrateV7toV8(
  state: V7.AppPersistentState,
): V8.AppPersistentState {
  return {
    ...state,
    documents: Object.fromEntries(
      Object.entries(state.documents).map(([id, document]) => [
        id,
        { ...document, structure3DNodes: {} },
      ]),
    ),
  };
}
