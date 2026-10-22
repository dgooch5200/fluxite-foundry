// Checks a device class's 3D structure for data that refers to things that
// don't fit or no longer exist. These are soft warnings: the data is still
// stored, and the editor points the user at what to fix.

import { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  DeviceClassDocument,
  EmitterReference,
  EntityId,
  FCUnitName,
  Parameter,
  ParameterReference,
  Resource,
  Structure3DControlType,
  structure3DControlTypes,
} from "app/persistentState";
import { Library, LibraryStore } from "codex/library";
import { resolveClassRef } from "features/deviceClassEditor/classResolution";
import { MOTION_LIBRARY } from "features/deviceClassEditor/export";
import { entityIdAsCodexId } from "features/deviceClassEditor/referenceResolution";
import { serializeParameterReference } from "utils/utils";
import {
  emitterForCopy,
  indexNamesAt,
  nodeCopies,
  ONLY_COPY,
  parameterForCopy,
  placeholderNames,
} from "./repeats";
import {
  emitterReferenceExists,
  emitterReferenceLabel,
} from "features/emittersEditor/state";

export const MODEL_RESOURCE_CLASS = "3d-model";

// Which part of a node's form an issue belongs to.
export type Structure3DIssueField =
  | "id"
  | "accessoryLocation"
  | "repeat"
  | "model"
  | `control.${number}`;

// From the proposed schema: what a repeat's index can be named.
const INDEX_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

export interface Structure3DIssue {
  field: Structure3DIssueField;
  message: MessageDescriptor;
}

const ISSUES = {
  repeatCount: msg({
    id: "deviceClassEditor.structure3D.issue.repeatCount",
    message: "A repeat's count should be a whole number of at least 1.",
  }),
  repeatStepEmpty: msg({
    id: "deviceClassEditor.structure3D.issue.repeatStepEmpty",
    message:
      "Give the repeat a step: how far each copy moves or turns from the one before.",
  }),
  repeatIndexName: msg({
    id: "deviceClassEditor.structure3D.issue.repeatIndexName",
    message:
      "An index name should start with a letter, followed by letters, digits, - or _.",
  }),
  repeatIndexTaken: msg({
    id: "deviceClassEditor.structure3D.issue.repeatIndexTaken",
    message: "A repeat above this one already uses the index name {name}.",
  }),
  unknownIndex: msg({
    id: "deviceClassEditor.structure3D.issue.unknownIndex",
    message: "No repeat at or above this node has the index name {name}.",
  }),
  parameterMissingInCopy: msg({
    id: "deviceClassEditor.structure3D.issue.parameterMissingInCopy",
    message: "{parameter} isn't one of the device class's parameters.",
  }),
  idNotUnique: msg({
    id: "deviceClassEditor.structure3D.issue.idNotUnique",
    message:
      "Another node has this ID. Each node needs its own, anywhere in the structure.",
  }),
  parameterMissing: msg({
    id: "deviceClassEditor.structure3D.issue.parameterMissing",
    message:
      "The parameter that drove this control no longer exists. Choose another one.",
  }),
  rotateNeedsDegrees: msg({
    id: "deviceClassEditor.structure3D.issue.rotateNeedsDegrees",
    message:
      "A rotate control should be driven by a parameter measured in degrees.",
  }),
  linearNeedsMeters: msg({
    id: "deviceClassEditor.structure3D.issue.linearNeedsMeters",
    message:
      "A linear control should be driven by a parameter measured in meters.",
  }),
  noControlGroups: msg({
    id: "deviceClassEditor.structure3D.issue.noControlGroups",
    message: "Add at least one control group.",
  }),
  beamNeedsControlGroups: msg({
    id: "deviceClassEditor.structure3D.issue.beamNeedsControlGroups",
    message: "A beam control should be driven by control groups.",
  }),
  needsParameter: msg({
    id: "deviceClassEditor.structure3D.issue.needsParameter",
    message: "A linear or rotate control should be driven by a parameter.",
  }),
  emittersNeedBeam: msg({
    id: "deviceClassEditor.structure3D.issue.emittersNeedBeam",
    message: "Only a beam control can name emitters.",
  }),
  apertureNeedsBeam: msg({
    id: "deviceClassEditor.structure3D.issue.apertureNeedsBeam",
    message: "Only a beam control can have an aperture.",
  }),
  apertureNotPositive: msg({
    id: "deviceClassEditor.structure3D.issue.apertureNotPositive",
    message: "The aperture's size should be more than 0.",
  }),
  emitterMissing: msg({
    id: "deviceClassEditor.structure3D.issue.emitterMissing",
    message:
      "{emitter} isn't in the device class's emitters. Choose another one.",
  }),
  emitterPlacedTwice: msg({
    id: "deviceClassEditor.structure3D.issue.emitterPlacedTwice",
    message:
      "{emitter} is also placed at node {node}. An emitter can only be at one node.",
  }),
  modelMissing: msg({
    id: "deviceClassEditor.structure3D.issue.modelMissing",
    message: "The model's resource no longer exists. Choose another one.",
  }),
  modelWrongClass: msg({
    id: "deviceClassEditor.structure3D.issue.modelWrongClass",
    message:
      "The model's resource should be of the motion library's 3d-model class.",
  }),
};

