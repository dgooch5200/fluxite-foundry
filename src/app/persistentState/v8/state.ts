import * as z from "zod";

export const VERSION = 8;

// ---------------------------------------------------------------------------
// Utility models and other types
// ---------------------------------------------------------------------------

// Represents the ID of an entity in Fluxite Codex
export const CodexIdSchema = z.string().brand("CodexId");

// Represents the ID of an entity in the local database
export const EntityIdSchema = z.string().brand("EntityId");

// Represents a key into a localization database
export const LocalizationKeySchema = z.string().brand("LocalizationKey");

export const accesses = {
  READ: "read",
  WRITE: "write",
} as const;

export type Access = (typeof accesses)[keyof typeof accesses];

export const lifetimes = {
  STATIC: "static",
  PERSISTENT: "persistent",
  RUNTIME: "runtime",
} as const;

export type Lifetime = (typeof lifetimes)[keyof typeof lifetimes];

export const parameterAccesses = {
  READ_ACTUAL: "readActual",
  READ_TARGET: "readTarget",
  WRITE: "write",
} as const;

export type ParameterAccess =
  (typeof parameterAccesses)[keyof typeof parameterAccesses];

export const modelCategories = {
  LIGHTING: "lighting",
  VIDEO: "video",
  AUDIO: "audio",
  MACHINERY_AUTOMATION: "machinery-automation",
  ATMOSPHERE: "atmosphere",
  EFFECT: "effect",
  INFRASTRUCTURE: "infrastructure",
  OTHER: "other",
} as const;

export type ModelCategory =
  (typeof modelCategories)[keyof typeof modelCategories];

export const modelSubcategories = {
  FIXED_PROFILE: "fixed-profile",
  FIXED_FRESNEL: "fixed-fresnel",
  FIXED_PEBBLE_CONVEX: "fixed-pebble-convex",
  FIXED_WASH: "fixed-wash",
  FIXED_PAR: "fixed-par",
  FIXED_STRIP: "fixed-strip",
  FIXED_OTHER: "fixed-other",
  MOVING_PROFILE: "moving-profile",
  MOVING_FRESNEL: "moving-fresnel",
  MOVING_PEBBLE_CONVEX: "moving-pebble-convex",
  MOVING_WASH: "moving-wash",
  MOVING_STRIP: "moving-strip",
  MOVING_MIRROR: "moving-mirror",
  MOVING_OTHER: "moving-other",
  ACCESSORY_SCROLLER: "accessory-scroller",
  ACCESSORY_GOBO_ROTATOR: "accessory-gobo-rotator",
  ACCESSORY_ANIMATION: "accessory-animation",
  ACCESSORY_IRIS: "accessory-iris",
  ACCESSORY_OTHER: "accessory-other",
  ARCHITECTURAL_SCONCE: "architectural-sconce",
  ARCHITECTURAL_DOWNLIGHT: "architectural-downlight",
  ARCHITECTURAL_FLOOD: "architectural-flood",
  ARCHITECTURAL_SPOT: "architectural-spot",
  ARCHITECTURAL_TRACKLIGHT: "architectural-tracklight",
  ARCHITECTURAL_WALL_WASH: "architectural-wall-wash",
  ARCHITECTURAL_OTHER: "architectural-other",
  PRACTICAL_FLOOR_LAMP: "practical-floor-lamp",
  PRACTICAL_DESK_LAMP: "practical-desk-lamp",
  PRACTICAL_TABLE_LAMP: "practical-table-lamp",
  PRACTICAL_PENDANT: "practical-pendant",
  PRACTICAL_CHANDELIER: "practical-chandelier",
  PRACTICAL_OTHER: "practical-other",
  CONTROLLER: "controller",
  MEDIA_SERVER: "media-server",
  PROJECTOR: "projector",
  PANEL: "panel",
  CAMERA: "camera",
  AMPLIFIER: "amplifier",
  SPEAKER_LINE_ARRAY: "speaker-line-array",
  SPEAKER_POINT_SOURCE: "speaker-point-source",
  SPEAKER_COLUMN: "speaker-column",
  SPEAKER_HORN_LOADED: "speaker-horn-loaded",
  SPEAKER_MONITOR: "speaker-monitor",
  SPEAKER_STAGE_WEDGE: "speaker-stage-wedge",
  SPEAKER_IEM: "speaker-iem",
  SPEAKER_SUBWOOFER: "speaker-subwoofer",
  SPEAKER_CEILING: "speaker-ceiling",
  SPEAKER_SURFACE: "speaker-surface",
  SPEAKER_OTHER: "speaker-other",
  PROCESSOR: "processor",
  MIXER: "mixer",
  WINCH: "winch",
  HOIST: "hoist",
  DRIVE: "drive",
  REVOLVE: "revolve",
  LOAD_CELL: "load-cell",
  ESTOP: "estop",
  SMOKE: "smoke",
  HAZE: "haze",
  PYRO: "pyro",
  FIRE: "fire",
  STROBE: "strobe",
  LASER: "laser",
  WATER: "water",
  SNOW: "snow",
  BUBBLE: "bubble",
  FAN: "fan",
  NETWORK_SWITCH: "network-switch",
  ROUTER: "router",
  SECURITY: "security",
  GATEWAY: "gateway",
  WIRELESS: "wireless",
  SPLITTER: "splitter",
  MANAGEMENT: "management",
  OTHER: "other",
} as const;

