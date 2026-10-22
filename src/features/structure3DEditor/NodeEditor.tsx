import { ReactNode, useId } from "react";
import { Draft } from "immer";
import { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { capitalCase } from "change-case";
import {
  FileUpIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthoringLocale } from "app/store";
import {
  CodexId,
  EmitterReference,
  EntityId,
  ParameterReference,
  Structure3DAperture,
  Structure3DControl,
  Structure3DControlType,
  Structure3DNode,
  Structure3DRepeat,
  Structure3DTransform,
  Structure3DVisual,
  structure3DAxes,
  structure3DCommonAxes,
  structure3DControlTypes,
  structure3DModelQualities,
  Vec3,
} from "app/persistentState";
import { FieldSet } from "components/FieldSet";
import { LabeledCheckbox } from "components/LabeledCheckbox";
import { NumberInput } from "components/NumberInput";
import { RenderError } from "components/RenderError";
import { ValidatedInput } from "components/ValidatedInput";
import { SelectField } from "components/EditorFields/SelectField";
import { Button } from "components/scn-ui/Button";
import { Item, ItemGroup } from "components/scn-ui/Item";
import { Label } from "components/scn-ui/Label";
import { ToggleGroup, ToggleGroupItem } from "components/scn-ui/ToggleGroup";
import {
  InputValidationResult,
  validateNewItemId,
} from "utils/inputValidation";
import {
  errorMessage,
  serializeParameterReference,
  wrapDegrees,
} from "utils/utils";
import { entityIdAsCodexId } from "features/deviceClassEditor/referenceResolution";
import {
  EMITTER_PATH,
  emitterReferenceFromPath,
  emitterReferenceLabel,
  useEmitterGroups,
  useEmitterOptions,
  useEmitters,
} from "features/emittersEditor/state";
import { gltfObjectNames } from "./sceneGraph";
import { useGltf } from "./useGltf";
import {
  ControlParameterOption,
  importGltfModel,
  modifyStructure3DNode,
  modifyStructure3DNodeLocalizedValue,
  useControlParameterOptions,
  useResources,
  useStructure3DNode,
  useStructure3DNodeFriendlyName,
  useStructure3DIndexNames,
  useStructure3DOtherNodeCodexIds,
} from "./state";
import {
  isCompatibleUnit,
  isModelResource,
  Structure3DIssue,
  Structure3DIssueField,
} from "./validation";

const MESSAGES = {
  translateAxis: msg({
    id: "deviceClassEditor.structure3DNodeEditor.translateAxis",
    message: "Translate {axis}",
  }),
  rotateAxis: msg({
    id: "deviceClassEditor.structure3DNodeEditor.rotateAxis",
    message: "Rotate {axis}",
  }),
  matrixCell: msg({
    id: "deviceClassEditor.structure3DNodeEditor.matrixCell",
    message: "Matrix row {row}, column {column}",
  }),
  none: msg({
    id: "deviceClassEditor.structure3DNodeEditor.none",
    message: "None",
  }),
  drivenByParameter: msg({
    id: "deviceClassEditor.structure3DNodeEditor.drivenByParameter",
    message: "Parameter",
  }),
  drivenByControlGroups: msg({
    id: "deviceClassEditor.structure3DNodeEditor.drivenByControlGroups",
    message: "Control Groups",
  }),
  removeControl: msg({
    id: "deviceClassEditor.structure3DNodeEditor.removeControl",
    message: "Remove Control",
  }),
  controlGroupPath: msg({
    id: "deviceClassEditor.structure3DNodeEditor.controlGroupPath",
    message: "Control group {number}",
  }),
  newControlGroupPath: msg({
    id: "deviceClassEditor.structure3DNodeEditor.newControlGroupPath",
    message: "New control group",
  }),
  removeControlGroupPath: msg({
    id: "deviceClassEditor.structure3DNodeEditor.removeControlGroupPath",
    message: "Remove control group {number}",
  }),
  invalidControlGroupPath: msg({
    id: "deviceClassEditor.structure3DNodeEditor.invalidControlGroupPath",
    message:
      "Write a path into a control groups structure, like control-groups?/groups/0",
  }),
  addEmitterPath: msg({
    id: "deviceClassEditor.structure3DNodeEditor.addEmitterPath",
    message: "Add emitter by path",
  }),
  invalidEmitterPath: msg({
    id: "deviceClassEditor.structure3DNodeEditor.invalidEmitterPath",
    message: "Write a path into the emitters structure, such as {example}",
  }),
  invalidIndexName: msg({
    id: "deviceClassEditor.structure3DNodeEditor.invalidIndexName",
    message:
      "Start with a letter, followed by letters, digits, - or _. Leave empty for none.",
  }),
  stepTranslateAxis: msg({
    id: "deviceClassEditor.structure3DNodeEditor.stepTranslateAxis",
    message: "Step translate {axis}",
  }),
  stepRotateAxis: msg({
    id: "deviceClassEditor.structure3DNodeEditor.stepRotateAxis",
    message: "Step rotate {axis}",
  }),
  addEmitter: msg({
    id: "deviceClassEditor.structure3DNodeEditor.addEmitter",
    message: "Add emitter or group",
  }),
  removeEmitter: msg({
    id: "deviceClassEditor.structure3DNodeEditor.removeEmitter",
    message: "Remove {emitter}",
  }),
  apertureCircle: msg({
    id: "deviceClassEditor.structure3DNodeEditor.apertureCircle",
    message: "Circle",
  }),
  apertureRectangle: msg({
    id: "deviceClassEditor.structure3DNodeEditor.apertureRectangle",
    message: "Rectangle",
  }),
  defaultScene: msg({
    id: "deviceClassEditor.structure3DNodeEditor.defaultScene",
    message: "Default scene",
  }),
  importFailed: msg({
    id: "deviceClassEditor.structure3DNodeEditor.importFailed",
    message: "Couldn't import the model: {reason}",
  }),
  modelUnreadable: msg({
    id: "deviceClassEditor.structure3DNodeEditor.modelUnreadable",
    message:
      "The model can't be shown: {reason}. Only GLB files, and .gltf files with everything embedded, can be shown.",
  }),
  nameNotInModel: msg({
    id: "deviceClassEditor.structure3DNodeEditor.nameNotInModel",
    message: "The model has no node or scene named {name}.",
  }),
};

// The value that stands for "none" in selects, which can't use an empty string.
// No ID or schema value contains angle brackets.
const NONE = "<none>";

const AXES = Object.values(structure3DAxes);

// From the structure-3d schema
// A path may number a group with a repeat's index, as "/groups/${i}".
const CONTROL_GROUP_PATH =
  /^[^?]+\?(\/groups\/(\d+|\$\{[A-Za-z][A-Za-z0-9_-]*\}))+$/;
// From the proposed schema: what a repeat's index can be named.
const INDEX_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
// An example path, not text for people to read.
// eslint-disable-next-line lingui/no-unlocalized-strings
const EMITTER_PATH_EXAMPLE = "emitters?/emitterGroups/px-${i}";

// A new repeat starts with copies this far apart along X, in meters.
const DEFAULT_REPEAT_STEP = 0.1;

// A new aperture starts at this size, in meters.
const DEFAULT_APERTURE_SIZE = 0.1;

// prettier-ignore
const IDENTITY_MATRIX = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

interface Props {
  id: EntityId;
  issues: Structure3DIssue[];
}

/** The form for one node of a 3D structure. */
export const NodeEditor = ({ id, issues }: Props) => {
  const node = useStructure3DNode(id);
  const friendlyName = useStructure3DNodeFriendlyName(id);
  const otherCodexIds = useStructure3DOtherNodeCodexIds(id);
  const indexNames = useStructure3DIndexNames(id);
  const locale = useAuthoringLocale();
  const idPrefix = useId();

  if (!node) {
    return <RenderError />;
  }

  const modify = (recipe: (draft: Draft<Structure3DNode>) => void) =>
    modifyStructure3DNode(id, recipe);

  const issuesFor = (field: Structure3DIssueField) =>
    issues.filter((issue) => issue.field === field);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <FieldSet>
          <Label htmlFor={`${idPrefix}-id`}>
            <Trans id="deviceClassEditor.structure3DNodeEditor.id">ID</Trans>
          </Label>
          <ValidatedInput
            id={`${idPrefix}-id`}
            value={node.codexId}
            onConfirm={(newValue) =>
              modify((draft) => (draft.codexId = CodexId(newValue)))
            }
            validator={(input) => validateNewItemId(input, otherCodexIds)}
          />
        </FieldSet>
        <FieldSet>
          <Label htmlFor={`${idPrefix}-friendlyName`}>
            <Trans id="deviceClassEditor.structure3DNodeEditor.displayName">
              Display Name
            </Trans>
          </Label>
          <ValidatedInput
            id={`${idPrefix}-friendlyName`}
            value={friendlyName}
            onConfirm={(newValue) =>
              modifyStructure3DNodeLocalizedValue(
                id,
                "friendlyName",
                newValue,
                locale,
              )
            }
          />
        </FieldSet>
        <FieldSet>
          <Label htmlFor={`${idPrefix}-accessoryLocation`}>
            <Trans id="deviceClassEditor.structure3DNodeEditor.accessoryLocation">
              Accessory Location
            </Trans>
          </Label>
          <ValidatedInput
            id={`${idPrefix}-accessoryLocation`}
            value={node.accessoryLocation ?? ""}
            onConfirm={(newValue) =>
              modify((draft) => {
                // Deleting an absent key records no change, where assigning
                // undefined would.
                if (newValue) draft.accessoryLocation = newValue;
                else delete draft.accessoryLocation;
              })
            }
          />
        </FieldSet>
      </div>
      <FieldIssues
        issues={[...issuesFor("id"), ...issuesFor("accessoryLocation")]}
      />
      <TransformFields transform={node.transform} modify={modify} />
      <RepeatFields
        repeat={node.repeat}
        issues={issuesFor("repeat")}
        modify={modify}
      />
      <ControlsFields
        controls={node.controls}
        indexNames={indexNames}
        issuesFor={issuesFor}
        modify={modify}
      />
      <ModelFields
        id={id}
        visual={node.visual}
        issues={issuesFor("model")}
        modify={modify}
      />
    </div>
  );
};