// The unit a control's parameter has to be measured in, if any.
const REQUIRED_UNITS: Record<
  Structure3DControlType,
  { unit: FCUnitName; issue: MessageDescriptor } | undefined
> = {
  rotate: { unit: "degree", issue: ISSUES.rotateNeedsDegrees },
  linear: { unit: "meter", issue: ISSUES.linearNeedsMeters },
  beam: undefined,
};

/** The unit of a parameter, taken from its class. */
export function parameterUnitName(
  parameter: Parameter,
  libraries: Record<string, string>,
  deviceLibrary: Library,
  store: Readonly<LibraryStore>,
): FCUnitName | undefined {
  const resolved = resolveClassRef(
    parameter.class,
    libraries,
    deviceLibrary,
    store,
    "parameterClasses",
  );
  return resolved?.library.parameterClasses[resolved.classId]?.unit?.name;
}

/** Whether a parameter in the given unit can drive a control of this type. */
export function isCompatibleUnit(
  controlType: Structure3DControlType,
  unit: FCUnitName | undefined,
): boolean {
  const required = REQUIRED_UNITS[controlType];
  return !required || unit === required.unit;
}

export function isModelResource(resource: Resource): boolean {
  return (
    resource.class.type === "imported" &&
    resource.class.library === MOTION_LIBRARY &&
    resource.class.codexId === MODEL_RESOURCE_CLASS
  );
}

