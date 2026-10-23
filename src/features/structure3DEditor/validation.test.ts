import { beforeEach, describe, expect, it } from "vitest";
import { EntityId } from "app/persistentState";
import { loadDefaultLibraries } from "codex/libraryStore";
import {
  createEmptyDeviceClassEditor,
  currentEditor,
  resetAllStores,
} from "test/utils";
import { validateStructure3D } from "./validation";
import {
  addMotionParameters,
  addMotionResource,
  addStructureWithRoot,
  control,
  MODEL,
  PAN,
  ROOT,
  TRACK,
} from "./testFixtures";

const SHAPE = EntityId("shape");

function issueIds() {
  const issues = validateStructure3D(currentEditor(), loadDefaultLibraries());
  return Object.fromEntries(
    Object.entries(issues).map(([id, list]) => [
      id,
      list.map((issue) => `${issue.field} ${issue.message.id}`),
    ]),
  );
}

describe("validateStructure3D", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
    addMotionParameters();
    addMotionResource(MODEL);
  });

  it("finds nothing wrong with controls and a model that fit", () => {
    addStructureWithRoot({
      controls: [
        control("rotate", { type: "parameter", parameter: { id: PAN } }),
        control("linear", { type: "parameter", parameter: { id: TRACK } }),
        control("beam", { type: "parameter", parameter: { id: PAN } }),
        control("rotate", {
          type: "controlGroups",
          controlGroups: ["control-groups?/groups/0"],
        }),
      ],
      visual: { quality: "high", resource: MODEL },
    });

    expect(issueIds()).toEqual({});
  });

  it("reports a parameter whose unit doesn't suit the control", () => {
    addStructureWithRoot({
      controls: [
        control("rotate", { type: "parameter", parameter: { id: TRACK } }),
        control("linear", { type: "parameter", parameter: { id: PAN } }),
      ],
    });

    expect(issueIds()).toEqual({
      [ROOT]: [
        "control.0 deviceClassEditor.structure3D.issue.rotateNeedsDegrees",
        "control.1 deviceClassEditor.structure3D.issue.linearNeedsMeters",
      ],
    });
  });

  it("reports a parameter that no longer exists", () => {
    addStructureWithRoot({
      controls: [
        control("beam", {
          type: "parameter",
          parameter: { id: EntityId("deleted") },
        }),
      ],
    });

    expect(issueIds()).toEqual({
      [ROOT]: [
        "control.0 deviceClassEditor.structure3D.issue.parameterMissing",
      ],
    });
  });

  it("reports a control driven by no control groups", () => {
    addStructureWithRoot({
      controls: [
        control("rotate", { type: "controlGroups", controlGroups: [] }),
      ],
    });

    expect(issueIds()).toEqual({
      [ROOT]: ["control.0 deviceClassEditor.structure3D.issue.noControlGroups"],
    });
  });

  it("reports a model resource that is missing or not a 3d-model", () => {
    addStructureWithRoot({
      visual: { quality: "low", resource: EntityId("deleted") },
    });
    expect(issueIds()).toEqual({
      [ROOT]: ["model deviceClassEditor.structure3D.issue.modelMissing"],
    });

    addMotionResource(SHAPE, "not-a-model");
    addStructureWithRoot({ visual: { quality: "low", resource: SHAPE } });
    expect(issueIds()).toEqual({
      [ROOT]: ["model deviceClassEditor.structure3D.issue.modelWrongClass"],
    });
  });
});