type Modify = (recipe: (draft: Draft<Structure3DNode>) => void) => void;

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

interface TransformFieldsProps {
  transform: Structure3DTransform;
  modify: Modify;
}

const TransformFields = ({ transform, modify }: TransformFieldsProps) => {
  const { _ } = useLingui();
  const labelId = useId();

  // Switching starts the other kind of transform from identity, rather than
  // converting.
  const setType = (type: Structure3DTransform["type"]) =>
    modify((draft) => {
      if (draft.transform.type !== type) {
        draft.transform =
          type === "trs" ? { type } : { type, matrix: [...IDENTITY_MATRIX] };
      }
    });

  const modifyTrs = (key: "translate" | "rotate", value: Vec3) =>
    modify((draft) => {
      if (draft.transform.type === "trs") {
        draft.transform[key] = value;
      }
    });

  return (
    <FieldSet>
      <Label id={labelId}>
        <Trans id="deviceClassEditor.structure3DNodeEditor.transform">
          Transform
        </Trans>
      </Label>
      <div className="flex flex-col gap-3">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-labelledby={labelId}
          value={transform.type}
          // Choosing the selected type again would clear the selection.
          onValueChange={(value) =>
            value && setType(value as Structure3DTransform["type"])
          }
        >
          <ToggleGroupItem value="trs">
            <Trans id="deviceClassEditor.structure3DNodeEditor.transformTrs">
              Translate and Rotate
            </Trans>
          </ToggleGroupItem>
          <ToggleGroupItem value="matrix">
            <Trans id="deviceClassEditor.structure3DNodeEditor.transformMatrix">
              Matrix
            </Trans>
          </ToggleGroupItem>
        </ToggleGroup>
        {transform.type === "trs" ? (
          <>
            <Vec3Fields
              label={
                <Trans id="deviceClassEditor.structure3DNodeEditor.translate">
                  Translate
                </Trans>
              }
              axisLabel={(axis) =>
                _({ ...MESSAGES.translateAxis, values: { axis } })
              }
              value={transform.translate}
              onCommit={(value) => modifyTrs("translate", value)}
            />
            <Vec3Fields
              label={
                <Trans id="deviceClassEditor.structure3DNodeEditor.rotate">
                  Rotate (degrees)
                </Trans>
              }
              axisLabel={(axis) =>
                _({ ...MESSAGES.rotateAxis, values: { axis } })
              }
              value={transform.rotate}
              // The schema only allows angles from 0 to 360.
              onCommit={(value) =>
                modifyTrs("rotate", value.map(wrapDegrees) as Vec3)
              }
            />
          </>
        ) : (
          <MatrixFields
            matrix={transform.matrix}
            onCommit={(matrix) =>
              modify((draft) => {
                if (draft.transform.type === "matrix") {
                  draft.transform.matrix = matrix;
                }
              })
            }
          />
        )}
      </div>
    </FieldSet>
  );
};

