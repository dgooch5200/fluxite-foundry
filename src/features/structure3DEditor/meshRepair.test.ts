import { describe, test, expect } from "vitest";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Object3D,
  Triangle,
  Vector3,
} from "three";
import { repairMesh, repairNormals } from "./meshRepair";
import { makeGeometry } from "./testFixtures";

const vertex = (geometry: BufferGeometry, i: number) =>
  geometry.index ? geometry.index.getX(i) : i;

const point = (geometry: BufferGeometry, name: string, i: number) =>
  new Vector3().fromBufferAttribute(geometry.getAttribute(name), i);

function cornerPoints(geometry: BufferGeometry, name = "position") {
  const count =
    geometry.index?.count ?? geometry.getAttribute("position").count;
  return Array.from({ length: count / 3 }, (_, t) =>
    [0, 1, 2].map((k) => point(geometry, name, vertex(geometry, 3 * t + k))),
  );
}

const triangles = (geometry: BufferGeometry) =>
  cornerPoints(geometry).map((corners) =>
    corners.map((corner) => corner.toArray()).join(" "),
  );

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

    expect(repairMesh(mesh)).toEqual({ mergedVertices: 1, removedFaces: 3 });
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

    expect(repairMesh(group)).toEqual({ mergedVertices: 2, removedFaces: 0 });
    expect(meshes[0].geometry).not.toBe(geometry);
    expect(meshes[1].geometry).toBe(meshes[0].geometry);
  });
});

describe("repairNormals", () => {
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

  // Half a cylinder wall around z, facing the axis like a reflector.
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

  function expectFacing(
    geometry: BufferGeometry,
    out: (centre: Vector3) => Vector3,
  ) {
    const normals = geometry.hasAttribute("normal")
      ? cornerPoints(geometry, "normal")
      : [];
    cornerPoints(geometry).forEach(([a, b, c], t) => {
      const triangle = new Triangle(a, b, c);
      const faceNormal = triangle.getNormal(new Vector3());
      const direction = out(triangle.getMidpoint(new Vector3()));
      expect(faceNormal.dot(direction)).toBeGreaterThan(0);
      for (const normal of normals[t] ?? []) {
        expect(normal.dot(direction)).toBeGreaterThan(0);
      }
    });
  }

  function surface(
    positions: number[][],
    faces: number[][],
    out: (centre: Vector3) => Vector3,
  ) {
    const index = faces.flatMap(([a, b, c]) => {
      const [pa, pb, pc] = [a, b, c].map((i) =>
        new Vector3().fromArray(positions[i]),
      );
      const triangle = new Triangle(pa, pb, pc);
      const face = triangle.getNormal(new Vector3());
      const centre = triangle.getMidpoint(new Vector3());
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
    const normals = cornerPoints(mesh.geometry, "normal");
    cornerPoints(mesh.geometry).forEach(([a, b, c], t) => {
      const face = new Triangle(a, b, c).getNormal(new Vector3());
      for (const normal of normals[t]) {
        expect(normal.dot(face)).toBeCloseTo(1);
      }
    });
    expect(repairNormals(mesh)).toEqual({ flippedFaces: 0, fixedNormals: 0 });
  });

  test("gives an open part without normals smooth ones, as it's wound", () => {
    const bore = halfBore();
    bore.deleteAttribute("normal");
    reverse(bore, everyFace(bore));
    const mesh = new Mesh(bore);

    // One per position: its segments meet at shallower angles than the crease.
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
    // Quads joining the first circle of vertices to the second.
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
    // Four triangles fanned around vertex 0, which is pulled out past the
    // bottom edge so that edge's triangle folds back over the others.
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
