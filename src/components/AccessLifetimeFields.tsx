import { useId } from "react";
import { Trans } from "@lingui/react/macro";
import { capitalCase } from "change-case";
import { Access, accesses, Lifetime, lifetimes } from "app/persistentState";
import { FieldSet } from "./FieldSet";
import { LabeledCheckbox } from "./LabeledCheckbox";
import { SelectField } from "./EditorFields/SelectField";
import { Label } from "./scn-ui/Label";

interface Props {
  access: Access[];
  lifetime: Lifetime;
  onChange: (access: Access[], lifetime: Lifetime) => void;
}

export const AccessLifetimeFields = ({ access, lifetime, onChange }: Props) => {
  const idPrefix = useId();

  const updateAccess = (checked: boolean, relevantAccess: Access) => {
    if (checked && !access.includes(relevantAccess)) {
      onChange([...access, relevantAccess], lifetime);
    } else if (!checked) {
      onChange(
        access.filter((a) => a !== relevantAccess),
        lifetime,
      );
    }
  };

  return (
    <>
      <FieldSet>
        <Label id={`${idPrefix}-access`}>
          <Trans id="accessLifetimeFields.access">Access</Trans>
        </Label>
        <div
          role="group"
          aria-labelledby={`${idPrefix}-access`}
          className="flex w-xs h-9 items-center gap-4 px-1"
        >
          <LabeledCheckbox
            checked={access.includes(accesses.READ)}
            onChange={(checked) => updateAccess(checked, accesses.READ)}
          >
            <Trans id="accessLifetimeFields.read">Read</Trans>
          </LabeledCheckbox>
          <LabeledCheckbox
            disabled={lifetime === lifetimes.STATIC}
            checked={access.includes(accesses.WRITE)}
            onChange={(checked) => updateAccess(checked, accesses.WRITE)}
          >
            <Trans id="accessLifetimeFields.write">Write</Trans>
          </LabeledCheckbox>
        </div>
      </FieldSet>
      <FieldSet>
        <Label htmlFor={`${idPrefix}-lifetime`}>
          <Trans id="accessLifetimeFields.lifetime">Lifetime</Trans>
        </Label>
        <SelectField
          id={`${idPrefix}-lifetime`}
          values={Object.values(lifetimes)}
          displayValues={Object.values(lifetimes).map((value) =>
            capitalCase(value),
          )}
          selectedValue={lifetime}
          onSelectionChanged={(value) =>
            onChange(
              value === lifetimes.STATIC
                ? access.filter((a) => a !== accesses.WRITE)
                : access,
              value as Lifetime,
            )
          }
        />
      </FieldSet>
    </>
  );
};
