import { describe, test, expect } from "vitest";
import {
  AnimationClip,
  BoxGeometry,
  BufferGeometry,
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
  EntityId,
  Structure3DControl,
  Structure3DNode,
} from "app/persistentState";
import {
  addMissingNormals,
  buildStructureObject,
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
    ["16", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1]],
    ["12", [1, 0, 0, 0, 1, 0, 0, 0, 1, 4, 5, 6]],
  ])("a %s-value column-major matrix places the node", (_, matrix) => {
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