export type ModelSubcategory =
  (typeof modelSubcategories)[keyof typeof modelSubcategories];

export const fcDataTypes = {
  NUMBER: "number",
  ENUM: "enum",
  STRING: "string",
  BINARY: "binary",
  BOOLEAN: "boolean",
  UUID: "uuid",
} as const;

export type FCDataType = (typeof fcDataTypes)[keyof typeof fcDataTypes];

export const fcUnitNames = {
  ampere: "ampere",
  candela: "candela",
  kelvin: "kelvin",
  kilogram: "kilogram",
  meter: "meter",
  second: "second",
  degree_celsius: "degree-celsius",
  HERTZ: "hertz",
  JOULE: "joule",
  LUMEN: "lumen",
  LUX: "lux",
  NEWTON: "newton",
  NEWTON_METER: "newton-meter",
  OHM: "ohm",
  PASCAL: "pascal",
  RADIAN: "radian",
  RADIAN_PER_SECOND: "radian-per-second",
  RADIAN_PER_SECOND_SQUARED: "radian-per-second-squared",
  STERADIAN: "steradian",
  VOLT: "volt",
  WATT: "watt",
  CUBIC_METER: "cubic-meter",
  METER_PER_SECOND: "meter-per-second",
  METER_PER_SECOND_SQUARED: "meter-per-second-squared",
  SQUARE_METER: "square-meter",
  AMP_HOURS: "amp-hours",
  BYTE: "byte",
  BYTE_PER_SECOND: "byte-per-second",
  DEGREE: "degree",
  RATIO: "ratio",
  LOG_DB: "log-db",
  RPM: "rpm",
  OTHER: "other",
  NONE: "none",
} as const;

export type FCUnitName = (typeof fcUnitNames)[keyof typeof fcUnitNames];

export const documentTypes = {
  DEVICE_CLASS: "deviceClass",
} as const;

export type DocumentType = (typeof documentTypes)[keyof typeof documentTypes];

export const themes = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;

export type Theme = (typeof themes)[keyof typeof themes];

export const OrgIdUserSchema = z.object({
  type: z.literal("user"),
  id: z.string(),
});

export const OrgIdOrgSchema = z.object({
  type: z.literal("org"),
  id: z.string(),
});

export const OrgIdSchema = z.discriminatedUnion("type", [
  OrgIdUserSchema,
  OrgIdOrgSchema,
]);

export const ParameterAccessSchema = z.enum(parameterAccesses);

export const AccessSchema = z.enum(accesses);

export const LifetimeSchema = z.enum(lifetimes);

export const ModelCategorySchema = z.enum(modelCategories);

export const ModelSubcategorySchema = z.enum(modelSubcategories);

export const FCDataTypeSchema = z.enum(fcDataTypes);

export const FCUnitSchema = z.object({
  name: z.enum(fcUnitNames),
  exponent: z.number().optional(),
});

// A reference to an item class used by a device class.
export const ClassReferenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("local"),
    id: EntityIdSchema,
  }),
  z.object({
    type: z.literal("imported"),
    library: z.string(),
    codexId: CodexIdSchema,
  }),
]);

