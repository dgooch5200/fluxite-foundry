import { describe, test, expect } from "vitest";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import { repairMesh, repairNormals } from "./meshRepair";

function makeGeometry(positions: number[][], index?: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(positions.flat(), 3),
  );
  if (index) geometry.setIndex(index);
  return geometry;
}

const vertex = (geometry: BufferGeometry, i: number) =>
  geometry.index ? geometry.index.getX(i) : i;

const point = (geometry: BufferGeometry, name: string, i: number) =>
  new Vector3().fromBufferAttribute(geometry.getAttribute(name), i);

/** Each triangle as the positions of its corners in order, e.g. "0,0,0 1,0,0 0,1,0". */
function triangles(geometry: BufferGeometry): string[] {
  const count =
    geometry.index?.count ?? geometry.getAttribute("position").count;
  const result: string[] = [];
  for (let i = 0; i < count; i += 3) {
    result.push(
      [i, i + 1, i + 2]
        .map((c) => point(geometry, "position", vertex(geometry, c)).toArray())
        .join(" "),
    );
  }
  return result;
}

/** Runs a repair on a mesh of the geometry and checks it changed nothing. */
function expectUntouched(
  geometry: BufferGeometry,
  repair: (object: Object3D) => object,
) {
  const mesh = new Mesh(geometry);
  const parts = () => [geometry.index, ...Object.values(geometry.attributes)];
  const before = parts();
  const contents = before.map((part) => Array.from(part?.array ?? []));

  for (const count of Object.values(repair(mesh))) expect(count).toBe(0);
  expect(mesh.geometry).toBe(geometry);
  parts().forEach((part, i) => {
    expect(part).toBe(before[i]);
    expect(Array.from(part?.array ?? [])).toEqual(contents[i]);
  });
}

