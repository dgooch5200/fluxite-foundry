import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Group, Matrix4 } from "three";
import { act, render, screen } from "test/render";
import {
  createEmptyDeviceClassEditor,
  currentEditor,
  resetAllStores,
  TEST_EDITOR_ID,
} from "test/utils";
import { assetStorage } from "app/assetStorage";
import { EntityId } from "app/persistentState";
import { openFile } from "app/openFile";
import { initUndo, undo } from "app/undo";
import { NodeEditor } from "./NodeEditor";
import { MOTION_LIBRARY } from "features/deviceClassEditor/export";
import { MODEL_RESOURCE_CLASS } from "./validation";
import {
  addStructureWithRoot,
  control,
  ROOT,
  showModelAtRoot,
} from "./testFixtures";

vi.mock("app/openFile", () => ({ openFile: vi.fn() }));

const { parseAsync } = vi.hoisted(() => ({ parseAsync: vi.fn() }));
vi.mock("three-stdlib", () => ({
  GLTFLoader: class {
    parseAsync = parseAsync;
  },
}));

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
    act(() => undo(TEST_EDITOR_ID));
    expect(currentEditor().resources).toEqual({});
    expect(currentEditor().structure3DNodes[ROOT].visual).toBeUndefined();
  });

  it("picks the node or scene from the names in the model", async () => {
    const user = userEvent.setup();
    const assetId = await assetStorage.storeAsset(
      new ArrayBuffer(4),
      "model/gltf-binary",
    );
    showModelAtRoot(assetId, "Yoke");
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

describe("NodeEditor with references an import left empty", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
  });

  it("shows the node rather than failing", () => {
    addStructureWithRoot({
      controls: [
        control("rotate", {
          type: "parameter",
          parameter: { id: EntityId("") },
        }),
      ],
      visual: { quality: "high", resource: EntityId("") },
    });

    render(<NodeEditor id={ROOT} issues={[]} />);

    expect(screen.getByText("Controls")).toBeInTheDocument();
  });
});

describe("NodeEditor transform", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
    addStructureWithRoot();
  });

  const transform = () => currentEditor().structure3DNodes[ROOT].transform;

  it("edits translate and rotate, then a matrix that starts at identity", async () => {
    const user = userEvent.setup();
    const enter = async (name: string, text: string) => {
      const input = screen.getByRole("textbox", { name });
      await user.clear(input);
      await user.type(input, `${text}{Enter}`);
    };
    render(<NodeEditor id={ROOT} issues={[]} />);

    await enter("Translate X", "2");
    await enter("Rotate Z", "-90");
    expect(transform()).toEqual({
      type: "trs",
      translate: [2, 0, 0],
      rotate: [0, 0, 270],
    });
    expect(screen.getByRole("textbox", { name: "Rotate Z" })).toHaveValue(
      "270",
    );

    await user.click(screen.getByRole("radio", { name: "Matrix" }));
    expect(transform()).toEqual({
      type: "matrix",
      matrix: new Matrix4().toArray(),
    });

    await enter("Matrix row 1, column 4", "5");
    expect(transform()).toMatchObject({
      matrix: new Matrix4().setPosition(5, 0, 0).toArray(),
    });
  });
});