// Identifies a sub-item (an enum choice, a command argument) in whichever ID
// space that its parent's class uses. When the owning ClassReference is
// "local", the member is an entity in this editor and this is an EntityId. When
// it is "imported", the member only exists in the library and this is a
// CodexId.
export const LocalOrImportedIdSchema = z.union([EntityIdSchema, CodexIdSchema]);

// Reference to a Parameter instance.
//
// For parameters with count > 1, the index specifies which instance (0-based).
// When serialized to/from Fluxite Codex, uses syntax like "frame[1]" for
// indexed references.
export const ParameterReferenceSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// App Settings Models
// ---------------------------------------------------------------------------

export const ThemeSchema = z.enum(themes);

export const AppSettingsSchema = z.object({
  theme: ThemeSchema,
  orgId: OrgIdSchema,
  // The locale used for authoring Fluxite Codex documents.
  authoringLocale: z.string(),
  // The current display locale of the app, or "system" to follow the browser.
  uiLocale: z.string(),
});

export const DocumentTypeSchema = z.enum(documentTypes);

// How the Structure 3D view colors a model; MODEL uses the glTF's materials.
export const structure3DFinishes = {
  GRAY: "gray",
  BY_NODE: "byNode",
  MODEL: "model",
} as const;

export type Structure3DFinish =
  (typeof structure3DFinishes)[keyof typeof structure3DFinishes];

// What the app is doing with its documents right now, as opposed to what the
// documents themselves contain. Document-specific information that is not
// exported in a save file.
export const SessionSchema = z.object({
  // The open documents, in the order their tabs appear.
  openDocuments: z.array(EntityIdSchema),
  // The document being edited, or undefined when none is.
  selectedDocumentId: EntityIdSchema.optional(),
  // Stringified FlexLayout model per document.
  layouts: z.record(EntityIdSchema, z.string()),
  // An unknown value (e.g. a removed finish) is dropped so it can't fail the
  // whole state's validation.
  structure3DView: z
    .object({
      // In pixels
      height: z.number().optional().catch(undefined),
      finish: z.enum(structure3DFinishes).optional().catch(undefined),
      ambientOcclusion: z.boolean().optional().catch(undefined),
      smoothShading: z.boolean().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

// ---------------------------------------------------------------------------
// Device Class Editor Models
// ---------------------------------------------------------------------------

export const DeviceClassBasicDataSchema = z.object({
  publishDate: z.string(),
  author: z.string(),
  history: z.record(z.string(), z.string()),
  manufacturerName: z.string(),
  manufacturerUrl: z.string().optional(),
  manufacturerEstaId: z.string().optional(),
  modelName: z.string(),
  modelCategory: ModelCategorySchema,
  modelSubcategory: ModelSubcategorySchema,
  compatibleFirmwareVersions: z.array(z.string()).optional(),
  localized: z.object({
    description: LocalizationKeySchema,
  }),
});

export const ParameterClassSchema = z.object({
  codexId: CodexIdSchema,
  dataType: FCDataTypeSchema,
  unit: FCUnitSchema.optional(),
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
  // Choices are in a separate table
});

export const StructureClassSchema = z.object({
  codexId: CodexIdSchema,
  multipleAllowed: z.boolean().optional(),
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
});

export const SerializerClassSchema = z.object({
  codexId: CodexIdSchema,
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
});

export const ResourceClassSchema = z.object({
  codexId: CodexIdSchema,
  mediaType: z.array(z.string()),
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
});

export const CommandClassSchema = z.object({
  codexId: CodexIdSchema,
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
  // Arguments and return values are in a separate table
});

export const ParameterValueSchema = z.union([z.number(), z.boolean()]);

export const ParameterDefaultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("numeric"), value: z.number() }),
  z.object({ type: z.literal("bool"), value: z.boolean() }),
  z.object({ type: z.literal("inactive") }),
]);

export const ParameterCountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fixed"),
    value: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal("dynamic"),
    min: z.int().nonnegative(),
    max: z.int().nonnegative().optional(),
  }),
]);

