import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, render, screen } from "test/render";
import {
  createEmptyDeviceClassEditor,
  currentEditor,
  resetAllStores,
  testUndoLabel,
} from "test/utils";
import { updateCurrentEditor } from "features/deviceClassEditor/state";
import { Structure3DEditor } from "./Structure3DEditor";
import { MOTION_LIBRARY } from "features/deviceClassEditor/export";
import {
  addMotionParameters,
  addStructureWithRoot,
  control,
  PAN,
} from "./testFixtures";

// happy-dom has no WebGL.
vi.mock("./Viewport", () => ({ Structure3DViewport: () => null }));

const PARAMETER_MISSING =
  "The parameter that drove this control no longer exists. Choose another one.";

describe("Structure3DEditor", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
    addMotionParameters();
  });

  it("builds a structure of nodes, transforms and controls", async () => {
    const user = userEvent.setup();
    render(<Structure3DEditor />);

    await user.click(
      screen.getByRole("button", { name: "Create Structure 3D" }),
    );
    await user.click(screen.getByRole("button", { name: "Add Root Node" }));
    await user.click(screen.getByRole("button", { name: "Add Child Node" }));

    const translateX = screen.getByLabelText("Translate X");
    await user.clear(translateX);
    await user.type(translateX, "1.5{Enter}");

    await user.click(screen.getByRole("button", { name: "Add Control" }));
    // A rotate control is offered only the parameters measured in degrees.
    await user.click(screen.getByRole("combobox", { name: "Parameter" }));
    expect(
      screen.queryByRole("option", { name: "track" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "pan" }));

    const editor = currentEditor();
    const [rootId] = editor.structure3D!.rootNodes;
    const root = editor.structure3DNodes[rootId];
    expect(root.codexId).toBe("node");
    expect(editor.structure3DNodes[root.children[0]]).toMatchObject({
      codexId: "node",
      parent: rootId,
      transform: { type: "trs", translate: [1.5, 0, 0] },
      controls: [
        {
          type: "rotate",
          axis: "x",
          target: { type: "parameter", parameter: { id: PAN } },
        },
      ],
    });
  });

  it("imports the motion library when creating the structure", async () => {
    const user = userEvent.setup();
    updateCurrentEditor(testUndoLabel("Drop library"), (editor) => {
      delete editor.libraries[MOTION_LIBRARY];
    });
    render(<Structure3DEditor />);

    await user.click(
      screen.getByRole("button", { name: "Create Structure 3D" }),
    );

    expect(currentEditor().libraries[MOTION_LIBRARY]).toBe("1.0.0");
    expect(currentEditor().structure3D).toEqual({
      codexId: "structure-3d",
      access: ["read"],
      lifetime: "static",
      rootNodes: [],
    });
  });

  it("warns once a control's parameter is deleted", async () => {
    const user = userEvent.setup();
    addStructureWithRoot({
      controls: [
        control("rotate", { type: "parameter", parameter: { id: PAN } }),
      ],
    });
    render(<Structure3DEditor />);
    await user.click(screen.getByRole("button", { name: "base" }));
    expect(screen.queryByText(PARAMETER_MISSING)).not.toBeInTheDocument();

    act(() =>
      updateCurrentEditor(testUndoLabel("Delete parameter"), (editor) => {
        delete editor.parameters[PAN];
      }),
    );

    expect(screen.getByText(PARAMETER_MISSING)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: PARAMETER_MISSING }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Parameter" }),
    ).toHaveTextContent(PAN);
  });

  it("deletes a node with everything beneath it", async () => {
    const user = userEvent.setup();
    addStructureWithRoot();
    render(<Structure3DEditor />);
    await user.click(screen.getByRole("button", { name: "base" }));
    await user.click(screen.getByRole("button", { name: "Add Child Node" }));
    await user.type(screen.getByLabelText("Display Name"), "Arm{Enter}");
    const localizationCount = Object.keys(currentEditor().localizations).length;

    await user.click(screen.getByRole("button", { name: "base" }));
    await user.click(screen.getByRole("button", { name: "Delete Node" }));

    const editor = currentEditor();
    expect(editor.structure3D!.rootNodes).toEqual([]);
    expect(editor.structure3DNodes).toEqual({});
    expect(Object.keys(editor.localizations)).toHaveLength(
      localizationCount - 1,
    );
    expect(screen.getByRole("button", { name: "Structure" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
