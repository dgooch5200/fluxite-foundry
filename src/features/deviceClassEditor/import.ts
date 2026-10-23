import JSZip from "jszip";
import {
  Condition,
  DeviceClass,
  E173Archive,
  EstaDmx,
  MappingBounds,
  MappingRange,
  Trigger,
  Structure,
  UnmappedParam,
} from "@cpwg-community/delver";
import { z } from "zod";
import { newEntityId } from "app/stateUtils";
import { updateAppPersistentState, useAppPersistentStore } from "app/store";
import {
  buildQualifiedId,
  EntityType,
  getDefaultWindowLayout,
  getUniqueItemId,
  OrgId,
  parseParameterReference,
  wrapDegrees,
} from "utils/utils";
import {
  importDocumentLocalizations,
  ImportedLocalizationKeys,
} from "features/localizations/localize";
import {
  codexIdAsEntityId,
  codexToId,
  commandArgKeyToEditor,
  commandExclusionsToEditor,
  paramExclusionsToEditor,
  resolveCommandId,
  toEditorParameterReference,
} from "./referenceResolution";
import {
  Access,
  LocalOrImportedId,
  ClassReference,
  CodexId,
  DeviceClassDocument,
  documentTypes,
  Localization,
  DmxChunkRefCondition,
  DmxConditionGroup,
  DmxConditionParent,
  DmxMapping,
  DmxMappingBounds,
  DmxMappingRange,
  DmxSerializer,
  DmxTrigger,
  DmxUnmappedParam,
  Command,
  EntityId,
  Lifetime,
  LocalizationKey,
  Resource,
  ParameterCount,
  structure3DAxes,
  structure3DCommonAxes,
  Structure3DControl,
  Structure3DControlTarget,
  structure3DControlTypes,
  structure3DModelQualities,
  Structure3DTransform,
  Structure3DVisual,
  Vec3,
  Vec3Schema,
} from "app/persistentState";
import { getDefaultDeviceClass } from "codex/codex";
import { emptyLibraryIndex, importClasses, LibraryIndex } from "codex/library";
import { assetStorage } from "app/assetStorage";
import { isStructure3D } from "./export";

export interface ArchiveToImport {
  archiveFile: File;
  archive: E173Archive;
}

export async function importDeviceClassEditor(
  orgId: OrgId,
  id: string,
  version: string,
  deviceClass: DeviceClass,
  archive?: ArchiveToImport,
) {
  const newDeviceClass = archive
    ? await getImportedDeviceClassEditorWithAssets(
        orgId,
        id,
        version,
        deviceClass,
        archive,
      )
    : getImportedDeviceClassEditor(orgId, id, version, deviceClass);

  updateAppPersistentState((state) => {
    const newId = newEntityId();
    state.documents[newId] = newDeviceClass;
    state.session.openDocuments.push(newId);
    state.session.layouts[newId] = JSON.stringify(getDefaultWindowLayout());
    state.session.selectedDocumentId = newId;
  });
}

export function getNewDeviceClassEditor(
  existingEditorIds: string[],
  sourceLocale: string,
): DeviceClassDocument {
  // TODO: This only needs to be unique among the same OrgId now
  const deviceClassId = getUniqueItemId(existingEditorIds, "super-light");
  const orgId = useAppPersistentStore.getState().appSettings.orgId;

  return getImportedDeviceClassEditor(
    orgId,
    deviceClassId,
    "1.0.0",
    getDefaultDeviceClass(deviceClassId, sourceLocale),
  );
}

