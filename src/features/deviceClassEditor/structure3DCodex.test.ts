import { describe, test, expect } from "vitest";
import Ajv2019 from "ajv/dist/2019";
import { DeviceClass, parseFluxiteCodexDocument } from "@cpwg-community/delver";
import {
  DeviceClassDocument,
  EntityId,
  Structure3DNode,
} from "app/persistentState";
import structure3DSchema from "e173/libraries/motion/draft-2027-1/schemas/structure-3d.json";
import encoreDocument from "e173/examples/draft-2027-1/device-classes/martin_mac_encore_performance_cld.fcd?raw";
import movableDocument from "e173/examples/draft-2027-1/device-classes/movable.fcd?raw";
import { getImportedDeviceClassEditor } from "./import";
import {
  exportDeviceClass,
  STRUCTURE_3D_CLASS,
  MOTION_LIBRARY,
} from "./export";

function exampleDeviceClass(documentText: string): DeviceClass {
  const { document, errors } = parseFluxiteCodexDocument(documentText);
  expect(errors).toEqual([]);
  const [versions] = Object.values(document.e173doc.deviceClasses ?? {});
  const [deviceClass] = Object.values(versions);
  return deviceClass;
}

function importDeviceClass(deviceClass: DeviceClass): DeviceClassDocument {
  return getImportedDeviceClassEditor(
    { type: "org", id: "com.example" },
    "test",
    "1.0.0",
    deviceClass,
    "en-US",
  );
}

function nodeNamed(
  editor: DeviceClassDocument,
  codexId: string,
): [EntityId, Structure3DNode] {
  const entry = Object.entries(editor.structure3DNodes).find(
    ([, node]) => node.codexId === codexId,
  );
  if (!entry) {
    throw new Error(`No structure 3D node ${codexId}`);
  }
  return [EntityId(entry[0]), entry[1]];
}

// The structure-3d `default` objects in an exported device class.
function exportedStructure3Ds(deviceClass: DeviceClass): object[] {
  return Object.values(deviceClass.structures ?? {}).flatMap((structure) =>
    structure.type === "Other" &&
    structure.value.library === MOTION_LIBRARY &&
    structure.value.class === STRUCTURE_3D_CLASS
      ? [structure.value.default]
      : [],
  );
}

function minimalDeviceClass(): DeviceClass {
  return {
    libraries: {},
    "@description": "description",
    publishDate: "2024-01-01T00:00:00.000Z",
    author: "Test Author",
    info: {
      manufacturer: { name: "Test Manufacturer" },
      model: {
        name: "Test Model",
        category: "lighting",
        subcategory: "fixed-profile",
      },
    },
    history: {},
  };
}

function withStructure3DNodes(nodes: object): DeviceClass {
  return {
    ...minimalDeviceClass(),
    structures: {
      structure: {
        type: "Other",
        value: {
          library: MOTION_LIBRARY,
          class: STRUCTURE_3D_CLASS,
          access: ["read"],
          lifetime: "static",
          default: { nodes },
        },
      },
    },
  };
}

describe("importing the MAC Encore structure 3D", () => {
  const editor = importDeviceClass(exampleDeviceClass(encoreDocument));

  test("keeps the base, pan, tilt hierarchy", () => {
    const [baseId, base] = nodeNamed(editor, "base");
    const [panId, pan] = nodeNamed(editor, "pan");
    const [tiltId, tilt] = nodeNamed(editor, "tilt");

    expect(editor.structure3D?.rootNodes).toEqual([baseId]);
    expect(base.children).toEqual([panId]);
    expect(pan.parent).toBe(baseId);
    expect(pan.children).toEqual([tiltId]);
    expect(tilt.parent).toBe(panId);
  });

  test("reads a control given as a bare object as a list of one", () => {
    const [, pan] = nodeNamed(editor, "pan");

    expect(pan.controls).toHaveLength(1);
    const [control] = pan.controls;
    expect(control).toMatchObject({
      type: "rotate",
      axis: "z",
      commonAxis: "pan",
    });
    expect(control.target.type).toBe("parameter");
    if (control.target.type === "parameter") {
      expect(editor.parameters[control.target.parameter.id]?.codexId).toBe(
        "pan",
      );
    }
  });

  test("keeps only the best model quality, resolved to its resource", () => {
    const [, base] = nodeNamed(editor, "base");

    expect(base.visual?.quality).toBe("high");
    expect(editor.resources[base.visual!.resource]?.codexId).toBe("model-high");
    expect(base.visual?.nodeOrSceneName).toBe("base");
  });

  test("drops the bounds, which cannot satisfy the schema", () => {
    const [structure] = exportedStructure3Ds(exportDeviceClass(editor));

    expect(structure).toMatchObject({
      nodes: {
        base: {
          model: { visual: { high: "model-high", nodeOrSceneName: "base" } },
        },
      },
    });
    expect(JSON.stringify(structure)).not.toContain("bounds");
  });
});

describe("structure 3D import", () => {
  test("wraps rotations into [0, 360)", () => {
    const editor = importDeviceClass(
      withStructure3DNodes({ node: { rotate: [-90, 360, 45] } }),
    );

    expect(nodeNamed(editor, "node")[1].transform).toEqual({
      type: "trs",
      translate: undefined,
      rotate: [270, 0, 45],
    });
  });

  test("keeps a control with no target as a broken parameter reference", () => {
    const editor = importDeviceClass(
      withStructure3DNodes({
        node: { control: [{ type: "beam", axis: "z" }] },
      }),
    );

    const [control] = nodeNamed(editor, "node")[1].controls;
    expect(control.type).toBe("beam");
    expect(control.target.type).toBe("parameter");
  });

  test("leaves the structure absent when the device class has none", () => {
    const editor = importDeviceClass(minimalDeviceClass());

    expect(editor.structure3D).toBeUndefined();
    expect(editor.structure3DNodes).toEqual({});
  });
});

describe("structure 3D export", () => {
  test("round trips matrices, control groups and indexed parameters", () => {
    const nodes = {
      arm: {
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
        control: [
          {
            type: "linear",
            axis: "x",
            controlGroups: ["control-groups?/groups/0"],
          },
          { type: "rotate", axis: "y", parameter: "frame[1]" },
        ],
      },
    };
    const deviceClass = withStructure3DNodes(nodes);

    const [exported] = exportedStructure3Ds(
      exportDeviceClass(importDeviceClass(deviceClass)),
    );

    expect(JSON.parse(JSON.stringify(exported))).toEqual({ nodes });
  });
});

describe("exported structure 3D conforms to the schema", () => {
  const validate = new Ajv2019({ strict: false, allErrors: true }).compile(
    structure3DSchema,
  );

  test.each([
    ["movable", movableDocument],
    ["MAC Encore", encoreDocument],
  ])("for %s", (_, documentText) => {
    const exported = exportDeviceClass(
      importDeviceClass(exampleDeviceClass(documentText)),
    );
    const structures = exportedStructure3Ds(exported);

    expect(structures).toHaveLength(1);
    for (const structure of structures) {
      // Through JSON, as on the way to a file, which drops undefined fields.
      validate(JSON.parse(JSON.stringify(structure)));
      expect(validate.errors ?? []).toEqual([]);
    }
  });
});