interface Vec3FieldsProps {
  label: ReactNode;
  axisLabel: (axis: string) => string;
  value?: Vec3;
  onCommit: (value: Vec3) => void;
}

const Vec3Fields = ({
  label,
  axisLabel,
  value = [0, 0, 0],
  onCommit,
}: Vec3FieldsProps) => {
  const labelId = useId();

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-wrap items-center gap-2"
    >
      <span id={labelId} className="w-36 text-sm">
        {label}
      </span>
      {AXES.map((axis, index) => (
        <NumberInput
          key={axis}
          aria-label={axisLabel(axis.toUpperCase())}
          className="w-24"
          hideControls
          value={value[index]}
          onCommit={(newValue) => {
            const next: Vec3 = [...value];
            next[index] = newValue;
            onCommit(next);
          }}
        />
      ))}
    </div>
  );
};

interface MatrixFieldsProps {
  matrix: number[];
  onCommit: (matrix: number[]) => void;
}

const MatrixFields = ({ matrix, onCommit }: MatrixFieldsProps) => {
  const { _ } = useLingui();
  const cells = matrixCells(matrix);

  return (
    <div className="grid w-fit grid-cols-4 gap-2">
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3].map((column) => {
          const index = row * 4 + column;
          return (
            <NumberInput
              key={index}
              aria-label={_({
                ...MESSAGES.matrixCell,
                values: { row: row + 1, column: column + 1 },
              })}
              className="w-24"
              hideControls
              value={cells[index]}
              onCommit={(newValue) => {
                const next = [...cells];
                next[index] = newValue;
                onCommit(next);
              }}
            />
          );
        }),
      )}
    </div>
  );
};

