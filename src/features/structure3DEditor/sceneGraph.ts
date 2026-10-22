import {
  BufferGeometry,
  Color,
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
  DeviceClassDocument,
  EmitterColorScheme,
  emitterColorSchemes,
  EmitterCommonColor,
  EmitterControlGroup,
  EntityId,
  ParameterReference,
  Structure3DControl,
  Structure3DNode,
  Structure3DTransform,
} from "app/persistentState";
import { SMOOTH_ANGLE } from "./meshRepair";
import { fitToWhite, schemeColor } from "./lightColor";
import {
  copyNumbers,
  CopyIndices,
  NodeCopy,
  nextCopy,
  ONLY_COPY,
} from "./repeats";

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
  // Row-major, "across then down", as E1.73-4 has it. Twelve values leave out
  // the bottom row, which is always 0, 0, 0, 1.
  const cells = m.length === 12 ? [...m, 0, 0, 0, 1] : m;
  if (cells.length === 16) return new Matrix4().fromArray(cells).transpose();
  // ponytail: the spec allows 12 to 16 values but only the 12 and 16 layouts
  // are obvious; 13 to 15 fall back to identity until the spec defines them.
  return new Matrix4();
}

export interface StructureObjectOptions {
  /**
   * A control's current value in one copy of its node: degrees for rotate,
   * meters for linear. Defaults to 0.
   */
  controlValue?: (
    nodeId: EntityId,
    controlIndex: number,
    control: Structure3DControl,
    indices: CopyIndices,
  ) => number;
  /** glTF content to show at a node, already in glTF's Y-up orientation. */
  model?: (nodeId: EntityId, node: Structure3DNode) => Object3D | null;
  /** What to draw for a beam control in one copy of its node, in the node's own Z-up frame. */
  beam?: (control: Structure3DControl, indices: CopyIndices) => Object3D | null;
}

// What each common color looks like on screen. These are rough, for drawing
// only: an emitter's real color is in its spectral data.
const COMMON_COLOR_HEX: Record<EmitterCommonColor, number> = {
  amber: 0xffbf00,
  blue: 0x0000ff,
  "cool-white": 0xe0ecff,
  cyan: 0x00ffff,
  "deep-blue": 0x2000c0,
  "deep-red": 0xb00000,
  green: 0x00ff00,
  indigo: 0x4400ff,
  lime: 0xb0ff00,
  mint: 0x80ffc0,
  orange: 0xff8000,
  red: 0xff0000,
  uv: 0x7a00ff,
  "warm-white": 0xffd8a0,
  white: 0xffffff,
};

type EmitterTables = Pick<
  DeviceClassDocument,
  "emitterGroups" | "emitters" | "emittersStructure"
>;

/** A parameter's live value, if it has one. */
export type ParameterValue = (ref: ParameterReference) => number | undefined;

const fraction = (value: number) => MathUtils.clamp(value, 0, 1);

/**
 * The color of a beam's light, from the emitters it names and the group
 * controls over their groups (E1.73-3 section 8.1):
 *
 * - Each group control's master intensity scales the light.
 * - The most specific group control with a color scheme, the one over the
 *   fewest groups, sets the color: by its crossfade, moving straight between
 *   its points' colors, or else by its first scheme whose parameters all have
 *   values.
 * - Otherwise the emitters' own colors mix, each scaled by its intensity and
 *   relative brightness and added together as light, so red, green and blue at
 *   full make white.
 *
 * A parameter with no value counts as full, and a scheme with one doesn't
 * apply, so the beam shows everything its emitters can make until something
 * drives them. Undefined when it has no color to show.
 */
