import { describe, test, expect } from "vitest";
import {
  AnimationClip,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  QuaternionKeyframeTrack,
  Scene,
  Vector3,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three-stdlib";
import {
  CodexId,
  DeviceClassDocument,
  EmitterControlGroup,
  EntityId,
  Structure3DControl,
  Structure3DNode,
} from "app/persistentState";
import {
  addMissingNormals,
  apertureOutline,
  beamColor,
  beamColorForTheme,
  buildStructureObject,
  ParameterValue,
  exportGlb,
  shadeSmooth,
  findGltfObject,
  gltfObjectNames,
} from "./sceneGraph";

function makeNode(fields: Partial<Structure3DNode> = {}): Structure3DNode {
  return {
    codexId: CodexId("node"),
    children: [],
    transform: { type: "trs" },
    controls: [],
    localized: {},
    ...fields,
  };
}

function control(
  type: Structure3DControl["type"],
  axis: Structure3DControl["axis"],
): Structure3DControl {
  return {
    type,
    axis,
    target: { type: "parameter", parameter: { id: EntityId("param") } },
  };
}

function nodeObject(root: Object3D, nodeId: string): Object3D {
  let found: Object3D | undefined;
  root.traverse((o) => {
    if (o.userData.nodeId === nodeId) found = o;
  });
  if (!found) throw new Error(`no object for node ${nodeId}`);
  return found;
}

function worldPosition(root: Object3D, nodeId: string): Vector3 {
  root.updateMatrixWorld();
  return nodeObject(root, nodeId).getWorldPosition(new Vector3());
}

function expectVector(actual: Vector3, expected: [number, number, number]) {
  actual.toArray().forEach((v, i) => expect(v).toBeCloseTo(expected[i]));
}

describe("buildStructureObject", () => {
  test("a rotate control turns everything below its node", () => {
    const root = buildStructureObject(
      {
        [EntityId("pan")]: makeNode({
          children: [EntityId("head")],
          controls: [control("rotate", "z")],
        }),
        [EntityId("head")]: makeNode({
          transform: { type: "trs", translate: [0, 1, 0] },
        }),
      },
      [EntityId("pan")],
      { controlValue: () => 90 },
    );

    expectVector(worldPosition(root, "head"), [-1, 0, 0]);
  });

  test("a linear control moves the node's model along its axis", () => {
    const model = new Object3D();
    const root = buildStructureObject(
      {
        [EntityId("slide")]: makeNode({
          controls: [control("beam", "x"), control("linear", "y")],
        }),
      },
      [EntityId("slide")],
      {
        controlValue: (_id, index) => (index === 1 ? 0.5 : 7),
        model: () => model,
      },
    );

    root.updateMatrixWorld();
    expectVector(model.getWorldPosition(new Vector3()), [0, 0.5, 0]);
  });

  test("translate and ZYX rotate place the node", () => {
    const root = buildStructureObject(
      {
        [EntityId("a")]: makeNode({
          transform: { type: "trs", translate: [1, 2, 3], rotate: [90, 0, 90] },
        }),
      },
      [EntityId("a")],
    );
    root.updateMatrixWorld();

    // Rz(90) * Rx(90), then the translation.
    // prettier-ignore
    const expected = new Matrix4().set(
      0, 0, 1, 1,
      1, 0, 0, 2,
      0, 1, 0, 3,
      0, 0, 0, 1,
    );
    nodeObject(root, "a").matrixWorld.elements.forEach((v, i) =>
      expect(v).toBeCloseTo(expected.elements[i]),
    );
  });

  test.each([
    // prettier-ignore
    ["16", [
      1, 0, 0, 4,
      0, 1, 0, 5,
      0, 0, 1, 6,
      0, 0, 0, 1,
    ]],
    // prettier-ignore
    ["12", [
      1, 0, 0, 4,
      0, 1, 0, 5,
      0, 0, 1, 6,
    ]],
  ])("a %s-value row-major matrix places the node", (_, matrix) => {
    const root = buildStructureObject(
      { [EntityId("a")]: makeNode({ transform: { type: "matrix", matrix } }) },
      [EntityId("a")],
    );

    expectVector(worldPosition(root, "a"), [4, 5, 6]);
  });

  test("dangling and cyclic child ids are skipped", () => {
    const root = buildStructureObject(
      {
        [EntityId("a")]: makeNode({
          children: [EntityId("missing"), EntityId("b")],
        }),
        [EntityId("b")]: makeNode({ children: [EntityId("a")] }),
      },
      [EntityId("a"), EntityId("gone")],
    );

    const ids: unknown[] = [];
    root.traverse((o) => {
      if (o.userData.nodeId) ids.push(o.userData.nodeId);
    });
    expect(ids).toEqual(["a", "b"]);
  });

  test("a repeated node is built once per copy, each a step further on", () => {
    const root = buildStructureObject(
      {
        [EntityId("px")]: makeNode({
          transform: { type: "trs", translate: [-0.59, 0, 0] },
          repeat: { count: 60, step: { translate: [0.02, 0, 0] }, index: "i" },
        }),
      },
      [EntityId("px")],
    );
    root.updateMatrixWorld();

    const copies: Object3D[] = [];
    root.traverse((o) => {
      if (o.userData.nodeId === "px") copies.push(o);
    });
    expect(copies).toHaveLength(60);
    expectVector(copies[0].getWorldPosition(new Vector3()), [-0.59, 0, 0]);
    expectVector(copies[59].getWorldPosition(new Vector3()), [0.59, 0, 0]);
  });

  test("a rotate step makes a ring, with children in every copy", () => {
    const leds: Object3D[] = [];
    const indices: unknown[] = [];
    const root = buildStructureObject(
      {
        [EntityId("aura")]: makeNode({
          transform: { type: "trs", translate: [1, 0, 0] },
          repeat: { count: 4, step: { rotate: [0, 0, 90] }, index: "n" },
          children: [EntityId("led")],
        }),
        [EntityId("led")]: makeNode({
          parent: EntityId("aura"),
          controls: [control("beam", "z")],
        }),
      },
      [EntityId("aura")],
      {
        beam: (_control, copy) => {
          indices.push(copy);
          const led = new Object3D();
          leds.push(led);
          return led;
        },
      },
    );
    root.updateMatrixWorld();

    expect(indices).toEqual([{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }]);
    expectVector(leds[0].getWorldPosition(new Vector3()), [1, 0, 0]);
    expectVector(leds[1].getWorldPosition(new Vector3()), [0, 1, 0]);
    expectVector(leds[2].getWorldPosition(new Vector3()), [-1, 0, 0]);
  });

  test("a beam is drawn at its node and turns with the node's controls", () => {
    const marker = new Object3D();
    const root = buildStructureObject(
      {
        [EntityId("head")]: makeNode({
          transform: { type: "trs", translate: [0, 0, 1] },
          controls: [control("rotate", "z"), control("beam", "x")],
        }),
      },
      [EntityId("head")],
      {
        controlValue: (_id, index) => (index === 0 ? 90 : 0),
        beam: (beam) => (beam.axis === "x" ? marker : null),
      },
    );

    root.updateMatrixWorld();
    expectVector(marker.getWorldPosition(new Vector3()), [0, 0, 1]);
    // The beam leaves along +x, which the 90° pan turns to +y.
    expectVector(
      new Vector3(1, 0, 0).transformDirection(marker.matrixWorld),
      [0, 1, 0],
    );
  });
});

describe("beamColor", () => {
  const [CELL, OTHER] = [EntityId("cell"), EntityId("other")];
  const [RED, GREEN, BLUE, WHITE, PLAIN, DIM] = [
    "red",
    "green",
    "blue",
    "white",
    "plain",
    "dim",
  ].map(EntityId);
  const level = (id: string) => ({ id: EntityId(id) });
  const tables: Pick<
    DeviceClassDocument,
    "emitterGroups" | "emitters" | "emittersStructure"
  > = {
    emitterGroups: {
      [CELL]: { codexId: CodexId("cell"), emitters: [RED, GREEN, BLUE] },
      [OTHER]: { codexId: CodexId("other"), emitters: [] },
    },
    emitters: {
      [RED]: {
        codexId: CodexId("red"),
        group: CELL,
        commonColor: "red",
        directControl: level("red-level"),
      },
      [GREEN]: {
        codexId: CodexId("green"),
        group: CELL,
        commonColor: "green",
        directControl: level("green-level"),
      },
      [BLUE]: {
        codexId: CodexId("blue"),
        group: CELL,
        commonColor: "blue",
        directControl: level("blue-level"),
      },
      [WHITE]: { codexId: CodexId("white"), group: CELL, commonColor: "white" },
      [PLAIN]: { codexId: CodexId("plain"), group: CELL },
      [DIM]: {
        codexId: CodexId("dim"),
        group: CELL,
        commonColor: "red",
        relativeBrightness: 0.5,
      },
    },
  };
  // Parameter values by parameter ID, for the parameters that have one.
  const values =
    (byId: Record<string, number>): ParameterValue =>
    (ref) =>
      byId[ref.id];
  const withControls = (...controlGroups: EmitterControlGroup[]) => ({
    ...tables,
    emittersStructure: {
      codexId: CodexId("emitters"),
      access: [],
      lifetime: "static" as const,
      emitterGroups: [CELL, OTHER],
      controlGroups,
    },
  });
  const rgb = (prefix: string) => ({
    red: level(`${prefix}-r`),
    green: level(`${prefix}-g`),
    blue: level(`${prefix}-b`),
  });
  const placedAt = (
    ...emitters: { group: EntityId; emitter?: EntityId }[]
  ): Structure3DControl => ({
    type: "beam",
    axis: "z",
    target: { type: "controlGroups", controlGroups: [] },
    emitters,
  });

  test("adds a group's colors together as light", () => {
    const color = beamColor(placedAt({ group: CELL }), tables);

    expect(color?.toArray()).toEqual([1, 1, 1]);
  });

  test("scales colors that add up past white back down", () => {
    const color = beamColor(
      placedAt({ group: CELL }, { group: CELL, emitter: WHITE }),
      tables,
    );

    expect(color?.toArray()).toEqual([1, 1, 1]);
  });

  test("counts an emitter named twice once", () => {
    const color = beamColor(
      placedAt(
        { group: CELL, emitter: RED },
        { group: CELL, emitter: RED },
        { group: CELL, emitter: GREEN },
      ),
      tables,
    );

    expect(color?.toArray()).toEqual([1, 1, 0]);
  });

  test("scales each emitter by its intensity", () => {
    const color = beamColor(
      placedAt({ group: CELL }),
      tables,
      values({ "red-level": 1, "green-level": 0.5, "blue-level": 0 }),
    );

    expect(color?.toArray()).toEqual([1, 0.5, 0]);
  });

  test("counts an intensity it doesn't know as full, and one past 1 as 1", () => {
    const color = beamColor(
      placedAt({ group: CELL }),
      tables,
      values({ "green-level": 2 }),
    );

    expect(color?.toArray()).toEqual([1, 1, 1]);
  });

  test("is black with every emitter at zero", () => {
    const color = beamColor(
      placedAt({ group: CELL }),
      tables,
      values({ "red-level": 0, "green-level": 0, "blue-level": 0 }),
    );

    expect(color?.toArray()).toEqual([0, 0, 0]);
  });

  test("scales an emitter by its relative brightness", () => {
    const color = beamColor(placedAt({ group: CELL, emitter: DIM }), tables);

    expect(color?.toArray()).toEqual([0.5, 0, 0]);
  });

  test("is undefined without emitters that have a common color", () => {
    expect(
      beamColor(placedAt({ group: CELL, emitter: PLAIN }), tables),
    ).toBeUndefined();
    expect(beamColor(control("beam", "z"), tables)).toBeUndefined();
  });

  describe("with group controls", () => {
    test("scales the light by their master intensity", () => {
      const color = beamColor(
        placedAt({ group: CELL }),
        withControls({
          codexId: CodexId("all"),
          emitterGroups: [CELL],
          masterIntensity: level("dimmer"),
          colorSchemes: {},
        }),
        values({ dimmer: 0.5 }),
      );

      expect(color?.toArray()).toEqual([0.5, 0.5, 0.5]);
    });

    test("takes the color of a scheme whose parameters have values", () => {
      const tablesWithRgb = withControls({
        codexId: CodexId("all"),
        emitterGroups: [CELL],
        colorSchemes: { rgb: rgb("all") },
      });

      const red = beamColor(
        placedAt({ group: CELL }),
        tablesWithRgb,
        values({ "all-r": 1, "all-g": 0, "all-b": 0 }),
      );
      const untouched = beamColor(placedAt({ group: CELL }), tablesWithRgb);

      expect(red?.toArray()).toEqual([1, 0, 0]);
      expect(untouched?.toArray()).toEqual([1, 1, 1]);
    });

    test("crossfades between a scheme and the emitters' own colors", () => {
      const tablesWithFade = withControls({
        codexId: CodexId("all"),
        emitterGroups: [CELL],
        colorSchemes: { rgb: rgb("all") },
        crossfade: {
          parameter: level("fade"),
          points: [
            { value: 0, controlScheme: "rgb" },
            { value: 1, controlScheme: "direct" },
          ],
        },
      });
      const at = (fade: number) =>
        beamColor(
          placedAt({ group: CELL }),
          tablesWithFade,
          values({ "all-r": 1, "all-g": 0, "all-b": 0, fade }),
        )?.toArray();

      expect(at(0)).toEqual([1, 0, 0]);
      expect(at(0.5)).toEqual([1, 0.5, 0.5]);
      expect(at(2)).toEqual([1, 1, 1]);
    });

    test("takes the color from the control over the fewest groups", () => {
      const color = beamColor(
        placedAt({ group: CELL }),
        withControls(
          {
            codexId: CodexId("all"),
            emitterGroups: [CELL, OTHER],
            colorSchemes: { rgb: rgb("all") },
          },
          {
            codexId: CodexId("cell"),
            emitterGroups: [CELL],
            colorSchemes: { rgb: rgb("cell") },
          },
        ),
        values({
          "all-r": 0,
          "all-g": 0,
          "all-b": 1,
          "cell-r": 1,
          "cell-g": 0,
          "cell-b": 0,
        }),
      );

      expect(color?.toArray()).toEqual([1, 0, 0]);
    });
  });
});

describe("beamColorForTheme", () => {
  const luminance = ({ r, g, b }: Color) =>
    0.2126 * r + 0.7152 * g + 0.0722 * b;

  test("darkens a pale color on the light theme, keeping its hue", () => {
    const white = beamColorForTheme(new Color(1, 1, 1), false);

    expect(luminance(white)).toBeCloseTo(0.3);
    expect(white.r).toBe(white.g);
    expect(white.g).toBe(white.b);
  });

  test("leaves dark colors, and every color on the dark theme, alone", () => {
    const deepRed = new Color(0xb00000);

    expect(beamColorForTheme(deepRed, false)).toBe(deepRed);
    expect(beamColorForTheme(new Color(1, 1, 1), true).toArray()).toEqual([
      1, 1, 1,
    ]);
  });
});

describe("apertureOutline", () => {
  const beam = (
    axis: Structure3DControl["axis"],
    aperture?: Structure3DControl["aperture"],
  ): Structure3DControl => ({ ...control("beam", axis), aperture });

  test("is empty for a beam that leaves from a point", () => {
    expect(apertureOutline(beam("z"))).toEqual([]);
  });

  test("lays a rectangle's width and height along the other axes in order", () => {
    const outline = apertureOutline(
      beam("y", { shape: "rectangle", width: 0.4, height: 0.2 }),
    );

    expect(outline.map((p) => p.toArray())).toEqual([
      [-0.2, 0, -0.1],
      [0.2, 0, -0.1],
      [0.2, 0, 0.1],
      [-0.2, 0, 0.1],
    ]);
  });

  test("lays a circle across the beam's axis", () => {
    const outline = apertureOutline(
      beam("x", { shape: "circle", diameter: 0.5 }),
    );

    expect(outline.length).toBeGreaterThan(8);
    for (const point of outline) {
      expect(point.x).toBe(0);
      expect(point.length()).toBeCloseTo(0.25);
    }
  });
});

function named(name: string, ...children: Object3D[]): Group {
  const group = new Group();
  group.name = name;
  if (children.length) group.add(...children);
  return group;
}

function makeGltf() {
  const base = named("Base", named("Head"));
  base.position.set(1, 2, 3);
  base.rotation.set(0.5, 0, 0);
  base.scale.setScalar(2);
  // GLTFLoader sanitizes names and keeps the original in userData.
  const arm = named("Pan_Arm");
  arm.userData.name = "Pan Arm";
  const main = named("Scene", base, arm);
  const alt = named("Alt", named("Base"), new Object3D());
  return { scene: main, scenes: [main, alt] };
}

describe("findGltfObject", () => {
  test("finds a scene by name", () => {
    const gltf = makeGltf();
    const found = findGltfObject(gltf, "Alt");
    expect(found?.name).toBe("Alt");
    expect(found).not.toBe(gltf.scenes[1]);
  });

  test("finds a node by name, copied without its placement", () => {
    const found = findGltfObject(makeGltf(), "Base");
    expect(found?.children.map((c) => c.name)).toEqual(["Head"]);
    expect(found?.position.toArray()).toEqual([0, 0, 0]);
    expect(found?.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });

  test("keeps the scale a node has in the file, including its ancestors'", () => {
    expect(findGltfObject(makeGltf(), "Base")?.scale.toArray()).toEqual([
      2, 2, 2,
    ]);
    expect(findGltfObject(makeGltf(), "Head")?.scale.toArray()).toEqual([
      2, 2, 2,
    ]);
  });

  test("finds a node by its name in the file", () => {
    expect(findGltfObject(makeGltf(), "Pan Arm")?.name).toBe("Pan_Arm");
  });

  test.each([undefined, ""])("name %j gives the default scene", (name) => {
    expect(findGltfObject(makeGltf(), name)?.name).toBe("Scene");
  });

  test("leaves out the parts below it that other nodes draw", () => {
    const gltf = makeGltf();

    const found = findGltfObject(gltf, "Base", new Set(["Base", "Head"]));

    expect(found?.name).toBe("Base");
    expect(found?.getObjectByName("Head")).toBeUndefined();
    // The loaded file keeps them.
    expect(gltf.scene.getObjectByName("Head")).toBeDefined();
  });

  test("an unknown name finds nothing", () => {
    expect(findGltfObject(makeGltf(), "Nope")).toBeUndefined();
  });
});

describe("gltfObjectNames", () => {
  test("lists scene and node names once each, in document order", () => {
    expect(gltfObjectNames(makeGltf())).toEqual([
      "Scene",
      "Base",
      "Head",
      "Pan Arm",
      "Alt",
    ]);
  });
});

describe("addMissingNormals", () => {
  test("gives a mesh without normals flat ones, one per face", () => {
    // Two faces folded along a shared edge: one in the XY plane, one in YZ.
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const folded = new Mesh(
      geometry,
      new MeshStandardMaterial({ flatShading: true }),
    );
    const withNormals = new Mesh(new BufferGeometry());
    withNormals.geometry.setAttribute(
      "normal",
      new Float32BufferAttribute([0, 0, 1], 3),
    );
    const normalsBefore = withNormals.geometry;

    addMissingNormals(new Group().add(folded, withNormals));

    const normals = folded.geometry.getAttribute("normal");
    const normal = (i: number) => [
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i),
    ];
    // Shared vertices would have averaged the two faces' normals.
    expect([0, 1, 2].map(normal)).toEqual([
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ]);
    expect([3, 4, 5].map(normal)).toEqual([
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);
    expect(withNormals.geometry).toBe(normalsBefore);
    // Its normals are flat already, and smoothing them must be able to show.
    expect(folded.material.flatShading).toBe(false);
  });
});

describe("shadeSmooth", () => {
  // Two triangles meeting along the edge from (0, 0, 0) to (0, 1, 0), the
  // second turned up out of the first's plane by the given angle.
  function foldedMesh(degrees: number) {
    const angle = (degrees * Math.PI) / 180;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        [
          ...[0, 0, 0, 1, 0, 0, 0, 1, 0],
          ...[0, 0, 0, 0, 1, 0, -Math.cos(angle), 0, Math.sin(angle)],
        ],
        3,
      ),
    );
    geometry.computeVertexNormals();
    return new Mesh(geometry);
  }
  // The normal at a vertex of the shared edge, as each triangle has it.
  const edgeNormals = (mesh: Mesh) => {
    const normals = mesh.geometry.getAttribute("normal");
    return [0, 3].map((i) =>
      [normals.getX(i), normals.getY(i), normals.getZ(i)].map((n) =>
        Number(n.toFixed(3)),
      ),
    );
  };

  test("blends faces meeting at a shallow angle, and keeps sharp edges", () => {
    const shallow = foldedMesh(10);
    const sharp = foldedMesh(90);
    const sharpBefore = edgeNormals(sharp);

    shadeSmooth(new Group().add(shallow, sharp));

    const [first, second] = edgeNormals(shallow);
    expect(first).toEqual(second);
    expect(edgeNormals(sharp)).toEqual(sharpBefore);
  });

  test("leaves the original geometry alone and smooths it only once", () => {
    const mesh = foldedMesh(10);
    const original = mesh.geometry;
    const flatBefore = edgeNormals(mesh);
    const copy = mesh.clone();

    shadeSmooth(mesh);
    shadeSmooth(copy);

    expect(edgeNormals(new Mesh(original))).toEqual(flatBefore);
    expect(copy.geometry).toBe(mesh.geometry);
  });
});

describe("exportGlb", () => {
  test("writes the file back with its names and animations", async () => {
    // The loader renames "Moving Head" to "Moving_Head" and points the
    // animation at that name.
    const head = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    head.name = "Moving Head";
    const scene = new Scene();
    scene.name = "Main Scene";
    scene.add(head);
    const spin = new AnimationClip("Spin", 1, [
      new QuaternionKeyframeTrack(
        `${head.uuid}.quaternion`,
        [0, 1],
        [0, 0, 0, 1, 0, 1, 0, 0],
      ),
    ]);
    const file = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      animations: [spin],
    });
    const loaded = await new GLTFLoader().parseAsync(file as ArrayBuffer, "");

    const exported = await new GLTFLoader().parseAsync(
      await exportGlb(loaded),
      "",
    );

    expect(gltfObjectNames(exported)).toContain("Moving Head");
    // The loader keeps no original for a scene's name, so it's read from the
    // file.
    expect(exported.parser.json.scenes[0].name).toBe("Main Scene");
    expect(exported.animations).toHaveLength(1);
    expect(exported.animations[0].tracks).toHaveLength(1);
  });
});