// A matrix's 16 values, row-major ("across then down") as E1.73-4 has it. The
// schema also allows 12 values, which leave out the bottom row of 0, 0, 0, 1.
function matrixCells(matrix: number[]): number[] {
  if (matrix.length === 12) {
    return [...matrix, 0, 0, 0, 1];
  }
  return IDENTITY_MATRIX.map((identity, index) => matrix[index] ?? identity);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface ControlsFieldsProps {
  controls: Structure3DControl[];
  // The index names of the repeats at and above the node
  indexNames: string[];
  issuesFor: (field: Structure3DIssueField) => Structure3DIssue[];
  modify: Modify;
}

const ControlsFields = ({
  controls,
  indexNames,
  issuesFor,
  modify,
}: ControlsFieldsProps) => {
  const labelId = useId();
  const parameterOptions = useControlParameterOptions(indexNames);

  const addControl = () =>
    modify((draft) => {
      const type = structure3DControlTypes.ROTATE;
      const parameter = parameterOptions.find((option) =>
        isCompatibleUnit(type, option.unit),
      );
      draft.controls.push({
        type,
        axis: structure3DAxes.X,
        target: parameter
          ? { type: "parameter", parameter: parameter.ref }
          : { type: "controlGroups", controlGroups: [] },
      });
    });

  return (
    <FieldSet>
      <Label id={labelId}>
        <Trans id="deviceClassEditor.structure3DNodeEditor.controls">
          Controls
        </Trans>
      </Label>
      <div className="flex flex-col gap-2">
        {controls.length > 0 && (
          <ItemGroup aria-labelledby={labelId} className="gap-2">
            {controls.map((control, index) => (
              <ControlItem
                key={index}
                control={control}
                parameterOptions={parameterOptions}
                inRepeat={indexNames.length > 0}
                issues={issuesFor(`control.${index}`)}
                onChange={(recipe) =>
                  modify((draft) => {
                    if (draft.controls[index]) {
                      recipe(draft.controls[index]);
                    }
                  })
                }
                onRemove={() =>
                  modify((draft) => {
                    draft.controls.splice(index, 1);
                  })
                }
              />
            ))}
          </ItemGroup>
        )}
        <Button variant="outline" className="w-fit" onClick={addControl}>
          <PlusIcon />
          <Trans id="deviceClassEditor.structure3DNodeEditor.addControl">
            Add Control
          </Trans>
        </Button>
      </div>
    </FieldSet>
  );
};

interface ControlItemProps {
  control: Structure3DControl;
  parameterOptions: ControlParameterOption[];
  // Whether a repeat at or above the node has an index name to use
  inRepeat: boolean;
  issues: Structure3DIssue[];
  onChange: (recipe: (draft: Draft<Structure3DControl>) => void) => void;
  onRemove: () => void;
}

const ControlItem = ({
  control,
  parameterOptions,
  inRepeat,
  issues,
  onChange,
  onRemove,
}: ControlItemProps) => {
  const { _ } = useLingui();
  const idPrefix = useId();
  const { target } = control;

  const compatibleOptions = (type: Structure3DControlType) =>
    parameterOptions.filter((option) => isCompatibleUnit(type, option.unit));

  // Picks a parameter that fits the control, if there is one to pick.
  const driveByParameter = (draft: Draft<Structure3DControl>) => {
    const option = compatibleOptions(draft.type)[0] ?? parameterOptions[0];
    if (option) {
      draft.target = { type: "parameter", parameter: option.ref };
    }
  };

  const setDrivenBy = (drivenBy: string) =>
    onChange((draft) => {
      if (drivenBy === draft.target.type) {
        return;
      }
      if (drivenBy === "controlGroups") {
        draft.target = { type: "controlGroups", controlGroups: [] };
      } else {
        driveByParameter(draft);
      }
    });

  // E1.73-4 Table 8-8: beams are driven by control groups, linear and rotate
  // controls by a parameter, so changing the type changes what drives it. Only
  // a beam has emitters and an aperture.
  const setType = (type: Structure3DControlType) =>
    onChange((draft) => {
      draft.type = type;
      if (type === structure3DControlTypes.BEAM) {
        if (draft.target.type !== "controlGroups") {
          draft.target = { type: "controlGroups", controlGroups: [] };
        }
        return;
      }
      delete draft.emitters;
      delete draft.aperture;
      if (draft.target.type !== "parameter") {
        driveByParameter(draft);
      }
    });

  const isBeam = control.type === structure3DControlTypes.BEAM;
  const emitters = control.emitters ?? [];

  // What drives this type of control, and whatever drives it already if that
  // doesn't fit, so the form doesn't misreport the data; its issue is shown
  // beside the control.
  const drivenBy = isBeam ? "controlGroups" : "parameter";
  const drivenByValues =
    target.type === drivenBy ? [drivenBy] : [drivenBy, target.type];
  const drivenByNames: Record<string, MessageDescriptor> = {
    parameter: MESSAGES.drivenByParameter,
    controlGroups: MESSAGES.drivenByControlGroups,
  };

  return (
    <Item variant="outline" role="listitem" className="flex-col items-stretch">
      <div className="flex flex-wrap items-start gap-4">
        <FieldSet>
          <Label htmlFor={`${idPrefix}-type`}>
            <Trans id="deviceClassEditor.structure3DNodeEditor.controlType">
              Type
            </Trans>
          </Label>
          <SelectField
            id={`${idPrefix}-type`}
            className="w-32"
            values={Object.values(structure3DControlTypes)}
            displayValues={Object.values(structure3DControlTypes).map((type) =>
              capitalCase(type),
            )}
            selectedValue={control.type}
            onSelectionChanged={(value) =>
              setType(value as Structure3DControlType)
            }
          />
        </FieldSet>
        <FieldSet>
          <Label htmlFor={`${idPrefix}-axis`}>
            <Trans id="deviceClassEditor.structure3DNodeEditor.axis">
              Axis
            </Trans>
          </Label>
          <SelectField
            id={`${idPrefix}-axis`}
            className="w-24"
            values={AXES}
            displayValues={AXES.map((axis) => axis.toUpperCase())}
            selectedValue={control.axis}
            onSelectionChanged={(value) =>
              onChange((draft) => {
                draft.axis = value as Structure3DControl["axis"];
              })
            }
          />
        </FieldSet>
        <FieldSet>
          <Label htmlFor={`${idPrefix}-commonAxis`}>
            <Trans id="deviceClassEditor.structure3DNodeEditor.commonAxis">
              Common Axis
            </Trans>
          </Label>
          <SelectField
            id={`${idPrefix}-commonAxis`}
            className="w-32"
            values={[NONE, ...Object.values(structure3DCommonAxes)]}
            displayValues={[
              _(MESSAGES.none),
              ...Object.values(structure3DCommonAxes).map((axis) =>
                axis.length === 1 ? axis.toUpperCase() : capitalCase(axis),
              ),
            ]}
            selectedValue={control.commonAxis ?? NONE}
            onSelectionChanged={(value) =>
              onChange((draft) => {
                draft.commonAxis =
                  value === NONE
                    ? undefined
                    : (value as Structure3DControl["commonAxis"]);
              })
            }
          />
        </FieldSet>
        <FieldSet>
          <Label htmlFor={`${idPrefix}-drivenBy`}>
            <Trans id="deviceClassEditor.structure3DNodeEditor.drivenBy">
              Driven By
            </Trans>
          </Label>
          <SelectField
            id={`${idPrefix}-drivenBy`}
            className="w-40"
            values={drivenByValues}
            displayValues={drivenByValues.map((value) =>
              _(drivenByNames[value]!),
            )}
            selectedValue={target.type}
            onSelectionChanged={setDrivenBy}
          />
        </FieldSet>
        {target.type === "parameter" && (
          <FieldSet>
            <Label htmlFor={`${idPrefix}-parameter`}>
              <Trans id="deviceClassEditor.structure3DNodeEditor.parameter">
                Parameter
              </Trans>
            </Label>
            <ParameterSelect
              id={`${idPrefix}-parameter`}
              selected={target.parameter}
              options={compatibleOptions(control.type)}
              allOptions={parameterOptions}
              onSelect={(ref) =>
                onChange((draft) => {
                  draft.target = { type: "parameter", parameter: ref };
                })
              }
            />
          </FieldSet>
        )}
        {target.type === "controlGroups" && (
          <FieldSet>
            <Label id={`${idPrefix}-controlGroups`}>
              <Trans id="deviceClassEditor.structure3DNodeEditor.controlGroups">
                Control Groups
              </Trans>
            </Label>
            <ControlGroupsField
              aria-labelledby={`${idPrefix}-controlGroups`}
              paths={target.controlGroups}
              onChange={(paths) =>
                onChange((draft) => {
                  draft.target = {
                    type: "controlGroups",
                    controlGroups: paths,
                  };
                })
              }
            />
          </FieldSet>
        )}
        {(isBeam || emitters.length > 0) && (
          <FieldSet>
            <Label id={`${idPrefix}-emitters`}>
              <Trans id="deviceClassEditor.structure3DNodeEditor.emitters">
                Emitters
              </Trans>
            </Label>
            <EmitterReferencesField
              aria-labelledby={`${idPrefix}-emitters`}
              refs={emitters}
              allowPaths={inRepeat}
              onChange={(refs) =>
                onChange((draft) => {
                  if (refs.length > 0) draft.emitters = refs;
                  else delete draft.emitters;
                })
              }
            />
          </FieldSet>
        )}
        {(isBeam || control.aperture) && (
          <ApertureFields
            aperture={control.aperture}
            onChange={(aperture) =>
              onChange((draft) => {
                // Deleting an absent key records no change, where assigning
                // undefined would.
                if (aperture) draft.aperture = aperture;
                else delete draft.aperture;
              })
            }
          />
        )}
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label={_(MESSAGES.removeControl)}
          title={_(MESSAGES.removeControl)}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>
      <FieldIssues issues={issues} />
    </Item>
  );
};

interface ParameterSelectProps {
  id: string;
  selected: ParameterReference;
  // The parameters that fit the control
  options: ControlParameterOption[];
  allOptions: ControlParameterOption[];
  onSelect: (ref: ParameterReference) => void;
}

/**
 * Picks from the parameters that fit a control. The parameter that is chosen
 * already is shown even if it doesn't fit or no longer exists, so the form
 * doesn't misreport the data; its issue is shown beside the control.
 */
const ParameterSelect = ({
  id,
  selected,
  options,
  allOptions,
  onSelect,
}: ParameterSelectProps) => {
  const isSelected = (option: ControlParameterOption) =>
    option.ref.id === selected.id && option.ref.index === selected.index;

  const selectedLabel =
    allOptions.find(isSelected)?.label ??
    serializeParameterReference({
      codexId: entityIdAsCodexId(selected.id),
      index: selected.index,
    });

  const labels = options.map((option) => option.label);
  if (!options.some(isSelected)) {
    labels.push(selectedLabel);
  }

  return (
    <SelectField
      id={id}
      className="w-48"
      values={labels}
      selectedValue={selectedLabel}
      onSelectionChanged={(label) => {
        const option = options.find((option) => option.label === label);
        if (option && !isSelected(option)) {
          onSelect(option.ref);
        }
      }}
    />
  );
};

interface ControlGroupsFieldProps {
  "aria-labelledby": string;
  paths: string[];
  onChange: (paths: string[]) => void;
}

const ControlGroupsField = ({
  "aria-labelledby": labelledBy,
  paths,
  onChange,
}: ControlGroupsFieldProps) => {
  const { _ } = useLingui();

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-2"
    >
      {paths.map((path, index) => (
        <div key={index} className="flex items-center gap-1">
          <ValidatedInput
            aria-label={_({
              ...MESSAGES.controlGroupPath,
              values: { number: index + 1 },
            })}
            value={path}
            validator={validateControlGroupPath}
            onConfirm={(newValue) =>
              newValue !== path &&
              onChange(paths.map((p, i) => (i === index ? newValue : p)))
            }
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={_({
              ...MESSAGES.removeControlGroupPath,
              values: { number: index + 1 },
            })}
            onClick={() => onChange(paths.filter((_p, i) => i !== index))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <ValidatedInput
        // Starts empty again once a path has been added.
        key={paths.length}
        aria-label={_(MESSAGES.newControlGroupPath)}
        placeholder="control-groups?/groups/0"
        value=""
        validator={(input) =>
          input === "" ? { isValid: true } : validateControlGroupPath(input)
        }
        onConfirm={(newValue) => newValue && onChange([...paths, newValue])}
      />
    </div>
  );
};

function validateControlGroupPath(input: string): InputValidationResult {
  return CONTROL_GROUP_PATH.test(input)
    ? { isValid: true }
    : { isValid: false, feedback: MESSAGES.invalidControlGroupPath };
}

interface EmitterReferencesFieldProps {
  "aria-labelledby": string;
  refs: EmitterReference[];
  // Whether a path can be typed, so each copy of a repeated node can name its
  // own group, as "emitters?/emitterGroups/px-${i}"
  allowPaths: boolean;
  onChange: (refs: EmitterReference[]) => void;
}

/**
 * The emitter groups and emitters a beam is placed at, picked from the device
 * class's emitters or, in a repeated node, given by a path. One that no longer
 * exists is still listed, so the form doesn't misreport the data; its issue is
 * shown beside the control.
 */
const EmitterReferencesField = ({
  "aria-labelledby": labelledBy,
  refs,
  allowPaths,
  onChange,
}: EmitterReferencesFieldProps) => {
  const { _ } = useLingui();
  const options = useEmitterOptions();
  const emitterGroups = useEmitterGroups();
  const emitters = useEmitters();

  const key = (ref: EmitterReference) => `${ref.group}/${ref.emitter ?? ""}`;
  const chosen = new Set(refs.map(key));
  const available = options.filter((option) => !chosen.has(key(option.ref)));

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-2"
    >
      {refs.map((ref, index) => {
        const label = emitterReferenceLabel({ emitterGroups, emitters }, ref);
        return (
          <div key={key(ref)} className="flex items-center gap-1">
            <span className="min-w-36 text-sm">{label}</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={_({
                ...MESSAGES.removeEmitter,
                values: { emitter: label },
              })}
              onClick={() => onChange(refs.filter((_r, i) => i !== index))}
            >
              <XIcon />
            </Button>
          </div>
        );
      })}
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Trans id="deviceClassEditor.structure3DNodeEditor.noEmitterOptions">
            The device class has no emitters yet. Add them in the Emitters tab.
          </Trans>
        </p>
      ) : (
        available.length > 0 && (
          <SelectField
            // Starts empty again once an emitter has been added.
            key={refs.length}
            className="w-48"
            aria-label={_(MESSAGES.addEmitter)}
            placeholder={_(MESSAGES.addEmitter)}
            values={available.map((option) => key(option.ref))}
            displayValues={available.map((option) => option.label)}
            onSelectionChanged={(value) => {
              const option = available.find(
                (option) => key(option.ref) === value,
              );
              if (option) onChange([...refs, option.ref]);
            }}
          />
        )
      )}
      {allowPaths && (
        <ValidatedInput
          // Starts empty again once an emitter has been added.
          key={`path-${refs.length}`}
          aria-label={_(MESSAGES.addEmitterPath)}
          placeholder={EMITTER_PATH_EXAMPLE}
          value=""
          validator={(input) =>
            input === "" || EMITTER_PATH.test(input)
              ? { isValid: true }
              : {
                  isValid: false,
                  feedback: {
                    ...MESSAGES.invalidEmitterPath,
                    values: { example: EMITTER_PATH_EXAMPLE },
                  },
                }
          }
          onConfirm={(path) => {
            const ref =
              path &&
              emitterReferenceFromPath({ emitterGroups, emitters }, path);
            if (ref) onChange([...refs, ref]);
          }}
        />
      )}
    </div>
  );
};

interface RepeatFieldsProps {
  repeat?: Structure3DRepeat;
  issues: Structure3DIssue[];
  modify: Modify;
}

/** Whether the node stands for several copies, and how they're laid out. */
const RepeatFields = ({ repeat, issues, modify }: RepeatFieldsProps) => {
  const { _ } = useLingui();
  const idPrefix = useId();

  const modifyRepeat = (recipe: (draft: Draft<Structure3DRepeat>) => void) =>
    modify((draft) => {
      if (draft.repeat) recipe(draft.repeat);
    });

  return (
    <FieldSet>
      <LabeledCheckbox
        checked={repeat !== undefined}
        onChange={(checked) =>
          modify((draft) => {
            if (checked) {
              draft.repeat = {
                count: 2,
                step: { translate: [DEFAULT_REPEAT_STEP, 0, 0] },
              };
            } else {
              delete draft.repeat;
            }
          })
        }
      >
        <Trans id="deviceClassEditor.structure3DNodeEditor.repeat">
          Repeat
        </Trans>
      </LabeledCheckbox>
      {repeat && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            <FieldSet>
              <Label htmlFor={`${idPrefix}-count`}>
                <Trans id="deviceClassEditor.structure3DNodeEditor.repeatCount">
                  Count
                </Trans>
              </Label>
              <NumberInput
                id={`${idPrefix}-count`}
                className="w-24"
                hideControls
                integer
                min={1}
                value={repeat.count}
                onCommit={(count) =>
                  modifyRepeat((draft) => {
                    draft.count = count;
                  })
                }
              />
            </FieldSet>
            <FieldSet>
              <Label htmlFor={`${idPrefix}-index`}>
                <Trans id="deviceClassEditor.structure3DNodeEditor.repeatIndex">
                  Index Name
                </Trans>
              </Label>
              <ValidatedInput
                id={`${idPrefix}-index`}
                className="w-36"
                value={repeat.index ?? ""}
                validator={(input) =>
                  input === "" || INDEX_NAME.test(input)
                    ? { isValid: true }
                    : { isValid: false, feedback: MESSAGES.invalidIndexName }
                }
                onConfirm={(index) =>
                  modifyRepeat((draft) => {
                    if (index) draft.index = index;
                    else delete draft.index;
                  })
                }
              />
            </FieldSet>
          </div>
          <Vec3Fields
            label={
              <Trans id="deviceClassEditor.structure3DNodeEditor.repeatStepTranslate">
                Step: Translate
              </Trans>
            }
            axisLabel={(axis) =>
              _({ ...MESSAGES.stepTranslateAxis, values: { axis } })
            }
            value={repeat.step.translate}
            onCommit={(value) =>
              modifyRepeat((draft) => {
                draft.step.translate = value;
              })
            }
          />
          <Vec3Fields
            label={
              <Trans id="deviceClassEditor.structure3DNodeEditor.repeatStepRotate">
                Step: Rotate (degrees)
              </Trans>
            }
            axisLabel={(axis) =>
              _({ ...MESSAGES.stepRotateAxis, values: { axis } })
            }
            value={repeat.step.rotate}
            // The schema only allows angles from 0 to 360.
            onCommit={(value) =>
              modifyRepeat((draft) => {
                draft.step.rotate = value.map(wrapDegrees) as Vec3;
              })
            }
          />
        </div>
      )}
      <FieldIssues issues={issues} />
    </FieldSet>
  );
};

