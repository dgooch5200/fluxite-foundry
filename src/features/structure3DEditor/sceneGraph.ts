import {
  BufferGeometry,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PropertyBinding,
  Quaternion,
  Scene,
  Vector3,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTF } from "three-stdlib";
import {
  EntityId,
  Structure3DControl,
  Structure3DNode,
  Structure3DTransform,
} from "app/persistentState";
import { SMOOTH_ANGLE } from "./meshRepair";

// The structure is Z-up and three.js is Y-up. The viewport puts this on the
// object returned by buildStructureObject so the structure stands upright.
export const STRUCTURE_TO_THREE = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);

// glTF is Y-up, so imported model content is turned to stand upright in the
// structure's Z-up frame. The spec doesn't say how a model is oriented relative
// to its node, so this is a guess to tune against real models.
export const GLTF_TO_STRUCTURE = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  Math.PI / 2,
);

/** A node's placement relative to its parent. */
export function nodeMatrix(transform: Structure3DTransform): Matrix4 {
  if (transform.type === "trs") {
    const [x, y, z] = transform.rotate ?? [0, 0, 0];
    return new Matrix4()
      .makeRotationFromEuler(
        new Euler(
          MathUtils.degToRad(x),
          MathUtils.degToRad(y),
          MathUtils.degToRad(z),
          "ZYX",
        ),
      )
      .setPosition(...(transform.translate ?? [0, 0, 0]));
  }
  const m = transform.matrix;
  // Column-major, as in glTF.
  if (m.length === 16) return new Matrix4().fromArray(m);
  // Four columns of xyz with an implied 0, 0, 0, 1 bottom row.
  if (m.length === 12) {
    // prettier-ignore
    return new Matrix4().set(
      m[0], m[3], m[6], m[9],
      m[1], m[4], m[7], m[10],
      m[2], m[5], m[8], m[11],
      0, 0, 0, 1,
    );
  }
  // ponytail: the spec allows 12 to 16 values but only the 12 and 16 layouts
  // are obvious; 13 to 15 fall back to identity until the spec defines them.
  return new Matrix4();
}

export interface StructureObjectOptions {
  /** A control's current value: degrees for rotate, meters for linear. Defaults to 0. */
  controlValue?: (
    nodeId: EntityId,
    controlIndex: number,
    control: Structure3DControl,
  ) => number;
  /** glTF content to show at a node, already in glTF's Y-up orientation. */
  model?: (nodeId: EntityId, node: Structure3DNode) => Object3D | null;
}

/**
 * Builds the structure as three.js objects in the structure's own Z-up frame.
 * Each node becomes a Group with `userData.nodeId` placed by its transform,
 * holding an inner Group moved by its controls. Child nodes and the model hang
 * off the inner Group, so a pan control carries everything beneath it.
 */
export function buildStructureObject(
  nodes: Partial<Record<EntityId, Structure3DNode>>,
  rootNodes: EntityId[],
  options: StructureObjectOptions = {},
): Group {
  const visited = new Set<EntityId>();

  const build = (nodeId: EntityId, parent: Object3D) => {
    const node = nodes[nodeId];
    // Ids in state can dangle or loop; each node is built once at most.
    if (!node || visited.has(nodeId)) return;
    visited.add(nodeId);

    const nodeGroup = new Group();
    nodeGroup.userData.nodeId = nodeId;
    // A matrix transform may hold shear that position/quaternion/scale can't.
    nodeGroup.matrixAutoUpdate = false;
    nodeGroup.matrix.copy(nodeMatrix(node.transform));
    parent.add(nodeGroup);

    // Linear values add up along each axis, and rotate values add up per axis
    // and apply as one Tait-Bryan ZYX rotation, like a node's own `rotate`.
    // Translation comes before rotation, so linear axes are the node's axes
    // and don't turn with its rotate controls.
    const controlGroup = new Group();
    controlGroup.rotation.order = "ZYX";
    node.controls.forEach((control, i) => {
      const value = options.controlValue?.(nodeId, i, control) ?? 0;
      if (control.type === "linear")
        controlGroup.position[control.axis] += value;
      if (control.type === "rotate")
        controlGroup.rotation[control.axis] += MathUtils.degToRad(value);
    });
    nodeGroup.add(controlGroup);

    const model = options.model?.(nodeId, node);
    if (model) {
      const upright = new Group();
      upright.quaternion.copy(GLTF_TO_STRUCTURE);
      upright.add(model);
      controlGroup.add(upright);
    }

    node.children.forEach((childId) => build(childId, controlGroup));
  };

  const root = new Group();
  rootNodes.forEach((id) => build(id, root));
  return root;
}

interface GltfScenes {
  scene: Object3D;
  scenes: Object3D[];
}

// GLTFLoader rewrites names to make them safe for animation bindings (spaces
// become underscores, `[].:/` are dropped, duplicates get a suffix) and keeps a
// node's name from the file in `userData.name`. The spec refers to the file's
// names.
// ponytail: GLTFLoader keeps no original for scene names, so a scene whose name
// has spaces or `[].:/` won't match; read `gltf.parser.json.scenes` if needed.
const gltfName = (object: Object3D): string =>
  typeof object.userData.name === "string" ? object.userData.name : object.name;

/** Scene and node names in a loaded glTF, for picking `nodeOrSceneName`. */
export function gltfObjectNames(gltf: GltfScenes): string[] {
  // ponytail: lists every named object, which includes mesh primitives the
  // loader names itself; filter with `gltf.parser.associations` if that's noisy.
  const names = new Set<string>();
  gltf.scenes.forEach((scene) =>
    scene.traverse((object) => names.add(gltfName(object))),
  );
  names.delete("");
  return [...names];
}

