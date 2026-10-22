import { useId } from "react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { capitalCase } from "change-case";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
  CodexId,
  EmitterCommonColor,
  emitterCommonColors,
  EntityId,
} from "app/persistentState";
import { FieldSet } from "components/FieldSet";
import { NumberInput } from "components/NumberInput";
import { ValidatedInput } from "components/ValidatedInput";
import { SelectField } from "components/EditorFields/SelectField";
import { Button } from "components/scn-ui/Button";
import { Item, ItemGroup } from "components/scn-ui/Item";
import { Label } from "components/scn-ui/Label";
import { validateNewItemId } from "utils/inputValidation";
import { serializeParameterReference } from "utils/utils";
import { StructureFields } from "features/deviceClassEditor/StructureFields";
import { entityIdAsCodexId } from "features/deviceClassEditor/referenceResolution";
import {
  ControlParameterOption,
  useControlParameterOptions,
  useResources,
} from "features/structure3DEditor/state";
import {
  addEmitter,
  addEmitterGroup,
  createEmittersStructure,
  deleteEmitter,
  deleteEmitterGroup,
  modifyEmitter,
  modifyEmitterGroup,
  modifyEmittersStructure,
  useEmitterGroups,
  useEmitters,
  useEmittersStructure,
} from "./state";

const MESSAGES = {
  none: msg({
    id: "deviceClassEditor.emittersEditor.none",
    message: "None",
  }),
  removeGroup: msg({
    id: "deviceClassEditor.emittersEditor.removeGroup",
    message: "Remove group {id}",
  }),
  removeEmitter: msg({
    id: "deviceClassEditor.emittersEditor.removeEmitter",
    message: "Remove emitter {id}",
  }),
  spdDirect: msg({
    id: "deviceClassEditor.emittersEditor.spdDirect",
    message: "Spectral data given in place",
  }),
  spdResource: msg({
    id: "deviceClassEditor.emittersEditor.spdResource",
    message: "Spectral data from {resource}",
  }),
};

// The value that stands for "none" in selects, which can't use an empty string.
// No ID or schema value contains angle brackets.
const NONE = "<none>";

const COMMON_COLORS = Object.values(emitterCommonColors);

const colorName = (color: EmitterCommonColor) =>
  color === emitterCommonColors.UV ? "UV" : capitalCase(color);

/** Edits the device class's emitters structure from the intensity-color library. */
export const EmittersEditor = () => {
  const structure = useEmittersStructure();
  const groups = useEmitterGroups();
  const labelId = useId();

  if (!structure) {
    return <EmptyState />;
  }

  const controlGroupCount = structure.controlGroups.length;
  const groupCodexIds = structure.emitterGroups
    .map((id) => groups[id]?.codexId)
    .filter((codexId) => codexId !== undefined);

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto px-6 py-5">
      <StructureFields structure={structure} modify={modifyEmittersStructure} />
      <FieldSet>
        <Label id={labelId}>
          <Trans id="deviceClassEditor.emittersEditor.groups">
            Emitter Groups
          </Trans>
        </Label>
        <div className="flex flex-col gap-2">
          {structure.emitterGroups.length > 0 && (
            <ItemGroup aria-labelledby={labelId} className="gap-2">
              {structure.emitterGroups.map((id) => (
                <GroupItem
                  key={id}
                  id={id}
                  otherCodexIds={groupCodexIds.filter(
                    (codexId) => codexId !== groups[id]?.codexId,
                  )}
                />
              ))}
            </ItemGroup>
          )}
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => addEmitterGroup()}
          >
            <PlusIcon />
            <Trans id="deviceClassEditor.emittersEditor.addGroup">
              Add Emitter Group
            </Trans>
          </Button>
        </div>
      </FieldSet>
      {controlGroupCount > 0 && (
        <p className="text-sm text-muted-foreground">
          <Trans id="deviceClassEditor.emittersEditor.controlGroupsKept">
            Control groups kept as imported: {controlGroupCount}. Editing them
            here is not supported yet.
          </Trans>
        </p>
      )}
    </div>
  );
};

const EmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
    <p className="max-w-md text-muted-foreground">
      <Trans id="deviceClassEditor.emittersEditor.emptyState">
        Emitters are the light sources of a device: their colors, the parameters
        that control them, and their spectral data. A beam in the 3D structure
        can be placed at an emitter group or emitter. This device class has no
        emitters yet.
      </Trans>
    </p>
    <Button onClick={createEmittersStructure}>
      <PlusIcon />
      <Trans id="deviceClassEditor.emittersEditor.create">
        Create Emitters
      </Trans>
    </Button>
  </div>
);

interface GroupItemProps {
  id: EntityId;
  // The other groups' IDs, which this one's can't repeat
  otherCodexIds: string[];
}

const GroupItem = ({ id, otherCodexIds }: GroupItemProps) => {
  const { _ } = useLingui();
  const idPrefix = useId();
  const group = useEmitterGroups()[id];
  const emitters = useEmitters();
  const parameterOptions = useControlParameterOptions();

  if (!group) {
    return null;
  }

  const emitterCodexIds = group.emitters
    .map((emitter) => emitters[emitter]?.codexId)
    .filter((codexId) => codexId !== undefined);

  return (
    <Item variant="outline" role="listitem" className="flex-col items-stretch">
      <div className="flex flex-wrap items-end gap-4">
        <FieldSet>
          <Label htmlFor={`${idPrefix}-id`}>
            <Trans id="deviceClassEditor.emittersEditor.groupId">
              Group ID
            </Trans>
          </Label>
          <ValidatedInput
            id={`${idPrefix}-id`}
            value={group.codexId}
            onConfirm={(newValue) =>
              modifyEmitterGroup(id, (draft) => {
                draft.codexId = CodexId(newValue);
              })
            }
            validator={(input) => validateNewItemId(input, otherCodexIds)}
          />
        </FieldSet>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label={_({
            ...MESSAGES.removeGroup,
            values: { id: group.codexId },
          })}
          title={_({ ...MESSAGES.removeGroup, values: { id: group.codexId } })}
          onClick={() => deleteEmitterGroup(id)}
        >
          <Trash2Icon />
        </Button>
      </div>
      {group.emitters.length > 0 && (
        <ItemGroup className="gap-2">
          {group.emitters.map((emitterId) => (
            <EmitterItem
              key={emitterId}
              id={emitterId}
              otherCodexIds={emitterCodexIds.filter(
                (codexId) => codexId !== emitters[emitterId]?.codexId,
              )}
              parameterOptions={parameterOptions}
            />
          ))}
        </ItemGroup>
      )}
      <Button
        variant="outline"
        className="w-fit"
        onClick={() => addEmitter(id)}
      >
        <PlusIcon />
        <Trans id="deviceClassEditor.emittersEditor.addEmitter">
          Add Emitter
        </Trans>
      </Button>
    </Item>
  );
};

interface EmitterItemProps {
  id: EntityId;
  // The IDs of the other emitters in its group, which this one's can't repeat
  otherCodexIds: string[];
  parameterOptions: ControlParameterOption[];
}

