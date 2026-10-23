// Soft warnings: the data is still stored, and the editor points at what to fix.

import { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  DeviceClassDocument,
  EntityId,
  FCUnitName,
  Parameter,
  Resource,
  Structure3DControlType,
} from "app/persistentState";
import { Library, LibraryStore } from "codex/library";
import { resolveClassRef } from "features/deviceClassEditor/classResolution";
import { MOTION_LIBRARY } from "features/deviceClassEditor/export";

export const MODEL_RESOURCE_CLASS = "3d-model";

export type Structure3DIssueField = "model" | `control.${number}`;

export interface Structure3DIssue {
  field: Structure3DIssueField;
  message: MessageDescriptor;
}

const ISSUES = {
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
    message:
      "Add at least one control group, or drive this control by a parameter.",
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

const REQUIRED_UNITS: Record<
  Structure3DControlType,
  { unit: FCUnitName; issue: MessageDescriptor } | undefined
> = {
  rotate: { unit: "degree", issue: ISSUES.rotateNeedsDegrees },
  linear: { unit: "meter", issue: ISSUES.linearNeedsMeters },
  beam: undefined,
};

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

export function validateStructure3D(
  editor: DeviceClassDocument,
  store: Readonly<LibraryStore>,
): Record<EntityId, Structure3DIssue[]> {
  const result: Record<EntityId, Structure3DIssue[]> = {};

  for (const [id, node] of Object.entries(editor.structure3DNodes)) {
    const issues: Structure3DIssue[] = [];

    node.controls.forEach((control, index) => {
      const field: Structure3DIssueField = `control.${index}`;
      const { target } = control;

      if (target.type === "controlGroups") {
        if (target.controlGroups.length === 0) {
          issues.push({ field, message: ISSUES.noControlGroups });
        }
        return;
      }

      const parameter = editor.parameters[target.parameter.id];
      if (!parameter) {
        issues.push({ field, message: ISSUES.parameterMissing });
        return;
      }

      const unit = parameterUnitName(
        parameter,
        editor.libraries,
        editor,
        store,
      );
      if (!isCompatibleUnit(control.type, unit)) {
        issues.push({ field, message: REQUIRED_UNITS[control.type]!.issue });
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