export function getImportedDeviceClassEditor(
  orgId: OrgId,
  id: string,
  version: string,
  codexClass: DeviceClass,
): DeviceClassDocument {
  const localizations: Record<LocalizationKey, Localization> = {};
  const locKeys = importDocumentLocalizations(
    codexClass.localizations,
    localizations,
  );

  const editor: DeviceClassDocument = {
    type: documentTypes.DEVICE_CLASS,
    orgId,
    deviceClassId: id,
    deviceClassVersion: version,
    basicData: {
      publishDate: codexClass.publishDate,
      author: codexClass.author,
      history: codexClass.history,
      manufacturerName: codexClass.info.manufacturer.name,
      manufacturerUrl: codexClass.info.manufacturer.url,
      manufacturerEstaId: codexClass.info.manufacturer.estaId,
      modelName: codexClass.info.model.name,
      modelCategory: codexClass.info.model.category,
      modelSubcategory: codexClass.info.model.subcategory,
      compatibleFirmwareVersions:
        codexClass.info.compatibility?.firmwareVersions,
      localized: {
        description: locKeys.of(codexClass["@description"]),
      },
    },
    libraries: codexClass.libraries,
    parameterClasses: {},
    structureClasses: {},
    serializerClasses: {},
    resourceClasses: {},
    commandClasses: {},
    parameterEditors: [],
    parameters: {},
    resourceEditors: [],
    resources: {},
    resourceAssets: {},
    commandEditors: [],
    commands: {},
    commandClassArguments: {},
    commandClassReturnValues: {},
    enumChoices: {},
    dmxSerializers: {},
    structure3DNodes: {},
    localizations,
    sourceLocale: codexClass.locale,
  };

  // This is used only temporarily for the purpose of importing items that
  // reference device library classes, as opposed to the permanent indexes
  // present in ImportedLibrary.
  const deviceLibraryIndex = emptyLibraryIndex();

  importClasses(
    codexClass.deviceLibrary ?? {},
    editor,
    deviceLibraryIndex,
    locKeys.of,
  );
  importParameters(codexClass, editor, deviceLibraryIndex, locKeys);
  importResources(codexClass, editor, deviceLibraryIndex);
  importCommands(codexClass, editor, deviceLibraryIndex, locKeys);
  importStructure3D(codexClass, editor, locKeys);

  importDmxSerializers(codexClass, editor);

  return editor;
}

function importParameters(
  imported: DeviceClass,
  editor: DeviceClassDocument,
  classIndex: LibraryIndex,
  locKeys: ImportedLocalizationKeys,
) {
  for (const [id, param] of Object.entries(imported.parameters || {})) {
    const classRef: ClassReference = param.library
      ? {
          type: "imported",
          library: param.library,
          codexId: CodexId(param.class),
        }
      : {
          type: "local",
          id: localClassId(classIndex.parameterClasses, param.class),
        };

    let count: ParameterCount | undefined = undefined;
    if (param.count?.type === "fixed") {
      count = { type: "fixed", value: param.count.value };
    } else if (param.count?.type === "dynamic") {
      count = {
        type: "dynamic",
        min: param.count.value.minimum,
        max: param.count.value.maximum,
      };
    }

    const paramId = newEntityId();
    editor.parameters[paramId] = {
      codexId: CodexId(id),
      class: classRef,
      count,
      access: param.access,
      lifetime: param.lifetime,
      enumExclusions: param.choices?.excluded
        ? paramExclusionsToEditor(
            editor,
            classRef,
            param.choices.excluded.map((c) => CodexId(c)),
          )
        : undefined,
      atomicIdentifier: param.atomicIdentifier,
      minimum: param.minimum,
      maximum: param.maximum,
      minimumModifier: param.minimumModifier,
      maximumModifier: param.maximumModifier,
      default: param.default,
      wrapping: param.looping,
      localized: {
        friendlyName: locKeys.of(param["@friendlyName"]),
      },
    };
    editor.parameterEditors.push(paramId);
    for (const [index, choice] of (param.choices?.additional || []).entries()) {
      const choiceId = newEntityId();
      editor.enumChoices[choiceId] = {
        parent: {
          type: "paramAdditional",
          id: paramId,
        },
        codexId: CodexId(choice.id),
        index,
        localized: {
          name: locKeys.of(choice["@name"]),
          // TODO description
        },
      };
      // TODO description
    }
  }
}

function importResources(
  imported: DeviceClass,
  editor: DeviceClassDocument,
  classIndex: LibraryIndex,
) {
  for (const [id, resource] of Object.entries(imported.resources || {})) {
    const classRef: ClassReference = resource.library
      ? {
          type: "imported",
          library: resource.library,
          codexId: CodexId(resource.class),
        }
      : {
          type: "local",
          id: localClassId(classIndex.resourceClasses, resource.class),
        };

    const resId = newEntityId();
    editor.resources[resId] = {
      codexId: CodexId(id),
      class: classRef,
      access: resource.access,
      lifetime: resource.lifetime,
      mediaType: resource.mediaType,
      assetId: resource.assetId,
      importPath: resource.importPath,
      provenance: resource.provenance,
      default: resource.default,
    };
    editor.resourceEditors.push(resId);
  }
}

