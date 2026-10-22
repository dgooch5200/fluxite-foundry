import { describe, test, expect } from "vitest";
import { treeifyError } from "zod";
import { nanoid } from "nanoid";
import { migrateV6toV7 } from "./migrate";
import * as V6 from "../v6/state";
import * as V7 from "./state";

function createV6State(): V6.AppPersistentState {
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

function createV6Document(): V6.DeviceClassDocument {
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
        description: devClassDesc as V6.LocalizationKey,
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
    localizations: {
      [devClassDesc]: {
        strings: V6.LocalizationDbSchema.parse({ "en-US": "A device" }),
      },
    },
  } as V6.DeviceClassDocument;
}

function stateWithDocument(): V6.AppPersistentState {
  const state = createV6State();
  state.documents["doc1" as V6.EntityId] = createV6Document();
  return state;
}

describe("migrateV6toV7", () => {
  test("gives each device class document empty structure 3D and emitter tables", () => {
    const result = migrateV6toV7(stateWithDocument());

    expect(result.documents["doc1" as V7.EntityId]).toMatchObject({
      structure3DNodes: {},
      emitterGroups: {},
      emitters: {},
    });
  });

  test("leaves the structure 3D and emitters structures absent", () => {
    const result = migrateV6toV7(stateWithDocument());

    expect(result.documents["doc1" as V7.EntityId]).not.toHaveProperty(
      "structure3D",
    );
    expect(result.documents["doc1" as V7.EntityId]).not.toHaveProperty(
      "emittersStructure",
    );
  });

  test("preserves the rest of each document", () => {
    const state = stateWithDocument();

    const result = migrateV6toV7(state);

    const {
      structure3DNodes: _nodes,
      emitterGroups: _groups,
      emitters: _emitters,
      ...rest
    } = result.documents["doc1" as V7.EntityId];
    expect(rest).toEqual(state.documents["doc1" as V6.EntityId]);
  });

  test("preserves settings and session untouched", () => {
    const state = stateWithDocument();
    state.session.layouts = {
      ["doc1" as V6.EntityId]: '{"type":"row"}',
    };

    const result = migrateV6toV7(state);

    expect(result.appSettings).toEqual(state.appSettings);
    expect(result.session).toEqual(state.session);
  });

  test("produces a state that validates against the V7 schema", () => {
    const result = migrateV6toV7(stateWithDocument());

    const parsed = V7.AppStateSchema.safeParse(result);

    expect(
      parsed.success ? undefined : treeifyError(parsed.error),
    ).toBeUndefined();
  });
});
