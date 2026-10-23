import { describe, test, expect } from "vitest";
import { treeifyError } from "zod";
import { nanoid } from "nanoid";
import { migrateV7toV8 } from "./migrate";
import * as V7 from "../v7/state";
import * as V8 from "./state";

function createV7State(): V7.AppPersistentState {
  return {
    appSettings: {
      theme: "dark",
      orgId: { type: "user", id: "test-user-id" },
      authoringLocale: "en-US",
      uiLocale: "system",
    },
    session: {
      openDocuments: [],
      selectedDocumentId: undefined,
      layouts: {},
    },
    documents: {},
  };
}

function createV7Document(): V7.DeviceClassDocument {
  const devClassDesc = nanoid();
  return {
    type: "deviceClass",
    orgId: { type: "user", id: "test-user-id" },
    sourceLocale: "en-US",
    deviceClassId: "test-device-class",
    deviceClassVersion: "1.0.0",
    basicData: {
      publishDate: "2024-01-01",
      author: "Test Author",
      history: {},
      manufacturerName: "Test Manufacturer",
      modelName: "Test Model",
      modelCategory: "lighting",
      modelSubcategory: "fixed-profile",
      localized: {
        description: devClassDesc as V7.LocalizationKey,
      },
    },
    libraries: {},
    parameterClasses: {},
    structureClasses: {},
    serializerClasses: {},
    resourceClasses: {},
    commandClasses: {},
    parameterEditors: [],
    parameters: {},
    resourceEditors: [],
    resources: {},
    resourceAssets: {},
    commandEditors: [],
    commands: {},
    commandClassArguments: {},
    commandClassReturnValues: {},
    enumChoices: {},
    dmxSerializers: {},
    localizations: {
      [devClassDesc]: {
        strings: V7.LocalizationDbSchema.parse({ "en-US": "A device" }),
      },
    },
  } as V7.DeviceClassDocument;
}

function stateWithDocument(): V7.AppPersistentState {
  const state = createV7State();
  state.documents["doc1" as V7.EntityId] = createV7Document();
  return state;
}

describe("migrateV7toV8", () => {
  test("gives each device class document an empty structure 3D node table", () => {
    const result = migrateV7toV8(stateWithDocument());

    expect(result.documents["doc1" as V8.EntityId].structure3DNodes).toEqual(
      {},
    );
  });

  test("leaves the structure 3D structure absent", () => {
    const result = migrateV7toV8(stateWithDocument());

    expect(result.documents["doc1" as V8.EntityId]).not.toHaveProperty(
      "structure3D",
    );
  });

  test("preserves the rest of each document", () => {
    const state = stateWithDocument();

    const result = migrateV7toV8(state);

    const { structure3DNodes: _, ...rest } =
      result.documents["doc1" as V8.EntityId];
    expect(rest).toEqual(state.documents["doc1" as V7.EntityId]);
  });

  test("preserves settings and session untouched", () => {
    const state = stateWithDocument();
    state.session.layouts = {
      ["doc1" as V7.EntityId]: '{"type":"row"}',
    };

    const result = migrateV7toV8(state);

    expect(result.appSettings).toEqual(state.appSettings);
    expect(result.session).toEqual(state.session);
  });

  test("produces a state that validates against the V8 schema", () => {
    const result = migrateV7toV8(stateWithDocument());

    const parsed = V8.AppStateSchema.safeParse(result);

    expect(
      parsed.success ? undefined : treeifyError(parsed.error),
    ).toBeUndefined();
  });
});
