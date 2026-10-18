// Integration test for round-trip import/export of Fluxite Codex format.
// Reads real device class files, imports them into editor state, exports them
// back, and verifies the exported form matches the original.

import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  Condition,
  DeviceClass,
  EstaDmx,
  MappingGroup,
  parseFluxiteCodexDocument,
} from "@cpwg-community/delver";
import { getImportedDeviceClassEditor } from "../../src/features/deviceClassEditor/import";
import { exportDeviceClass } from "../../src/features/deviceClassEditor/export";
import { parseQualifiedId } from "../../src/utils/utils";

interface RoundTripTestCase {
  name: string;
  filePath: string;
  qualifiedId: string;
  version: string;
  allowValidationErrors?: boolean;
  ignoreStructures?: boolean;
}

// Add new test cases here to extend testing
const testCases: RoundTripTestCase[] = [
  {
    name: "MAC Encore Performance CLD",
    filePath:
      "src/e173/examples/draft-2027-1/device-classes/martin_mac_encore_performance_cld.fcd",
    qualifiedId: "com.martin.dev.encore-performance-cold",
    version: "1.0.0",
    // Its structure-3d breaks the schema (a control given as an object,
    // bounds, several model qualities per node), so import normalizes it and
    // it cannot come back unchanged.
    ignoreStructures: true,
  },
  {
    name: "Movable",
    filePath: "src/e173/examples/draft-2027-1/device-classes/movable.fcd",
    qualifiedId: "com.example.dev.movable",
    version: "1.0.0",
  },
  {
    name: "Dangling references",
    filePath: "tests/integration/fixtures/dangling_references.fcd",
    qualifiedId: "com.example.dev.dangling-references",
    version: "1.0.0",
    allowValidationErrors: true,
  },
];

// Removes undefined values recursively (JSON doesn't support undefined, but
// exported objects may have explicit undefined values)
function removeUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) {
        result[key] = removeUndefined(value);
      }
    }

    return result;
  }

  return obj;
}

// Normalizes DMX chunk IDs to canonical offset-based identifiers.
// During import/export, chunk IDs may change (e.g., "b12" -> "11" based on offsets).
function normalizeDmxChunkIds(deviceClass: DeviceClass): DeviceClass {
  if (!deviceClass.serializers) {
    return deviceClass;
  }

  const normalizedSerializers: typeof deviceClass.serializers = {};

  for (const [key, serializer] of Object.entries(deviceClass.serializers)) {
    if (serializer.type === "EstaDmx" && serializer.value.default) {
      normalizedSerializers[key] = {
        ...serializer,
        value: {
          ...serializer.value,
          // The editor does not store the DMX serializer's lifetime yet, and
          // always exports it as static.
          lifetime: "static",
          default: normalizeEstaDmx(serializer.value.default),
        },
      };
    } else {
      normalizedSerializers[key] = serializer;
    }
  }

  return {
    ...deviceClass,
    serializers: normalizedSerializers,
  };
}

function normalizeEstaDmx(dmx: EstaDmx): EstaDmx {
  const chunkIdMapping: Record<string, string> = {};
  for (const [oldId, chunk] of Object.entries(dmx.chunks)) {
    chunkIdMapping[oldId] = chunk.offsets.join("-");
  }

  const normalizedChunks: EstaDmx["chunks"] = {};
  for (const [oldId, chunk] of Object.entries(dmx.chunks)) {
    const canonicalId = chunkIdMapping[oldId];
    normalizedChunks[canonicalId] = {
      ...chunk,
      mappingGroups: chunk.mappingGroups.map((mg) =>
        normalizeMappingGroup(mg, chunkIdMapping),
      ),
    };
  }

  return { chunks: normalizedChunks };
}

function normalizeMappingGroup(
  mg: MappingGroup,
  chunkIdMapping: Record<string, string>,
): MappingGroup {
  if (!mg.conditions) {
    return mg;
  }
  return {
    ...mg,
    conditions: mg.conditions.map((c) => normalizeCondition(c, chunkIdMapping)),
  };
}

