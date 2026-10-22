import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Group } from "three";
import { act, render, screen } from "test/render";
import {
  createEmptyDeviceClassEditor,
  resetAllStores,
  testUndoLabel,
} from "test/utils";
import { assetStorage } from "app/assetStorage";
import { CodexId, EntityId } from "app/persistentState";
import { openFile } from "app/openFile";
import { initUndo, undo } from "app/undo";
import { updateCurrentEditor } from "features/deviceClassEditor/state";
import { NodeEditor } from "./NodeEditor";
import { MOTION_LIBRARY } from "features/deviceClassEditor/export";
import { MODEL_RESOURCE_CLASS } from "./validation";
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
} from "./testFixtures";

vi.mock("app/openFile", () => ({ openFile: vi.fn() }));

const { parseAsync } = vi.hoisted(() => ({ parseAsync: vi.fn() }));
vi.mock("three-stdlib", () => ({
  GLTFLoader: class {
    parseAsync = parseAsync;
  },
}));

const MODEL = EntityId("model-resource");
const GROUP_0 = {
  type: "controlGroups" as const,
  controlGroups: ["control-groups?/groups/0"],
};
const EDITOR = EntityId("test-editor-id");

// A model whose default scene holds a base with a head on it.
function fakeGltf() {
  const scene = new Group();
  scene.name = "Scene";
  const base = new Group();
  base.name = "Base";
  const head = new Group();
  head.name = "Head";
  base.add(head);
  scene.add(base);
  return { scene, scenes: [scene] };
}

describe("NodeEditor model", () => {
  let stopUndo: () => void;

  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
    addStructureWithRoot();
    parseAsync.mockResolvedValue(fakeGltf());
    stopUndo = initUndo();
  });

  afterEach(() => stopUndo());

  it("imports a glTF file as a 3d-model resource shown at the node", async () => {
    const user = userEvent.setup();
    vi.mocked(openFile).mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])]),
      name: "Moving Head.glb",
    });
    render(<NodeEditor id={ROOT} issues={[]} />);

    await user.click(screen.getByRole("button", { name: "Import glTF…" }));

    // The picker lists the names once the imported model has been read.
    await screen.findByRole("combobox", { name: "glTF Node or Scene" });
    const { visual } = currentEditor().structure3DNodes[ROOT];
    expect(visual).toEqual({ quality: "high", resource: expect.any(String) });
    const resource = currentEditor().resources[visual!.resource];
    expect(resource).toMatchObject({
      codexId: "moving-head",
      class: {
        type: "imported",
        library: MOTION_LIBRARY,
        codexId: MODEL_RESOURCE_CLASS,
      },
      access: ["read"],
      lifetime: "static",
      mediaType: "model/gltf-binary",
    });
    const assetId = currentEditor().resourceAssets[resource.default!];
    expect(await assetStorage.getAsset(assetId)).toMatchObject({
      mediaType: "model/gltf-binary",
      originalFileName: "Moving Head.glb",
    });

    // The whole import is one change.
    act(() => undo(EDITOR));
    expect(currentEditor().resources).toEqual({});
    expect(currentEditor().structure3DNodes[ROOT].visual).toBeUndefined();
  });

  it("picks the node or scene from the names in the model", async () => {
    const user = userEvent.setup();
    const assetId = await assetStorage.storeAsset(
      new ArrayBuffer(4),
      "model/gltf-binary",
    );
    addMotionResource(MODEL);
    updateCurrentEditor(testUndoLabel("Show the model"), (editor) => {
      editor.resources[MODEL].default = "model.glb";
      editor.resourceAssets["model.glb"] = assetId;
      editor.structure3DNodes[ROOT].visual = {
        quality: "high",
        resource: MODEL,
        nodeOrSceneName: "Yoke",
      };
    });
    render(<NodeEditor id={ROOT} issues={[]} />);

    const missing = await screen.findByText(
      "The model has no node or scene named Yoke.",
    );
    const picker = screen.getByRole("combobox", {
      name: "glTF Node or Scene",
    });
    await user.click(picker);
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Default scene", "Scene", "Base", "Head", "Yoke"]);
    await user.click(screen.getByRole("option", { name: "Head" }));

    expect(currentEditor().structure3DNodes[ROOT].visual?.nodeOrSceneName).toBe(
      "Head",
    );
    expect(missing).not.toBeInTheDocument();

    await user.click(picker);
    await user.click(screen.getByRole("option", { name: "Default scene" }));

    expect(
      currentEditor().structure3DNodes[ROOT].visual?.nodeOrSceneName,
    ).toBeUndefined();
  });
});