/**
 * The glTF scene or node a structure node shows, as it is in the loaded file.
 * An empty or absent name means the default scene.
 */
export function gltfObject(
  gltf: GltfScenes,
  name?: string,
): Object3D | undefined {
  let found: Object3D | undefined = name
    ? gltf.scenes.find((scene) => gltfName(scene) === name)
    : gltf.scene;
  if (name && !found) {
    gltf.scenes.forEach((scene) =>
      scene.traverse((object) => {
        if (!found && gltfName(object) === name) found = object;
      }),
    );
  }
  return found;
}

/**
 * A copy of the glTF scene or node a structure node shows. An empty or absent
 * name means the default scene.
 */
export function findGltfObject(
  gltf: GltfScenes,
  name?: string,
): Object3D | undefined {
  const found = gltfObject(gltf, name);
  if (!found) {
    return undefined;
  }
  // Its scale in the file, from itself and its ancestors. Exporters often put
  // the unit conversion (e.g. inches to meters) on a root node.
  found.updateWorldMatrix(true, false);
  const scale = found.getWorldScale(new Vector3());

  const copy = found.clone();
  // ponytail: the spec doesn't say whether a node's placement in the glTF
  // applies. The structure node already places the model, so it's dropped and
  // only the scale kept; keep it all if real models turn out to be authored
  // relative to it.
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.copy(scale);
  return copy;
}

/**
 * Writes a loaded glTF file back out as a GLB, under the names it had in the
 * file. This takes the loaded objects apart, so they can't be used after.
 */
// ponytail: three writes what it can read back, so extensions it doesn't know
// are dropped and images are encoded again. Edit the file's JSON and buffers
// directly (e.g. with glTF-Transform) if that loses something that matters.
export async function exportGlb(gltf: GLTF): Promise<ArrayBuffer> {
  // Animation tracks find their node by its name, which is about to go back to
  // the file's own, so they find it by its uuid instead.
  for (const track of gltf.animations.flatMap((clip) => clip.tracks)) {
    const { nodeName } = PropertyBinding.parseTrackName(track.name);
    const node = gltf.scenes
      .map((scene) => PropertyBinding.findNode(scene, nodeName))
      .find((found): found is Object3D => found instanceof Object3D);
    if (node && track.name.startsWith(nodeName)) {
      track.name = node.uuid + track.name.slice(nodeName.length);
    }
  }

  gltf.scenes.forEach((scene) =>
    scene.traverse((object) => {
      if (typeof object.userData.name === "string") {
        object.name = object.userData.name;
        delete object.userData.name;
      }
    }),
  );

  // The exporter writes a three.js Scene as a glTF scene and makes its first
  // one the default; the loader made each a Group.
  const sceneNames = gltf.scenes.map(
    (scene, index): string =>
      gltf.parser.json.scenes?.[index]?.name ?? scene.name,
  );
  const ordered = gltf.scene
    ? [gltf.scene, ...gltf.scenes.filter((scene) => scene !== gltf.scene)]
    : gltf.scenes;
  const scenes = ordered.map((group) => {
    const scene = new Scene();
    scene.name = sceneNames[gltf.scenes.indexOf(group)] ?? group.name;
    scene.userData = group.userData;
    scene.add(...group.children);
    return scene;
  });

  const data = await new GLTFExporter().parseAsync(scenes, {
    binary: true,
    // Hidden parts of the file are still part of it.
    onlyVisible: false,
    animations: gltf.animations,
    includeCustomExtensions: true,
  });
  if (!(data instanceof ArrayBuffer)) {
    throw new Error("GLTFExporter did not produce a GLB");
  }
  return data;
}

/**
 * Gives each mesh that has no normals the flat ones glTF says it is drawn
 * with. The loader only shades such a mesh flat in the material it makes,
 * while other materials and the ambient occlusion pass need the normals.
 */
export function addMissingNormals(object: Object3D) {
  object.traverse((part) => {
    if (!(part instanceof Mesh) || part.geometry.hasAttribute("normal")) return;
    // Each face needs its own vertices for its normal to be its own.
    const geometry = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry;
    geometry.computeVertexNormals();
    part.geometry = geometry;
    // The loader shades such a mesh flat by its material, which with normals
    // it no longer needs, and which would hide smooth shading.
    for (const material of [part.material].flat()) {
      if (material instanceof MeshStandardMaterial)
        material.flatShading = false;
    }
  });
}

// Each geometry of a loaded file, smoothed once and shared by every copy.
const smoothedGeometries = new WeakMap<BufferGeometry, BufferGeometry>();

/**
 * Shades a model's meshes smooth where their faces meet at a shallow angle,
 * keeping sharper edges hard, like Blender's Smooth by Angle. The meshes take
 * smoothed copies of their geometry, leaving the loaded file's alone.
 */
export function shadeSmooth(object: Object3D) {
  object.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    let smoothed = smoothedGeometries.get(part.geometry);
    if (!smoothed) {
      // ponytail: three matches vertices to the nearest centimeter of the
      // model's units, so details finer than that may smooth together.
      // It changes geometry without an index in place, hence the copy.
      smoothed = toCreasedNormals(part.geometry.clone(), SMOOTH_ANGLE);
      smoothedGeometries.set(part.geometry, smoothed);
    }
    part.geometry = smoothed;
  });
}