describe("repairMesh", () => {
  test("welds duplicate vertices and removes broken and repeated triangles", () => {
    const geometry = makeGeometry(
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 0, 0], // the same as vertex 1 in every way
        [1, 1, 0],
        [1, 0, 0], // at vertex 1's position, but across a UV seam
        [2, 0, 0],
      ],
      [
        ...[0, 1, 2],
        ...[3, 4, 2],
        ...[0, 1, 3], // two corners in one place
        ...[1, 2, 0], // the first triangle again
        ...[0, 2, 1], // the first triangle's back face
        ...[5, 6, 4],
        ...[0, 1, 6], // corners along a line
      ],
    );
    geometry.setAttribute(
      "uv",
      new Float32BufferAttribute(
        [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0.5, 0, 1, 0],
        2,
      ),
    );
    const mesh = new Mesh(geometry);

    expect(repairMesh(mesh)).toEqual({
      fixedFolds: 0,
      mergedVertices: 1,
      removedFaces: 3,
    });
    // The vertex across the UV seam is kept apart from the one it shares a
    // position with.
    expect(mesh.geometry.getAttribute("position").count).toBe(6);
    expect(triangles(mesh.geometry).sort()).toEqual(
      [
        "0,0,0 1,0,0 0,1,0",
        "1,0,0 1,1,0 0,1,0",
        "0,0,0 0,1,0 1,0,0",
        "1,0,0 2,0,0 1,1,0",
      ].sort(),
    );
  });

  test("leaves a clean geometry alone", () => {
    expectUntouched(new BoxGeometry(), repairMesh);
  });

  test("repairs a geometry shared by two meshes once, for both", () => {
    // A quad as two triangles that each have their own copy of the diagonal.
    const geometry = makeGeometry([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]);
    const group = new Group();
    const meshes = [new Mesh(geometry), new Mesh(geometry)];
    group.add(...meshes);

    expect(repairMesh(group)).toEqual({
      fixedFolds: 0,
      mergedVertices: 2,
      removedFaces: 0,
    });
    expect(meshes[0].geometry).not.toBe(geometry);
    expect(meshes[1].geometry).toBe(meshes[0].geometry);
  });

  /**
   * Six triangles around a centre in the plane z = 0, wound to face up. The
   * centre has been pushed just past corner 0, out across the side from there
   * to corner 1, which folds that side's triangle back over the others.
   */
  function pleat(missing?: number) {
    const corners = Array.from({ length: 6 }, (_, k) => [
      Math.cos((k * Math.PI) / 3),
      Math.sin((k * Math.PI) / 3),
      0,
    ]);
    const index = [0, 1, 2, 3, 4, 5]
      .filter((k) => k !== missing)
      .flatMap((k) => [6, k, (k + 1) % 6]);
    return makeGeometry([...corners, [1.005, 0.02, 0]], index);
  }

  /** Which way, up or down, each triangle faces, as it winds. */
  const facing = (geometry: BufferGeometry) =>
    triangles(geometry).map((triangle) => {
      const [a, b, c] = triangle
        .split(" ")
        .map((corner) =>
          new Vector3().fromArray(corner.split(",").map(Number)),
        );
      return Math.sign(b.sub(a).cross(c.sub(a)).z);
    });

  test("collapses a triangle folded back over its neighbours", () => {
    const geometry = pleat();
    expect(facing(geometry)).toEqual([-1, 1, 1, 1, 1, 1]);
    const mesh = new Mesh(geometry);

    expect(repairMesh(mesh)).toEqual({
      fixedFolds: 1,
      mergedVertices: 1,
      removedFaces: 2,
    });
    // The centre joined corner 0, taking the folded triangle and the one
    // beside it, and the rest still face up.
    expect(facing(mesh.geometry)).toEqual([1, 1, 1, 1]);
  });

  test("flips the edge a sliver is folded across, moving nothing", () => {
    // A square on its corners, split along its middle into a triangle above
    // and three below. The middle one below is a sliver whose corner at the
    // square's centre has been pushed just above the middle, folding it back
    // over the triangle above. No edge is short enough to collapse.
    const geometry = makeGeometry(
      [
        [0, 0, 0],
        [2, 0, 0],
        [1, 1, 0],
        [1, -1, 0],
        [1, 0.01, 0],
      ],
      [0, 1, 2, 1, 0, 4, 0, 3, 4, 4, 3, 1],
    );
    // The corners' positions, which a flip leaves where they are.
    const positions = (of: BufferGeometry) =>
      new Set(triangles(of).flatMap((triangle) => triangle.split(" ")));
    const before = positions(geometry);
    expect(facing(geometry)).toEqual([1, -1, 1, 1]);
    const mesh = new Mesh(geometry);

    expect(repairMesh(mesh)).toEqual({
      fixedFolds: 1,
      mergedVertices: 0,
      removedFaces: 0,
    });
    expect(facing(mesh.geometry)).toEqual([1, 1, 1, 1]);
    expect(positions(mesh.geometry)).toEqual(before);
  });

  test("moves no vertex on an open edge to undo a fold", () => {
    // Without the triangle opposite the fold, the centre is on an open edge
    // too, and every vertex that could move to undo the fold is.
    expectUntouched(pleat(3), repairMesh);
  });

  test("leaves a sharp ridge alone", () => {
    // Two strips meeting at 60 degrees along the x axis, with a sliver of a
    // step along the ridge that could be collapsed if the ridge were a fold.
    const xs = [0, 1, 1.02, 2];
    const ridge = xs.map((x) => [x, 0, 0]);
    const flat = xs.map((x) => [x, 1, 0]);
    const raised = xs.map((x) => [x, 0.5, Math.sqrt(3) / 2]);
    // Ridge vertices are 0 to 3, the flat strip's 4 to 7, the raised one's 8
    // to 11; each quad along a strip is two triangles.
    const strip = (side: number) =>
      [0, 1, 2].flatMap((i) => [
        i,
        i + 1,
        side + i + 1,
        i,
        side + i + 1,
        side + i,
      ]);
    const geometry = makeGeometry(
      [...ridge, ...flat, ...raised],
      [...strip(4), ...strip(8)],
    );

    expectUntouched(geometry, repairMesh);
  });
});

