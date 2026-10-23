import { useMemo } from "react";
import { Draft } from "immer";
import { i18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { kebabCase } from "change-case";
import { Object3D } from "three";
import { assetStorage } from "app/assetStorage";
import { openFile } from "app/openFile";
import {
  asOneChange,
  updateAppPersistentState,
  useAppPersistentStore,
  useAppRuntimeStore,
  useAuthoringLocale,
  useLibraryStore,
} from "app/store";
import {
  CodexId,
  DeviceClassDocument,
  EntityId,
  FCUnitName,
  ParameterReference,
  Resource,
  Structure3D,
  Structure3DNode,
  Structure3DViewSettings,
} from "app/persistentState";
import { newEntityId } from "app/stateUtils";
import { getNewestVersionOfEachLibrary } from "codex/libraryStore";
import { localize } from "features/localizations/localize";
import { getUniqueItemId, serializeParameterReference } from "utils/utils";
import {
  getCurrentEditor,
  updateCurrentEditor,
  useCurrentEditorPart,
  useCurrentEditorPartShallow,
  useDeviceLibrary,
  useLibraries,
  useSourceLocale,
} from "features/deviceClassEditor/state";
import {
  MOTION_LIBRARY,
  STRUCTURE_3D_CLASS,
} from "features/deviceClassEditor/export";
import {
  removeDeviceClassLocalizations,
  setDeviceClassLocalizedValue,
} from "features/deviceClassEditor/localizationRegistry";
import {
  createNewResource,
  getFileExtension,
  modifyResource,
  updateResourceAsset,
} from "features/deviceClassEditor/resourcesEditor/state";
import { useParameters } from "features/deviceClassEditor/parametersEditor/state";
import {
  MODEL_RESOURCE_CLASS,
  parameterUnitName,
  Structure3DIssue,
  validateStructure3D,
} from "./validation";
import {
  MeshRepairSummary,
  NormalsRepairSummary,
  repairMesh,
  repairNormals,
} from "./meshRepair";
import { exportGlb, gltfObject } from "./sceneGraph";
import { parseGltfAsset } from "./useGltf";

const UNDO = {
  createStructure: msg({
    id: "deviceClassEditor.structure3D.undo.createStructure",
    message: "Create Structure 3D",
  }),
  editStructure: msg({
    id: "deviceClassEditor.structure3D.undo.editStructure",
    message: "Edit Structure 3D",
  }),
  addNode: msg({
    id: "deviceClassEditor.structure3D.undo.addNode",
    message: "Add Node",
  }),
  editNode: msg({
    id: "deviceClassEditor.structure3D.undo.editNode",
    message: "Edit Node",
  }),
  deleteNode: msg({
    id: "deviceClassEditor.structure3D.undo.deleteNode",
    message: "Delete Node",
  }),
  importModel: msg({
    id: "deviceClassEditor.structure3D.undo.importModel",
    message: "Import glTF Model",
  }),
  repairMesh: msg({
    id: "deviceClassEditor.structure3D.undo.repairMesh",
    message: "Repair Mesh",
  }),
  repairNormals: msg({
    id: "deviceClassEditor.structure3D.undo.repairNormals",
    message: "Repair Normals",
  }),
};

const GLTF_FILE_TYPE = msg({
  id: "deviceClassEditor.structure3D.gltfFileType",
  message: "glTF Model",
});

const GLB_MEDIA_TYPE = "model/gltf-binary";

const NO_NODES: Record<EntityId, Structure3DNode> = {};
const NO_RESOURCES: Record<EntityId, Resource> = {};
const NO_ISSUES: Record<EntityId, Structure3DIssue[]> = {};
const NO_VIEW_SETTINGS: Structure3DViewSettings = {};

export interface ControlParameterOption {
  ref: ParameterReference;
  // The reference as Fluxite Codex writes it, e.g. "pan" or "frame[1]"
  label: string;
  unit?: FCUnitName;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useStructure3D(): Structure3D | undefined {
  return useCurrentEditorPart((editor) => editor.structure3D);
}

export function useStructure3DNodes(): Record<EntityId, Structure3DNode> {
  return useCurrentEditorPart((editor) => editor.structure3DNodes) ?? NO_NODES;
}

export function useStructure3DNode(id: EntityId): Structure3DNode | undefined {
  return useCurrentEditorPart((editor) => editor.structure3DNodes[id]);
}

export function useStructure3DNodeFriendlyName(id: EntityId): string {
  const locale = useAuthoringLocale();
  const sourceLocale = useSourceLocale();
  return (
    useCurrentEditorPart((editor) => {
      const key = editor.structure3DNodes[id]?.localized.friendlyName;
      return key
        ? localize(editor.localizations, key, locale, sourceLocale).value
        : "";
    }) ?? ""
  );
}

export function useStructure3DSiblingCodexIds(id: EntityId): string[] {
  return (
    useCurrentEditorPartShallow((editor) =>
      nodeCodexIds(
        editor,
        (childIds(editor, editor.structure3DNodes[id]?.parent) ?? []).filter(
          (siblingId) => siblingId !== id,
        ),
      ),
    ) ?? []
  );
}

export function useResources(): Record<EntityId, Resource> {
  return useCurrentEditorPart((editor) => editor.resources) ?? NO_RESOURCES;
}

export function useControlParameterOptions(): ControlParameterOption[] {
  const parameters = useParameters();
  const libraries = useLibraries();
  const deviceLibrary = useDeviceLibrary();
  const store = useLibraryStore();

  return useMemo(() => {
    if (!parameters || !libraries || !deviceLibrary) {
      return [];
    }

    return Object.entries(parameters).flatMap(([key, parameter]) => {
      const id = EntityId(key);
      const unit = parameterUnitName(
        parameter,
        libraries,
        deviceLibrary,
        store,
      );
      const count =
        parameter.count?.type === "fixed" ? parameter.count.value : 1;
      const indices = count > 1 ? [...Array(count).keys()] : [undefined];

      return indices.map((index) => ({
        ref: index === undefined ? { id } : { id, index },
        label: serializeParameterReference({
          codexId: parameter.codexId,
          index,
        }),
        unit,
      }));
    });
  }, [parameters, libraries, deviceLibrary, store]);
}

export function useStructure3DIssues(): Record<EntityId, Structure3DIssue[]> {
  // The whole document, as the checks look across several of its tables.
  const editor = useCurrentEditorPart((editor) => editor);
  const store = useLibraryStore();
  return useMemo(
    () => (editor ? validateStructure3D(editor, store) : NO_ISSUES),
    [editor, store],
  );
}

export function useStructure3DViewSettings(): Structure3DViewSettings {
  return (
    useAppPersistentStore((state) => state.session.structure3DView) ??
    NO_VIEW_SETTINGS
  );
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function setStructure3DViewSettings(
  settings: Partial<Structure3DViewSettings>,
) {
  updateAppPersistentState((state) => {
    state.session.structure3DView = {
      ...state.session.structure3DView,
      ...settings,
    };
  });
}

export function createStructure3D() {
  const motionLibrary = getNewestVersionOfEachLibrary(
    useAppRuntimeStore.getState().libraries,
  ).find((library) => library.id === MOTION_LIBRARY);

  updateCurrentEditor(UNDO.createStructure, (editor) => {
    if (editor.structure3D) {
      return;
    }

    if (motionLibrary && !editor.libraries[MOTION_LIBRARY]) {
      editor.libraries[MOTION_LIBRARY] = motionLibrary.version;
    }

    editor.structure3D = {
      codexId: CodexId(STRUCTURE_3D_CLASS),
      access: ["read"],
      lifetime: "static",
      rootNodes: [],
    };
  });
}

export function modifyStructure3D(recipe: (draft: Draft<Structure3D>) => void) {
  updateCurrentEditor(UNDO.editStructure, (editor) => {
    if (editor.structure3D) {
      recipe(editor.structure3D);
    }
  });
}

export function addStructure3DNode(parent?: EntityId): EntityId {
  const id = newEntityId();

  updateCurrentEditor(UNDO.addNode, (editor) => {
    if (!editor.structure3D) {
      return;
    }

    const siblings = childIds(editor, parent);
    if (!siblings) {
      return;
    }

    editor.structure3DNodes[id] = {
      codexId: CodexId(getUniqueItemId(nodeCodexIds(editor, siblings), "node")),
      parent,
      children: [],
      transform: { type: "trs" },
      controls: [],
      localized: {},
    };
    siblings.push(id);
  });

  return id;
}

export function modifyStructure3DNode(
  id: EntityId,
  recipe: (draft: Draft<Structure3DNode>) => void,
) {
  updateCurrentEditor(UNDO.editNode, (editor) => {
    const node = editor.structure3DNodes[id];
    if (node) {
      recipe(node);
    }
  });
}

export function modifyStructure3DNodeLocalizedValue(
  id: EntityId,
  key: keyof Structure3DNode["localized"],
  newValue: string,
  locale: string,
) {
  updateCurrentEditor(UNDO.editNode, (editor) => {
    setDeviceClassLocalizedValue(
      editor,
      { table: "structure3DNodes", entityId: id, field: key },
      newValue,
      locale,
    );
  });
}

export async function importGltfModel(nodeId: EntityId) {
  const documentId =
    useAppPersistentStore.getState().session.selectedDocumentId;
  const file = await openFile(["glb", "gltf"], i18n._(GLTF_FILE_TYPE));
  if (file === "cancelled") {
    return;
  }

  // The desktop app reads files without a media type.
  const mediaType = file.name.toLowerCase().endsWith(".gltf")
    ? "model/gltf+json"
    : GLB_MEDIA_TYPE;
  const assetId = await assetStorage.storeAsset(
    await file.data.arrayBuffer(),
    mediaType,
    file.name,
  );

  // The user may have switched documents or removed the node while a large
  // file was stored. The orphaned asset is left for startup cleanup.
  const state = useAppPersistentStore.getState();
  const editor = getCurrentEditor(state);
  if (
    state.session.selectedDocumentId !== documentId ||
    !editor?.structure3DNodes[nodeId]
  ) {
    return;
  }

  const existingIds = Object.values(editor.resources).map(
    (resource) => resource.codexId,
  );
  const codexId = getUniqueItemId(
    existingIds,
    kebabCase(file.name.replace(/\.[^.]*$/, "")) || "model",
  );

  asOneChange(UNDO.importModel, () => {
    const resourceId = createNewResource(
      MOTION_LIBRARY,
      CodexId(MODEL_RESOURCE_CLASS),
      CodexId(codexId),
      codexId,
    );
    if (!resourceId) {
      return;
    }
    modifyResource(resourceId, (draft) => {
      draft.access = ["read"];
      draft.lifetime = "static";
      draft.mediaType = mediaType;
    });
    updateResourceAsset(resourceId, assetId);
    modifyStructure3DNode(nodeId, (draft) => {
      draft.visual = { quality: "high", resource: resourceId };
    });
  });
}

export function repairModelMesh(
  nodeId: EntityId,
): Promise<MeshRepairSummary | undefined> {
  return repairModel(nodeId, UNDO.repairMesh, repairMesh);
}

export function repairModelNormals(
  nodeId: EntityId,
): Promise<NormalsRepairSummary | undefined> {
  return repairModel(nodeId, UNDO.repairNormals, repairNormals);
}

async function repairModel<Summary extends Record<string, number>>(
  nodeId: EntityId,
  label: MessageDescriptor,
  repair: (object: Object3D) => Summary,
): Promise<Summary | undefined> {
  const state = useAppPersistentStore.getState();
  const documentId = state.session.selectedDocumentId;
  const editor = getCurrentEditor(state);
  const visual = editor?.structure3DNodes[nodeId]?.visual;
  const file = visual && editor.resources[visual.resource]?.default;
  const assetId = file && editor.resourceAssets[file];
  if (!visual || !file || !assetId) {
    return undefined;
  }

  // A fresh copy, since the one the view draws is shared.
  const gltf = await parseGltfAsset(assetId);
  const object = gltfObject(gltf, visual.nodeOrSceneName);
  const summary = object && repair(object);
  if (!summary || Object.values(summary).every((count) => count === 0)) {
    return undefined;
  }

  const originalFileName = (await assetStorage.getAsset(assetId))
    ?.originalFileName;
  const repairedAssetId = await assetStorage.storeAsset(
    await exportGlb(gltf),
    GLB_MEDIA_TYPE,
    originalFileName?.replace(
      /\.[^.]*$/,
      `.${getFileExtension(GLB_MEDIA_TYPE)}`,
    ),
  );

  // As with an import, the document may have changed meanwhile.
  const latest = useAppPersistentStore.getState();
  if (
    latest.session.selectedDocumentId !== documentId ||
    getCurrentEditor(latest)?.resources[visual.resource]?.default !== file
  ) {
    return undefined;
  }

  asOneChange(label, () => {
    modifyResource(visual.resource, (draft) => {
      draft.mediaType = GLB_MEDIA_TYPE;
    });
    updateResourceAsset(visual.resource, repairedAssetId);
  });
  return summary;
}

export function deleteStructure3DNode(id: EntityId) {
  updateCurrentEditor(UNDO.deleteNode, (editor) => {
    const node = editor.structure3DNodes[id];
    if (!node) {
      return;
    }

    const subtree = collectSubtree(editor, id);

    removeDeviceClassLocalizations(
      editor,
      subtree.map((entityId) => ({ table: "structure3DNodes", entityId })),
    );

    const siblings = childIds(editor, node.parent);
    const at = siblings?.indexOf(id) ?? -1;
    if (at >= 0) {
      siblings?.splice(at, 1);
    }

    for (const entityId of subtree) {
      delete editor.structure3DNodes[entityId];
    }
  });
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function childIds(
  editor: Pick<DeviceClassDocument, "structure3D" | "structure3DNodes">,
  parent?: EntityId,
): EntityId[] | undefined {
  return parent
    ? editor.structure3DNodes[parent]?.children
    : editor.structure3D?.rootNodes;
}

function nodeCodexIds(
  editor: Pick<DeviceClassDocument, "structure3DNodes">,
  ids: EntityId[],
) {
  return ids
    .map((id) => editor.structure3DNodes[id]?.codexId)
    .filter((codexId) => codexId !== undefined);
}

function collectSubtree(
  editor: Pick<DeviceClassDocument, "structure3DNodes">,
  id: EntityId,
): EntityId[] {
  const children = editor.structure3DNodes[id]?.children ?? [];
  return [id, ...children.flatMap((child) => collectSubtree(editor, child))];
}