export const ParameterSchema = z.object({
  codexId: CodexIdSchema,
  class: ClassReferenceSchema,
  count: ParameterCountSchema.optional(),
  access: z.array(ParameterAccessSchema),
  lifetime: LifetimeSchema,
  // IDs are in the ID space of `class` above.
  enumExclusions: z.array(LocalOrImportedIdSchema).optional(),
  // Additional choices are in a separate table
  atomicIdentifier: z.string().optional(),
  minimum: ParameterValueSchema.optional(),
  maximum: ParameterValueSchema.optional(),
  minimumModifier: z.string().optional(),
  maximumModifier: z.string().optional(),
  default: ParameterDefaultSchema.optional(),
  wrapping: z.boolean().optional(),
  localized: z.object({
    friendlyName: LocalizationKeySchema.optional(),
  }),
});

export const ResourceSchema = z.object({
  codexId: CodexIdSchema,
  class: ClassReferenceSchema,
  access: z.array(AccessSchema),
  lifetime: LifetimeSchema,
  mediaType: z.string().optional(),
  assetId: z.string().optional(),
  importPath: z.string().optional(),
  provenance: z.string().optional(),
  default: z.string().optional(),
});

export const CommandSchema = z.object({
  codexId: CodexIdSchema,
  class: ClassReferenceSchema,
  // [argId] -> excludedId[]. Both sides are in the ID space of `class` above.
  argEnumExclusions: z
    .record(LocalOrImportedIdSchema, z.array(LocalOrImportedIdSchema))
    .optional(),
  returnEnumExclusions: z
    .record(LocalOrImportedIdSchema, z.array(LocalOrImportedIdSchema))
    .optional(),
  completionNotification: z.boolean(),
  localized: z.object({
    friendlyName: LocalizationKeySchema.optional(),
  }),
});

export const EnumChoiceParentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum([
      "paramClass",
      "paramAdditional",
      "cmdClassArg",
      "cmdClassRet",
    ]),
    id: EntityIdSchema,
  }),
  z.object({
    type: z.enum(["cmdArg", "cmdRet"]),
    id: EntityIdSchema,
    idType: z.literal("local"),
    cmdId: EntityIdSchema,
  }),
  z.object({
    type: z.enum(["cmdArg", "cmdRet"]),
    id: CodexIdSchema,
    idType: z.literal("imported"),
    cmdId: EntityIdSchema,
  }),
]);

export const EnumChoiceSchema = z.object({
  parent: EnumChoiceParentSchema,
  codexId: CodexIdSchema,
  index: z.int().nonnegative(),
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
});

export const CommandArgumentSchema = z.object({
  parentId: EntityIdSchema, // command class
  codexId: CodexIdSchema,
  dataType: FCDataTypeSchema,
  unit: FCUnitSchema.optional(),
  required: z.boolean(),
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
  // Choices are in a separate table
});

export const CommandReturnValueSchema = z.object({
  parentId: EntityIdSchema, // command class
  codexId: CodexIdSchema,
  dataType: FCDataTypeSchema,
  unit: FCUnitSchema.optional(),
  required: z.boolean(),
  localized: z.object({
    name: LocalizationKeySchema,
    description: LocalizationKeySchema.optional(),
  }),
  // Choices are in a separate table
});

// ---------------------------------------------------------------------------
// DMX Serializer Models
// ---------------------------------------------------------------------------

export const HoldValueSchema = z.union([
  z.object({
    milliseconds: z.number().nonnegative(),
  }),
  z.literal("indefinite"),
]);

export const DmxSequenceStepSchema = z.object({
  chunkStart: z.int().nonnegative(),
  chunkEnd: z.int().nonnegative(),
  hold: HoldValueSchema,
});

export const DmxMappingBoundSchema = z.union([z.number(), z.boolean()]);

export const DmxMappingBoundsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("null") }),
  z.object({
    type: z.literal("numeric"),
    start: z.number(),
    end: z.number().optional(),
  }),
  z.object({
    type: z.literal("bool"),
    start: z.boolean(),
    end: z.boolean().optional(),
  }),
]);

export const DmxMappingChunkValuesSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("range"),
    chunkStart: z.int().nonnegative(),
    chunkEnd: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal("sequence"),
    steps: z.array(DmxSequenceStepSchema),
  }),
]);

export const DmxMappingRangeSchema = z.object({
  bounds: DmxMappingBoundsSchema,
  chunkValues: DmxMappingChunkValuesSchema,
});

