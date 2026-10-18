import { ReactNode, useId } from "react";
import { Draft } from "immer";
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
  EntityId,
  ParameterReference,
  Structure3DControl,
  Structure3DControlType,
  Structure3DNode,
  Structure3DTransform,
  Structure3DVisual,
  structure3DAxes,
  structure3DCommonAxes,
  structure3DControlTypes,
  structure3DModelQualities,
  Vec3,
} from "app/persistentState";
import { FieldSet } from "components/FieldSet";
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
  useStructure3DSiblingCodexIds,
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
const CONTROL_GROUP_PATH = /^[^?]+\?(\/groups\/\d+)+?$/;

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
  const siblingCodexIds = useStructure3DSiblingCodexIds(id);
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
            validator={(input) => validateNewItemId(input, siblingCodexIds)}
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
      <TransformFields transform={node.transform} modify={modify} />
      <ControlsFields
        controls={node.controls}
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
  // converting, as a matrix can hold things translate and rotate can't.
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
          const index = column * 4 + row;
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

// A matrix's 16 values, column-major as in glTF. The schema also allows 12
// values, which leave out the bottom row.
function matrixCells(matrix: number[]): number[] {
  if (matrix.length === 12) {
    return [0, 1, 2, 3].flatMap((column) => [
      ...matrix.slice(column * 3, column * 3 + 3),
      column === 3 ? 1 : 0,
    ]);
  }
  return IDENTITY_MATRIX.map((identity, index) => matrix[index] ?? identity);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface ControlsFieldsProps {
  controls: Structure3DControl[];
  issuesFor: (field: Structure3DIssueField) => Structure3DIssue[];
  modify: Modify;
}

const ControlsFields = ({
  controls,
  issuesFor,
  modify,
}: ControlsFieldsProps) => {
  const labelId = useId();
  const parameterOptions = useControlParameterOptions();

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
  issues: Structure3DIssue[];
  onChange: (recipe: (draft: Draft<Structure3DControl>) => void) => void;
  onRemove: () => void;
}

const ControlItem = ({
  control,
  parameterOptions,
  issues,
  onChange,
  onRemove,
}: ControlItemProps) => {
  const { _ } = useLingui();
  const idPrefix = useId();
  const { target } = control;

  const compatibleOptions = (type: Structure3DControlType) =>
    parameterOptions.filter((option) => isCompatibleUnit(type, option.unit));

  const setDrivenBy = (drivenBy: string) =>
    onChange((draft) => {
      if (drivenBy === draft.target.type) {
        return;
      }
      if (drivenBy === "controlGroups") {
        draft.target = { type: "controlGroups", controlGroups: [] };
        return;
      }
      const option = compatibleOptions(draft.type)[0] ?? parameterOptions[0];
      if (option) {
        draft.target = { type: "parameter", parameter: option.ref };
      }
    });

  // A parameter can only be offered when there is one to pick.
  const drivenByValues =
    parameterOptions.length > 0 || target.type === "parameter"
      ? ["parameter", "controlGroups"]
      : ["controlGroups"];

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
              onChange((draft) => {
                draft.type = value as Structure3DControlType;
              })
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
              _(
                value === "parameter"
                  ? MESSAGES.drivenByParameter
                  : MESSAGES.drivenByControlGroups,
              ),
            )}
            selectedValue={target.type}
            onSelectionChanged={setDrivenBy}
          />
        </FieldSet>
        {target.type === "parameter" ? (
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
        ) : (
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
