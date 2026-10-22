import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "test/render";
import {
  createEmptyDeviceClassEditor,
  resetAllStores,
  testUndoLabel,
} from "test/utils";
import { CodexId } from "app/persistentState";
import { updateCurrentEditor } from "features/deviceClassEditor/state";
import {
  addEmitters,
  addMotionParameters,
  CELL_1,
  CELL_1_RED,
  CELL_2,
  currentEditor,
  PAN,
} from "features/structure3DEditor/testFixtures";
import { EmittersEditor } from "./EmittersEditor";

describe("EmittersEditor", () => {
  beforeEach(() => {
    resetAllStores();
    createEmptyDeviceClassEditor();
  });

  it("creates the structure, then a group with an emitter in it", async () => {
    const user = userEvent.setup();
    addMotionParameters();
    render(<EmittersEditor />);

    await user.click(screen.getByRole("button", { name: "Create Emitters" }));
    await user.click(screen.getByRole("button", { name: "Add Emitter Group" }));
    const groupId = screen.getByRole("textbox", { name: "Group ID" });
    await user.clear(groupId);
    await user.type(groupId, "cell-1{Enter}");
    await user.click(screen.getByRole("button", { name: "Add Emitter" }));
    await user.click(screen.getByRole("combobox", { name: "Common Color" }));
    await user.click(screen.getByRole("option", { name: "Deep Red" }));
    await user.click(
      screen.getByRole("combobox", { name: "Intensity Parameter" }),
    );
    await user.click(screen.getByRole("option", { name: "pan" }));
    await user.type(
      screen.getByRole("textbox", { name: "Relative Brightness" }),
      "0.5{Enter}",
    );

    const editor = currentEditor();
    const [group] = Object.values(editor.emitterGroups);
    expect(editor.emittersStructure?.emitterGroups).toHaveLength(1);
    expect(group).toEqual({
      codexId: "cell-1",
      emitters: [expect.any(String)],
    });
    expect(editor.emitters[group.emitters[0]]).toEqual({
      codexId: "emitter",
      group: editor.emittersStructure?.emitterGroups[0],
      commonColor: "deep-red",
      directControl: { id: PAN },
      relativeBrightness: 0.5,
    });
  });

  it("deletes a group with its emitters, and control groups let go of it", async () => {
    const user = userEvent.setup();
    addEmitters();
    updateCurrentEditor(testUndoLabel("Add control group"), (editor) => {
      editor.emittersStructure?.controlGroups.push({
        codexId: CodexId("all"),
        emitterGroups: [CELL_1, CELL_2],
        colorSchemes: {},
      });
    });
    render(<EmittersEditor />);

    await user.click(
      screen.getByRole("button", { name: "Remove group cell-1" }),
    );

    const editor = currentEditor();
    expect(editor.emitterGroups[CELL_1]).toBeUndefined();
    expect(editor.emitters[CELL_1_RED]).toBeUndefined();
    expect(editor.emittersStructure?.emitterGroups).toEqual([CELL_2]);
    expect(editor.emittersStructure?.controlGroups[0].emitterGroups).toEqual([
      CELL_2,
    ]);
  });

  it("removes one emitter from its group", async () => {
    const user = userEvent.setup();
    addEmitters();
    render(<EmittersEditor />);

    await user.click(
      screen.getByRole("button", { name: "Remove emitter red" }),
    );

    const editor = currentEditor();
    expect(editor.emitters).toEqual({});
    expect(editor.emitterGroups[CELL_1].emitters).toEqual([]);
    expect(editor.emitterGroups[CELL_2]).toBeDefined();
  });
});