const EmitterItem = ({
  id,
  otherCodexIds,
  parameterOptions,
}: EmitterItemProps) => {
  const { _ } = useLingui();
  const idPrefix = useId();
  const emitter = useEmitters()[id];
  const resources = useResources();

  if (!emitter) {
    return null;
  }

  const { directControl, spd } = emitter;
  const isSelected = (option: ControlParameterOption) =>
    option.ref.id === directControl?.id &&
    option.ref.index === directControl.index;
  // The parameter that is chosen already is shown even if it no longer exists,
  // so the form doesn't misreport the data.
  const selectedParameter = directControl
    ? (parameterOptions.find(isSelected)?.label ??
      serializeParameterReference({
        codexId: entityIdAsCodexId(directControl.id),
        index: directControl.index,
      }))
    : NONE;
  const parameterLabels = parameterOptions.map((option) => option.label);
  if (directControl && !parameterOptions.some(isSelected)) {
    parameterLabels.push(selectedParameter);
  }

  return (
    <Item variant="muted" role="listitem" className="flex-wrap items-end gap-4">
      <FieldSet>
        <Label htmlFor={`${idPrefix}-id`}>
          <Trans id="deviceClassEditor.emittersEditor.emitterId">ID</Trans>
        </Label>
        <ValidatedInput
          id={`${idPrefix}-id`}
          className="w-36"
          value={emitter.codexId}
          onConfirm={(newValue) =>
            modifyEmitter(id, (draft) => {
              draft.codexId = CodexId(newValue);
            })
          }
          validator={(input) => validateNewItemId(input, otherCodexIds)}
        />
      </FieldSet>
      <FieldSet>
        <Label htmlFor={`${idPrefix}-color`}>
          <Trans id="deviceClassEditor.emittersEditor.commonColor">
            Common Color
          </Trans>
        </Label>
        <SelectField
          id={`${idPrefix}-color`}
          className="w-36"
          values={[NONE, ...COMMON_COLORS]}
          displayValues={[_(MESSAGES.none), ...COMMON_COLORS.map(colorName)]}
          selectedValue={emitter.commonColor ?? NONE}
          onSelectionChanged={(value) =>
            modifyEmitter(id, (draft) => {
              if (value === NONE) delete draft.commonColor;
              else draft.commonColor = value as EmitterCommonColor;
            })
          }
        />
      </FieldSet>
      <FieldSet>
        <Label htmlFor={`${idPrefix}-intensity`}>
          <Trans id="deviceClassEditor.emittersEditor.directControl">
            Intensity Parameter
          </Trans>
        </Label>
        <SelectField
          id={`${idPrefix}-intensity`}
          className="w-48"
          values={[NONE, ...parameterLabels]}
          displayValues={[_(MESSAGES.none), ...parameterLabels]}
          selectedValue={selectedParameter}
          onSelectionChanged={(label) =>
            modifyEmitter(id, (draft) => {
              const option = parameterOptions.find(
                (option) => option.label === label,
              );
              if (label === NONE) delete draft.directControl;
              else if (option) draft.directControl = option.ref;
            })
          }
        />
      </FieldSet>
      <FieldSet>
        <Label htmlFor={`${idPrefix}-brightness`}>
          <Trans id="deviceClassEditor.emittersEditor.relativeBrightness">
            Relative Brightness
          </Trans>
        </Label>
        <NumberInput
          id={`${idPrefix}-brightness`}
          className="w-24"
          hideControls
          nullable
          min={0}
          max={1}
          value={emitter.relativeBrightness ?? null}
          onCommit={(value) =>
            modifyEmitter(id, (draft) => {
              if (value === null) delete draft.relativeBrightness;
              else draft.relativeBrightness = value;
            })
          }
        />
      </FieldSet>
      {spd && (
        <p className="h-9 content-center text-sm text-muted-foreground">
          {spd.type === "direct"
            ? _(MESSAGES.spdDirect)
            : _({
                ...MESSAGES.spdResource,
                values: {
                  resource:
                    resources[spd.resource]?.codexId ??
                    entityIdAsCodexId(spd.resource),
                },
              })}
        </p>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="ml-auto"
        aria-label={_({
          ...MESSAGES.removeEmitter,
          values: { id: emitter.codexId },
        })}
        title={_({
          ...MESSAGES.removeEmitter,
          values: { id: emitter.codexId },
        })}
        onClick={() => deleteEmitter(id)}
      >
        <Trash2Icon />
      </Button>
    </Item>
  );
};
