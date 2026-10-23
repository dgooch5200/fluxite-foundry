import { describe, test, expect } from "vitest";
import { treeifyError } from "zod";
import { migrateV7toV8 } from "./migrate";
import * as V7 from "../v7/state";
import * as V8 from "./state";

const DOC_ID = V7.EntityId("doc1");

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
  const devClassDesc = V7.LocalizationKey("desc");
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
        description: devClassDesc,
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
  state.documents[DOC_ID] = createV7Document();
  return state;
}

describe("migrateV7toV8", () => {
  test("adds an empty structure 3D node table and changes nothing else", () => {
    const state = stateWithDocument();

    const result = migrateV7toV8(state);

    expect(result.documents[DOC_ID]).toStrictEqual({
      ...state.documents[DOC_ID],
      structure3DNodes: {},
    });
  });

  test("preserves settings and session untouched", () => {
    const state = stateWithDocument();
    state.session.layouts = {
      [DOC_ID]: '{"type":"row"}',
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
