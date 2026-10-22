import { beforeEach, describe, expect, it } from "vitest";
import { CodexId, EntityId, Structure3DControl } from "app/persistentState";
import { loadDefaultLibraries } from "codex/libraryStore";
import {
  createEmptyDeviceClassEditor,
  resetAllStores,
  testUndoLabel,
} from "test/utils";
import { updateCurrentEditor } from "features/deviceClassEditor/state";
import { codexIdAsEntityId } from "features/deviceClassEditor/referenceResolution";
import { validateStructure3D } from "./validation";
import {
  addEmitters,
  addMotionParameters,
  addMotionResource,
  addStructureWithRoot,
  CELL_1,
  CELL_1_RED,
  CELL_2,
  currentEditor,
  PAN,
  ROOT,
  TRACK,
} from "./testFixtures";

const MODEL = EntityId("model");
const GROUP_0: Structure3DControl["target"] = {
  type: "controlGroups",
  controlGroups: ["control-groups?/groups/0"],
};
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

function control(
  type: Structure3DControl["type"],
  target: Structure3DControl["target"],
): Structure3DControl {
  return { type, axis: "x", target };
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
        control("beam", GROUP_0),
      ],
      visual: { quality: "high", resource: MODEL },
    });

    expect(issueIds()).toEqual({});
  });

  it("reports a control driven the way its type isn't", () => {
    addStructureWithRoot({
      controls: [
        control("beam", { type: "parameter", parameter: { id: PAN } }),
        control("rotate", GROUP_0),
      ],
    });

    expect(issueIds()).toEqual({
      [ROOT]: [
        "control.0 deviceClassEditor.structure3D.issue.beamNeedsControlGroups",
        "control.1 deviceClassEditor.structure3D.issue.needsParameter",
      ],
    });
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
        control("rotate", {
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

  it("reports a beam driven by no control groups", () => {
    addStructureWithRoot({
      controls: [control("beam", { type: "controlGroups", controlGroups: [] })],
    });

    expect(issueIds()).toEqual({
      [ROOT]: ["control.0 deviceClassEditor.structure3D.issue.noControlGroups"],
    });
  });

  it("finds nothing wrong with a beam placed at emitters, with an aperture", () => {
    addEmitters();
    addStructureWithRoot({
      controls: [
        {
          ...control("beam", GROUP_0),
          emitters: [{ group: CELL_2 }, { group: CELL_1, emitter: CELL_1_RED }],
          aperture: { shape: "circle", diameter: 0.1 },
        },
      ],
    });

    expect(issueIds()).toEqual({});
  });

  it("reports emitters and an aperture on a control that isn't a beam", () => {
    addEmitters();
    addStructureWithRoot({
      controls: [
        {
          ...control("rotate", { type: "parameter", parameter: { id: PAN } }),
          emitters: [{ group: CELL_1 }],
          aperture: { shape: "rectangle", width: 0.1, height: 0 },
        },
      ],
    });

    expect(issueIds()).toEqual({
      [ROOT]: [
        "control.0 deviceClassEditor.structure3D.issue.emittersNeedBeam",
        "control.0 deviceClassEditor.structure3D.issue.apertureNeedsBeam",
        "control.0 deviceClassEditor.structure3D.issue.apertureNotPositive",
      ],
    });
  });

  it("reports an emitter that isn't in the emitters, or not in its group", () => {
    addEmitters();
    addStructureWithRoot({
      controls: [
        {
          ...control("beam", GROUP_0),
          emitters: [{ group: CELL_2, emitter: CELL_1_RED }],
        },
        {
          ...control("beam", GROUP_0),
          emitters: [{ group: EntityId("deleted") }],
        },
      ],
    });

    const issues = validateStructure3D(currentEditor(), loadDefaultLibraries());

    expect(
      issues[ROOT]?.map((issue) => [issue.message.id, issue.message.values]),
    ).toEqual([
      [
        "deviceClassEditor.structure3D.issue.emitterMissing",
        { emitter: "cell-2 / red" },
      ],
      [
        "deviceClassEditor.structure3D.issue.emitterMissing",
        { emitter: "deleted" },
      ],
    ]);
  });

  it("reports an emitter placed at two nodes, directly or by its group", () => {
    const CHILD = EntityId("child-node");
    addEmitters();
    addStructureWithRoot({
      children: [CHILD],
      controls: [
        { ...control("beam", GROUP_0), emitters: [{ group: CELL_1 }] },
      ],
    });
    updateCurrentEditor(testUndoLabel("Add child"), (editor) => {
      editor.structure3DNodes[CHILD] = {
        codexId: CodexId("lens"),
        parent: ROOT,
        children: [],
        transform: { type: "trs" },
        controls: [
          {
            ...control("beam", GROUP_0),
            emitters: [
              { group: CELL_2 },
              { group: CELL_1, emitter: CELL_1_RED },
            ],
          },
        ],
        localized: {},
      };
    });

    const issues = validateStructure3D(currentEditor(), loadDefaultLibraries());

    expect(issues[ROOT]?.map((issue) => issue.message.values)).toEqual([
      { emitter: "cell-1", node: "lens" },
    ]);
    expect(issues[CHILD]?.map((issue) => issue.message.values)).toEqual([
      { emitter: "cell-1 / red", node: "base" },
    ]);
  });

  it("reports a repeat that can't make copies", () => {
    addStructureWithRoot({
      repeat: { count: 0, step: {}, index: "1st" },
    });

    expect(issueIds()).toEqual({
      [ROOT]: [
        "repeat deviceClassEditor.structure3D.issue.repeatCount",
        "repeat deviceClassEditor.structure3D.issue.repeatStepEmpty",
        "repeat deviceClassEditor.structure3D.issue.repeatIndexName",
      ],
    });
  });

  it("reports an index name taken above, and placeholders naming no repeat", () => {
    const CHILD = EntityId("child-node");
    addStructureWithRoot({
      children: [CHILD],
      repeat: { count: 2, step: { translate: [1, 0, 0] }, index: "i" },
    });
    updateCurrentEditor(testUndoLabel("Add child"), (editor) => {
      editor.structure3DNodes[CHILD] = {
        codexId: CodexId("lens"),
        parent: ROOT,
        children: [],
        transform: { type: "trs" },
        accessoryLocation: "slot-${k}",
        controls: [
          {
            ...control("beam", GROUP_0),
            emitters: [{ group: codexIdAsEntityId("px-${j}") }],
          },
        ],
        repeat: { count: 2, step: { translate: [0, 1, 0] }, index: "i" },
        localized: {},
      };
    });

    const issues = validateStructure3D(currentEditor(), loadDefaultLibraries());

    expect(
      issues[CHILD]?.map((issue) => [issue.field, issue.message.values]),
    ).toEqual([
      ["accessoryLocation", { name: "k" }],
      ["repeat", { name: "i" }],
      ["control.0", { name: "j" }],
    ]);
  });

  it("checks the emitters and parameter of every copy", () => {
    const [PX_0, PX_1] = [EntityId("px-0-group"), EntityId("px-1-group")];
    addEmitters();
    updateCurrentEditor(testUndoLabel("Add pixel groups"), (editor) => {
      editor.emitterGroups[PX_0] = { codexId: CodexId("px-0"), emitters: [] };
      editor.emitterGroups[PX_1] = { codexId: CodexId("px-1"), emitters: [] };
      editor.emittersStructure?.emitterGroups.push(PX_0, PX_1);
    });
    addStructureWithRoot({
      repeat: { count: 3, step: { translate: [1, 0, 0] }, index: "i" },
      controls: [
        {
          ...control("beam", GROUP_0),
          emitters: [{ group: codexIdAsEntityId("px-${i}") }],
        },
        control("rotate", {
          type: "parameter",
          parameter: { id: codexIdAsEntityId("tilt[${i}]") },
        }),
      ],
    });

    const issues = validateStructure3D(currentEditor(), loadDefaultLibraries());

    expect(
      issues[ROOT]?.map((issue) => [issue.message.id, issue.message.values]),
    ).toEqual([
      [
        "deviceClassEditor.structure3D.issue.emitterMissing",
        { emitter: "px-2" },
      ],
      [
        "deviceClassEditor.structure3D.issue.parameterMissingInCopy",
        { parameter: "tilt[0]" },
      ],
    ]);
  });

  it("reports an emitter that every copy of a repeated node names", () => {
    addEmitters();
    addStructureWithRoot({
      repeat: { count: 2, step: { translate: [1, 0, 0] } },
      controls: [
        { ...control("beam", GROUP_0), emitters: [{ group: CELL_1 }] },
      ],
    });

    const issues = validateStructure3D(currentEditor(), loadDefaultLibraries());

    expect(issues[ROOT]?.map((issue) => issue.message.values)).toEqual([
      { emitter: "cell-1", node: "base[1]" },
    ]);
  });

  it("reports node IDs repeated anywhere in the structure", () => {
    const CHILD = EntityId("child-node");
    addStructureWithRoot({ children: [CHILD] });
    updateCurrentEditor(testUndoLabel("Add child"), (editor) => {
      editor.structure3DNodes[CHILD] = {
        // The root's ID, one level down
        codexId: CodexId("base"),
        parent: ROOT,
        children: [],
        transform: { type: "trs" },
        controls: [],
        localized: {},
      };
    });

    expect(issueIds()).toEqual({
      [ROOT]: ["id deviceClassEditor.structure3D.issue.idNotUnique"],
      [CHILD]: ["id deviceClassEditor.structure3D.issue.idNotUnique"],
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