/** The issues of each node of the structure that has any. */
export function validateStructure3D(
  editor: DeviceClassDocument,
  store: Readonly<LibraryStore>,
): Record<EntityId, Structure3DIssue[]> {
  const result: Record<EntityId, Structure3DIssue[]> = {};
  const nodes = editor.structure3DNodes;
  const copiesOf = new Map(
    Object.keys(nodes).map((id) => [id, nodeCopies(nodes, EntityId(id))]),
  );

  // Where each emitter is placed, by group, to find any placed at two nodes or
  // in two copies of one.
  const placements = new Map<
    EntityId,
    { at: string; node: string; emitter?: EntityId }[]
  >();
  for (const [id, node] of Object.entries(nodes)) {
    for (const control of node.controls) {
      if (control.type !== structure3DControlTypes.BEAM) continue;
      for (const copy of copiesOf.get(id) ?? []) {
        for (const ref of control.emitters ?? []) {
          const placed = emitterForCopy(editor, ref, copy.indices);
          if (isStillTemplated(placed)) continue;
          const list = placements.get(placed.group) ?? [];
          list.push({
            at: `${id}${copy.suffix}`,
            node: `${node.codexId}${copy.suffix}`,
            emitter: placed.emitter,
          });
          placements.set(placed.group, list);
        }
      }
    }
  }

  // E1.73-4 has node IDs be unique throughout the structure.
  const idCounts = new Map<string, number>();
  for (const node of Object.values(nodes)) {
    idCounts.set(node.codexId, (idCounts.get(node.codexId) ?? 0) + 1);
  }

  for (const [id, node] of Object.entries(nodes)) {
    const issues: Structure3DIssue[] = [];
    const copies = copiesOf.get(id) ?? [ONLY_COPY];
    const indexNames = indexNamesAt(nodes, EntityId(id));
    // The first placeholder naming no repeat above, if any.
    const unknownIndex = (texts: string[]) =>
      texts
        .flatMap(placeholderNames)
        .find((name) => !indexNames.includes(name));
    const pushUnknownIndex = (
      field: Structure3DIssueField,
      texts: string[],
    ) => {
      const name = unknownIndex(texts);
      if (name) {
        issues.push({
          field,
          message: { ...ISSUES.unknownIndex, values: { name } },
        });
      }
    };

    if ((idCounts.get(node.codexId) ?? 0) > 1) {
      issues.push({ field: "id", message: ISSUES.idNotUnique });
    }
    pushUnknownIndex("accessoryLocation", [node.accessoryLocation ?? ""]);

    if (node.repeat) {
      const { count, step, index } = node.repeat;
      const field = "repeat";
      if (!Number.isInteger(count) || count < 1) {
        issues.push({ field, message: ISSUES.repeatCount });
      }
      if (!step.translate && !step.rotate) {
        issues.push({ field, message: ISSUES.repeatStepEmpty });
      }
      if (index !== undefined && !INDEX_NAME.test(index)) {
        issues.push({ field, message: ISSUES.repeatIndexName });
      } else if (
        index !== undefined &&
        node.parent &&
        indexNamesAt(nodes, node.parent).includes(index)
      ) {
        issues.push({
          field,
          message: { ...ISSUES.repeatIndexTaken, values: { name: index } },
        });
      }
    }

    node.controls.forEach((control, index) => {
      const field: Structure3DIssueField = `control.${index}`;
      const { target, emitters = [], aperture } = control;
      const isBeam = control.type === structure3DControlTypes.BEAM;

      pushUnknownIndex(field, [
        ...(target.type === "parameter"
          ? [entityIdAsCodexId(target.parameter.id)]
          : target.controlGroups),
        ...emitters.flatMap((ref) => [
          entityIdAsCodexId(ref.group),
          ref.emitter ? entityIdAsCodexId(ref.emitter) : "",
        ]),
      ]);

      // E1.73-4 Table 8-8: beams are driven by control groups, linear and
      // rotate controls by a parameter.
      if (isBeam && target.type === "parameter") {
        issues.push({ field, message: ISSUES.beamNeedsControlGroups });
      } else if (!isBeam && target.type === "controlGroups") {
        issues.push({ field, message: ISSUES.needsParameter });
      } else if (target.type === "controlGroups") {
        if (target.controlGroups.length === 0) {
          issues.push({ field, message: ISSUES.noControlGroups });
        }
      } else {
        const issue = parameterIssue(
          editor,
          store,
          control.type,
          copies.map((copy) =>
            parameterForCopy(editor.parameters, target.parameter, copy.indices),
          ),
        );
        if (issue) issues.push({ field, message: issue });
      }

      if (!isBeam && emitters.length > 0) {
        issues.push({ field, message: ISSUES.emittersNeedBeam });
      }
      if (!isBeam && aperture) {
        issues.push({ field, message: ISSUES.apertureNeedsBeam });
      }
      if (
        aperture &&
        (aperture.shape === "circle"
          ? aperture.diameter <= 0
          : aperture.width <= 0 || aperture.height <= 0)
      ) {
        issues.push({ field, message: ISSUES.apertureNotPositive });
      }
      if (!isBeam) {
        return;
      }

      // The emitters each copy names. Ones still holding a placeholder name
      // no repeat above, which is reported already.
      const named = copies.flatMap((copy) =>
        emitters
          .map((ref) => emitterForCopy(editor, ref, copy.indices))
          .filter((ref) => !isStillTemplated(ref))
          .map((ref) => ({ copy, ref })),
      );

      const missing = named.find(
        ({ ref }) => !emitterReferenceExists(editor, ref),
      );
      if (missing) {
        issues.push({
          field,
          message: {
            ...ISSUES.emitterMissing,
            values: { emitter: emitterReferenceLabel(editor, missing.ref) },
          },
        });
      }

      for (const { copy, ref } of named) {
        const other = placements
          .get(ref.group)
          ?.find(
            (placement) =>
              placement.at !== `${id}${copy.suffix}` &&
              (!placement.emitter ||
                !ref.emitter ||
                placement.emitter === ref.emitter),
          );
        if (other) {
          issues.push({
            field,
            message: {
              ...ISSUES.emitterPlacedTwice,
              values: {
                emitter: emitterReferenceLabel(editor, ref),
                node: other.node,
              },
            },
          });
          break;
        }
      }
    });

    if (node.visual) {
      const resource = editor.resources[node.visual.resource];
      if (!resource) {
        issues.push({ field: "model", message: ISSUES.modelMissing });
      } else if (!isModelResource(resource)) {
        issues.push({ field: "model", message: ISSUES.modelWrongClass });
      }
    }

    if (issues.length > 0) {
      result[EntityId(id)] = issues;
    }
  }

  return result;
}

/**
 * What's wrong with the parameter a control is driven by in each of its node's
 * copies, if anything: the first copy's problem is enough to report.
 */
function parameterIssue(
  editor: DeviceClassDocument,
  store: Readonly<LibraryStore>,
  type: Structure3DControlType,
  refs: ParameterReference[],
): MessageDescriptor | undefined {
  for (const ref of refs) {
    const parameter = editor.parameters[ref.id];
    if (!parameter) {
      const text = entityIdAsCodexId(ref.id);
      // One still holding a placeholder names no repeat above, which is
      // reported already.
      if (placeholderNames(text).length > 0) continue;
      return refs.length > 1
        ? {
            ...ISSUES.parameterMissingInCopy,
            values: {
              parameter: serializeParameterReference({
                codexId: text,
                index: ref.index,
              }),
            },
          }
        : ISSUES.parameterMissing;
    }
    const unit = parameterUnitName(parameter, editor.libraries, editor, store);
    if (!isCompatibleUnit(type, unit)) {
      return REQUIRED_UNITS[type]!.issue;
    }
  }
  return undefined;
}

// A reference whose group or emitter, once filled in for a copy, still holds a
// placeholder.
function isStillTemplated(ref: EmitterReference): boolean {
  return (
    placeholderNames(
      `${entityIdAsCodexId(ref.group)}/${ref.emitter ? entityIdAsCodexId(ref.emitter) : ""}`,
    ).length > 0
  );
}