describe("NodeEditor beam", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
  });

  it("places a beam at emitters and gives it an aperture", async () => {
    const user = userEvent.setup();
    addEmitters();
    addStructureWithRoot({
      controls: [
        {
          type: "beam",
          axis: "z",
          target: GROUP_0,
        },
      ],
    });
    render(<NodeEditor id={ROOT} issues={[]} />);

    await user.click(
      screen.getByRole("combobox", { name: "Add emitter or group" }),
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["cell-1", "cell-1 / red", "cell-2"]);
    await user.click(screen.getByRole("option", { name: "cell-1 / red" }));
    await user.click(
      screen.getByRole("combobox", { name: "Add emitter or group" }),
    );
    await user.click(screen.getByRole("option", { name: "cell-2" }));
    await user.click(screen.getByRole("combobox", { name: "Aperture" }));
    await user.click(screen.getByRole("option", { name: "Circle" }));
    const diameter = screen.getByRole("textbox", { name: "Diameter (m)" });
    await user.clear(diameter);
    await user.type(diameter, "0.2{Enter}");

    expect(currentEditor().structure3DNodes[ROOT].controls).toEqual([
      {
        type: "beam",
        axis: "z",
        target: GROUP_0,
        emitters: [{ group: CELL_1, emitter: CELL_1_RED }, { group: CELL_2 }],
        aperture: { shape: "circle", diameter: 0.2 },
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove cell-2" }));
    await user.click(
      screen.getByRole("button", { name: "Remove cell-1 / red" }),
    );

    expect(
      currentEditor().structure3DNodes[ROOT].controls[0],
    ).not.toHaveProperty("emitters");
  });

  it("drives each type of control the way the standard says", async () => {
    const user = userEvent.setup();
    addMotionParameters();
    addStructureWithRoot({
      controls: [
        {
          type: "rotate",
          axis: "z",
          target: { type: "parameter", parameter: { id: PAN } },
        },
      ],
    });
    render(<NodeEditor id={ROOT} issues={[]} />);
    const drivenByOptions = async () => {
      await user.click(screen.getByRole("combobox", { name: "Driven By" }));
      const options = screen
        .getAllByRole("option")
        .map((option) => option.textContent);
      await user.keyboard("{Escape}");
      return options;
    };

    expect(await drivenByOptions()).toEqual(["Parameter"]);
    expect(
      screen.queryByRole("combobox", { name: "Aperture" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Beam" }));

    expect(currentEditor().structure3DNodes[ROOT].controls[0].target).toEqual({
      type: "controlGroups",
      controlGroups: [],
    });
    expect(await drivenByOptions()).toEqual(["Control Groups"]);
    expect(
      screen.getByRole("combobox", { name: "Aperture" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Rotate" }));

    expect(currentEditor().structure3DNodes[ROOT].controls[0].target).toEqual({
      type: "parameter",
      parameter: { id: PAN },
    });
  });
});

describe("NodeEditor repeat", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
  });

  it("repeats a node a step apart, naming its index", async () => {
    const user = userEvent.setup();
    addStructureWithRoot();
    render(<NodeEditor id={ROOT} issues={[]} />);

    await user.click(screen.getByRole("checkbox", { name: "Repeat" }));
    const count = screen.getByRole("textbox", { name: "Count" });
    await user.clear(count);
    await user.type(count, "60{Enter}");
    const stepX = screen.getByRole("textbox", { name: "Step translate X" });
    await user.clear(stepX);
    await user.type(stepX, "0.02{Enter}");
    await user.type(
      screen.getByRole("textbox", { name: "Index Name" }),
      "i{Enter}",
    );

    expect(currentEditor().structure3DNodes[ROOT].repeat).toEqual({
      count: 60,
      step: { translate: [0.02, 0, 0] },
      index: "i",
    });

    await user.click(screen.getByRole("checkbox", { name: "Repeat" }));

    expect(currentEditor().structure3DNodes[ROOT]).not.toHaveProperty("repeat");
  });

  it("lets each copy name its own emitters and parameter element", async () => {
    const user = userEvent.setup();
    addEmitters();
    updateCurrentEditor(testUndoLabel("Add tilt"), (editor) => {
      editor.parameters[EntityId("tilt-parameter")] = {
        codexId: CodexId("tilt"),
        class: {
          type: "imported",
          library: MOTION_LIBRARY,
          codexId: CodexId("motion/rotate/offset"),
        },
        count: { type: "fixed", value: 4 },
        access: ["write"],
        lifetime: "runtime",
        localized: {},
      };
    });
    addStructureWithRoot({
      repeat: { count: 4, step: { translate: [0.1, 0, 0] }, index: "i" },
      controls: [
        { type: "beam", axis: "z", target: GROUP_0 },
        {
          type: "rotate",
          axis: "x",
          target: { type: "parameter", parameter: { id: PAN } },
        },
      ],
    });
    render(<NodeEditor id={ROOT} issues={[]} />);

    // "{{" types a literal "{".
    await user.type(
      screen.getByRole("textbox", { name: "Add emitter by path" }),
      "emitters?/emitterGroups/px-${{i}{Enter}",
    );
    expect(screen.getByText("px-${i}")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Parameter" }));
    await user.click(screen.getByRole("option", { name: "tilt[${i}]" }));

    const [beam, rotate] = currentEditor().structure3DNodes[ROOT].controls;
    expect(beam.emitters).toEqual([{ group: "px-${i}" }]);
    expect(rotate.target).toEqual({
      type: "parameter",
      parameter: { id: "tilt[${i}]" },
    });
  });
});

describe("NodeEditor matrix", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
  });

  it("lays the matrix out row-major, across then down", async () => {
    const user = userEvent.setup();
    // prettier-ignore
    addStructureWithRoot({
      transform: {
        type: "matrix",
        matrix: [
          1, 0, 0, 4,
          0, 1, 0, 5,
          0, 0, 1, 6,
        ],
      },
    });
    render(<NodeEditor id={ROOT} issues={[]} />);

    const cell = (row: number, column: number) =>
      screen.getByRole("textbox", {
        name: `Matrix row ${row}, column ${column}`,
      });
    expect(cell(1, 4)).toHaveValue("4");
    expect(cell(3, 4)).toHaveValue("6");
    expect(cell(4, 4)).toHaveValue("1");

    await user.clear(cell(2, 4));
    await user.type(cell(2, 4), "7{Enter}");

    // prettier-ignore
    expect(currentEditor().structure3DNodes[ROOT].transform).toEqual({
      type: "matrix",
      matrix: [
        1, 0, 0, 4,
        0, 1, 0, 7,
        0, 0, 1, 6,
        0, 0, 0, 1,
      ],
    });
  });
});

describe("NodeEditor with references an import left empty", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
  });

  it("shows the node rather than failing", () => {
    // What import makes of `"parameter": ""` and `"visual": {"high": ""}`
    addStructureWithRoot({
      controls: [
        {
          type: "rotate",
          axis: "z",
          target: { type: "parameter", parameter: { id: EntityId("") } },
        },
      ],
      visual: { quality: "high", resource: EntityId("") },
    });

    render(<NodeEditor id={ROOT} issues={[]} />);

    expect(screen.getByText("Controls")).toBeInTheDocument();
  });
});
