import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InterleavedBufferAttribute,
  MathUtils,
  Matrix3,
  Matrix4,
  Mesh,
  Object3D,
  Triangle,
  Vector3,
} from "three";
import {
  deinterleaveAttribute,
  deinterleaveGeometry,
  mergeVertices,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type MeshRepairSummary = {
  mergedVertices: number;
  removedFaces: number;
};

export type NormalsRepairSummary = {
  flippedFaces: number;
  fixedNormals: number;
};

type Attribute = BufferAttribute | InterleavedBufferAttribute;

// Fraction of the geometry's size; just above float32 rounding.
const TOLERANCE = 1e-6;

// Times area^1.5, the least volume a closed part needs to have an inside.
const FLAT = 1e-4;

const MIN_NORMAL_LENGTH = 1e-3;

// cos(84°): normals nearer sideways to a face don't say which side is out.
const SIDEWAYS = 0.1;

// Blender's Smooth by Angle default.
export const SMOOTH_ANGLE = MathUtils.degToRad(30);

export function repairMesh(object: Object3D): MeshRepairSummary {
  const summary: MeshRepairSummary = { mergedVertices: 0, removedFaces: 0 };
  repairEachGeometry(object, (geometry) => {
    const position = geometry.getAttribute("position");
    const corners = triangleCorners(geometry);
    const minHeight = TOLERANCE * size(position);
    const ids = positionIds(position, minHeight);
    const triangle = new Triangle();
    const faces = new Set<string>();
    const kept: number[] = [];

    for (let t = 0; t < corners.length; t += 3) {
      const [i, j, k] = corners.slice(t, t + 3);
      triangle.setFromAttributeAndIndices(position, i, j, k);
      if (![triangle.a, triangle.b, triangle.c].every(isFinite3)) continue;

      const [p, q, r] = [ids[i], ids[j], ids[k]];
      if (p === q || q === r || r === p || flat(triangle, minHeight)) continue;

      // Rotated to start at the lowest id so copies match. Reversed copies
      // are deliberate back faces, so they stay.
      const first = Math.min(p, q, r);
      const key = (
        first === p ? [p, q, r] : first === q ? [q, r, p] : [r, p, q]
      ).join();
      if (faces.has(key)) continue;
      faces.add(key);
      kept.push(i, j, k);
    }

    const removedFaces = (corners.length - kept.length) / 3;
    const welded = weld(geometry, kept);
    const mergedVertices =
      position.count - welded.getAttribute("position").count;
    if (!removedFaces && !mergedVertices) return undefined;
    summary.removedFaces += removedFaces;
    summary.mergedVertices += mergedVertices;
    return welded;
  });
  return summary;
}

/** Winds each part consistently and outward, with normals to match. */
export function repairNormals(object: Object3D): NormalsRepairSummary {
  const summary: NormalsRepairSummary = { flippedFaces: 0, fixedNormals: 0 };
  const flips = trianglesToFlip(object);
  repairEachGeometry(object, (geometry) => {
    const turned = flips.get(geometry)?.slice();
    if (!turned) return undefined;
    const position = geometry.getAttribute("position");
    const stored = geometry.getAttribute("normal") as Attribute | undefined;

    const index = triangleCorners(geometry);
    const reverse = (t: number) => {
      [index[3 * t + 1], index[3 * t + 2]] = [
        index[3 * t + 2],
        index[3 * t + 1],
      ];
    };
    turned.forEach((flipped, t) => flipped && reverse(t));
    for (const t of stored ? foldedOver(position, stored, index) : []) {
      reverse(t);
      turned[t] ^= 1;
    }
    const flippedFaces = turned.reduce((sum, flipped) => sum + flipped, 0);

    if (!stored) {
      const creased = toCreasedNormals(
        geometry.clone().setIndex(index),
        SMOOTH_ANGLE,
      );
      const smooth = weld(creased, triangleCorners(creased));
      summary.flippedFaces += flippedFaces;
      summary.fixedNormals += smooth.getAttribute("position").count;
      return smooth;
    }

    const normals = fixNormals(stored, position, index);
    if (!flippedFaces && !normals.fixed) return undefined;
    summary.flippedFaces += flippedFaces;
    summary.fixedNormals += normals.fixed;
    const repaired = geometry.clone();
    if (flippedFaces) repaired.setIndex(index);
    if (normals.fixed) {
      repaired.setAttribute("normal", normals.attribute);
      // Stale against the new normals; viewers derive their own when missing.
      repaired.deleteAttribute("tangent");
    }
    return repaired;
  });
  return summary;
}

function repairEachGeometry(
  object: Object3D,
  repair: (geometry: BufferGeometry) => BufferGeometry | undefined,
) {
  for (const [geometry, meshes] of meshesByGeometry(object)) {
    const repaired = repair(geometry);
    if (repaired) meshes.forEach((mesh) => (mesh.geometry = repaired));
  }
}

function meshesByGeometry(object: Object3D): Map<BufferGeometry, Mesh[]> {
  const meshes = new Map<BufferGeometry, Mesh[]>();
  object.traverse((part) => {
    if (!(part instanceof Mesh) || !part.geometry.hasAttribute("position"))
      return;
    const geometry: BufferGeometry = part.geometry;
    meshes.set(geometry, [...(meshes.get(geometry) ?? []), part]);
  });
  return meshes;
}

function triangleCorners(geometry: BufferGeometry): number[] {
  const { index } = geometry;
  const count = index ? index.count : geometry.getAttribute("position").count;
  return Array.from({ length: count - (count % 3) }, (_, i) =>
    index ? index.getX(i) : i,
  );
}

const isFinite3 = (v: Vector3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

// Skips non-finite points, which turn Box3.setFromBufferAttribute to NaN.
function size(position: Attribute): number {
  const box = new Box3();
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    if (isFinite3(point)) box.expandByPoint(point);
  }
  return box.isEmpty() ? 0 : box.getSize(point).length();
}

function positionIds(position: Attribute, cell: number): number[] {
  // TODO: points either side of a grid line never match, however close.
  const byPoint = new Map<string, number>();
  const point = new Vector3();
  const ids: number[] = [];
  for (let i = 0; i < position.count; i++) {
    point
      .fromBufferAttribute(position, i)
      .divideScalar(cell || 1)
      .round();
    const key = point.toArray().join();
    let id = byPoint.get(key);
    if (id === undefined) {
      id = byPoint.size;
      byPoint.set(key, id);
    }
    ids.push(id);
  }
  return ids;
}

// @types/three mistypes this as taking a geometry.
const deinterleave = deinterleaveAttribute as unknown as (
  attribute: InterleavedBufferAttribute,
) => BufferAttribute;

function weld(geometry: BufferGeometry, triangles: number[]): BufferGeometry {
  // mergeVertices can't rebuild interleaved attributes and ignores morph
  // targets, so each target joins the comparison as a temporary attribute.
  const prepared = geometry.clone().setIndex(triangles);
  deinterleaveGeometry(prepared);
  const morphNames: string[] = [];
  for (const targets of Object.values(prepared.morphAttributes)) {
    targets?.forEach((target, i) => {
      if (target instanceof InterleavedBufferAttribute) {
        targets[i] = deinterleave(target);
      }
      const name = `morph target ${morphNames.length}`;
      prepared.setAttribute(name, targets[i]);
      morphNames.push(name);
    });
  }
  // Copies only indexed vertices, which drops unused ones.
  // TODO: it also welds detail finer than 1e-4 in every attribute's units.
  const welded = mergeVertices(prepared);
  morphNames.forEach((name) => welded.deleteAttribute(name));
  return welded;
}

function flat(triangle: Triangle, minHeight: number) {
  const { a, b, c } = triangle;
  const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  return 2 * triangle.getArea() <= minHeight * longest;
}

const isNormal = (n: Vector3) =>
  isFinite3(n) && n.length() >= MIN_NORMAL_LENGTH;

function gatherTriangles(object: Object3D) {
  object.updateWorldMatrix(true, true);
  const toObject = object.matrixWorld.clone().invert();
  const [matrix, normalMatrix] = [new Matrix4(), new Matrix3()];
  const v = new Vector3();
  const points: number[] = [];
  const normals: number[] = [];
  const corners: number[] = [];
  const ranges = new Map<BufferGeometry, [start: number, end: number]>();
  // TODO: a geometry shared by several meshes is wound for its first mesh only.
  for (const [geometry, [mesh]] of meshesByGeometry(object)) {
    matrix.multiplyMatrices(toObject, mesh.matrixWorld);
    normalMatrix.getNormalMatrix(matrix);
    // three swaps a mirrored mesh's front faces, so its triangles are
    // reversed to face the way they're seen.
    const mirrored = matrix.determinant() < 0;
    const position = geometry.getAttribute("position");
    const stored = geometry.getAttribute("normal") as Attribute | undefined;

    const first = points.length / 3;
    for (let i = 0; i < position.count; i++) {
      points.push(...v.fromBufferAttribute(position, i).applyMatrix4(matrix));
      const valid = stored && isNormal(v.fromBufferAttribute(stored, i));
      normals.push(
        ...(valid ? v.applyNormalMatrix(normalMatrix) : [NaN, NaN, NaN]),
      );
    }
    const start = corners.length / 3;
    const local = triangleCorners(geometry);
    for (let t = 0; t < local.length; t += 3) {
      const [a, b, c] = local.slice(t, t + 3).map((i) => first + i);
      corners.push(...(mirrored ? [a, c, b] : [a, b, c]));
    }
    ranges.set(geometry, [start, corners.length / 3]);
  }
  return {
    // Doubles, so that points shared across meshes still meet once moved.
    position: new BufferAttribute(new Float64Array(points), 3),
    normal: new BufferAttribute(new Float64Array(normals), 3),
    corners,
    ranges,
  };
}

function windingEvidence(
  position: Attribute,
  normal: Attribute,
  corners: number[],
) {
  const areas = new Float64Array(corners.length / 3);
  const votes = new Float64Array(corners.length / 3);
  const triangle = new Triangle();
  const [face, n, sum] = [new Vector3(), new Vector3(), new Vector3()];
  for (let t = 0; t < areas.length; t++) {
    const [i, j, k] = corners.slice(3 * t, 3 * t + 3);
    triangle.setFromAttributeAndIndices(position, i, j, k).getNormal(face);
    areas[t] = triangle.getArea();
    sum.set(0, 0, 0);
    for (const v of [i, j, k]) {
      if (isNormal(n.fromBufferAttribute(normal, v))) sum.add(n.normalize());
    }
    // NaN when no corner has a normal, which votes 0.
    const cos = face.dot(sum) / sum.length();
    votes[t] = cos > SIDEWAYS ? areas[t] : cos < -SIDEWAYS ? -areas[t] : 0;
  }
  return { areas, votes };
}

function trianglesToFlip(object: Object3D): Map<BufferGeometry, Uint8Array> {
  const { position, normal, corners, ranges } = gatherTriangles(object);
  const { areas, votes } = windingEvidence(position, normal, corners);
  const triangleCount = corners.length / 3;
  // By position, not vertex: CAD exports split vertices along hard edges.
  const ids = positionIds(position, TOLERANCE * size(position));
  const edge = (t: number, k: number) => {
    const from = ids[corners[3 * t + k]];
    const to = ids[corners[3 * t + ((k + 1) % 3)]];
    return {
      key: Math.min(from, to) * ids.length + Math.max(from, to),
      forward: from < to ? 1 : 0,
      degenerate: from === to,
    };
  };

  // Each use is 2 * triangle, plus 1 if it runs from the lower position id.
  const edgeUses = new Map<number, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const { key, forward, degenerate } = edge(t, k);
      if (degenerate) continue;
      const uses = edgeUses.get(key) ?? [];
      uses.push(2 * t + forward);
      edgeUses.set(key, uses);
    }
  }

  const across = (t: number, k: number) => {
    const { key, forward } = edge(t, k);
    const uses = edgeUses.get(key);
    // Non-manifold edges don't say which way to wind.
    if (uses?.length !== 2) return undefined;
    const other = uses[0] >> 1 === t ? uses[1] : uses[0];
    // A triangle with two corners in one place can be on both sides.
    if (other >> 1 === t) return undefined;
    // Alike when they run along the shared edge in opposite directions.
    return { neighbour: other >> 1, same: (other & 1) !== forward };
  };

  // TODO: a closed shell inside another (a sealed cavity) gets turned out.
  const flip = new Uint8Array(triangleCount);
  const partOf = new Int32Array(triangleCount).fill(-1);
  for (let start = 0; start < triangleCount; start++) {
    if (partOf[start] >= 0) continue;
    partOf[start] = start;
    const part = [start];
    for (let n = 0; n < part.length; n++) {
      const t = part[n];
      for (let k = 0; k < 3; k++) {
        const next = across(t, k);
        if (!next || partOf[next.neighbour] >= 0) continue;
        partOf[next.neighbour] = start;
        flip[next.neighbour] = next.same ? flip[t] : flip[t] ^ 1;
        part.push(next.neighbour);
      }
    }

    const closed = part.every((t) =>
      [0, 1, 2].every((k) => {
        const [first, second, ...more] = (
          edgeUses.get(edge(t, k).key) ?? []
        ).filter((use) => partOf[use >> 1] === start);
        const direction = (use: number) => (use ^ flip[use >> 1]) & 1;
        return (
          second !== undefined &&
          !more.length &&
          direction(first) !== direction(second)
        );
      }),
    );
    // Only a closed part's volume says which side is out.
    const outward = closed ? facing(position, corners, part, flip) : 0;
    let turn = outward < 0;
    if (!outward) {
      // Follow the normals' vote, or failing that, most of the file's winding.
      let agreed = 0;
      let reversed = 0;
      let area = 0;
      for (const t of part) {
        agreed += flip[t] ? -votes[t] : votes[t];
        reversed += flip[t] ? areas[t] : 0;
        area += areas[t];
      }
      turn = agreed ? agreed < 0 : reversed > area / 2;
    }
    if (turn) part.forEach((t) => (flip[t] ^= 1));
  }

  return new Map(
    Array.from(ranges, ([geometry, [start, end]]) => [
      geometry,
      flip.subarray(start, end),
    ]),
  );
}