function normalizeCondition(
  condition: Condition,
  chunkIdMapping: Record<string, string>,
): Condition {
  if (condition.type === "simple") {
    return {
      type: "simple",
      value: {
        ...condition.value,
        chunk: chunkIdMapping[condition.value.chunk] ?? condition.value.chunk,
      },
    };
  } else {
    return {
      type: "group",
      value: {
        ...condition.value,
        conditions: condition.value.conditions.map((c) =>
          normalizeCondition(c, chunkIdMapping),
        ),
      },
    };
  }
}

// Fields not currently imported/exported by the editor
const IGNORED_FIELDS = new Set([
  "categories", // localization categories added by parseFluxiteCodexDocument but not used
]);

// Of the structures, the editor imports only structure-3d, so the others (e.g.
// constraints) are left out of the comparison.
function keepComparedStructures(
  deviceClass: DeviceClass,
  ignoreStructures: boolean,
): DeviceClass {
  const { structures, ...rest } = deviceClass;
  const compared = Object.entries(structures ?? {}).filter(
    ([, structure]) =>
      !ignoreStructures &&
      structure.type === "Other" &&
      structure.value.class === "structure-3d",
  );
  return compared.length > 0
    ? { ...rest, structures: Object.fromEntries(compared) }
    : rest;
}

function removeIgnoredFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeIgnoredFields);
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (!IGNORED_FIELDS.has(key)) {
        result[key] = removeIgnoredFields(value);
      }
    }

    return result;
  }

  return obj;
}

function normalizeForComparison(
  deviceClass: DeviceClass,
  ignoreStructures: boolean,
): unknown {
  const withNormalizedDmx = normalizeDmxChunkIds(
    keepComparedStructures(deviceClass, ignoreStructures),
  );
  // The editor does not tell an absent compatibility from an empty one, and
  // always exports one.
  withNormalizedDmx.info = {
    ...withNormalizedDmx.info,
    compatibility: withNormalizedDmx.info.compatibility ?? {},
  };
  let result: unknown = withNormalizedDmx;
  result = removeUndefined(result);
  result = removeIgnoredFields(result);
  return result;
}

function compareDeviceClasses(
  original: DeviceClass,
  exported: DeviceClass,
  ignoreStructures: boolean,
): void {
  const normalizedOriginal = normalizeForComparison(original, ignoreStructures);
  const normalizedExported = normalizeForComparison(exported, ignoreStructures);
  expect(normalizedExported).toEqual(normalizedOriginal);
}

function readDeviceClassFromFile({
  filePath,
  qualifiedId,
  version,
  allowValidationErrors,
}: RoundTripTestCase): DeviceClass {
  const absolutePath = resolve(process.cwd(), filePath);
  const content = readFileSync(absolutePath, "utf-8");
  const { document, errors } = parseFluxiteCodexDocument(content);

  if (errors.length > 0 && !allowValidationErrors) {
    throw new Error(
      `Validation errors in ${filePath}: ${errors.map((e) => e.message).join(", ")}`,
    );
  }

  const deviceClasses = document.e173doc.deviceClasses;
  if (!deviceClasses) {
    throw new Error(`No device classes found in ${filePath}`);
  }

  const deviceClassVersions = deviceClasses[qualifiedId];
  if (!deviceClassVersions) {
    throw new Error(
      `Device class ${qualifiedId} not found in ${filePath}. ` +
        `Available: ${Object.keys(deviceClasses).join(", ")}`,
    );
  }

  const deviceClass = deviceClassVersions[version];
  if (!deviceClass) {
    throw new Error(
      `Version ${version} of ${qualifiedId} not found in ${filePath}. ` +
        `Available: ${Object.keys(deviceClassVersions).join(", ")}`,
    );
  }

  return deviceClass;
}

describe("Import/Export Round Trip", () => {
  describe.each(testCases)("$name", (testCase) => {
    test("round-trip import and export produces equivalent result", () => {
      const original = readDeviceClassFromFile(testCase);

      const parsed = parseQualifiedId(testCase.qualifiedId);
      if (!parsed) {
        throw new Error(`Invalid qualified ID: ${testCase.qualifiedId}`);
      }
      const [, orgId, deviceId] = parsed;

      const editorState = getImportedDeviceClassEditor(
        orgId,
        deviceId,
        testCase.version,
        original,
        "en-US",
      );

      const exported = exportDeviceClass(editorState);

      compareDeviceClasses(
        original,
        exported,
        testCase.ignoreStructures ?? false,
      );
    });
  });
});
