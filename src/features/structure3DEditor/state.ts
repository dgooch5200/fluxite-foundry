import { useMemo } from "react";
import { Draft } from "immer";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { kebabCase } from "change-case";
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
import { MOTION_LIBRARY } from "features/deviceClassEditor/export";
import {
  removeDeviceClassLocalizations,
  setDeviceClassLocalizedValue,
} from "features/deviceClassEditor/localizationRegistry";
import {
  createNewResource,
  modifyResource,
  updateResourceAsset,
} from "features/deviceClassEditor/resourcesEditor/state";
import {
  MODEL_RESOURCE_CLASS,
  parameterUnitName,
  Structure3DIssue,
  validateStructure3D,
} from "./validation";

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
};

const GLTF_FILE_TYPE = msg({
  id: "deviceClassEditor.structure3D.gltfFileType",
  message: "glTF Model",
});

const NO_NODES: Record<EntityId, Structure3DNode> = {};
const NO_RESOURCES: Record<EntityId, Resource> = {};
const NO_ISSUES: Record<EntityId, Structure3DIssue[]> = {};

/** A parameter, or one element of an array parameter, that can drive a control. */
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

/** The node's friendly name in the authoring locale, or "" if it has none. */
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

/** The codexIds of the node's siblings, not including its own. */
export function useStructure3DSiblingCodexIds(id: EntityId): string[] {
  return (
    useCurrentEditorPartShallow((editor) =>
      siblingIds(editor, id)
        .filter((siblingId) => siblingId !== id)
        .map((siblingId) => editor.structure3DNodes[siblingId]?.codexId)
        .filter((codexId) => codexId !== undefined),
    ) ?? []
  );
}

export function useResources(): Record<EntityId, Resource> {
  return useCurrentEditorPart((editor) => editor.resources) ?? NO_RESOURCES;
}

export function useControlParameterOptions(): ControlParameterOption[] {
  const parameters = useCurrentEditorPart((editor) => editor.parameters);
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

/** The issues of each node of the structure that has any. */
export function useStructure3DIssues(): Record<EntityId, Structure3DIssue[]> {
  // The whole document, as the checks look across several of its tables.
  const editor = useCurrentEditorPart((editor) => editor);
  const store = useLibraryStore();
  return useMemo(
    () => (editor ? validateStructure3D(editor, store) : NO_ISSUES),
    [editor, store],
  );
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Gives the device class a 3D structure, importing the motion library that
 * defines it if the device class doesn't already.
 */
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
      codexId: CodexId("structure-3d"),
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

/**
 * Adds a node under the given parent, or at the top of the structure if there
 * is none. Returns the new node's ID.
 */
export function addStructure3DNode(parent?: EntityId): EntityId {
  const id = newEntityId();

  updateCurrentEditor(UNDO.addNode, (editor) => {
    if (!editor.structure3D) {
      return;
    }

    const siblings = parent
      ? editor.structure3DNodes[parent]?.children
      : editor.structure3D.rootNodes;
    if (!siblings) {
      return;
    }

    editor.structure3DNodes[id] = {
      codexId: CodexId(
        getUniqueItemId(
          siblings
            .map((sibling) => editor.structure3DNodes[sibling]?.codexId)
            .filter((codexId) => codexId !== undefined),
          "node",
        ),
      ),
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

/**
 * Asks for a glTF file and shows it at the node, as a new 3d-model resource
 * named after the file. Does nothing if the user cancels.
 */
export async function importGltfModel(nodeId: EntityId) {
  const documentId =
    useAppPersistentStore.getState().session.selectedDocumentId;
  const file = await openFile(["glb", "gltf"], i18n._(GLTF_FILE_TYPE));
  if (file === "cancelled") {
    return;
  }

  // The desktop app reads files without a media type, so it comes from the
  // extension.
  const mediaType = file.name.toLowerCase().endsWith(".gltf")
    ? "model/gltf+json"
    : "model/gltf-binary";
  const assetId = await assetStorage.storeAsset(
    await file.data.arrayBuffer(),
    mediaType,
    file.name,
  );

  // Reading and storing a large file takes a while, and the user may have
  // switched documents or removed the node meanwhile. The stored asset is left
  // for startup cleanup.
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

/** Deletes a node along with everything beneath it. */
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

    if (node.parent) {
      const parent = editor.structure3DNodes[node.parent];
      if (parent) {
        parent.children = parent.children.filter((child) => child !== id);
      }
    } else if (editor.structure3D) {
      editor.structure3D.rootNodes = editor.structure3D.rootNodes.filter(
        (root) => root !== id,
      );
    }

    for (const entityId of subtree) {
      delete editor.structure3DNodes[entityId];
    }
  });
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function siblingIds(
  editor: Pick<DeviceClassDocument, "structure3D" | "structure3DNodes">,
  id: EntityId,
): EntityId[] {
  const parent = editor.structure3DNodes[id]?.parent;
  return (
    (parent
      ? editor.structure3DNodes[parent]?.children
      : editor.structure3D?.rootNodes) ?? []
  );
}

function collectSubtree(
  editor: Pick<DeviceClassDocument, "structure3DNodes">,
  id: EntityId,
): EntityId[] {
  const children = editor.structure3DNodes[id]?.children ?? [];
  return [id, ...children.flatMap((child) => collectSubtree(editor, child))];
}

const NO_VIEW_SETTINGS: Structure3DViewSettings = {};

/** How the 3D view was last set up. Fields never changed are absent. */
export function useStructure3DViewSettings(): Structure3DViewSettings {
  return (
    useAppPersistentStore((state) => state.session.structure3DView) ??
    NO_VIEW_SETTINGS
  );
}

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
