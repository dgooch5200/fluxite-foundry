// A repeated node stands for several copies of itself and everything beneath
// it, as proposed in `docs/rfcs/emitter_location_3d.md`. These
// list a node's copies, and fill in the `${index}` placeholders that references
// beneath a repeated node may hold, for one copy.

import {
  DeviceClassDocument,
  EmitterReference,
  EntityId,
  ParameterReference,
  Structure3DNode,
  Structure3DRepeat,
} from "app/persistentState";
import {
  entityIdAsCodexId,
  toEditorParameterReference,
} from "features/deviceClassEditor/referenceResolution";
import { emitterReferenceByCodexIds } from "features/emittersEditor/state";
import {
  parseParameterReference,
  serializeParameterReference,
} from "utils/utils";

/** Each enclosing repeat's copy number, by the repeat's index name. */
export type CopyIndices = Readonly<Record<string, number>>;

/** One copy of a node. */
export interface NodeCopy {
  // What its ID is followed by, e.g. "[2][5]", or "" when nothing repeats it
  suffix: string;
  indices: CopyIndices;
}

/** The copy of a node that nothing repeats. */
export const ONLY_COPY: NodeCopy = { suffix: "", indices: {} };

// `${name}`. No identifier can hold one, as "$" isn't allowed in identifiers.
const PLACEHOLDER = /\$\{([A-Za-z][A-Za-z0-9_-]*)\}/g;

type Nodes = Partial<Record<EntityId, Structure3DNode>>;
type EmitterTables = Pick<DeviceClassDocument, "emitterGroups" | "emitters">;

/** The index names a string's placeholders use, in order. */
export function placeholderNames(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]!);
}

/** The string with each placeholder the copy has a number for filled in. */
export function fillIndices(text: string, indices: CopyIndices): string {
  return text.replace(PLACEHOLDER, (placeholder, name: string) =>
    name in indices ? String(indices[name]) : placeholder,
  );
}

/**
 * The copy numbers a repeat makes. A count that isn't a whole number of at
 * least 1 makes one copy, so the node stays in view while its issue is shown.
 */
// ponytail: no upper limit; a count in the tens of thousands builds that many
// objects, so cap or instance them if such fixtures turn up.
export function copyNumbers(repeat: Structure3DRepeat): number[] {
  return Number.isInteger(repeat.count) && repeat.count >= 1
    ? [...Array(repeat.count).keys()]
    : [0];
}

/** Copy k of a repeat, within a copy of whatever encloses it. */
export function nextCopy(
  copy: NodeCopy,
  repeat: Structure3DRepeat,
  k: number,
): NodeCopy {
  return {
    suffix: `${copy.suffix}[${k}]`,
    indices: repeat.index
      ? { ...copy.indices, [repeat.index]: k }
      : copy.indices,
  };
}

/** The repeats of the node and its ancestors, outermost first. */
export function enclosingRepeats(
  nodes: Nodes,
  id: EntityId,
): Structure3DRepeat[] {
  const repeats: Structure3DRepeat[] = [];
  // Parents in state can loop; each node is visited once at most.
  const seen = new Set<EntityId>();
  for (
    let current: EntityId | undefined = id;
    current && !seen.has(current);

  ) {
    seen.add(current);
    const node: Structure3DNode | undefined = nodes[current];
    if (node?.repeat) repeats.unshift(node.repeat);
    current = node?.parent;
  }
  return repeats;
}

/** The index names a node's references can use: its own repeat's and its ancestors'. */
export function indexNamesAt(nodes: Nodes, id: EntityId): string[] {
  return enclosingRepeats(nodes, id).flatMap((repeat) =>
    repeat.index ? [repeat.index] : [],
  );
}

/** Every copy of a node, one for each combination of the repeats enclosing it. */
export function nodeCopies(nodes: Nodes, id: EntityId): NodeCopy[] {
  return enclosingRepeats(nodes, id).reduce<NodeCopy[]>(
    (copies, repeat) =>
      copies.flatMap((copy) =>
        copyNumbers(repeat).map((k) => nextCopy(copy, repeat, k)),
      ),
    [ONLY_COPY],
  );
}

/**
 * A parameter reference as it reads in one copy. One with a placeholder is
 * kept by its codexId, so it's filled in and looked up again.
 */
export function parameterForCopy(
  parameters: DeviceClassDocument["parameters"],
  ref: ParameterReference,
  indices: CopyIndices,
): ParameterReference {
  const text = entityIdAsCodexId(ref.id);
  if (parameters[ref.id] || placeholderNames(text).length === 0) {
    return ref;
  }
  const filled = parseParameterReference(
    fillIndices(
      serializeParameterReference({ codexId: text, index: ref.index }),
      indices,
    ),
  );
  return toEditorParameterReference(
    { parameters },
    filled.codexId,
    filled.index,
  );
}

/**
 * An emitter reference as it reads in one copy. A group or emitter with a
 * placeholder is kept by its codexId, so it's filled in and looked up again.
 */
export function emitterForCopy(
  tables: EmitterTables,
  ref: EmitterReference,
  indices: CopyIndices,
): EmitterReference {
  const group =
    tables.emitterGroups[ref.group]?.codexId ?? entityIdAsCodexId(ref.group);
  const emitter =
    ref.emitter &&
    (tables.emitters[ref.emitter]?.codexId ?? entityIdAsCodexId(ref.emitter));
  if (placeholderNames(`${group}/${emitter ?? ""}`).length === 0) {
    return ref;
  }
  return emitterReferenceByCodexIds(
    tables,
    fillIndices(group, indices),
    emitter && fillIndices(emitter, indices),
  );
}
