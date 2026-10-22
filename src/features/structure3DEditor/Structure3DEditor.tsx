import { ReactNode, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { PlusIcon } from "lucide-react";
import { EntityId } from "app/persistentState";
import { Button } from "components/scn-ui/Button";
import {
  SidebarLayout,
  SidebarLayoutMain,
  SidebarLayoutSidebar,
} from "components/SidebarLayout";
import { StructureFields } from "features/deviceClassEditor/StructureFields";
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
            <StructureFields structure={structure} modify={modifyStructure3D} />
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
