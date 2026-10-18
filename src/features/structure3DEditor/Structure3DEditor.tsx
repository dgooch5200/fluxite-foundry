import { ReactNode, useId, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { capitalCase } from "change-case";
import { PlusIcon } from "lucide-react";
import {
  Access,
  accesses,
  CodexId,
  EntityId,
  Lifetime,
  lifetimes,
  Structure3D,
} from "app/persistentState";
import { FieldSet } from "components/FieldSet";
import { LabeledCheckbox } from "components/LabeledCheckbox";
import { ValidatedInput } from "components/ValidatedInput";
import { SelectField } from "components/EditorFields/SelectField";
import { Button } from "components/scn-ui/Button";
import { Label } from "components/scn-ui/Label";
import {
  SidebarLayout,
  SidebarLayoutMain,
  SidebarLayoutSidebar,
} from "components/SidebarLayout";
import { validateNewItemId } from "utils/inputValidation";
import {
  createStructure3D,
  modifyStructure3D,
  useStructure3D,
  useStructure3DIssues,
  useStructure3DNodes,
} from "./state";
import { NodeTree } from "./NodeTree";
import { NodeEditor } from "./NodeEditor";

/** What the 3D viewport is given to show and change the selection with. */
export interface Structure3DViewportProps {
  /** Undefined when the structure itself is selected. */
  selectedNodeId?: EntityId;
  onSelectNode: (nodeId?: EntityId) => void;
}

interface Props {
  /** Draws a 3D view of the structure above the selected item's form. */
  renderViewport?: (props: Structure3DViewportProps) => ReactNode;
}

/** Edits the device class's structure-3d structure from the motion library. */
export const Structure3DEditor = ({ renderViewport }: Props) => {
  const structure = useStructure3D();
  const nodes = useStructure3DNodes();
  const issues = useStructure3DIssues();
  const [selectedNodeId, setSelectedNodeId] = useState<EntityId>();

  if (!structure) {
    return <EmptyState />;
  }

  // If the selected node goes away, e.g. by undo, the structure is selected.
  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : undefined;
  const selected = selectedNode ? selectedNodeId : undefined;

  return (
    <SidebarLayout className="items-start">
      <SidebarLayoutSidebar className="flex items-start p-2">
        <NodeTree
          selectedNodeId={selected}
          issues={issues}
          onSelect={setSelectedNodeId}
        />
      </SidebarLayoutSidebar>
      <SidebarLayoutMain className="flex flex-col overflow-auto">
        {renderViewport?.({
          selectedNodeId: selected,
          onSelectNode: setSelectedNodeId,
        })}
        <div className="min-w-xs m-2 px-4 py-5 flex flex-col gap-4">
          <div className="text-xl font-semibold">
            {selectedNode ? (
              selectedNode.codexId
            ) : (
              <Trans id="deviceClassEditor.structure3DEditor.structureTitle">
                Structure
              </Trans>
            )}
          </div>
          {selected ? (
            <NodeEditor
              key={selected}
              id={selected}
              issues={issues[selected] ?? []}
            />
          ) : (
            <StructureEditor structure={structure} />
          )}
        </div>
      </SidebarLayoutMain>
    </SidebarLayout>
  );
};

const EmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
    <p className="max-w-md text-muted-foreground">
      <Trans id="deviceClassEditor.structure3DEditor.emptyState">
        A 3D structure describes the physical parts of a device: where each part
        sits, which parameters move it, and the 3D model that shows it. This
        device class has no 3D structure yet.
      </Trans>
    </p>
    <Button onClick={createStructure3D}>
      <PlusIcon />
      <Trans id="deviceClassEditor.structure3DEditor.create">
        Create Structure 3D
      </Trans>
    </Button>
  </div>
);

/** The form for the structure as a whole. */
const StructureEditor = ({ structure }: { structure: Structure3D }) => {
  const idPrefix = useId();

  const setAccess = (access: Access, checked: boolean) =>
    modifyStructure3D((draft) => {
      draft.access = draft.access.filter((value) => value !== access);
      if (checked) {
        draft.access.push(access);
      }
    });

  return (
    <div className="flex flex-wrap gap-4">
      <FieldSet>
        <Label htmlFor={`${idPrefix}-id`}>
          <Trans id="deviceClassEditor.structure3DEditor.id">ID</Trans>
        </Label>
        <ValidatedInput
          id={`${idPrefix}-id`}
          value={structure.codexId}
          onConfirm={(newValue) =>
            modifyStructure3D((draft) => {
              draft.codexId = CodexId(newValue);
            })
          }
          validator={(input) => validateNewItemId(input, [])}
        />
      </FieldSet>
      <FieldSet>
        <Label id={`${idPrefix}-access`}>
          <Trans id="deviceClassEditor.structure3DEditor.access">Access</Trans>
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
            <Trans id="deviceClassEditor.structure3DEditor.read">Read</Trans>
          </LabeledCheckbox>
          <LabeledCheckbox
            disabled={structure.lifetime === lifetimes.STATIC}
            checked={structure.access.includes(accesses.WRITE)}
            onChange={(checked) => setAccess(accesses.WRITE, checked)}
          >
            <Trans id="deviceClassEditor.structure3DEditor.write">Write</Trans>
          </LabeledCheckbox>
        </div>
      </FieldSet>
      <FieldSet>
        <Label htmlFor={`${idPrefix}-lifetime`}>
          <Trans id="deviceClassEditor.structure3DEditor.lifetime">
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
            modifyStructure3D((draft) => {
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