export const DmxUnmappedParamSchema = z.object({
  parameter: ParameterReferenceSchema,
  bounds: DmxMappingBoundsSchema,
});

export const DmxMappingSchema = z.object({
  mappedParam: ParameterReferenceSchema,
  ranges: z.array(DmxMappingRangeSchema),
  unmappedParams: z.array(DmxUnmappedParamSchema).optional(),
});

export const DmxArgumentConditionSchema = z.object({
  argumentMin: DmxMappingBoundSchema,
  argumentMax: DmxMappingBoundSchema.optional(),
});

export const DmxTriggerMappingSchema = z.object({
  // Keyed by command argument ID, in the ID space of the class of the command
  // referenced by the enclosing DmxTrigger.
  conditions: z.record(LocalOrImportedIdSchema, DmxArgumentConditionSchema),
  sequence: z.array(DmxSequenceStepSchema),
});

export const DmxTriggerSchema = z.object({
  command: EntityIdSchema,
  mappings: z.array(DmxTriggerMappingSchema),
});

// Parent reference for conditions - can point to a MappingGroup or another Condition
export const DmxConditionParentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mappingGroup"),
    id: EntityIdSchema,
  }),
  z.object({
    type: z.literal("condition"),
    id: EntityIdSchema,
  }),
]);

// Condition: chunk reference form - "when chunk X has value in range [start, end]"
export const DmxChunkRefConditionSchema = z.object({
  conditionType: z.literal("chunkRef"),
  parent: DmxConditionParentSchema,
  chunkId: EntityIdSchema,
  chunkStart: z.number(),
  chunkEnd: z.number(),
});

// Condition: group form - logical grouping of child conditions
export const DmxConditionGroupSchema = z.object({
  conditionType: z.literal("group"),
  parent: DmxConditionParentSchema,
  match: z.enum(["any", "all"]),
});

// Discriminated union of condition types
export const DmxConditionSchema = z.discriminatedUnion("conditionType", [
  DmxChunkRefConditionSchema,
  DmxConditionGroupSchema,
]);

export const DmxMappingGroupSchema = z.object({
  chunkId: EntityIdSchema,
  index: z.number().int().nonnegative(),
  mappings: z.array(DmxMappingSchema),
  triggers: z.array(DmxTriggerSchema),
});

// Chunk as entity
export const DmxChunkSchema = z.object({
  offsets: z.array(z.number()),
});

// An EstaDmx serializer of the device class. The serializer's default value is
// stored as flat maps for all of its entities.
export const DmxSerializerSchema = z.object({
  codexId: CodexIdSchema,
  access: z.array(AccessSchema),
  lifetime: LifetimeSchema,
  chunks: z.record(EntityIdSchema, DmxChunkSchema),
  mappingGroups: z.record(EntityIdSchema, DmxMappingGroupSchema),
  conditions: z.record(EntityIdSchema, DmxConditionSchema),
});

// ---------------------------------------------------------------------------
// Structure 3D Models
// ---------------------------------------------------------------------------

// E1.73-4 motion library structure-3d (e173/libraries/motion/<draft>/schemas/).
// Value ranges are enforced on import and in the editor, not here, so
// out-of-range data can't fail rehydration.

export const structure3DControlTypes = {
  LINEAR: "linear",
  ROTATE: "rotate",
  BEAM: "beam",
} as const;

export type Structure3DControlType =
  (typeof structure3DControlTypes)[keyof typeof structure3DControlTypes];

export const structure3DAxes = {
  X: "x",
  Y: "y",
  Z: "z",
} as const;

export type Structure3DAxis =
  (typeof structure3DAxes)[keyof typeof structure3DAxes];

export const structure3DCommonAxes = {
  PAN: "pan",
  TILT: "tilt",
  BARREL: "barrel",
  X: "x",
  Y: "y",
  Z: "z",
} as const;

export type Structure3DCommonAxis =
  (typeof structure3DCommonAxes)[keyof typeof structure3DCommonAxes];

export const structure3DModelQualities = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type Structure3DModelQuality =
  (typeof structure3DModelQualities)[keyof typeof structure3DModelQualities];

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const Structure3DTransformSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("trs"),
    translate: Vec3Schema.optional(),
    // Degrees, applied as Tait-Bryan ZYX.
    rotate: Vec3Schema.optional(),
  }),
  z.object({
    type: z.literal("matrix"),
    // 12 to 16 values
    matrix: z.array(z.number()),
  }),
]);