// ponytail: shows the color a scheme asks for, even one the emitters can't
// make; work it out from their spectral data if that matters.
export function beamColor(
  control: Structure3DControl,
  tables: EmitterTables,
  value: ParameterValue = () => undefined,
): Color | undefined {
  // A group and an emitter in it may both be named; each emitter counts once.
  const emitterIds = new Set(
    (control.emitters ?? []).flatMap((ref) =>
      ref.emitter
        ? [ref.emitter]
        : (tables.emitterGroups[ref.group]?.emitters ?? []),
    ),
  );
  const direct = directMix([...emitterIds], tables, value);

  const groups = new Set((control.emitters ?? []).map((ref) => ref.group));
  const controls = (tables.emittersStructure?.controlGroups ?? []).filter(
    (group) => group.emitterGroups.some((id) => groups.has(id)),
  );
  const master = controls.reduce(
    (level, group) =>
      level *
      (group.masterIntensity ? fraction(value(group.masterIntensity) ?? 1) : 1),
    1,
  );
  const [colorControl] = controls
    .filter(
      (group) => Object.keys(group.colorSchemes).length > 0 || group.crossfade,
    )
    .sort((a, b) => a.emitterGroups.length - b.emitterGroups.length);

  const color =
    (colorControl && groupColor(colorControl, direct, value)) ?? direct;
  return color?.clone().multiplyScalar(master);
}

// The emitters' own colors, each scaled by its intensity and relative
// brightness, added together as light.
function directMix(
  emitterIds: EntityId[],
  tables: EmitterTables,
  value: ParameterValue,
): Color | undefined {
  const colors = emitterIds.flatMap((id) => {
    const emitter = tables.emitters[id];
    if (!emitter?.commonColor) return [];
    const intensity = emitter.directControl && value(emitter.directControl);
    const level = fraction(intensity ?? 1) * (emitter.relativeBrightness ?? 1);
    return [
      new Color(COMMON_COLOR_HEX[emitter.commonColor]).multiplyScalar(level),
    ];
  });
  if (colors.length === 0) return undefined;
  return fitToWhite(
    colors.reduce((total, color) => total.add(color), new Color(0)),
  );
}

// The color a group control sets, or undefined to leave it to the emitters.
function groupColor(
  group: EmitterControlGroup,
  direct: Color | undefined,
  value: ParameterValue,
): Color | undefined {
  const color = (scheme: EmitterColorScheme) => {
    const parameters = group.colorSchemes[scheme];
    return (
      parameters &&
      schemeColor(
        scheme,
        Object.fromEntries(
          Object.entries(parameters).map(([component, ref]) => [
            component,
            value(ref),
          ]),
        ),
      )
    );
  };

  const { crossfade } = group;
  const position = crossfade && value(crossfade.parameter);
  if (crossfade && position !== undefined && crossfade.points.length > 0) {
    const pointColor = (scheme: EmitterColorScheme | "direct") =>
      scheme === "direct" ? direct : (color(scheme) ?? direct);
    const points = [...crossfade.points].sort((a, b) => a.value - b.value);
    const next = points.findIndex((point) => point.value >= position);
    if (next <= 0) {
      return pointColor(points.at(next)!.controlScheme);
    }
    const [from, to] = [points[next - 1]!, points[next]!];
    const [fromColor, toColor] = [
      pointColor(from.controlScheme),
      pointColor(to.controlScheme),
    ];
    if (!fromColor || !toColor) return fromColor ?? toColor;
    // Linear light is a linear map of CIE XYZ, so mixing in it moves straight
    // between the two colors in CIE 1931 xy, as E1.73-3 section 5.4 has it.
    return fromColor
      .clone()
      .lerp(toColor, (position - from.value) / (to.value - from.value));
  }

  for (const scheme of Object.values(emitterColorSchemes)) {
    const schemeLight = color(scheme);
    if (schemeLight) return schemeLight;
  }
  return undefined;
}

// The most a beam color's luminance can be on the light theme. Darker than
// this, a line has 3:1 contrast with the white page behind the view.
const LIGHT_THEME_MAX_LUMINANCE = 0.3;

/**
 * A beam color that shows against the page: on the light theme, a pale color
 * is darkened, keeping its hue, so a white beam doesn't vanish.
 */
export function beamColorForTheme(color: Color, darkMode: boolean): Color {
  if (darkMode) return color;
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return luminance > LIGHT_THEME_MAX_LUMINANCE
    ? color.clone().multiplyScalar(LIGHT_THEME_MAX_LUMINANCE / luminance)
    : color;
}

/**
 * Where a beam control's aperture outline runs, as points in the node's frame.
 * The outline lies across the beam's axis: a rectangle's width runs along the
 * first other axis in x, y, z order and its height along the second. Empty for
 * a beam with no aperture, which leaves from a point.
 */
