import { useMemo } from "react";
import { Draft } from "immer";
import { msg } from "@lingui/core/macro";
import { useAppRuntimeStore } from "app/store";
import {
  CodexId,
  DeviceClassDocument,
  Emitter,
  EmitterGroup,
  EmitterReference,
  EmittersStructure,
  EntityId,
} from "app/persistentState";
import { newEntityId } from "app/stateUtils";
import { getNewestVersionOfEachLibrary } from "codex/libraryStore";
import { getUniqueItemId } from "utils/utils";
import {
  updateCurrentEditor,
  useCurrentEditorPart,
} from "features/deviceClassEditor/state";
import {
  EMITTERS_CLASS,
  INTENSITY_COLOR_LIBRARY,
} from "features/deviceClassEditor/export";
import {
  codexIdAsEntityId,
  entityIdAsCodexId,
} from "features/deviceClassEditor/referenceResolution";

const UNDO = {
  createStructure: msg({
    id: "deviceClassEditor.emitters.undo.createStructure",
    message: "Create Emitters",
  }),
  editStructure: msg({
    id: "deviceClassEditor.emitters.undo.editStructure",
    message: "Edit Emitters",
  }),
  addGroup: msg({
    id: "deviceClassEditor.emitters.undo.addGroup",
    message: "Add Emitter Group",
  }),
  editGroup: msg({
    id: "deviceClassEditor.emitters.undo.editGroup",
    message: "Edit Emitter Group",
  }),
  deleteGroup: msg({
    id: "deviceClassEditor.emitters.undo.deleteGroup",
    message: "Delete Emitter Group",
  }),
  addEmitter: msg({
    id: "deviceClassEditor.emitters.undo.addEmitter",
    message: "Add Emitter",
  }),
  editEmitter: msg({
    id: "deviceClassEditor.emitters.undo.editEmitter",
    message: "Edit Emitter",
  }),
  deleteEmitter: msg({
    id: "deviceClassEditor.emitters.undo.deleteEmitter",
    message: "Delete Emitter",
  }),
};

const NO_GROUPS: Record<EntityId, EmitterGroup> = {};
const NO_EMITTERS: Record<EntityId, Emitter> = {};

type EmitterTables = Pick<DeviceClassDocument, "emitterGroups" | "emitters">;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useEmittersStructure(): EmittersStructure | undefined {
  return useCurrentEditorPart((editor) => editor.emittersStructure);
}

export function useEmitterGroups(): Record<EntityId, EmitterGroup> {
  return useCurrentEditorPart((editor) => editor.emitterGroups) ?? NO_GROUPS;
}

export function useEmitters(): Record<EntityId, Emitter> {
  return useCurrentEditorPart((editor) => editor.emitters) ?? NO_EMITTERS;
}

/**
 * How an emitter group, or an emitter in it, is named to the user, e.g.
 * "cell-1" or "cell-1 / red". One that no longer exists keeps the ID it had.
 */
export function emitterReferenceLabel(
  tables: EmitterTables,
  ref: EmitterReference,
): string {
  const group =
    tables.emitterGroups[ref.group]?.codexId ?? entityIdAsCodexId(ref.group);
  if (!ref.emitter) {
    return group;
  }
  const emitter =
    tables.emitters[ref.emitter]?.codexId ?? entityIdAsCodexId(ref.emitter);
  return `${group} / ${emitter}`;
}

// From the proposed schema's pattern for emitter paths.
export const EMITTER_PATH =
  /^[^?]+\?\/emitterGroups\/([^/]+)(?:\/emitters\/([^/]+))?$/;

/**
 * The emitter group, or emitter in it, that a path into the emitters structure
 * names. The structure's ID in the path is not checked, since a device class
 * has only one. Undefined for a string that isn't such a path.
 */
export function emitterReferenceFromPath(
  tables: EmitterTables,
  path: string,
): EmitterReference | undefined {
  const match = EMITTER_PATH.exec(path);
  return match
    ? emitterReferenceByCodexIds(tables, match[1]!, match[2])
    : undefined;
}

/**
 * A group, and optionally an emitter in it, found by their codexIds. One that
 * isn't there is kept by its codexId, so it reads as broken, or, if it holds a
 * `${index}`, so it can be filled in for each copy of a repeated node.
 */
export function emitterReferenceByCodexIds(
  tables: EmitterTables,
  groupCodexId: string,
  emitterCodexId?: string,
): EmitterReference {
  const groupEntry = Object.entries(tables.emitterGroups).find(
    ([, group]) => group.codexId === groupCodexId,
  );
  const group = groupEntry
    ? EntityId(groupEntry[0])
    : codexIdAsEntityId(groupCodexId);
  if (emitterCodexId === undefined) {
    return { group };
  }

  // Emitter IDs are only unique within their group.
  const emitter = groupEntry?.[1].emitters.find(
    (id) => tables.emitters[id]?.codexId === emitterCodexId,
  );
  return { group, emitter: emitter ?? codexIdAsEntityId(emitterCodexId) };
}

/** Whether a reference names a group, and emitter in it, that exist. */
export function emitterReferenceExists(
  tables: EmitterTables,
  ref: EmitterReference,
): boolean {
  if (!tables.emitterGroups[ref.group]) {
    return false;
  }
  return !ref.emitter || tables.emitters[ref.emitter]?.group === ref.group;
}

