import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  CodexId,
  EntityId,
  Structure3DControl,
  Structure3DNode,
} from "app/persistentState";
import { testUndoLabel } from "test/utils";
import { updateCurrentEditor } from "features/deviceClassEditor/state";
import {
  MOTION_LIBRARY,
  STRUCTURE_3D_CLASS,
} from "features/deviceClassEditor/export";
import { MODEL_RESOURCE_CLASS } from "./validation";

export const PAN = EntityId("pan-parameter");
export const TRACK = EntityId("track-parameter");
export const ROOT = EntityId("root-node");
export const MODEL = EntityId("model-resource");

/** pan is measured in degrees, track in meters. */
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

export function control(
  type: Structure3DControl["type"],
  target: Structure3DControl["target"],
): Structure3DControl {
  return { type, axis: "x", target };
}

export function makeNode(
  fields: Partial<Structure3DNode> = {},
): Structure3DNode {
  return {
    codexId: CodexId("node"),
    children: [],
    transform: { type: "trs" },
    controls: [],
    localized: {},
    ...fields,
  };
}

export function makeGeometry(positions: number[][], index?: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(positions.flat(), 3),
  );
  if (index) geometry.setIndex(index);
  return geometry;
}

export function addStructureWithRoot(node: Partial<Structure3DNode> = {}) {
  updateCurrentEditor(testUndoLabel("Add structure"), (editor) => {
    editor.structure3D = {
      codexId: CodexId(STRUCTURE_3D_CLASS),
      access: ["read"],
      lifetime: "static",
      rootNodes: [ROOT],
    };
    editor.structure3DNodes[ROOT] = makeNode({
      codexId: CodexId("base"),
      ...node,
    });
  });
}

export function showModelAtRoot(assetId: string, nodeOrSceneName: string) {
  addMotionResource(MODEL);
  updateCurrentEditor(testUndoLabel("Show the model"), (editor) => {
    editor.resources[MODEL].mediaType = "model/gltf-binary";
    editor.resources[MODEL].default = "model.glb";
    editor.resourceAssets["model.glb"] = assetId;
    editor.structure3DNodes[ROOT].visual = {
      quality: "high",
      resource: MODEL,
      nodeOrSceneName,
    };
  });
}
