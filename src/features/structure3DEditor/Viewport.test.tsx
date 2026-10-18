import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, render, screen } from "test/render";
import { createEmptyDeviceClassEditor, resetAllStores } from "test/utils";
import { EntityId } from "app/persistentState";
import { setDmxParamStates } from "features/deviceClassEditor/controller/state";
import { Structure3DViewport } from "./Viewport";
import {
  addMotionParameters,
  addStructureWithRoot,
  currentEditor,
  PAN,
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

    // Posing is only for looking, and doesn't change the document.
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
      setDmxParamStates(EntityId("test-editor-id"), [
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
