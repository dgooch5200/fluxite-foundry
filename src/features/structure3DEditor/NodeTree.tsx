import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { BoxIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { EntityId, Structure3DNode } from "app/persistentState";
import { LabeledIconButton } from "components/LabeledIconButton";
import { Button } from "components/scn-ui/Button";
import { Toggle } from "components/scn-ui/Toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "components/scn-ui/Tooltip";
import { useSidebarLayout } from "components/SidebarLayout";
import {
  addStructure3DNode,
  deleteStructure3DNode,
  useStructure3D,
  useStructure3DNodes,
} from "./state";
import { Structure3DIssue } from "./validation";

const LABELS = {
  addRoot: msg({
    id: "deviceClassEditor.structure3DEditor.tree.addRootNode",
    message: "Add Root Node",
  }),
  addChild: msg({
    id: "deviceClassEditor.structure3DEditor.tree.addChildNode",
    message: "Add Child Node",
  }),
  delete: msg({
    id: "deviceClassEditor.structure3DEditor.tree.deleteNode",
    message: "Delete Node",
  }),
};

interface NodeTreeProps {
  selectedNodeId?: EntityId;
  issues: Record<EntityId, Structure3DIssue[]>;
  onSelect: (nodeId?: EntityId) => void;
}

export const NodeTree = ({
  selectedNodeId,
  issues,
  onSelect,
}: NodeTreeProps) => {
  const { _ } = useLingui();
  const structure = useStructure3D();
  const nodes = useStructure3DNodes();
  const { close } = useSidebarLayout();

  const select = (nodeId?: EntityId) => {
    close();
    onSelect(nodeId);
  };

  const branch: BranchProps = {
    ids: structure?.rootNodes ?? [],
    nodes,
    issues,
    selectedNodeId,
    onSelect: select,
    onAddChild: (parent) => select(addStructure3DNode(parent)),
    onDelete: (nodeId) => {
      const parent = nodes[nodeId]?.parent;
      deleteStructure3DNode(nodeId);
      onSelect(parent);
    },
  };

  return (
    <div className="flex flex-col max-h-full min-w-2xs max-w-xs border rounded-lg py-5 px-4 gap-2">
      <div className="flex flex-col min-h-0 gap-1 overflow-auto">
        <Toggle
          className="justify-start"
          pressed={selectedNodeId === undefined}
          onClick={() => select(undefined)}
        >
          <BoxIcon />
          <Trans id="deviceClassEditor.structure3DEditor.tree.structure">
            Structure
          </Trans>
        </Toggle>
        <Branch {...branch} />
      </div>
      <Button onClick={() => select(addStructure3DNode())}>
        <PlusIcon className="size-4" />
        {_(LABELS.addRoot)}
      </Button>
    </div>
  );
};

interface BranchProps {
  ids: EntityId[];
  nodes: Record<EntityId, Structure3DNode>;
  issues: Record<EntityId, Structure3DIssue[]>;
  selectedNodeId?: EntityId;
  onSelect: (nodeId: EntityId) => void;
  onAddChild: (parent: EntityId) => void;
  onDelete: (nodeId: EntityId) => void;
}

const Branch = ({ ids, ...props }: BranchProps) => {
  const { _ } = useLingui();
  const { nodes, issues, selectedNodeId, onSelect, onAddChild, onDelete } =
    props;

  if (ids.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1 pl-4">
      {ids.map((id) => {
        const node = nodes[id];
        if (!node) {
          return null;
        }
        const selected = id === selectedNodeId;

        return (
          <li key={id} className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <Toggle
                className="flex-1 min-w-0 justify-start"
                pressed={selected}
                onClick={() => onSelect(id)}
              >
                <span className="truncate" title={node.codexId}>
                  {node.codexId}
                </span>
              </Toggle>
              <IssuesIcon issues={issues[id] ?? []} />
              {selected && (
                <>
                  <LabeledIconButton
                    label={_(LABELS.addChild)}
                    onClick={() => onAddChild(id)}
                  >
                    <PlusIcon className="size-4" />
                  </LabeledIconButton>
                  <LabeledIconButton
                    label={_(LABELS.delete)}
                    onClick={() => onDelete(id)}
                  >
                    <Trash2Icon className="size-4" />
                  </LabeledIconButton>
                </>
              )}
            </div>
            <Branch {...props} ids={node.children} />
          </li>
        );
      })}
    </ul>
  );
};

const IssuesIcon = ({ issues }: { issues: Structure3DIssue[] }) => {
  const { _ } = useLingui();

  if (issues.length === 0) {
    return null;
  }

  const messages = issues.map((issue) => _(issue.message));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TriangleAlertIcon
          role="img"
          aria-label={messages.join(" ")}
          className="size-5 text-orange-500 shrink-0"
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {messages.map((message, index) => (
          <p key={index}>{message}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
};