function importCommands(
  imported: DeviceClass,
  editor: DeviceClassDocument,
  classIndex: LibraryIndex,
  locKeys: ImportedLocalizationKeys,
) {
  for (const [id, cmd] of Object.entries(imported.commands || {})) {
    const classCodexId = CodexId(cmd.class);
    const localClass = classIndex.commandClasses.get(classCodexId);
    const classRef: ClassReference = cmd.library
      ? {
          type: "imported",
          library: cmd.library,
          codexId: classCodexId,
        }
      : {
          type: "local",
          id: localClassId(classIndex.commandClasses, cmd.class),
        };

    const cmdId = newEntityId();
    const newCmd: Command = {
      codexId: CodexId(id),
      class: classRef,
      completionNotification: cmd.completionNotification,
      localized: {
        friendlyName: locKeys.of(cmd["@friendlyName"]),
      },
    };

    const rawArgExclusions: Record<string, CodexId[]> = {};
    for (const [argId, choices] of Object.entries(cmd.argumentChoices || {})) {
      const argCodexId = CodexId(argId);

      if (choices.excluded) {
        rawArgExclusions[argCodexId] = choices.excluded.map((c) => CodexId(c));
      }
      for (const [index, choice] of (choices.additional || []).entries()) {
        const choiceId = newEntityId();
        editor.enumChoices[choiceId] = {
          parent:
            classRef.type === "local"
              ? {
                  type: "cmdArg",
                  idType: "local",
                  id: localMemberId(
                    classIndex.commandArguments,
                    localClass,
                    argCodexId,
                  ),
                  cmdId,
                }
              : {
                  type: "cmdArg",
                  idType: "imported",
                  id: argCodexId,
                  cmdId,
                },
          codexId: CodexId(choice.id),
          index,
          localized: {
            name: locKeys.of(choice["@name"]),
            // TODO description
          },
        };
        // TODO description
      }
    }
    if (Object.keys(rawArgExclusions).length > 0) {
      newCmd.argEnumExclusions = commandExclusionsToEditor(
        editor,
        classRef,
        "arg",
        rawArgExclusions,
      );
    }

    const rawReturnExclusions: Record<string, CodexId[]> = {};
    for (const [retId, choices] of Object.entries(cmd.returnChoices || {})) {
      const retCodexId = CodexId(retId);

      if (choices.excluded) {
        rawReturnExclusions[retCodexId] = choices.excluded.map((c) =>
          CodexId(c),
        );
      }
      for (const [index, choice] of (choices.additional || []).entries()) {
        const choiceId = newEntityId();
        editor.enumChoices[choiceId] = {
          parent:
            classRef.type === "local"
              ? {
                  type: "cmdRet",
                  idType: "local",
                  id: localMemberId(
                    classIndex.commandReturnValues,
                    localClass,
                    retCodexId,
                  ),
                  cmdId,
                }
              : {
                  type: "cmdRet",
                  idType: "imported",
                  id: retCodexId,
                  cmdId,
                },
          codexId: CodexId(choice.id),
          index,
          localized: {
            name: locKeys.of(choice["@name"]),
            // TODO description
          },
        };
        // TODO description
      }
    }
    if (Object.keys(rawReturnExclusions).length > 0) {
      newCmd.returnEnumExclusions = commandExclusionsToEditor(
        editor,
        classRef,
        "return",
        rawReturnExclusions,
      );
    }

    editor.commands[cmdId] = newCmd;
    editor.commandEditors.push(cmdId);
  }
}

// ---------------------------------------------------------------------------
// Structure 3D
// ---------------------------------------------------------------------------

// delver doesn't validate a structure's content, so each structure-3d field is
// checked as it is read and dropped if malformed.

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const ImportedControlSchema = z.object({
  type: z.enum(structure3DControlTypes),
  axis: z.enum(structure3DAxes),
  commonAxis: z.enum(structure3DCommonAxes).optional().catch(undefined),
  parameter: z.string().optional().catch(undefined),
  controlGroups: z.array(z.string()).optional().catch(undefined),
});