export function apertureOutline(control: Structure3DControl): Vector3[] {
  const { aperture } = control;
  if (!aperture) return [];

  const [u, v] = (["x", "y", "z"] as const).filter(
    (axis) => axis !== control.axis,
  );
  const point = (a: number, b: number) => {
    const p = new Vector3();
    p[u] = a;
    p[v] = b;
    return p;
  };

  if (aperture.shape === "rectangle") {
    const [w, h] = [aperture.width / 2, aperture.height / 2];
    return [point(-w, -h), point(w, -h), point(w, h), point(-w, h)];
  }
  const r = aperture.diameter / 2;
  const segments = 48;
  return [...Array(segments).keys()].map((i) => {
    const angle = (i / segments) * Math.PI * 2;
    return point(r * Math.cos(angle), r * Math.sin(angle));
  });
}

/**
 * Builds the structure as three.js objects in the structure's own Z-up frame.
 * Each node becomes a Group with `userData.nodeId` placed by its transform,
 * holding an inner Group moved by its controls. Child nodes and the model hang
 * off the inner Group, so a pan control carries everything beneath it. A
 * repeated node becomes one such Group per copy.
 */
export function buildStructureObject(
  nodes: Partial<Record<EntityId, Structure3DNode>>,
  rootNodes: EntityId[],
  options: StructureObjectOptions = {},
): Group {
  const build = (
    nodeId: EntityId,
    parent: Object3D,
    outer: NodeCopy,
    ancestors: ReadonlySet<EntityId>,
  ) => {
    const node = nodes[nodeId];
    // Ids in state can dangle or loop; a node is never built inside itself.
    if (!node || ancestors.has(nodeId)) return;
    const path = new Set(ancestors).add(nodeId);

    // A repeated node is built once per copy, copy k placed by its step
    // applied k times, and its children are built again inside each copy.
    const own = nodeMatrix(node.transform);
    const { repeat } = node;
    const step = repeat && nodeMatrix({ type: "trs", ...repeat.step });
    const stepped = new Matrix4();
    const copies = repeat
      ? copyNumbers(repeat).map((k) => {
          const matrix = stepped.clone().multiply(own);
          stepped.multiply(step!);
          return { copy: nextCopy(outer, repeat, k), matrix };
        })
      : [{ copy: outer, matrix: own }];

    for (const { copy, matrix } of copies) {
      const nodeGroup = new Group();
      nodeGroup.userData.nodeId = nodeId;
      // A matrix transform may hold shear that position/quaternion/scale
      // can't.
      nodeGroup.matrixAutoUpdate = false;
      nodeGroup.matrix.copy(matrix);
      parent.add(nodeGroup);

      // Linear values add up along each axis, and rotate values add up per
      // axis and apply as one Tait-Bryan ZYX rotation, like a node's own
      // `rotate`. Translation comes before rotation, so linear axes are the
      // node's axes and don't turn with its rotate controls.
      const controlGroup = new Group();
      controlGroup.rotation.order = "ZYX";
      node.controls.forEach((control, i) => {
        const value =
          options.controlValue?.(nodeId, i, control, copy.indices) ?? 0;
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

      node.controls.forEach((control) => {
        const beam =
          control.type === "beam" && options.beam?.(control, copy.indices);
        if (beam) controlGroup.add(beam);
      });

      node.children.forEach((childId) =>
        build(childId, controlGroup, copy, path),
      );
    }
  };

  const root = new Group();
  rootNodes.forEach((id) => build(id, root, ONLY_COPY, new Set()));
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
 * name means the default scene. Parts below it named in `drawnElsewhere` are
 * left out: E1.73-4 has a node that draws a part of a model not draw the parts
 * beneath it that other nodes draw, so a Head leaves out its Lens.
 */
export function findGltfObject(
  gltf: GltfScenes,
  name?: string,
  drawnElsewhere: ReadonlySet<string> = new Set(),
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
  const leftOut: Object3D[] = [];
  copy.traverse((part) => {
    if (part !== copy && drawnElsewhere.has(gltfName(part))) leftOut.push(part);
  });
  leftOut.forEach((part) => part.removeFromParent());
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