export const Structure3DControlTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("parameter"),
    parameter: ParameterReferenceSchema,
  }),
  z.object({
    type: z.literal("controlGroups"),
    // e.g. "control-groups?/groups/0/groups/1"
    controlGroups: z.array(z.string()),
  }),
]);

export const Structure3DControlSchema = z.object({
  type: z.enum(structure3DControlTypes),
  axis: z.enum(structure3DAxes),
  commonAxis: z.enum(structure3DCommonAxes).optional(),
  target: Structure3DControlTargetSchema,
});

export const Structure3DVisualSchema = z.object({
  quality: z.enum(structure3DModelQualities),
  // A resource of the motion library's 3d-model class
  resource: EntityIdSchema,
  // Absent means the default scene
  nodeOrSceneName: z.string().optional(),
});

export const Structure3DNodeSchema = z.object({
  // The node's key in its parent's `nodes`
  codexId: CodexIdSchema,
  // Absent for the structure's top-level nodes
  parent: EntityIdSchema.optional(),
  children: z.array(EntityIdSchema),
  transform: Structure3DTransformSchema,
  // A key in the device class's accessoryLocations
  accessoryLocation: z.string().optional(),
  controls: z.array(Structure3DControlSchema),
  visual: Structure3DVisualSchema.optional(),
  localized: z.object({
    friendlyName: LocalizationKeySchema.optional(),
  }),
});

export const Structure3DSchema = z.object({
  codexId: CodexIdSchema,
  access: z.array(AccessSchema),
  lifetime: LifetimeSchema,
  rootNodes: z.array(EntityIdSchema),
});

export const LocalizationDbSchema = z
  .record(z.string(), z.string())
  .brand<"LocalizationDb">();

export const LocalizationSchema = z.object({
  // Key = BCP 47 language tag
  strings: LocalizationDbSchema,
  // What to call this string when the document is exported to Fluxite Codex.
  // When absent, export derives a readable key from whatever refers to the
  // string.
  exportKey: z.string().optional(),
});

export const DeviceClassDocumentSchema = z.object({
  type: z.literal(documentTypes.DEVICE_CLASS),
  orgId: OrgIdSchema,
  deviceClassId: z.string(),
  deviceClassVersion: z.string(),
  basicData: DeviceClassBasicDataSchema,
  libraries: z.record(z.string(), z.string()),

  parameterClasses: z.record(EntityIdSchema, ParameterClassSchema),
  structureClasses: z.record(EntityIdSchema, StructureClassSchema),
  serializerClasses: z.record(EntityIdSchema, SerializerClassSchema),
  resourceClasses: z.record(EntityIdSchema, ResourceClassSchema),
  commandClasses: z.record(EntityIdSchema, CommandClassSchema),

  parameterEditors: z.array(EntityIdSchema),
  parameters: z.record(EntityIdSchema, ParameterSchema),

  resourceEditors: z.array(EntityIdSchema),
  resources: z.record(EntityIdSchema, ResourceSchema),
  resourceAssets: z.record(z.string(), z.string()),

  commandEditors: z.array(EntityIdSchema),
  commands: z.record(EntityIdSchema, CommandSchema),

  commandClassArguments: z.record(EntityIdSchema, CommandArgumentSchema),
  commandClassReturnValues: z.record(EntityIdSchema, CommandReturnValueSchema),

  enumChoices: z.record(EntityIdSchema, EnumChoiceSchema),

  dmxSerializers: z.record(EntityIdSchema, DmxSerializerSchema),

  structure3D: Structure3DSchema.optional(),
  structure3DNodes: z.record(EntityIdSchema, Structure3DNodeSchema),

  localizations: z.record(LocalizationKeySchema, LocalizationSchema),

  // The locale the document is authored in. Says which strings are
  // authoritative and which are translations of them.
  sourceLocale: z.string(),
});

// One document is one device class, one library or one system: the unit that a
// save file holds and that an editor is opened on.
export const DocumentSchema = z.discriminatedUnion("type", [
  DeviceClassDocumentSchema,
]);