function importStructure3D(
  imported: DeviceClass,
  editor: DeviceClassDocument,
  locKeys: ImportedLocalizationKeys,
) {
  // structure-3d is not multipleAllowed, so only the first is kept.
  const entry = Object.entries(imported.structures ?? {}).find(
    (entry): entry is [string, Extract<Structure, { type: "Other" }>] =>
      isStructure3D(entry[1]),
  );
  if (!entry) {
    return;
  }
  const [codexId, { value: structure }] = entry;

  const resourceIds = codexToId(editor.resources);

  function importNodes(
    nodes: unknown,
    parent: EntityId | undefined,
  ): EntityId[] {
    if (!isJsonObject(nodes)) {
      return [];
    }

    return Object.entries(nodes).flatMap(([nodeCodexId, node]) => {
      if (!isJsonObject(node)) {
        return [];
      }

      const id = newEntityId();
      editor.structure3DNodes[id] = {
        codexId: CodexId(nodeCodexId),
        parent,
        children: [],
        transform: importTransform(node),
        accessoryLocation: asString(node.accessoryLocation),
        controls: importControls(editor, node.control),
        visual: importVisual(node.model, resourceIds),
        localized: {
          friendlyName: locKeys.of(asString(node["@friendlyName"])),
        },
      };
      editor.structure3DNodes[id].children = importNodes(node.nodes, id);
      return [id];
    });
  }

  editor.structure3D = {
    codexId: CodexId(codexId),
    access: structure.access,
    lifetime: structure.lifetime,
    rootNodes: importNodes(structure.default?.nodes, undefined),
  };
}

function importTransform(node: JsonObject): Structure3DTransform {
  // A node giving both a matrix and translate/rotate is invalid. The matrix
  // wins, being the whole transform.
  const matrix = z
    .array(z.number())
    .min(12)
    .max(16)
    .safeParse(node.matrix).data;
  if (matrix) {
    return { type: "matrix", matrix };
  }

  const rotate = Vec3Schema.safeParse(node.rotate).data;
  return {
    type: "trs",
    translate: Vec3Schema.safeParse(node.translate).data,
    rotate: rotate?.map(wrapDegrees) as Vec3 | undefined,
  };
}

function importControls(
  editor: DeviceClassDocument,
  control: unknown,
): Structure3DControl[] {
  // The schema says an array, but some files (the MAC Encore example among
  // them) give a single control as a bare object.
  const controls = Array.isArray(control) ? control : [control];

  return controls.flatMap((c) => {
    const control = ImportedControlSchema.safeParse(c).data;
    return control
      ? [
          {
            type: control.type,
            axis: control.axis,
            commonAxis: control.commonAxis,
            target: importControlTarget(editor, control),
          },
        ]
      : [];
  });
}

function importControlTarget(
  editor: DeviceClassDocument,
  { parameter, controlGroups }: z.infer<typeof ImportedControlSchema>,
): Structure3DControlTarget {
  if (parameter === undefined && controlGroups) {
    return { type: "controlGroups", controlGroups };
  }

  // A control naming neither keeps its type and axes as a broken parameter
  // reference, which the editor flags.
  const ref = parseParameterReference(parameter ?? "");
  return {
    type: "parameter",
    parameter: toEditorParameterReference(editor, ref.codexId, ref.index),
  };
}

// The schema allows one quality per node, so a node giving several keeps the
// best.
const QUALITIES_BEST_FIRST = [
  structure3DModelQualities.HIGH,
  structure3DModelQualities.MEDIUM,
  structure3DModelQualities.LOW,
];

function importVisual(
  model: unknown,
  resourceIds: Map<CodexId, EntityId>,
): Structure3DVisual | undefined {
  // `model.bounds` is dropped: the draft-2027-1 schema requires `extents` both
  // inside and beside `center`, so no bounds value validates.
  const visual = isJsonObject(model) ? model.visual : undefined;
  if (!isJsonObject(visual)) {
    return undefined;
  }

  const quality = QUALITIES_BEST_FIRST.find(
    (q) => typeof visual[q] === "string",
  );
  if (!quality) {
    return undefined;
  }

  const resourceCodexId = visual[quality] as string;
  return {
    quality,
    resource:
      resourceIds.get(CodexId(resourceCodexId)) ??
      codexIdAsEntityId(resourceCodexId),
    nodeOrSceneName: asString(visual.nodeOrSceneName),
  };
}

// Resolves a codexId the document uses to reference one of its own classes to
// the EntityId the class was imported under. A broken reference just uses the
// codexId as an EntityId, which is the app-wide pattern.
function localClassId(
  classIndex: Map<CodexId, EntityId>,
  codexId: string,
): EntityId {
  return classIndex.get(CodexId(codexId)) ?? codexIdAsEntityId(codexId);
}