describe("repairNormals", () => {
  /** Reverses the winding of the given triangles, keeping each vertex as it was. */
  function reverse(geometry: BufferGeometry, faces: number[]) {
    for (const t of faces) {
      const [i, j] = [3 * t + 1, 3 * t + 2];
      const { index } = geometry;
      if (index) {
        const second = index.getX(i);
        index.setX(i, index.getX(j));
        index.setX(j, second);
        continue;
      }
      for (const attribute of Object.values(geometry.attributes)) {
        for (let c = 0; c < attribute.itemSize; c++) {
          const first = attribute.getComponent(i, c);
          attribute.setComponent(i, c, attribute.getComponent(j, c));
          attribute.setComponent(j, c, first);
        }
      }
    }
  }

  const everyFace = (geometry: BufferGeometry) =>
    triangles(geometry).map((_, t) => t);

  function negateNormals(geometry: BufferGeometry) {
    const normal = geometry.getAttribute("normal");
    for (let v = 0; v < normal.count; v++) {
      normal.setXYZ(v, -normal.getX(v), -normal.getY(v), -normal.getZ(v));
    }
  }

  const normalValues = (geometry: BufferGeometry) =>
    Array.from(geometry.getAttribute("normal").array);

  /**
   * Half a cylinder's wall around the z axis, open along its sides and ends,
   * wound and with smooth normals facing the axis, like the inside of a bore
   * or a reflector.
   */
  function halfBore() {
    const segments = 8;
    const positions: number[][] = [];
    const normals: number[] = [];
    const index: number[] = [];
    for (let s = 0; s <= segments; s++) {
      const angle = (Math.PI * s) / segments;
      const [x, y] = [Math.cos(angle), Math.sin(angle)];
      positions.push([x, y, 0], [x, y, 1]);
      normals.push(-x, -y, 0, -x, -y, 0);
      if (s < segments) {
        index.push(2 * s, 2 * s + 1, 2 * s + 2);
        index.push(2 * s + 1, 2 * s + 3, 2 * s + 2);
      }
    }
    const geometry = makeGeometry(positions, index);
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    return geometry;
  }

  /**
   * Checks every triangle, as it winds, faces the way `out` gives for its
   * centre, and that its corners' normals do too if it has any.
   */
  function expectFacing(
    geometry: BufferGeometry,
    out: (centre: Vector3) => Vector3,
  ) {
    const count =
      geometry.index?.count ?? geometry.getAttribute("position").count;
    for (let i = 0; i < count; i += 3) {
      const [a, b, c] = [i, i + 1, i + 2].map((corner) =>
        point(geometry, "position", vertex(geometry, corner)),
      );
      const faceNormal = new Vector3()
        .subVectors(b, a)
        .cross(new Vector3().subVectors(c, a));
      const direction = out(a.clone().add(b).add(c).divideScalar(3));
      expect(faceNormal.dot(direction)).toBeGreaterThan(0);
      if (!geometry.hasAttribute("normal")) continue;
      for (const corner of [i, i + 1, i + 2]) {
        const normal = point(geometry, "normal", vertex(geometry, corner));
        expect(normal.dot(direction)).toBeGreaterThan(0);
      }
    }
  }

  /**
   * A geometry of the given triangles, each wound and with normals facing the
   * way `out` gives for its centre.
   */
  function surface(
    positions: number[][],
    faces: number[][],
    out: (centre: Vector3) => Vector3,
  ) {
    const index = faces.flatMap(([a, b, c]) => {
      const [pa, pb, pc] = [a, b, c].map((i) =>
        new Vector3().fromArray(positions[i]),
      );
      const face = pb.clone().sub(pa).cross(pc.clone().sub(pa));
      const centre = pa.add(pb).add(pc).divideScalar(3);
      return face.dot(out(centre)) > 0 ? [a, b, c] : [a, c, b];
    });
    const geometry = makeGeometry(positions, index);
    geometry.computeVertexNormals();
    return geometry;
  }

  const outOfBox = (centre: Vector3) => centre;
  const towardAxis = (centre: Vector3) => new Vector3(-centre.x, -centre.y, 0);

  test("leaves a box that is already right alone", () => {
    expectUntouched(new BoxGeometry(), repairNormals);
  });

  test("leaves an open part seen from its concave side alone", () => {
    expectUntouched(halfBore(), repairNormals);
  });

  test("turns triangles wound against their normals, keeping the normals", () => {
    const geometry = halfBore();
    reverse(geometry, everyFace(geometry));
    const normals = normalValues(geometry);
    const mesh = new Mesh(geometry);

    expect(repairNormals(mesh)).toEqual({ flippedFaces: 16, fixedNormals: 0 });
    expectFacing(mesh.geometry, towardAxis);
    expect(normalValues(mesh.geometry)).toEqual(normals);
  });

  test("keeps smooth normals on vertices that aren't shared", () => {
    const geometry = halfBore().toNonIndexed();
    reverse(geometry, [0, 5, 6]);
    const normals = normalValues(geometry);
    const mesh = new Mesh(geometry);

    expect(repairNormals(mesh)).toEqual({ flippedFaces: 3, fixedNormals: 0 });
    expectFacing(mesh.geometry, towardAxis);
    expect(normalValues(mesh.geometry)).toEqual(normals);
  });

  test("turns a closed part's normals that face into it, keeping their smoothing", () => {
    // Normals pointing out of the box's corners, as if its edges were rounded.
    const box = new BoxGeometry();
    const normal = box.getAttribute("normal");
    for (let v = 0; v < normal.count; v++) {
      const { x, y, z } = point(box, "position", v).normalize();
      normal.setXYZ(v, x, y, z);
    }
    const smooth = normalValues(box);
    negateNormals(box);
    const mesh = new Mesh(box);

    expect(repairNormals(mesh)).toEqual({ flippedFaces: 0, fixedNormals: 24 });
    expectFacing(mesh.geometry, outOfBox);
    expect(normalValues(mesh.geometry)).toEqual(smooth);
  });

  test("turns an inside-out closed part the right way out, normals and all", () => {
    const box = new BoxGeometry();
    reverse(box, everyFace(box));
    negateNormals(box);
    const mesh = new Mesh(box);

    expect(repairNormals(mesh)).toEqual({ flippedFaces: 12, fixedNormals: 24 });
    expectFacing(mesh.geometry, outOfBox);
  });

  test("replaces normals that aren't a direction", () => {
    const box = new BoxGeometry();
    const normal = box.getAttribute("normal");
    normal.setXYZ(0, NaN, 0, 0);
    normal.setXYZ(5, 0, 0, 0);
    const mesh = new Mesh(box);

    expect(repairNormals(mesh)).toEqual({ flippedFaces: 0, fixedNormals: 2 });
    expectFacing(mesh.geometry, outOfBox);
  });

  test("turns a closed part without normals out, and gives it creased ones", () => {
    const box = new BoxGeometry();
    box.deleteAttribute("normal");
    reverse(box, everyFace(box));
    const mesh = new Mesh(box);

    expect(repairNormals(mesh)).toEqual({ flippedFaces: 12, fixedNormals: 24 });
    expectFacing(mesh.geometry, outOfBox);
    // Its edges are sharper than the crease angle, so every face stays flat.
    const { geometry } = mesh;
    for (let i = 0; i < triangles(geometry).length * 3; i += 3) {
      const [a, b, c] = [i, i + 1, i + 2].map((corner) =>
        point(geometry, "position", vertex(geometry, corner)),
      );
      const face = b.sub(a).cross(c.sub(a)).normalize();
      for (const corner of [i, i + 1, i + 2]) {
        const normal = point(geometry, "normal", vertex(geometry, corner));
        expect(normal.dot(face)).toBeCloseTo(1);
      }
    }
    expect(repairNormals(mesh)).toEqual({ flippedFaces: 0, fixedNormals: 0 });
  });

  test("gives an open part without normals smooth ones, as it's wound", () => {
    // Nothing says which way an open part without normals should face.
    const bore = halfBore();
    bore.deleteAttribute("normal");
    reverse(bore, everyFace(bore));
    const mesh = new Mesh(bore);

    // One normal for each of its 18 positions, since its segments meet at
    // shallower angles than the crease.
    expect(repairNormals(mesh)).toEqual({ flippedFaces: 0, fixedNormals: 18 });
    expectFacing(mesh.geometry, (centre) => towardAxis(centre).negate());
    expect(repairNormals(mesh)).toEqual({ flippedFaces: 0, fixedNormals: 0 });
  });

  test("turns a mesh wound against the surface it continues in another mesh", () => {
    // A ring facing up, and a cup hanging from its inner edge whose inside
    // continues the ring's top. The cup is wound and normalled facing out.
    const segments = 8;
    const circle = (radius: number, z: number) =>
      Array.from({ length: segments }, (_, s) => {
        const angle = (2 * Math.PI * s) / segments;
        return [radius * Math.cos(angle), radius * Math.sin(angle), z];
      });
    // Quads between the circle of vertices from 0 and the one from `segments`.
    const band = Array.from({ length: segments }, (_, s) => {
      const next = (s + 1) % segments;
      return [
        [s, next, segments + s],
        [next, segments + next, segments + s],
      ];
    }).flat();
    const bottom = Array.from({ length: segments }, (_, s) => [
      segments + s,
      segments + ((s + 1) % segments),
      2 * segments,
    ]);
    const outOfCup = (centre: Vector3) =>
      centre.z < -0.4
        ? new Vector3(0, 0, -1)
        : new Vector3(centre.x, centre.y, 0);
    const ring = surface(
      [...circle(1, 0), ...circle(2, 0)],
      band,
      () => new Vector3(0, 0, 1),
    );
    const cup = surface(
      [...circle(1, 0), ...circle(1, -0.5), [0, 0, -0.5]],
      [...band, ...bottom],
      outOfCup,
    );
    const ringMesh = new Mesh(ring);
    const cupMesh = new Mesh(cup);

    expect(repairNormals(new Group().add(ringMesh, cupMesh))).toEqual({
      flippedFaces: 24,
      fixedNormals: 17,
    });
    expect(ringMesh.geometry).toBe(ring);
    expectFacing(cupMesh.geometry, (centre) => outOfCup(centre).negate());
  });

  test("leaves mirrored meshes that are right as they're drawn alone", () => {
    const box = new Mesh(new BoxGeometry());
    box.scale.set(-1, 1, 1);
    const bore = new Mesh(halfBore());
    bore.scale.set(1, -2, 1);
    bore.position.set(3, 0, 0);
    const geometries = [box.geometry, bore.geometry];

    expect(repairNormals(new Group().add(box, bore))).toEqual({
      flippedFaces: 0,
      fixedNormals: 0,
    });
    expect(box.geometry).toBe(geometries[0]);
    expect(bore.geometry).toBe(geometries[1]);
  });

  test("turns a triangle folded back over the surface around it", () => {
    // Four triangles around a centre that shares its vertex and normal with
    // them all. The centre is pulled out past one side, which folds that
    // side's triangle back over the others.
    const geometry = makeGeometry(
      [
        [0, -1.5, 0],
        [-1, -1, 0],
        [1, -1, 0],
        [1, 1, 0],
        [-1, 1, 0],
      ],
      [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1],
    );
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(Array(5).fill([0, 0, 1]).flat(), 3),
    );
    const normals = normalValues(geometry);
    const mesh = new Mesh(geometry);

    expect(repairNormals(mesh)).toEqual({ flippedFaces: 1, fixedNormals: 0 });
    expectFacing(mesh.geometry, () => new Vector3(0, 0, 1));
    expect(normalValues(mesh.geometry)).toEqual(normals);
  });
});