export const AppStateSchema = z.object({
  appSettings: AppSettingsSchema,
  session: SessionSchema,
  documents: z.record(EntityIdSchema, DocumentSchema),
});

export type AppPersistentState = z.infer<typeof AppStateSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Structure3DViewSettings = NonNullable<Session["structure3DView"]>;
export type Document = z.infer<typeof DocumentSchema>;
export type DeviceClassDocument = z.infer<typeof DeviceClassDocumentSchema>;
export type DeviceClassBasicData = z.infer<typeof DeviceClassBasicDataSchema>;
export type ParameterClass = z.infer<typeof ParameterClassSchema>;
export type StructureClass = z.infer<typeof StructureClassSchema>;
export type SerializerClass = z.infer<typeof SerializerClassSchema>;
export type ResourceClass = z.infer<typeof ResourceClassSchema>;
export type CommandClass = z.infer<typeof CommandClassSchema>;
export type ParameterCount = z.infer<typeof ParameterCountSchema>;
export type ParameterDefault = z.infer<typeof ParameterDefaultSchema>;
export type Parameter = z.infer<typeof ParameterSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type CommandArgument = z.infer<typeof CommandArgumentSchema>;
export type CommandReturnValue = z.infer<typeof CommandReturnValueSchema>;
export type EnumChoice = z.infer<typeof EnumChoiceSchema>;
export type EnumChoiceParent = z.infer<typeof EnumChoiceParentSchema>;
export type Localization = z.infer<typeof LocalizationSchema>;
export type LocalizationKey = z.infer<typeof LocalizationKeySchema>;
export type LocalizationDb = z.infer<typeof LocalizationDbSchema>;
export type ClassReference = z.infer<typeof ClassReferenceSchema>;
export type LocalOrImportedId = z.infer<typeof LocalOrImportedIdSchema>;
export type EntityId = z.infer<typeof EntityIdSchema>;
export type CodexId = z.infer<typeof CodexIdSchema>;
export type FCUnit = z.infer<typeof FCUnitSchema>;

export type ParameterReference = z.infer<typeof ParameterReferenceSchema>;
export type HoldValue = z.infer<typeof HoldValueSchema>;
export type DmxSequenceStep = z.infer<typeof DmxSequenceStepSchema>;
export type DmxMappingChunkValues = z.infer<typeof DmxMappingChunkValuesSchema>;
export type DmxConditionParent = z.infer<typeof DmxConditionParentSchema>;
export type DmxChunkRefCondition = z.infer<typeof DmxChunkRefConditionSchema>;
export type DmxConditionGroup = z.infer<typeof DmxConditionGroupSchema>;
export type DmxCondition = z.infer<typeof DmxConditionSchema>;
export type DmxMappingBound = z.infer<typeof DmxMappingBoundSchema>;
export type DmxMappingBounds = z.infer<typeof DmxMappingBoundsSchema>;
export type DmxMappingRange = z.infer<typeof DmxMappingRangeSchema>;
export type DmxUnmappedParam = z.infer<typeof DmxUnmappedParamSchema>;
export type DmxMapping = z.infer<typeof DmxMappingSchema>;
export type DmxArgumentCondition = z.infer<typeof DmxArgumentConditionSchema>;
export type DmxTriggerMapping = z.infer<typeof DmxTriggerMappingSchema>;
export type DmxTrigger = z.infer<typeof DmxTriggerSchema>;
export type DmxMappingGroup = z.infer<typeof DmxMappingGroupSchema>;
export type DmxChunk = z.infer<typeof DmxChunkSchema>;
export type DmxSerializer = z.infer<typeof DmxSerializerSchema>;

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Structure3DTransform = z.infer<typeof Structure3DTransformSchema>;
export type Structure3DControlTarget = z.infer<
  typeof Structure3DControlTargetSchema
>;
export type Structure3DControl = z.infer<typeof Structure3DControlSchema>;
export type Structure3DVisual = z.infer<typeof Structure3DVisualSchema>;
export type Structure3DNode = z.infer<typeof Structure3DNodeSchema>;
export type Structure3D = z.infer<typeof Structure3DSchema>;

export const EntityId = (id: string) => id as EntityId;
export const CodexId = (id: string) => id as CodexId;
export const LocalizationKey = (id: string) => id as LocalizationKey;
