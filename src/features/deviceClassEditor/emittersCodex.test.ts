import { describe, test, expect } from "vitest";
import Ajv2019 from "ajv/dist/2019";
import {
  parseFluxiteCodexDocument,
  unparseFluxiteCodexDocument,
} from "@cpwg-community/delver";
import { CodexId, DeviceClassDocument, EntityId } from "app/persistentState";
import emittersSchema from "e173/libraries/intensity-color/draft-2027-1/schemas/emitters.json";
import battenDocument from "../../../docs/rfcs/emitter_location_3d_batten.fcd?raw";
import { getImportedDeviceClassEditor } from "./import";
import { CODEX_DOC_SCHEMA_URL } from "consts";
import { exportDeviceClass } from "./export";

const DEVICE_CLASS_ID = "com.example.dev.test";

// Reads a document through delver, as opening a file does.
function importDocument(document: object | string): DeviceClassDocument {
  const { document: parsed } = parseFluxiteCodexDocument(document);
  const [versions] = Object.values(parsed.e173doc.deviceClasses ?? {});
  return getImportedDeviceClassEditor(
    { type: "org", id: "com.example" },
    "test",
    "1.0.0",
    Object.values(versions)[0],
    "en-US",
  );
}

// The device class as delver writes it to a file.
function exportRaw(editor: DeviceClassDocument): {
  structures: Record<string, { default: unknown }>;
} {
  const raw = unparseFluxiteCodexDocument({
    $schema: CODEX_DOC_SCHEMA_URL,
    e173doc: {
      deviceClasses: {
        [DEVICE_CLASS_ID]: { "1.0.0": exportDeviceClass(editor) },
      },
    },
  });
  return JSON.parse(
    JSON.stringify(raw.e173doc.deviceClasses?.[DEVICE_CLASS_ID]?.["1.0.0"]),
  );
}

function documentWithEmitters(emitters: object): object {
  return {
    $schema: CODEX_DOC_SCHEMA_URL,
    e173doc: {
      deviceClasses: {
        [DEVICE_CLASS_ID]: {
          "1.0.0": {
            libraries: { "org.esta.lib.intensity-color": "1.0.0" },
            "@description": "description",
            publishDate: "2024-01-01T00:00:00Z",
            author: "Test Author",
            info: {
              manufacturer: { name: "Test Manufacturer" },
              model: {
                name: "Test Model",
                category: "other",
                subcategory: "other",
              },
            },
            history: {},
            structures: {
              emitters: {
                library: "org.esta.lib.intensity-color",
                class: "emitters",
                access: ["read"],
                lifetime: "static",
                default: emitters,
              },
            },
            localizations: {
              "en-US": { strings: { description: "Test" } },
            },
          },
        },
      },
    },
  };
}

// Every part of an emitters structure. The parameters and resource it refers
// to aren't in the device class, so they're kept as they are.
const EMITTERS = {
  emitterGroups: {
    main: {
      emitters: {
        red: {
          directControl: "red",
          commonColor: "red",
          spd: {
            direct: {
              start: 380,
              step: 5,
              mappings: [
                {
                  value: 1,
                  powerDistribution: [0, 0.2, 1, 0.3],
                  deviationPlus: [0, 0.01, 0.02, 0.01],
                  deviationMinus: [0, 0.01, 0.02, 0.01],
                },
              ],
            },
          },
          relativeBrightness: 1,
        },
        white: {
          commonColor: "amber",
          spd: { local: "white-spd", remote: "https://example.com/white.csv" },
        },
      },
    },
    aura: {
      emitters: { "pixel-0": { directControl: "aura[0]" } },
    },
  },
  // delver keys control groups by ID where the draft-2027-1 schema lists them.
  controlGroups: {
    all: {
      emitterGroups: ["main", "aura"],
      masterIntensity: "dimmer",
      rgb: { red: "red", green: "green", blue: "blue" },
      cct: { cct: "cct", tint: "tint" },
      crossfade: {
        parameter: "color-mode",
        points: [
          { value: 0, controlScheme: "rgb" },
          { value: 1, controlScheme: "cct" },
        ],
      },
    },
  },
};

describe("emitters import and export", () => {
  test("round trip groups, emitters, spectral data and control groups", () => {
    const exported = exportRaw(importDocument(documentWithEmitters(EMITTERS)));

    expect(exported.structures.emitters).toEqual({
      library: "org.esta.lib.intensity-color",
      class: "emitters",
      access: ["read"],
      lifetime: "static",
      default: EMITTERS,
    });
  });

  test("put each emitter in the group it was read from", () => {
    const editor = importDocument(documentWithEmitters(EMITTERS));

    for (const [id, group] of Object.entries(editor.emitterGroups)) {
      for (const emitter of group.emitters) {
        expect(editor.emitters[emitter].group).toBe(EntityId(id));
      }
    }
    expect(editor.emittersStructure?.emitterGroups).toHaveLength(2);
  });

  test("put groups and their emitters in order by ID", () => {
    const editor = importDocument(
      documentWithEmitters({
        emitterGroups: {
          "cell-10": { emitters: {} },
          "cell-2": { emitters: { white: {}, red: {}, green: {} } },
          "cell-1": { emitters: {} },
        },
      }),
    );
    const codexIds = (
      ids: EntityId[] = [],
      table: Record<string, { codexId: string }>,
    ) => ids.map((id) => table[id]?.codexId);
    const groups = editor.emittersStructure?.emitterGroups;

    expect(codexIds(groups, editor.emitterGroups)).toEqual([
      "cell-1",
      "cell-2",
      "cell-10",
    ]);
    expect(
      codexIds(editor.emitterGroups[groups![1]].emitters, editor.emitters),
    ).toEqual(["green", "red", "white"]);
  });

  test("write emitter groups that conform to the draft-2027-1 schema", () => {
    const validate = new Ajv2019({ strict: false, allErrors: true }).compile(
      emittersSchema,
    );
    // The control groups are left out, as delver writes them keyed by ID
    // where the schema lists them.
    const emitterGroupsOnly = structuredClone({
      emitterGroups: EMITTERS.emitterGroups,
    });
    // amber isn't one of the schema's common colors.
    emitterGroupsOnly.emitterGroups.main.emitters.white.commonColor =
      "warm-white";

    const exported = exportRaw(
      importDocument(documentWithEmitters(emitterGroupsOnly)),
    );

    validate(exported.structures.emitters.default);
    expect(validate.errors ?? []).toEqual([]);
  });

  test("keep beams placed at a group that is renamed", () => {
    const editor = importDocument(battenDocument);
    const [cell3] = Object.values(editor.emitterGroups).filter(
      (group) => group.codexId === "cell-3",
    );
    cell3.codexId = CodexId("middle");

    const exported = exportRaw(editor);

    expect(exported.structures["structure-3d"].default).toMatchObject({
      nodes: {
        body: {
          nodes: {
            "cell-3": {
              control: [{ emitters: ["emitters?/emitterGroups/middle"] }],
            },
          },
        },
      },
    });
  });
});