function localMemberId(
  memberIndex: Map<EntityId, Map<CodexId, EntityId>>,
  ownerId: EntityId | undefined,
  codexId: CodexId,
): EntityId {
  const id = ownerId && memberIndex.get(ownerId)?.get(codexId);
  return id ?? codexIdAsEntityId(codexId);
}

async function getImportedDeviceClassEditorWithAssets(
  orgId: OrgId,
  id: string,
  version: string,
  deviceClass: DeviceClass,
  archive: ArchiveToImport,
) {
  const editor = getImportedDeviceClassEditor(orgId, id, version, deviceClass);

  const qualifiedId = buildQualifiedId(EntityType.Dev, orgId, id);
  editor.resourceAssets = await loadResourceAssets(
    qualifiedId,
    version,
    archive,
    editor.resources,
  );
  return editor;
}

async function loadResourceAssets(
  qualifiedId: string,
  version: string,
  archive: ArchiveToImport,
  resources: Record<string, Resource>,
): Promise<Record<string, string>> {
  const resourceAssets: Record<string, string> = {};

  let zip;
  try {
    zip = await JSZip.loadAsync(archive.archiveFile);
  } catch (_e) {
    return resourceAssets;
  }

  const assetsDir =
    archive.archive.e173archive.deviceClasses?.[qualifiedId]?.[version]
      ?.assetsDirectory;
  if (!assetsDir) {
    return resourceAssets;
  }

  for (const resource of Object.values(resources)) {
    if (resource.default) {
      try {
        const filePath = `${assetsDir}/${resource.default}`;

        const zipFile = zip.file(filePath);
        if (!zipFile) {
          throw new Error("Resource file did not exist in archive");
        }

        const fileContent = await zipFile.async("arraybuffer");
        const assetId = await assetStorage.storeAsset(
          fileContent,
          resource.mediaType,
        );
        resourceAssets[resource.default] = assetId;
      } catch (_e) {
        // TODO error handling
        continue;
      }
    }
  }

  return resourceAssets;
}

// ---------------------------------------------------------------------------
// DMX Conversion
// ---------------------------------------------------------------------------

function importDmxSerializers(
  imported: DeviceClass,
  editor: DeviceClassDocument,
) {
  for (const [codexId, serializer] of Object.entries(
    imported.serializers ?? {},
  )) {
    if (serializer.type !== "EstaDmx") {
      continue;
    }

    const { access, lifetime, default: estaDmx } = serializer.value;
    editor.dmxSerializers[newEntityId()] = convertEstaDmxToEditorState(
      editor,
      CodexId(codexId),
      access,
      lifetime,
      estaDmx ?? { chunks: {} },
    );
  }
}

function convertEstaDmxToEditorState(
  editor: DeviceClassDocument,
  codexId: CodexId,
  access: Access[],
  lifetime: Lifetime,
  estaDmx: EstaDmx,
): DmxSerializer {
  const result: DmxSerializer = {
    codexId,
    access,
    lifetime,
    chunks: {},
    mappingGroups: {},
    conditions: {},
  };

  // Build a map from old chunk IDs to new EntityIds
  // IMPORTANT: Build the entire map first before processing any conditions,
  // to avoid forward reference issues where conditions reference chunks
  // that haven't been added to the map yet.
  const chunkIdMap: Record<string, EntityId> = {};

  // First pass: Create all chunks and build the ID map
  for (const [oldChunkId, chunk] of Object.entries(estaDmx.chunks)) {
    const newChunkId = newEntityId();
    chunkIdMap[oldChunkId] = newChunkId;

    result.chunks[newChunkId] = {
      offsets: chunk.offsets,
    };
  }

  // Second pass: Process mapping groups and conditions
  // Now all chunks are in the map, so conditions can safely reference them
  for (const [oldChunkId, chunk] of Object.entries(estaDmx.chunks)) {
    const newChunkId = chunkIdMap[oldChunkId];

    // Convert mapping groups for this chunk
    chunk.mappingGroups.forEach((mg, index) => {
      const mappingGroupId = newEntityId();
      result.mappingGroups[mappingGroupId] = {
        chunkId: newChunkId,
        index,
        mappings: (mg.mappings ?? []).map((m) => convertMapping(editor, m)),
        triggers: (mg.triggers ?? []).map((t) => convertTrigger(editor, t)),
      };

      // Convert conditions for this mapping group
      if (mg.conditions && mg.conditions.length > 0) {
        convertConditionsToNormalized(
          mg.conditions,
          { type: "mappingGroup", id: mappingGroupId },
          chunkIdMap,
          result,
        );
      }
    });
  }

  return result;
}

