import {
  AxesHelper,
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

// The structure is Z-up; three.js and glTF are Y-up.
export const STRUCTURE_TO_THREE = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);

// A guess to tune: the spec doesn't say how a model is oriented to its node.
const GLTF_TO_STRUCTURE = STRUCTURE_TO_THREE.clone().invert();

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
  // Column-major, as in glTF; 12 values leave out the 0, 0, 0, 1 bottom row.
  if (m.length === 16) return new Matrix4().fromArray(m);
  if (m.length === 12) {
    // prettier-ignore
    return new Matrix4().set(
      m[0], m[3], m[6], m[9],
      m[1], m[4], m[7], m[10],
      m[2], m[5], m[8], m[11],
      0, 0, 0, 1,
    );
  }
  // TODO: 13 to 15 values fall back to identity until the spec defines them.
  return new Matrix4();
}

interface StructureObjectOptions {
  /** Degrees for rotate controls, meters for linear ones. */
  controlValue?: (control: Structure3DControl) => number;
  /** In glTF's Y-up orientation. */
  model?: (node: Structure3DNode) => Object3D | undefined;
}

/** Still Z-up. Node Groups carry `userData.nodeId`. */
export function buildStructureObject(
  nodes: Partial<Record<EntityId, Structure3DNode>>,
  rootNodes: EntityId[],
  options: StructureObjectOptions = {},
): Group {
  const visited = new Set<EntityId>();

  const build = (nodeId: EntityId, parent: Object3D) => {
    const node = nodes[nodeId];
    if (!node || visited.has(nodeId)) return;
    visited.add(nodeId);

    const nodeGroup = new Group();
    nodeGroup.userData.nodeId = nodeId;
    // A matrix transform may hold shear that position/quaternion/scale can't.
    nodeGroup.matrixAutoUpdate = false;
    nodeGroup.matrix.copy(nodeMatrix(node.transform));
    parent.add(nodeGroup);

    // Position isn't rotated, so linear controls move along the node's axes.
    const controlGroup = new Group();
    controlGroup.rotation.order = "ZYX";
    node.controls.forEach((control) => {
      const value = options.controlValue?.(control) ?? 0;
      if (control.type === "linear")
        controlGroup.position[control.axis] += value;
      if (control.type === "rotate")
        controlGroup.rotation[control.axis] += MathUtils.degToRad(value);
    });
    nodeGroup.add(controlGroup);

    const model = options.model?.(node);
    if (model) {
      const upright = new Group();
      upright.quaternion.copy(GLTF_TO_STRUCTURE);
      upright.add(model);
      controlGroup.add(upright);
    } else {
      controlGroup.add(new AxesHelper(0.15));
    }

    node.children.forEach((childId) => build(childId, controlGroup));
  };

  const root = new Group();
  rootNodes.forEach((id) => build(id, root));
  return root;
}

type GltfScenes = Pick<GLTF, "scene" | "scenes">;

// The spec uses the file's names, which GLTFLoader keeps in userData.name.
// TODO: a scene whose name has spaces or `[].:/` won't match.
const gltfName = (object: Object3D): string =>
  typeof object.userData.name === "string" ? object.userData.name : object.name;

function gltfObjects(gltf: GltfScenes): Object3D[] {
  const objects: Object3D[] = [];
  gltf.scenes.forEach((scene) => scene.traverse((o) => objects.push(o)));
  return objects;
}

export function gltfObjectNames(gltf: GltfScenes): string[] {
  // TODO: this includes mesh primitives the loader names itself.
  return [...new Set(gltfObjects(gltf).map(gltfName))].filter(Boolean);
}

export function gltfObject(
  gltf: GltfScenes,
  name?: string,
): Object3D | undefined {
  if (!name) return gltf.scene;
  return (
    gltf.scenes.find((scene) => gltfName(scene) === name) ??
    gltfObjects(gltf).find((object) => gltfName(object) === name)
  );
}

export function copyGltfObject(
  gltf: GltfScenes,
  name?: string,
): Object3D | undefined {
  const found = gltfObject(gltf, name);
  if (!found) {
    return undefined;
  }
  // Exporters often put a unit conversion (inches to meters) on a root node.
  found.updateWorldMatrix(true, false);
  const scale = found.getWorldScale(new Vector3());

  const copy = found.clone();
  // TODO: the spec doesn't say whether the glTF node's placement applies.
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.copy(scale);
  return copy;
}

/** Takes the loaded objects apart, so they can't be used after. */
// TODO: extensions three doesn't know are dropped, and images are re-encoded.
export async function exportGlb(gltf: GLTF): Promise<ArrayBuffer> {
  // Tracks find nodes by name, which changes below, so they use the uuid.
  for (const track of gltf.animations.flatMap((clip) => clip.tracks)) {
    const { nodeName } = PropertyBinding.parseTrackName(track.name);
    const node = gltf.scenes
      .map((scene) => PropertyBinding.findNode(scene, nodeName))
      .find((found): found is Object3D => found instanceof Object3D);
    if (node && track.name.startsWith(nodeName)) {
      track.name = node.uuid + track.name.slice(nodeName.length);
    }
  }

  for (const object of gltfObjects(gltf)) {
    if (typeof object.userData.name === "string") {
      object.name = object.userData.name;
      delete object.userData.name;
    }
  }

  // The exporter writes a three.js Scene as a glTF scene and makes its first
  // one the default; the loader made each a Group.
  const ordered = gltf.scene
    ? [gltf.scene, ...gltf.scenes.filter((scene) => scene !== gltf.scene)]
    : gltf.scenes;
  const scenes = ordered.map((group) => {
    const scene = new Scene();
    scene.name =
      gltf.parser.json.scenes?.[gltf.scenes.indexOf(group)]?.name ?? group.name;
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

// glTF draws a mesh without normals flat. The loader does that with its own
// material's flatShading, which other materials and ambient occlusion lack.
export function addMissingNormals(object: Object3D) {
  object.traverse((part) => {
    if (!(part instanceof Mesh) || part.geometry.hasAttribute("normal")) return;
    // Unshared vertices, so each face's normal is its own.
    const geometry = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry;
    geometry.computeVertexNormals();
    part.geometry = geometry;
    for (const material of [part.material].flat()) {
      if (material instanceof MeshStandardMaterial)
        material.flatShading = false;
    }
  });
}

const smoothedGeometries = new WeakMap<BufferGeometry, BufferGeometry>();

export function shadeSmooth(object: Object3D) {
  object.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    let smoothed = smoothedGeometries.get(part.geometry);
    if (!smoothed) {
      // TODO: details finer than 0.01 model units may smooth together.
      // toCreasedNormals changes a geometry without an index in place.
      smoothed = toCreasedNormals(part.geometry.clone(), SMOOTH_ANGLE);
      smoothedGeometries.set(part.geometry, smoothed);
    }
    part.geometry = smoothed;
  });
}
