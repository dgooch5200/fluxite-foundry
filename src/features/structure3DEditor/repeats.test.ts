import { describe, expect, test } from "vitest";
import {
  CodexId,
  DeviceClassDocument,
  EntityId,
  Structure3DNode,
} from "app/persistentState";
import { codexIdAsEntityId } from "features/deviceClassEditor/referenceResolution";
import {
  emitterForCopy,
  fillIndices,
  indexNamesAt,
  nodeCopies,
  parameterForCopy,
  placeholderNames,
} from "./repeats";

const [ROW, PX, LENS] = ["row", "px", "lens"].map(EntityId);

function node(fields: Partial<Structure3DNode>): Structure3DNode {
  return {
    codexId: CodexId("node"),
    children: [],
    transform: { type: "trs" },
    controls: [],
    localized: {},
    ...fields,
  };
}

// A panel: 2 rows (index r) of 3 pixels (index c), each with a lens.
const PANEL = {
  [ROW]: node({
    children: [PX],
    repeat: { count: 2, step: { translate: [0, 0.1, 0] }, index: "r" },
  }),
  [PX]: node({
    parent: ROW,
    children: [LENS],
    repeat: { count: 3, step: { translate: [0.1, 0, 0] }, index: "c" },
  }),
  [LENS]: node({ parent: PX }),
};

describe("placeholders", () => {
  test("are named in order and filled in where the copy has a number", () => {
    expect(placeholderNames("px-${r}-${c}")).toEqual(["r", "c"]);
    expect(fillIndices("px-${r}-${c}", { r: 1 })).toBe("px-1-${c}");
  });
});

describe("nodeCopies", () => {
  test("gives one copy per combination of the repeats above, outermost first", () => {
    expect(nodeCopies(PANEL, LENS)).toEqual([
      { suffix: "[0][0]", indices: { r: 0, c: 0 } },
      { suffix: "[0][1]", indices: { r: 0, c: 1 } },
      { suffix: "[0][2]", indices: { r: 0, c: 2 } },
      { suffix: "[1][0]", indices: { r: 1, c: 0 } },
      { suffix: "[1][1]", indices: { r: 1, c: 1 } },
      { suffix: "[1][2]", indices: { r: 1, c: 2 } },
    ]);
    expect(indexNamesAt(PANEL, LENS)).toEqual(["r", "c"]);
  });

  test("keeps one copy of a repeat whose count isn't a whole number", () => {
    const nodes = { [ROW]: node({ repeat: { count: 0, step: {} } }) };

    expect(nodeCopies(nodes, ROW)).toEqual([{ suffix: "[0]", indices: {} }]);
  });
});

describe("references for one copy", () => {
  const RED = EntityId("red-parameter");
  const PX_1 = EntityId("px-1-group");
  const PX_1_RED = EntityId("px-1-red-emitter");
  const editor: Pick<
    DeviceClassDocument,
    "parameters" | "emitterGroups" | "emitters"
  > = {
    parameters: {
      [RED]: {
        codexId: CodexId("red"),
        class: { type: "local", id: EntityId("class") },
        access: ["write"],
        lifetime: "runtime",
        localized: {},
      },
    },
    emitterGroups: {
      [PX_1]: { codexId: CodexId("px-1"), emitters: [PX_1_RED] },
    },
    emitters: { [PX_1_RED]: { codexId: CodexId("red"), group: PX_1 } },
  };

  test("fill in a parameter's index", () => {
    const ref = { id: codexIdAsEntityId("red[${c}]") };

    expect(parameterForCopy(editor.parameters, ref, { c: 2 })).toEqual({
      id: RED,
      index: 2,
    });
  });

  test("fill in an emitter group's ID, and find the emitter in it", () => {
    const ref = {
      group: codexIdAsEntityId("px-${c}"),
      emitter: codexIdAsEntityId("red"),
    };

    expect(emitterForCopy(editor, ref, { c: 1 })).toEqual({
      group: PX_1,
      emitter: PX_1_RED,
    });
    // A copy whose group isn't there keeps it by its codexId.
    expect(emitterForCopy(editor, ref, { c: 7 }).group).toBe("px-7");
  });

  test("leave references without placeholders alone", () => {
    const ref = { group: PX_1 };

    expect(emitterForCopy(editor, ref, { c: 1 })).toBe(ref);
  });
});