/** An emitter group or emitter a beam can be placed at. */
export interface EmitterOption {
  ref: EmitterReference;
  label: string;
}

/** Each emitter group followed by its emitters, in the structure's order. */
export function useEmitterOptions(): EmitterOption[] {
  const structure = useEmittersStructure();
  const emitterGroups = useEmitterGroups();
  const emitters = useEmitters();

  return useMemo(() => {
    const tables = { emitterGroups, emitters };
    return (structure?.emitterGroups ?? []).flatMap((group) => {
      const emitterIds = emitterGroups[group]?.emitters;
      if (!emitterIds) {
        return [];
      }
      return [{ group }, ...emitterIds.map((emitter) => ({ group, emitter }))]
        .filter((ref) => emitterReferenceExists(tables, ref))
        .map((ref) => ({ ref, label: emitterReferenceLabel(tables, ref) }));
    });
  }, [structure, emitterGroups, emitters]);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Gives the device class an emitters structure, importing the intensity-color
 * library that defines it if the device class doesn't already.
 */
export function createEmittersStructure() {
  const library = getNewestVersionOfEachLibrary(
    useAppRuntimeStore.getState().libraries,
  ).find((library) => library.id === INTENSITY_COLOR_LIBRARY);

  updateCurrentEditor(UNDO.createStructure, (editor) => {
    if (editor.emittersStructure) {
      return;
    }

    if (library && !editor.libraries[INTENSITY_COLOR_LIBRARY]) {
      editor.libraries[INTENSITY_COLOR_LIBRARY] = library.version;
    }

    editor.emittersStructure = {
      codexId: CodexId(EMITTERS_CLASS),
      access: ["read"],
      lifetime: "static",
      emitterGroups: [],
      controlGroups: [],
    };
  });
}

export function modifyEmittersStructure(
  recipe: (draft: Draft<EmittersStructure>) => void,
) {
  updateCurrentEditor(UNDO.editStructure, (editor) => {
    if (editor.emittersStructure) {
      recipe(editor.emittersStructure);
    }
  });
}

/** Adds an empty emitter group at the end. Returns its ID. */
export function addEmitterGroup(): EntityId {
  const id = newEntityId();

  updateCurrentEditor(UNDO.addGroup, (editor) => {
    const structure = editor.emittersStructure;
    if (!structure) {
      return;
    }

    editor.emitterGroups[id] = {
      codexId: CodexId(
        getUniqueItemId(
          structure.emitterGroups
            .map((group) => editor.emitterGroups[group]?.codexId)
            .filter((codexId) => codexId !== undefined),
          "group",
        ),
      ),
      emitters: [],
    };
    structure.emitterGroups.push(id);
  });

  return id;
}

export function modifyEmitterGroup(
  id: EntityId,
  recipe: (draft: Draft<EmitterGroup>) => void,
) {
  updateCurrentEditor(UNDO.editGroup, (editor) => {
    const group = editor.emitterGroups[id];
    if (group) {
      recipe(group);
    }
  });
}

/**
 * Deletes a group and its emitters. Control groups stop controlling it. Beams
 * placed at it keep their reference, which then reads as broken.
 */
export function deleteEmitterGroup(id: EntityId) {
  updateCurrentEditor(UNDO.deleteGroup, (editor) => {
    const group = editor.emitterGroups[id];
    if (!group) {
      return;
    }

    for (const emitter of group.emitters) {
      delete editor.emitters[emitter];
    }
    delete editor.emitterGroups[id];

    const structure = editor.emittersStructure;
    if (structure) {
      structure.emitterGroups = structure.emitterGroups.filter(
        (group) => group !== id,
      );
      for (const control of structure.controlGroups) {
        control.emitterGroups = control.emitterGroups.filter(
          (group) => group !== id,
        );
      }
    }
  });
}

/** Adds an emitter at the end of a group. Returns its ID. */
export function addEmitter(groupId: EntityId): EntityId {
  const id = newEntityId();

  updateCurrentEditor(UNDO.addEmitter, (editor) => {
    const group = editor.emitterGroups[groupId];
    if (!group) {
      return;
    }

    editor.emitters[id] = {
      codexId: CodexId(
        getUniqueItemId(
          group.emitters
            .map((emitter) => editor.emitters[emitter]?.codexId)
            .filter((codexId) => codexId !== undefined),
          "emitter",
        ),
      ),
      group: groupId,
    };
    group.emitters.push(id);
  });

  return id;
}

export function modifyEmitter(
  id: EntityId,
  recipe: (draft: Draft<Emitter>) => void,
) {
  updateCurrentEditor(UNDO.editEmitter, (editor) => {
    const emitter = editor.emitters[id];
    if (emitter) {
      recipe(emitter);
    }
  });
}

/** Deletes an emitter. Beams placed at it keep their now broken reference. */
export function deleteEmitter(id: EntityId) {
  updateCurrentEditor(UNDO.deleteEmitter, (editor) => {
    const emitter = editor.emitters[id];
    if (!emitter) {
      return;
    }

    const group = editor.emitterGroups[emitter.group];
    if (group) {
      group.emitters = group.emitters.filter((other) => other !== id);
    }
    delete editor.emitters[id];
  });
}
