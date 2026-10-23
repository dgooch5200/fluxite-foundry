import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { Toaster } from "sonner";
import { act, render, screen } from "test/render";
import {
  createEmptyDeviceClassEditor,
  resetAllStores,
  TEST_EDITOR_ID,
} from "test/utils";
import { assetStorage } from "app/assetStorage";
import { EntityId } from "app/persistentState";
import { initUndo, undo } from "app/undo";
import { setDmxParamStates } from "features/deviceClassEditor/controller/state";
import { ModelMenu, Structure3DViewport } from "./Viewport";
import { gltfObjectNames } from "./sceneGraph";
import { parseGltfAsset } from "./useGltf";
import {
  addMotionParameters,
  addStructureWithRoot,
  currentEditor,
  MODEL,
  PAN,
  ROOT,
  showModelAtRoot,
  TRACK,
} from "./testFixtures";

// happy-dom has no WebGL, so the 3D view draws nothing.
vi.mock("@react-three/fiber", () => ({
  Canvas: () => null,
  createPortal: vi.fn(),
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));

const DRIVEN_BY_DMX =
  "The DMX controller tab is posing the controls it has values for. Close it to pose them here.";

describe("Structure3DViewport", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
    addMotionParameters();
    addStructureWithRoot({
      controls: [
        {
          type: "rotate",
          axis: "z",
          target: { type: "parameter", parameter: { id: PAN } },
        },
        {
          type: "linear",
          axis: "x",
          target: { type: "parameter", parameter: { id: TRACK } },
        },
        {
          type: "beam",
          axis: "z",
          target: { type: "parameter", parameter: { id: PAN } },
        },
        {
          type: "rotate",
          axis: "y",
          target: {
            type: "controlGroups",
            controlGroups: ["control-groups?/groups/0"],
          },
        },
      ],
    });
  });

  it("poses the model with a slider per parameter-driven control", async () => {
    const user = userEvent.setup();
    render(<Structure3DViewport onSelectNode={vi.fn()} />);

    expect(screen.getAllByRole("slider")).toHaveLength(2);
    const pan = screen.getByRole("slider", { name: "pan on base" });
    expect(pan).toHaveAttribute("aria-valuemin", "-180");
    expect(pan).toHaveAttribute("aria-valuemax", "180");
    expect(
      screen.getByRole("slider", { name: "track on base" }),
    ).toHaveAttribute("aria-valuemax", "1");
    expect(screen.queryByText(DRIVEN_BY_DMX)).not.toBeInTheDocument();

    const before = currentEditor();
    act(() => pan.focus());
    await user.keyboard("{ArrowRight}");
    expect(pan).toHaveAttribute("aria-valuenow", "1");
    expect(currentEditor()).toBe(before);
  });

  it("has buttons to orbit the camera and center it on the selection", () => {
    const { rerender } = render(<Structure3DViewport onSelectNode={vi.fn()} />);

    for (const name of [
      "Orbit left",
      "Orbit right",
      "Orbit up",
      "Orbit down",
      "Zoom in",
      "Zoom out",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Center on the whole structure" }),
    ).toBeInTheDocument();

    const [rootId] = Object.keys(currentEditor().structure3DNodes);
    rerender(
      <Structure3DViewport
        selectedNodeId={EntityId(rootId)}
        onSelectNode={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Center on the selected node" }),
    ).toBeInTheDocument();
  });

  it("is resized from the handle under it, and remembers its size", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Structure3DViewport onSelectNode={vi.fn()} />);

    const handle = () =>
      screen.getByRole("separator", { name: "Resize the 3D view" });
    expect(handle()).toHaveAttribute("aria-valuenow", "320");

    act(() => handle().focus());
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(handle()).toHaveAttribute("aria-valuenow", "360");

    // It stops at its smallest.
    await user.keyboard("{ArrowUp>20/}");
    expect(handle()).toHaveAttribute("aria-valuenow", "160");

    unmount();
    render(<Structure3DViewport onSelectNode={vi.fn()} />);
    expect(handle()).toHaveAttribute("aria-valuenow", "160");
  });

  it("picks a finish and how to shade, and remembers them", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Structure3DViewport onSelectNode={vi.fn()} />);

    const ambientOcclusion = () =>
      screen.getByRole("button", { name: "Ambient occlusion" });
    const smoothShading = () =>
      screen.getByRole("button", { name: "Smooth shading" });
    const finish = (name: string) =>
      screen.getByRole("menuitemradio", { name });

    expect(ambientOcclusion()).toHaveAttribute("aria-pressed", "false");
    await user.click(ambientOcclusion());
    expect(ambientOcclusion()).toHaveAttribute("aria-pressed", "true");
    expect(smoothShading()).toHaveAttribute("aria-pressed", "false");
    await user.click(smoothShading());

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(finish("Gray")).toHaveAttribute("aria-checked", "true");
    await user.click(finish("By node"));

    unmount();
    render(<Structure3DViewport onSelectNode={vi.fn()} />);
    expect(ambientOcclusion()).toHaveAttribute("aria-pressed", "true");
    expect(smoothShading()).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(finish("By node")).toHaveAttribute("aria-checked", "true");
  });

  it("shows face orientation for a look, without remembering it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Structure3DViewport onSelectNode={vi.fn()} />);

    const faceOrientation = () =>
      screen.getByRole("button", { name: "Face orientation" });
    await user.click(faceOrientation());
    expect(faceOrientation()).toHaveAttribute("aria-pressed", "true");

    unmount();
    render(<Structure3DViewport onSelectNode={vi.fn()} />);
    expect(faceOrientation()).toHaveAttribute("aria-pressed", "false");
  });

  it("follows the DMX controller while it is running", () => {
    render(<Structure3DViewport onSelectNode={vi.fn()} />);

    act(() =>
      setDmxParamStates(TEST_EDITOR_ID, [
        { param: { id: "pan" }, value: { type: "numeric", value: 90 } },
      ]),
    );

    expect(screen.getByText(DRIVEN_BY_DMX)).toBeInTheDocument();
    const pan = screen.getByRole("slider", { name: "pan on base" });
    expect(pan).toHaveAttribute("aria-disabled", "true");
    expect(pan).toHaveAttribute("aria-valuenow", "90");
    // The controller has no value for track, so its slider still poses it.
    expect(
      screen.getByRole("slider", { name: "track on base" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("ModelMenu", () => {
  let stopUndo: () => void;

  async function showBox({ insideOut }: { insideOut: boolean }) {
    const geometry = new BoxGeometry();
    if (insideOut) {
      const index = geometry.index!;
      for (let i = 0; i < index.count; i += 3) {
        const b = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, b);
      }
      const normal = geometry.getAttribute("normal");
      for (let i = 0; i < normal.count; i++) {
        normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
      }
    }
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.name = "Moving Head";
    const scene = new Scene();
    scene.add(mesh);
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    const assetId = await assetStorage.storeAsset(
      glb as ArrayBuffer,
      "model/gltf-binary",
      "Box.glb",
    );
    showModelAtRoot(assetId, "Moving Head");
  }

  const renderMenu = () =>
    render(
      <>
        <ModelMenu
          nodeId={ROOT}
          x={0}
          y={0}
          nodeCodexId="base"
          onClose={vi.fn()}
        />
        <Toaster />
      </>,
    );

  const modelAssetId = () =>
    currentEditor().resourceAssets[currentEditor().resources[MODEL].default!];

  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
    addStructureWithRoot();
    stopUndo = initUndo();
  });

  afterEach(() => stopUndo());

  it("repairs the normals of the model it was opened on, as one change", async () => {
    const user = userEvent.setup();
    await showBox({ insideOut: true });
    const originalAssetId = modelAssetId();
    renderMenu();

    expect(screen.getByText("base")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Repair normals" }));

    expect(
      await screen.findByText(/^Turned 12 faces outward/),
    ).toBeInTheDocument();
    const repairedAssetId = modelAssetId();
    expect(repairedAssetId).not.toBe(originalAssetId);
    expect(await assetStorage.getAsset(repairedAssetId)).toMatchObject({
      mediaType: "model/gltf-binary",
      originalFileName: "Box.glb",
    });
    // The repaired file keeps the names the node refers to.
    expect(gltfObjectNames(await parseGltfAsset(repairedAssetId))).toContain(
      "Moving Head",
    );

    act(() => undo(TEST_EDITOR_ID));
    expect(modelAssetId()).toBe(originalAssetId);
  });

  it("leaves a model with nothing to repair as it is", async () => {
    const user = userEvent.setup();
    await showBox({ insideOut: false });
    const originalAssetId = modelAssetId();
    renderMenu();

    await user.click(screen.getByRole("menuitem", { name: "Repair mesh" }));

    expect(
      await screen.findByText("The model had nothing to repair."),
    ).toBeInTheDocument();
    expect(modelAssetId()).toBe(originalAssetId);
  });
});