interface ApertureFieldsProps {
  aperture?: Structure3DAperture;
  onChange: (aperture: Structure3DAperture | undefined) => void;
}

/** The area a beam's light leaves from: none, a circle or a rectangle. */
const ApertureFields = ({ aperture, onChange }: ApertureFieldsProps) => {
  const { _ } = useLingui();
  const idPrefix = useId();

  const setShape = (shape: string) => {
    if (shape === (aperture?.shape ?? NONE)) return;
    onChange(
      shape === "circle"
        ? { shape, diameter: DEFAULT_APERTURE_SIZE }
        : shape === "rectangle"
          ? {
              shape,
              width: DEFAULT_APERTURE_SIZE,
              height: DEFAULT_APERTURE_SIZE,
            }
          : undefined,
    );
  };

  const sizeField = (
    key: string,
    label: ReactNode,
    value: number,
    onCommit: (value: number) => void,
  ) => (
    <FieldSet key={key}>
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <NumberInput
        id={`${idPrefix}-${key}`}
        className="w-24"
        hideControls
        min={0}
        value={value}
        onCommit={onCommit}
      />
    </FieldSet>
  );

  return (
    <>
      <FieldSet>
        <Label htmlFor={`${idPrefix}-shape`}>
          <Trans id="deviceClassEditor.structure3DNodeEditor.aperture">
            Aperture
          </Trans>
        </Label>
        <SelectField
          id={`${idPrefix}-shape`}
          className="w-32"
          values={[NONE, "circle", "rectangle"]}
          displayValues={[
            _(MESSAGES.none),
            _(MESSAGES.apertureCircle),
            _(MESSAGES.apertureRectangle),
          ]}
          selectedValue={aperture?.shape ?? NONE}
          onSelectionChanged={setShape}
        />
      </FieldSet>
      {aperture?.shape === "circle" &&
        sizeField(
          "diameter",
          <Trans id="deviceClassEditor.structure3DNodeEditor.apertureDiameter">
            Diameter (m)
          </Trans>,
          aperture.diameter,
          (diameter) => onChange({ ...aperture, diameter }),
        )}
      {aperture?.shape === "rectangle" && [
        sizeField(
          "width",
          <Trans id="deviceClassEditor.structure3DNodeEditor.apertureWidth">
            Width (m)
          </Trans>,
          aperture.width,
          (width) => onChange({ ...aperture, width }),
        ),
        sizeField(
          "height",
          <Trans id="deviceClassEditor.structure3DNodeEditor.apertureHeight">
            Height (m)
          </Trans>,
          aperture.height,
          (height) => onChange({ ...aperture, height }),
        ),
      ]}
    </>
  );
};

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface ModelFieldsProps {
  id: EntityId;
  visual?: Structure3DVisual;
  issues: Structure3DIssue[];
  modify: Modify;
}