function convertConditionsToNormalized(
  conditions: Condition[],
  parent: DmxConditionParent,
  chunkIdMap: Record<string, EntityId>,
  result: DmxSerializer,
) {
  for (const condition of conditions) {
    if (condition.type === "group") {
      // This is a group condition
      const groupConditionId = newEntityId();
      const groupCondition: DmxConditionGroup = {
        conditionType: "group",
        parent,
        match: condition.value.condMatch,
      };
      result.conditions[groupConditionId] = groupCondition;

      // Recursively convert child conditions
      convertConditionsToNormalized(
        condition.value.conditions,
        { type: "condition", id: groupConditionId },
        chunkIdMap,
        result,
      );
    } else if (condition.type === "simple") {
      // This is a chunk reference condition
      const chunkRefConditionId = newEntityId();
      const referencedChunkId = chunkIdMap[condition.value.chunk];

      if (!referencedChunkId) {
        throw new Error(
          `Chunk reference condition references non-existent chunk: "${condition.value.chunk}". Available chunks: ${Object.keys(chunkIdMap).join(", ")}`,
        );
      }

      const chunkRefCondition: DmxChunkRefCondition = {
        conditionType: "chunkRef",
        parent,
        chunkId: referencedChunkId,
        chunkStart: condition.value.chunkStart,
        chunkEnd: condition.value.chunkEnd,
      };
      result.conditions[chunkRefConditionId] = chunkRefCondition;
    }
  }
}

function convertMapping(
  editor: DeviceClassDocument,
  m: {
    mappedParam: { id: string; index?: number };
    ranges: MappingRange[];
    unmappedParams?: UnmappedParam[];
  },
): DmxMapping {
  return {
    mappedParam: toEditorParameterReference(
      editor,
      CodexId(m.mappedParam.id),
      m.mappedParam.index,
    ),
    ranges: m.ranges.map(convertMappingRange),
    unmappedParams: m.unmappedParams?.map((up) =>
      convertUnmappedParam(editor, up),
    ),
  };
}

function convertMappingBounds(bounds: MappingBounds): DmxMappingBounds {
  switch (bounds.type) {
    case "null":
      return bounds;
    case "numeric":
      return { type: "numeric", ...bounds.value };
    case "bool":
      return { type: "bool", ...bounds.value };
  }
}

function convertMappingRange(r: MappingRange): DmxMappingRange {
  return {
    bounds: convertMappingBounds(r.bounds),
    chunkValues:
      r.chunkValues.type === "range"
        ? {
            type: "range",
            chunkStart: r.chunkValues.value.start,
            chunkEnd: r.chunkValues.value.end,
          }
        : {
            type: "sequence",
            steps: r.chunkValues.value.map((step) => ({
              chunkStart: step.chunkStart,
              chunkEnd: step.chunkEnd,
              hold: step.hold,
            })),
          },
  };
}

function convertUnmappedParam(
  editor: DeviceClassDocument,
  up: UnmappedParam,
): DmxUnmappedParam {
  return {
    parameter: toEditorParameterReference(
      editor,
      CodexId(up.parameter.id),
      up.parameter.index,
    ),
    bounds: convertMappingBounds(up.bounds),
  };
}

function convertTrigger(editor: DeviceClassDocument, t: Trigger): DmxTrigger {
  const commandId = resolveCommandId(editor, CodexId(t.command));
  const command = editor.commands[commandId];

  return {
    command: commandId,
    mappings: t.mappings.map((tm) => ({
      conditions: Object.fromEntries(
        Object.entries(tm.conditions ?? {}).map(([key, cond]) => [
          // Condition keys are argument codexIds in the codex format. Store
          // them as EntityIds when the command's class is local.
          command
            ? commandArgKeyToEditor(editor, command.class, CodexId(key))
            : (CodexId(key) as LocalOrImportedId),
          {
            argumentMin: cond.argumentMin,
            argumentMax: cond.argumentMax,
          },
        ]),
      ),
      sequence: tm.sequence.map((step) => ({
        chunkStart: step.chunkStart,
        chunkEnd: step.chunkEnd,
        hold: step.hold,
      })),
    })),
  };
}