/** 1 if a closed part, as wound, faces out, -1 if in, 0 if it's FLAT. */
function facing(
  position: Attribute,
  corners: number[],
  part: number[],
  flip: Uint8Array,
): number {
  const triangle = new Triangle();
  const { a, b, c } = triangle;
  // Any origin gives the same volume; one on the part keeps the numbers small.
  const origin = new Vector3().fromBufferAttribute(
    position,
    corners[3 * part[0]],
  );

  let volume = 0;
  let area = 0;
  for (const t of part) {
    const [i, j, k] = corners.slice(3 * t, 3 * t + 3);
    area += triangle.setFromAttributeAndIndices(position, i, j, k).getArea();
    [a, b, c].forEach((v) => v.sub(origin));
    volume += ((flip[t] ? -1 : 1) * a.dot(b.cross(c))) / 6;
  }
  return Math.abs(volume) > FLAT * area ** 1.5 ? Math.sign(volume) : 0;
}

/** Triangles against their normals, sharing a vertex with one that agrees. */
function foldedOver(
  position: Attribute,
  normal: Attribute,
  index: number[],
): number[] {
  // TODO: a fold sharing no vertex with its neighbours has its normals turned.
  const { votes } = windingEvidence(position, normal, index);
  const backed = new Uint8Array(position.count);
  const triangle = new Triangle();
  const [face, n] = [new Vector3(), new Vector3()];
  votes.forEach((vote, t) => {
    if (vote <= 0) return;
    const [i, j, k] = index.slice(3 * t, 3 * t + 3);
    triangle.setFromAttributeAndIndices(position, i, j, k).getNormal(face);
    for (const v of [i, j, k]) {
      n.fromBufferAttribute(normal, v);
      if (face.dot(n) > SIDEWAYS * n.length()) backed[v] = 1;
    }
  });
  const folded: number[] = [];
  votes.forEach((vote, t) => {
    if (vote < 0 && index.slice(3 * t, 3 * t + 3).some((i) => backed[i])) {
      folded.push(t);
    }
  });
  return folded;
}

function fixNormals(stored: Attribute, position: Attribute, index: number[]) {
  // TODO: morph target normals aren't negated with the normals they offset.
  const probe = new BufferGeometry();
  probe.setAttribute("position", position);
  probe.setIndex(index);
  probe.computeVertexNormals();
  const faces = probe.getAttribute("normal");

  const values = new Float32Array(3 * position.count);
  const [n, face] = [new Vector3(), new Vector3()];
  let fixed = 0;
  for (let i = 0; i < position.count; i++) {
    n.fromBufferAttribute(stored, i);
    // Zero where no triangle with any area uses the vertex.
    face.fromBufferAttribute(faces, i);
    if (face.lengthSq() > 0) {
      if (!isNormal(n)) {
        n.copy(face);
        fixed++;
      } else if (n.dot(face) < -SIDEWAYS * n.length()) {
        n.negate();
        fixed++;
      }
    }
    n.toArray(values, 3 * i);
  }
  return { attribute: new Float32BufferAttribute(values, 3), fixed };
}
