import { useId } from "react";
import { Draft } from "immer";
import { Trans } from "@lingui/react/macro";
import { capitalCase } from "change-case";
import {
  Access,
  accesses,
  CodexId,
  Lifetime,
  lifetimes,
} from "app/persistentState";
import { FieldSet } from "components/FieldSet";
import { LabeledCheckbox } from "components/LabeledCheckbox";
import { ValidatedInput } from "components/ValidatedInput";
import { SelectField } from "components/EditorFields/SelectField";
import { Label } from "components/scn-ui/Label";
import { validateNewItemId } from "utils/inputValidation";

/** What every structure instance has, whatever its class. */
interface StructureInstance {
  codexId: CodexId;
  access: Access[];
  lifetime: Lifetime;
}

interface Props {
  structure: StructureInstance;
  modify: (recipe: (draft: Draft<StructureInstance>) => void) => void;
}

/** The form for a structure instance's ID, access and lifetime. */
export const StructureFields = ({ structure, modify }: Props) => {
  const idPrefix = useId();

  const setAccess = (access: Access, checked: boolean) =>
    modify((draft) => {
      draft.access = draft.access.filter((value) => value !== access);
      if (checked) {
        draft.access.push(access);
      }
    });

  return (
    <div className="flex flex-wrap gap-4">
      <FieldSet>
        <Label htmlFor={`${idPrefix}-id`}>
          <Trans id="deviceClassEditor.structureFields.id">ID</Trans>
        </Label>
        <ValidatedInput
          id={`${idPrefix}-id`}
          value={structure.codexId}
          onConfirm={(newValue) =>
            modify((draft) => {
              draft.codexId = CodexId(newValue);
            })
          }
          validator={(input) => validateNewItemId(input, [])}
        />
      </FieldSet>
      <FieldSet>
        <Label id={`${idPrefix}-access`}>
          <Trans id="deviceClassEditor.structureFields.access">Access</Trans>
        </Label>
        <div
          role="group"
          aria-labelledby={`${idPrefix}-access`}
          className="flex h-9 items-center gap-4 px-1"
        >
          <LabeledCheckbox
            checked={structure.access.includes(accesses.READ)}
            onChange={(checked) => setAccess(accesses.READ, checked)}
          >
            <Trans id="deviceClassEditor.structureFields.read">Read</Trans>
          </LabeledCheckbox>
          <LabeledCheckbox
            disabled={structure.lifetime === lifetimes.STATIC}
            checked={structure.access.includes(accesses.WRITE)}
            onChange={(checked) => setAccess(accesses.WRITE, checked)}
          >
            <Trans id="deviceClassEditor.structureFields.write">Write</Trans>
          </LabeledCheckbox>
        </div>
      </FieldSet>
      <FieldSet>
        <Label htmlFor={`${idPrefix}-lifetime`}>
          <Trans id="deviceClassEditor.structureFields.lifetime">
            Lifetime
          </Trans>
        </Label>
        <SelectField
          id={`${idPrefix}-lifetime`}
          values={Object.values(lifetimes)}
          displayValues={Object.values(lifetimes).map((value) =>
            capitalCase(value),
          )}
          selectedValue={structure.lifetime}
          onSelectionChanged={(value) =>
            modify((draft) => {
              draft.lifetime = value as Lifetime;
              // A static item can't be written.
              if (value === lifetimes.STATIC) {
                draft.access = draft.access.filter(
                  (access) => access !== accesses.WRITE,
                );
              }
            })
          }
        />
      </FieldSet>
    </div>
  );
};
