import { useId, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { PlusIcon } from "lucide-react";
import { CodexId, EntityId, Structure3D } from "app/persistentState";
import { AccessLifetimeFields } from "components/AccessLifetimeFields";
import { FieldSet } from "components/FieldSet";
import { ValidatedInput } from "components/ValidatedInput";
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
import { Structure3DViewport } from "./Viewport";

export const Structure3DEditor = () => {
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
        <Structure3DViewport
          selectedNodeId={selected}
          onSelectNode={setSelectedNodeId}
        />
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

const StructureEditor = ({ structure }: { structure: Structure3D }) => {
  const idPrefix = useId();

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
      <AccessLifetimeFields
        access={structure.access}
        lifetime={structure.lifetime}
        onChange={(access, lifetime) =>
          modifyStructure3D((draft) => {
            draft.access = access;
            draft.lifetime = lifetime;
          })
        }
      />
    </div>
  );
};
