import * as V7 from "../v7/state";
import * as V8 from "./state";

// v7 -> v8: add the structure-3d structure to device class documents

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
