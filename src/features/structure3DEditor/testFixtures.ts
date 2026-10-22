import { useAppPersistentStore } from "app/store";
import {
  CodexId,
  DeviceClassDocument,
  documentTypes,
  EntityId,
  Structure3DNode,
} from "app/persistentState";
import { testUndoLabel } from "test/utils";
import { updateCurrentEditor } from "features/deviceClassEditor/state";
import { MOTION_LIBRARY } from "features/deviceClassEditor/export";
import { MODEL_RESOURCE_CLASS } from "./validation";

export const PAN = EntityId("pan-parameter");
export const TRACK = EntityId("track-parameter");
export const ROOT = EntityId("root-node");
export const CELL_1 = EntityId("cell-1-group");
export const CELL_2 = EntityId("cell-2-group");
export const CELL_1_RED = EntityId("cell-1-red-emitter");

/** The device class document that is open. */
export function currentEditor(): DeviceClassDocument {
  const state = useAppPersistentStore.getState();
  const document = state.documents[state.session.selectedDocumentId!];
  if (document?.type !== documentTypes.DEVICE_CLASS) {
    throw new Error("The open document is not a device class");
  }
  return document;
}

/**
 * Gives the open device class a parameter measured in degrees (pan) and one
 * measured in meters (track), both from the motion library.
 */
export function addMotionParameters() {
  updateCurrentEditor(testUndoLabel("Add parameters"), (editor) => {
    for (const [id, codexId, classId] of [
      [PAN, "pan", "motion/rotate/offset"],
      [TRACK, "track", "motion/linear/position"],
    ] as const) {
      editor.parameters[id] = {
        codexId: CodexId(codexId),
        class: {
          type: "imported",
          library: MOTION_LIBRARY,
          codexId: CodexId(classId),
        },
        access: ["write"],
        lifetime: "runtime",
        localized: {},
      };
    }
  });
}

/** Gives the open device class a resource of the given motion library class. */
export function addMotionResource(
  id: EntityId,
  classId = MODEL_RESOURCE_CLASS,
) {
  updateCurrentEditor(testUndoLabel("Add resource"), (editor) => {
    editor.resources[id] = {
      codexId: CodexId(id),
      class: {
        type: "imported",
        library: MOTION_LIBRARY,
        codexId: CodexId(classId),
      },
      access: ["read"],
      lifetime: "static",
    };
  });
}

/**
 * Gives the open device class an emitters structure with two groups: cell-1
 * (CELL_1) holding a red emitter (CELL_1_RED), and an empty cell-2 (CELL_2).
 */
export function addEmitters() {
  updateCurrentEditor(testUndoLabel("Add emitters"), (editor) => {
    editor.emittersStructure = {
      codexId: CodexId("emitters"),
      access: ["read"],
      lifetime: "static",
      emitterGroups: [CELL_1, CELL_2],
      controlGroups: [],
    };
    editor.emitterGroups[CELL_1] = {
      codexId: CodexId("cell-1"),
      emitters: [CELL_1_RED],
    };
    editor.emitterGroups[CELL_2] = { codexId: CodexId("cell-2"), emitters: [] };
    editor.emitters[CELL_1_RED] = { codexId: CodexId("red"), group: CELL_1 };
  });
}

/** Gives the open device class a structure with a single node, ROOT. */
export function addStructureWithRoot(node: Partial<Structure3DNode> = {}) {
  updateCurrentEditor(testUndoLabel("Add structure"), (editor) => {
    editor.structure3D = {
      codexId: CodexId("structure-3d"),
      access: ["read"],
      lifetime: "static",
      rootNodes: [ROOT],
    };
    editor.structure3DNodes[ROOT] = {
      codexId: CodexId("base"),
      children: [],
      transform: { type: "trs" },
      controls: [],
      localized: {},
      ...node,
    };
  });
}