/** The node's 3D model: a 3d-model resource, and what to show of it. */
const ModelFields = ({ id, visual, issues, modify }: ModelFieldsProps) => {
  const { _ } = useLingui();
  const idPrefix = useId();
  const resources = useResources();
  const gltf = useGltf(visual?.resource);

  const choices = Object.entries(resources)
    .filter(([, resource]) => isModelResource(resource))
    .map(([resourceId, resource]) => ({
      id: resourceId,
      label: resource.codexId,
    }));
  // The resource that is chosen already is shown even if it doesn't fit or no
  // longer exists; its issue is shown below.
  if (visual && !choices.some((choice) => choice.id === visual.resource)) {
    choices.push({
      id: visual.resource,
      label: resources[visual.resource]?.codexId ?? visual.resource,
    });
  }

  // The names in the model, once it has been read. Until then, or if it can't
  // be, the name is typed.
  const names =
    gltf?.status === "loaded" ? gltfObjectNames(gltf.gltf) : undefined;
  const name = visual?.nodeOrSceneName;
  const nameMissing = names && name && !names.includes(name);
  // A stored name the model doesn't have is still offered, with its issue below.
  const nameChoices = nameMissing ? [...names, name] : (names ?? []);

  const modelIssues = [...issues];
  if (gltf?.status === "error") {
    modelIssues.push({
      field: "model",
      message: {
        ...MESSAGES.modelUnreadable,
        values: { reason: errorMessage(gltf.error) },
      },
    });
  }
  if (nameMissing) {
    modelIssues.push({
      field: "model",
      message: { ...MESSAGES.nameNotInModel, values: { name } },
    });
  }

  const setNodeOrSceneName = (newValue: string) =>
    modify((draft) => {
      if (!draft.visual) return;
      if (newValue) draft.visual.nodeOrSceneName = newValue;
      else delete draft.visual.nodeOrSceneName;
    });

  const importModel = () =>
    importGltfModel(id).catch((error: unknown) =>
      toast.error(
        _({
          ...MESSAGES.importFailed,
          values: { reason: errorMessage(error) },
        }),
      ),
    );

  return (
    <FieldSet>
      <Label>
        <Trans id="deviceClassEditor.structure3DNodeEditor.model">Model</Trans>
      </Label>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-4">
          <FieldSet>
            <Label htmlFor={`${idPrefix}-resource`}>
              <Trans id="deviceClassEditor.structure3DNodeEditor.modelResource">
                Resource
              </Trans>
            </Label>
            <SelectField
              id={`${idPrefix}-resource`}
              className="w-48"
              values={[NONE, ...choices.map((choice) => choice.id)]}
              displayValues={[
                _(MESSAGES.none),
                ...choices.map((choice) => choice.label),
              ]}
              selectedValue={visual?.resource ?? NONE}
              onSelectionChanged={(value) =>
                modify((draft) => {
                  if (value === NONE) {
                    draft.visual = undefined;
                  } else if (draft.visual) {
                    draft.visual.resource = EntityId(value);
                  } else {
                    draft.visual = {
                      quality: structure3DModelQualities.HIGH,
                      resource: EntityId(value),
                    };
                  }
                })
              }
            />
          </FieldSet>
          {visual && (
            <>
              <FieldSet>
                <Label htmlFor={`${idPrefix}-quality`}>
                  <Trans id="deviceClassEditor.structure3DNodeEditor.modelQuality">
                    Quality
                  </Trans>
                </Label>
                <SelectField
                  id={`${idPrefix}-quality`}
                  className="w-32"
                  values={Object.values(structure3DModelQualities)}
                  displayValues={Object.values(structure3DModelQualities).map(
                    (quality) => capitalCase(quality),
                  )}
                  selectedValue={visual.quality}
                  onSelectionChanged={(value) =>
                    modify((draft) => {
                      if (draft.visual) {
                        draft.visual.quality =
                          value as Structure3DVisual["quality"];
                      }
                    })
                  }
                />
              </FieldSet>
              <FieldSet>
                <Label htmlFor={`${idPrefix}-nodeOrSceneName`}>
                  <Trans id="deviceClassEditor.structure3DNodeEditor.nodeOrSceneName">
                    glTF Node or Scene
                  </Trans>
                </Label>
                {names ? (
                  <SelectField
                    id={`${idPrefix}-nodeOrSceneName`}
                    className="w-48"
                    values={[NONE, ...nameChoices]}
                    displayValues={[_(MESSAGES.defaultScene), ...nameChoices]}
                    selectedValue={name ?? NONE}
                    onSelectionChanged={(value) =>
                      setNodeOrSceneName(value === NONE ? "" : value)
                    }
                  />
                ) : (
                  <ValidatedInput
                    id={`${idPrefix}-nodeOrSceneName`}
                    value={name ?? ""}
                    onConfirm={setNodeOrSceneName}
                  />
                )}
              </FieldSet>
            </>
          )}
        </div>
        <Button variant="outline" className="w-fit" onClick={importModel}>
          <FileUpIcon />
          <Trans id="deviceClassEditor.structure3DNodeEditor.importModel">
            Import glTF…
          </Trans>
        </Button>
        <FieldIssues issues={modelIssues} />
      </div>
    </FieldSet>
  );
};

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

const FieldIssues = ({ issues }: { issues: Structure3DIssue[] }) => {
  const { _ } = useLingui();

  return issues.map((issue, index) => (
    <p
      key={index}
      className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400"
    >
      <TriangleAlertIcon className="size-4 shrink-0" />
      {_(issue.message)}
    </p>
  ));
};
