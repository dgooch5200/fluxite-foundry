import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InterleavedBufferAttribute,
  Matrix3,
  Matrix4,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import {
  deinterleaveAttribute,
  mergeVertices,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type MeshRepairSummary = {
  /** Edges flipped or collapsed to undo triangles folded over their neighbours. */
  fixedFolds: number;
  /** Vertices removed by welding duplicates, or because no triangle used them. */
  mergedVertices: number;
  /** Triangles removed for being collapsed, degenerate, non-finite, or a duplicate. */
  removedFaces: number;
};

export type NormalsRepairSummary = {
  /** Triangles whose winding was reversed. */
  flippedFaces: number;
  /** Vertex normals that were missing, invalid, or facing away from their faces. */
  fixedNormals: number;
};

type Attribute = BufferAttribute | InterleavedBufferAttribute;

// Points closer together than this fraction of their geometry's size count as
// the same position, and a triangle flatter than it counts as having no area.
// float32 positions carry about seven significant digits, so this sits just
// above their rounding and far below any detail a model is drawn with.
const TOLERANCE = 1e-6;

// A closed part counts as flat, with no inside to face away from, when its
// volume is under this fraction of its area^1.5. A ball scores about 0.09, a
// cube 0.07 and a plate a thousandth as thick as it is wide 0.0004, while a
// sheet closed by its own back face scores only rounding error.
const FLAT = 1e-4;

// A stored normal shorter than this is a placeholder rather than a direction.
const MIN_NORMAL_LENGTH = 1e-3;

// Normals within this cosine of perpendicular to a face, about 84 degrees,
// don't say which side of it is out, as on a sliver across a tight curve.
const SIDEWAYS = 0.1;

// Two triangles on an edge are folded over each other when their far corners
// lie on the same side of it, less than this angle apart around it. A smooth
// surface has them near 180 degrees. In the fixture models almost every pair
// sharper than 30 degrees has one triangle facing against all the others
// around it, a sliver left by decimation or a boolean. Real creases there
// start at 37.8 degrees, a cut edge on the base, so 30 keeps clear of them,
// at the cost of a few folds on the head between 30 and 39.
const FOLD = (30 * Math.PI) / 180;

// A collapse moves a vertex less than this fraction of its geometry's size.
// The folded slivers lie in the surface, so a vertex sliding that far along
// one barely changes the outline. With collapses alone, this undid 62 of the
// fixture head's 85 folds, and 5% only 7 more for moves 2.5 times as long.
const MAX_COLLAPSE = 0.02;

// Faces meeting at a sharper angle than this keep a hard edge when a mesh is
// smoothed: by the view's Smooth shading, and when a mesh without normals is
// given some, so a repaired model looks as it did with Smooth shading on.
// It's Blender's default.
export const SMOOTH_ANGLE = (30 * Math.PI) / 180;

/** Cleans up the geometry of every mesh in the object (including the object itself). */
export function repairMesh(object: Object3D): MeshRepairSummary {
  const summary: MeshRepairSummary = {
    fixedFolds: 0,
    mergedVertices: 0,
    removedFaces: 0,
  };
  repairEachGeometry(object, (original) => {
    const folds = fixFolds(original);
    const geometry = folds ? original.clone().setIndex(folds.index) : original;
    if (folds?.position) geometry.setAttribute("position", folds.position);
    const position = geometry.getAttribute("position");
    const corners = triangleCorners(geometry);
    const minHeight = TOLERANCE * size(position);
    const ids = positionIds(position, minHeight);
    const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
    const faces = new Set<string>();
    const kept: number[] = [];

    for (let t = 0; t < corners.length; t += 3) {
      const triangle = corners.slice(t, t + 3);
      [a, b, c].forEach((v, k) => v.fromBufferAttribute(position, triangle[k]));
      if (![a, b, c].every(isFinite3)) continue;

      // One with two corners in one place, as a collapsed fold leaves, or
      // flatter than the tolerance, is a sliver along a line and covers
      // nothing.
      const [p, q, r] = triangle.map((i) => ids[i]);
      if (p === q || q === r || r === p || flat(a, b, c, minHeight)) continue;

      // Read from its lowest position, a face has one key whichever corner a
      // copy of it starts from. Reversed, the corners make the face's back,
      // which some files add to make a face two-sided, so that's kept.
      const first = Math.min(p, q, r);
      const key = (
        first === p ? [p, q, r] : first === q ? [q, r, p] : [r, p, q]
      ).join();
      if (faces.has(key)) continue;
      faces.add(key);
      kept.push(...triangle);
    }

    const removedFaces = (corners.length - kept.length) / 3;
    const welded = weld(geometry, kept);
    const mergedVertices =
      position.count - welded.getAttribute("position").count;
    if (!folds && !removedFaces && !mergedVertices) return undefined;
    summary.fixedFolds += folds?.fixes ?? 0;
    summary.removedFaces += removedFaces;
    summary.mergedVertices += mergedVertices;
    return welded;
  });
  return summary;
}

/**
 * Winds each connected surface among the object's meshes one way throughout,
 * facing out of the volume it encloses or else the way its stored normals
 * mostly say, fixes normals that aren't a direction or that face against
 * their triangles, turns triangles folded back over the surface around them,
 * and gives a mesh without normals smooth ones. Everything else stays exactly
 * as the file has it, so a part that was right stays right.
 */
export function repairNormals(object: Object3D): NormalsRepairSummary {
  const summary: NormalsRepairSummary = { flippedFaces: 0, fixedNormals: 0 };
  const flips = trianglesToFlip(object);
  repairEachGeometry(object, (geometry) => {
    const turned = flips.get(geometry)?.slice();
    if (!turned) return undefined;
    const position = geometry.getAttribute("position");
    // Its type doesn't admit it, but a file may have no normals.
    const stored = geometry.getAttribute("normal") as Attribute | undefined;

    // Swapping two corners reverses a triangle and leaves the vertices where
    // they are. A geometry without an index gets one this way.
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
      // glTF draws a mesh without normals flat, which shows every facet of a
      // low-poly one. It gets normals smooth across shallow edges and creased
      // at sharp ones, once it's wound the right way, then is indexed again.
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
      // Tangents were worked out against the old normals. Without them, three
      // and other glTF viewers derive their own.
      repaired.deleteAttribute("tangent");
    }
    return repaired;
  });
  return summary;
}

/**
 * Calls `repair` once for each distinct geometry among the object's meshes,
 * and gives every mesh that used it the repaired geometry, if there is one.
 */
function repairEachGeometry(
  object: Object3D,
  repair: (geometry: BufferGeometry) => BufferGeometry | undefined,
) {
  const results = new Map<BufferGeometry, BufferGeometry | undefined>();
  object.traverse((part) => {
    if (!(part instanceof Mesh) || !part.geometry.hasAttribute("position"))
      return;
    const geometry: BufferGeometry = part.geometry;
    if (!results.has(geometry)) results.set(geometry, repair(geometry));
    part.geometry = results.get(geometry) ?? geometry;
  });
}

/** The vertex at each corner of each triangle, three to a triangle. */
function triangleCorners(geometry: BufferGeometry): number[] {
  const { index } = geometry;
  const count = index ? index.count : geometry.getAttribute("position").count;
  const corners: number[] = [];
  // One or two vertices left over at the end make no triangle.
  for (let i = 0; i < count - (count % 3); i++) {
    corners.push(index ? index.getX(i) : i);
  }
  return corners;
}

const isFinite3 = (v: Vector3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** The diagonal of the box around the finite positions. */
function size(position: Attribute): number {
  const box = new Box3();
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    // Box3.setFromBufferAttribute would turn to NaN at the first bad point.
    point.fromBufferAttribute(position, i);
    if (isFinite3(point)) box.expandByPoint(point);
  }
  return box.isEmpty() ? 0 : box.getSize(point).length();
}

/**
 * An id for each vertex's position, the same for vertices whose positions
 * round to the same point on a grid `cell` apart.
 * ponytail: two points either side of a grid line don't match however close
 * they are. Exporters write a shared point the same each time, which is what
 * this relies on; checking neighbouring cells too would catch the rest.
 */
function positionIds(position: Attribute, cell: number): number[] {
  const byPoint = new Map<string, number>();
  const point = new Vector3();
  const ids: number[] = [];
  for (let i = 0; i < position.count; i++) {
    // A geometry with no size is all one point, so any cell will do.
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

// @types/three declares this as taking a geometry, but it takes an interleaved
// attribute and returns a plain copy of it.
const deinterleave = deinterleaveAttribute as unknown as (
  attribute: InterleavedBufferAttribute,
) => BufferAttribute;

/**
 * A copy of the geometry with only the given triangles, and with vertices
 * that match in every attribute, morph targets included, made into one.
 * ponytail: mergeVertices matches each attribute within 1e-4 of its own
 * units, a tenth of a millimetre for positions in glTF's meters, so a model
 * with detail finer than that and nothing else to tell it apart gets welded.
 */
function weld(geometry: BufferGeometry, triangles: number[]): BufferGeometry {
  // mergeVertices can't rebuild interleaved attributes, and compares base
  // attributes only. Each morph target joins them under a made-up name for
  // the comparison, so vertices that move apart in a morph stay apart.
  const plain = (attribute: Attribute) =>
    attribute instanceof InterleavedBufferAttribute
      ? deinterleave(attribute)
      : attribute;
  const prepared = geometry.clone().setIndex(triangles);
  for (const [name, attribute] of Object.entries(prepared.attributes)) {
    prepared.setAttribute(name, plain(attribute));
  }
  const morphNames: string[] = [];
  for (const targets of Object.values(prepared.morphAttributes)) {
    targets?.forEach((target, i) => {
      targets[i] = plain(target);
      const name = `morph target ${morphNames.length}`;
      prepared.setAttribute(name, targets[i]);
      morphNames.push(name);
    });
  }
  // It only copies the vertices the index uses, which drops unused ones.
  const welded = mergeVertices(prepared);
  morphNames.forEach((name) => welded.deleteAttribute(name));
  return welded;
}

/**
 * Whether a triangle is flatter than `minHeight`, measured as twice its area
 * over its longest side.
 */
function flat(a: Vector3, b: Vector3, c: Vector3, minHeight: number) {
  const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  const doubleArea = new Vector3()
    .subVectors(b, a)
    .cross(new Vector3().subVectors(c, a))
    .length();
  return doubleArea <= minHeight * longest;
}

/** One way to undo a fold: how far it moves a vertex, whether it may, and doing it. */
type Fix = { distance: number; allowed: () => boolean; make: () => void };

/**
 * Undoes triangles folded over their neighbours, by flipping the edge between
 * two triangles or by collapsing an edge, flips first and then the shortest
 * collapses, while any fix is allowed. A fix has to leave fewer folds around
 * it, turn no triangle that wasn't folded and flatten none. A collapse also
 * has to keep the surface manifold, move no vertex on an open or shared edge,
 * and move nothing far. The fixed index and, if any vertex moved, positions,
 * and how many fixes there were; undefined if there were none.
 * ponytail: the folds are found over the whole geometry again after every
 * fix, O(triangles × folds). Update only around each fix if a model with many
 * folds is slow.
 */
function fixFolds(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  const diagonal = size(position);
  const minHeight = TOLERANCE * diagonal;
  // The surface is worked on by position, one point for every vertex there.
  // A collapse joins two positions; a flip rewrites two triangles' corners.
  const ids = positionIds(position, minHeight);
  const points: Vector3[] = [];
  ids.forEach((id, i) => {
    points[id] ??= new Vector3().fromBufferAttribute(position, i);
  });
  const corners = triangleCorners(geometry);

  const key = (p: number, q: number) =>
    Math.min(p, q) * points.length + Math.max(p, q);
  const sides = (triangle: number[]) =>
    [0, 1, 2].map((k) => [triangle[k], triangle[(k + 1) % 3]]);
  const whole = ([p, q, r]: number[]) => p !== q && q !== r && r !== p;
  const edgesOf = (tris: number[][]) => {
    const edges = new Map<number, number[][]>();
    for (const triangle of tris) {
      for (const [p, q] of sides(triangle)) {
        edges.set(key(p, q), [...(edges.get(key(p, q)) ?? []), triangle]);
      }
    }
    return edges;
  };
  const normal = (triangle: number[], point: (id: number) => Vector3) => {
    const [a, b, c] = triangle.map(point);
    return new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
  };
  const flatAt = (triangle: number[], point: (id: number) => Vector3) => {
    const [a, b, c] = triangle.map(point);
    return flat(a, b, c, minHeight);
  };
  // Two vertices are interchangeable when they match in every attribute.
  const attributes = Object.values(geometry.attributes);
  const same = (i: number, j: number) =>
    i === j ||
    attributes.every((attribute) =>
      Array.from(
        { length: attribute.itemSize },
        (_, k) => attribute.getComponent(i, k) === attribute.getComponent(j, k),
      ).every(Boolean),
    );

  const [axis, wingC, wingD] = [new Vector3(), new Vector3(), new Vector3()];
  /** Whether the two triangles on edge pq, if there are just two, fold over each other. */
  const folded = (
    p: number,
    q: number,
    on: number[][] | undefined,
    point: (id: number) => Vector3,
  ) => {
    if (on?.length !== 2) return false;
    const [c, d] = on.map((tri) => tri.find((id) => id !== p && id !== q));
    // A face and its own back aren't folded, they're two-sided.
    if (c === undefined || d === undefined || c === d) return false;
    axis.subVectors(point(q), point(p));
    wingC.subVectors(point(c), point(p)).projectOnPlane(axis);
    wingD.subVectors(point(d), point(p)).projectOnPlane(axis);
    return wingC.dot(wingD) > Math.cos(FOLD) * wingC.length() * wingD.length();
  };
  /** The folded edges among the triangles' sides. */
  const foldsAmong = (
    tris: number[][],
    edges: Map<number, number[][]>,
    point: (id: number) => Vector3,
  ) => {
    const found = new Set<number>();
    for (const triangle of tris) {
      for (const [p, q] of sides(triangle)) {
        if (folded(p, q, edges.get(key(p, q)), point)) found.add(key(p, q));
      }
    }
    return found;
  };

  const now = (id: number) => points[id];
  /**
   * Whether changing each triangle of `region` as `change` says (to nothing,
   * or to no triangle, removes it), adding `added`, and moving points to where
   * `then` puts them leaves fewer folds among them, turns over no triangle
   * that wasn't folded, and flattens none, which would leave a crack once
   * it's removed.
   */
  const improves = (
    region: number[][],
    edges: Map<number, number[][]>,
    change: (triangle: number[]) => number[] | undefined,
    added: number[][],
    then: (id: number) => Vector3,
  ) => {
    const changed = (tris: number[][]) => [
      ...tris.flatMap((tri) => {
        const next = change(tri);
        return next && whole(next) ? [next] : [];
      }),
      ...added,
    ];
    // Only edges of the region's triangles can change, so only the triangles
    // across those matter.
    const nearby = new Set(
      region.flatMap((tri) =>
        sides(tri).flatMap(([p, q]) => edges.get(key(p, q)) ?? []),
      ),
    );
    const before = foldsAmong(region, edges, now);
    const after = foldsAmong(
      changed(region),
      edgesOf(changed([...nearby])),
      then,
    );
    if (after.size >= before.size) return false;
    if (added.some((tri) => flatAt(tri, then))) return false;
    return region.every((tri) => {
      const next = change(tri);
      if (!next || !whole(next)) return true;
      if (flatAt(next, then)) return false;
      const wasFolded = sides(tri).some(([p, q]) => before.has(key(p, q)));
      return wasFolded || normal(next, then).dot(normal(tri, now)) > 0;
    });
  };

  let fixes = 0;
  const moved = new Set<number>();
  for (;;) {
    const triangles = Array.from({ length: corners.length / 3 }, (_, t) =>
      corners.slice(3 * t, 3 * t + 3).map((i) => ids[i]),
    );
    const indexOf = new Map(triangles.map((tri, t) => [tri, t]));
    const live = triangles.filter(whole);
    const edges = edgesOf(live);
    const around = new Map<number, number[][]>();
    for (const triangle of live) {
      for (const id of triangle) {
        around.set(id, [...(around.get(id) ?? []), triangle]);
      }
    }
    const aroundAll = (...at: number[]) => [
      ...new Set(at.flatMap((id) => around.get(id) ?? [])),
    ];
    // A vertex on an edge with one triangle, or more than two, stays put, so
    // the seams with other meshes and the edges of openings can't crack.
    const pinned = new Set<number>();
    for (const [edge, on] of edges) {
      if (on.length === 2) continue;
      pinned.add(Math.floor(edge / points.length));
      pinned.add(edge % points.length);
    }

    /**
     * Turns the triangles (p, q, r) and (q, p, s) into (p, s, r) and
     * (s, q, r), which moves nothing. Each new corner is the vertex the old
     * triangles had there, so attributes stay where they were.
     */
    const flip = (p: number, q: number): Fix[] => {
      const on = edges.get(key(p, q)) ?? [];
      const runs = (from: number, to: number) =>
        on.find((tri) => sides(tri).some(([x, y]) => x === from && y === to));
      const [first, second] = [runs(p, q), runs(q, p)];
      if (on.length !== 2 || !first || !second || first === second) return [];
      const r = first.find((id) => id !== p && id !== q);
      const s = second.find((id) => id !== p && id !== q);
      if (r === undefined || s === undefined || r === s) return [];
      // The new edge rs mustn't be one there already.
      if (edges.has(key(r, s))) return [];
      const [t1, t2] = [indexOf.get(first) ?? -1, indexOf.get(second) ?? -1];
      const vertex = (t: number, id: number) =>
        corners.slice(3 * t, 3 * t + 3).find((i) => ids[i] === id) ?? -1;
      // Across a seam, where the two triangles' vertices at p or q differ,
      // the new triangles would mix attributes from either side.
      if (!same(vertex(t1, p), vertex(t2, p))) return [];
      if (!same(vertex(t1, q), vertex(t2, q))) return [];
      const [vp, vq, vr, vs] = [
        vertex(t1, p),
        vertex(t1, q),
        vertex(t1, r),
        vertex(t2, s),
      ];
      const added = [
        [p, s, r],
        [s, q, r],
      ];
      return [
        {
          distance: 0,
          allowed: () =>
            improves(
              aroundAll(p, q, r, s),
              edges,
              (tri) => (tri === first || tri === second ? undefined : tri),
              added,
              now,
            ),
          make: () => {
            corners.splice(3 * t1, 3, vp, vs, vr);
            corners.splice(3 * t2, 3, vs, vq, vr);
          },
        },
      ];
    };

    /** Joins `drop` to `keep`, both ending up at `to`. */
    const collapse = (keep: number, drop: number, to: Vector3): Fix => ({
      distance: Math.max(to.distanceTo(now(keep)), to.distanceTo(now(drop))),
      allowed: () => {
        // The link condition: the ends' only shared neighbours are the far
        // corners of the two triangles on the edge, so the surface stays
        // manifold, with no face doubled or edge shared three ways.
        const neighbours = (id: number) =>
          new Set((around.get(id) ?? []).flat().filter((x) => x !== id));
        const ofDrop = neighbours(drop);
        const shared = [...neighbours(keep)].filter((id) => ofDrop.has(id));
        const far = (edges.get(key(keep, drop)) ?? []).map((tri) =>
          tri.find((id) => id !== keep && id !== drop),
        );
        if (far.length !== 2 || shared.length !== 2) return false;
        if (!far.every((id) => id !== undefined && shared.includes(id))) {
          return false;
        }
        return improves(
          aroundAll(keep, drop),
          edges,
          (tri) => tri.map((id) => (id === drop ? keep : id)),
          [],
          (id) => (id === keep ? to : now(id)),
        );
      },
      make: () => {
        points[keep] = to.clone();
        ids.forEach((id, i) => id === drop && (ids[i] = keep));
        moved.add(keep);
      },
    });

    // Any edge of a folded pair's triangles may be flipped, or collapsed onto
    // either end or its middle if what moves isn't pinned.
    const candidates: Fix[] = [];
    for (const edge of foldsAmong(live, edges, now)) {
      for (const [u, v] of (edges.get(edge) ?? []).flatMap(sides)) {
        candidates.push(...flip(u, v));
        if (!pinned.has(v)) candidates.push(collapse(u, v, now(u)));
        if (!pinned.has(u)) candidates.push(collapse(v, u, now(v)));
        if (!pinned.has(u) && !pinned.has(v)) {
          candidates.push(collapse(u, v, now(u).clone().lerp(now(v), 0.5)));
        }
      }
    }
    const best = candidates
      .filter((fix) => fix.distance < MAX_COLLAPSE * diagonal)
      .sort((x, y) => x.distance - y.distance)
      .find((fix) => fix.allowed());
    if (!best) break;
    best.make();
    fixes++;
  }

  if (!fixes) return undefined;
  if (!moved.size) return { index: corners, fixes };
  // Every vertex at a collapsed edge goes to where its ends met. The rest
  // keep their exact positions.
  const values = new Float32Array(3 * position.count);
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    const at = moved.has(ids[i])
      ? points[ids[i]]
      : v.fromBufferAttribute(position, i);
    at.toArray(values, 3 * i);
  }
  return {
    index: corners,
    position: new Float32BufferAttribute(values, 3),
    fixes,
  };
}

/** Whether a stored normal is a direction, not a placeholder or garbage. */
const isNormal = (n: Vector3) =>
  isFinite3(n) && n.length() >= MIN_NORMAL_LENGTH;

/**
 * Every triangle of the object's meshes, with positions and normals in the
 * object's own space, and the range each geometry's triangles take among
 * them. NaN stands for a normal that isn't a direction. three draws a mirrored
 * mesh with its front faces swapped, so its triangles are reversed here to
 * face the way they're seen.
 */
function gatherTriangles(object: Object3D) {
  object.updateWorldMatrix(true, true);
  const toObject = object.matrixWorld.clone().invert();
  const [matrix, normalMatrix] = [new Matrix4(), new Matrix3()];
  const v = new Vector3();
  const points: number[] = [];
  const normals: number[] = [];
  const corners: number[] = [];
  const ranges = new Map<BufferGeometry, [start: number, end: number]>();
  object.traverse((part) => {
    if (!(part instanceof Mesh) || !part.geometry.hasAttribute("position"))
      return;
    const geometry: BufferGeometry = part.geometry;
    if (ranges.has(geometry)) return;
    matrix.multiplyMatrices(toObject, part.matrixWorld);
    normalMatrix.getNormalMatrix(matrix);
    const mirrored = matrix.determinant() < 0;
    const position = geometry.getAttribute("position");
    const stored = geometry.getAttribute("normal") as Attribute | undefined;

    const first = points.length / 3;
    for (let i = 0; i < position.count; i++) {
      points.push(...v.fromBufferAttribute(position, i).applyMatrix4(matrix));
      const valid = stored && isNormal(v.fromBufferAttribute(stored, i));
      normals.push(
        ...(valid ? v.applyMatrix3(normalMatrix).normalize() : [NaN, NaN, NaN]),
      );
    }
    const start = corners.length / 3;
    const local = triangleCorners(geometry);
    for (let t = 0; t < local.length; t += 3) {
      const [a, b, c] = local.slice(t, t + 3).map((i) => first + i);
      corners.push(...(mirrored ? [a, c, b] : [a, b, c]));
    }
    ranges.set(geometry, [start, corners.length / 3]);
  });
  return {
    // Doubles, so that points shared across meshes still meet once moved.
    position: new BufferAttribute(new Float64Array(points), 3),
    normal: new BufferAttribute(new Float64Array(normals), 3),
    corners,
    ranges,
  };
}

/**
 * Each triangle's area, and how much of it its normals vote for it winding
 * the way it does: all of it, all of it against, or none if they don't say.
 */
function windingEvidence(
  position: Attribute,
  normal: Attribute,
  corners: number[],
) {
  const areas = new Float64Array(corners.length / 3);
  const votes = new Float64Array(corners.length / 3);
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  const [n, sum] = [new Vector3(), new Vector3()];
  for (let t = 0; t < areas.length; t++) {
    const triangle = corners.slice(3 * t, 3 * t + 3);
    [a, b, c].forEach((v, k) => v.fromBufferAttribute(position, triangle[k]));
    const face = b.sub(a).cross(c.sub(a));
    areas[t] = face.length() / 2;
    sum.set(0, 0, 0);
    for (const i of triangle) {
      if (isNormal(n.fromBufferAttribute(normal, i))) sum.add(n.normalize());
    }
    // NaN without area or normals to compare, which says nothing either.
    const cos = face.dot(sum) / (face.length() * sum.length());
    votes[t] = cos > SIDEWAYS ? areas[t] : cos < -SIDEWAYS ? -areas[t] : 0;
  }
  return { areas, votes };
}

/**
 * Which triangles of each geometry among the object's meshes to reverse.
 * Triangles join into parts across meshes, by position in the object's space,
 * and each part is wound one way throughout. A closed part then faces out of
 * the volume it encloses. Any other faces the way its stored normals say for
 * most of its area, or without any, the way most of its area already winds.
 * ponytail: a geometry used by several meshes is judged where its first mesh
 * puts it, so another instance meeting other neighbours, or none, still gets
 * the first one's winding. Judge each instance and reconcile if that shows up.
 */
function trianglesToFlip(object: Object3D): Map<BufferGeometry, Uint8Array> {
  const { position, normal, corners, ranges } = gatherTriangles(object);
  const { areas, votes } = windingEvidence(position, normal, corners);
  const triangleCount = corners.length / 3;
  // Neighbours are found by position rather than by vertex: CAD exports split
  // vertices along every hard edge, so a box's faces share none.
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

  // The triangles along each edge, each as 2 * triangle, plus 1 if it runs
  // from the edge's lower position id to its higher.
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

  /** The one other triangle on a triangle's edge, and whether the two wind alike. */
  const across = (t: number, k: number) => {
    const { key, forward } = edge(t, k);
    const uses = edgeUses.get(key);
    // More than two triangles on an edge don't say which way to wind.
    if (uses?.length !== 2) return undefined;
    const other = uses[0] >> 1 === t ? uses[1] : uses[0];
    // A triangle with two corners in one place can be on both sides.
    if (other >> 1 === t) return undefined;
    // Neighbours wind the same way when they run along their shared edge in
    // opposite directions.
    return { neighbour: other >> 1, same: (other & 1) !== forward };
  };

  // ponytail: faces whose shared edge is split differently on each side don't
  // connect; an open part goes the way most of its area's normals say, so
  // where most of it is wound and normalled wrong it drags the rest along;
  // and a closed shell inside another, like the wall of a sealed cavity,
  // rightly faces into itself and gets turned out. Test whether it lies inside
  // another closed part if that shows up.
  const flip = new Uint8Array(triangleCount);
  // The part each triangle is in, named by the triangle it was found from.
  const partOf = new Int32Array(triangleCount).fill(-1);
  for (let start = 0; start < triangleCount; start++) {
    if (partOf[start] >= 0) continue;
    partOf[start] = start;
    // The part, which is also the breadth-first search's queue, with each
    // triangle wound to match the one it was reached from.
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

    // Closed, each of its edges has just two of its triangles on it, winding
    // alike, even where another part touches it along the same edge.
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
    // Only a closed part's volume says which side is out. An open one's
    // concave side is as likely to be its front, like a reflector's.
    const outward = closed ? facing(position, corners, part, flip) : 0;
    let turn = outward < 0;
    if (!outward) {
      // The area whose normals agree with the part as now wound, less the
      // area whose normals disagree, and the area wound against the file.
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

/**
 * 1 if a closed part, wound as `flip` says, faces out of the volume it
 * encloses, -1 if it faces into it, or 0 if it's too flat to tell.
 */
function facing(
  position: Attribute,
  corners: number[],
  part: number[],
  flip: Uint8Array,
): number {
  const corner = (t: number, k: number, target: Vector3) =>
    target.fromBufferAttribute(position, corners[3 * t + k]);
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  const [ab, ac] = [new Vector3(), new Vector3()];
  // A closed part encloses the same volume measured from anywhere, and from
  // a point on it the numbers stay small.
  const origin = corner(part[0], 0, new Vector3());

  let volume = 0;
  let area = 0;
  for (const t of part) {
    corner(t, 0, a).sub(origin);
    corner(t, 1, b).sub(origin);
    corner(t, 2, c).sub(origin);
    area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
    // The tetrahedron from the origin to the face, negative when the face
    // looks back towards the origin.
    volume += ((flip[t] ? -1 : 1) * a.dot(b.cross(c))) / 6;
  }
  return Math.abs(volume) > FLAT * area ** 1.5 ? Math.sign(volume) : 0;
}

/**
 * Triangles folded back over the surface around them, as a bad triangulation
 * leaves some. Each faces against its corners' normals, and at one of those
 * corners another triangle faces with the corner's normal and with its own
 * normals as a whole. The normals there are right for that neighbour, so it's
 * the folded triangle that has to turn.
 * ponytail: a fold whose vertices are all its own looks the same as a triangle
 * with wrong normals, so its normals are turned to match it instead. Compare
 * with neighbours at the same positions if that shows up.
 */
function foldedOver(
  position: Attribute,
  normal: Attribute,
  index: number[],
): number[] {
  const { votes } = windingEvidence(position, normal, index);
  const backed = new Uint8Array(position.count);
  const [a, b, c, n] = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ];
  votes.forEach((vote, t) => {
    if (vote <= 0) return;
    const triangle = index.slice(3 * t, 3 * t + 3);
    [a, b, c].forEach((v, k) => v.fromBufferAttribute(position, triangle[k]));
    const face = b.sub(a).cross(c.sub(a));
    for (const i of triangle) {
      n.fromBufferAttribute(normal, i);
      if (face.dot(n) > SIDEWAYS * face.length() * n.length()) backed[i] = 1;
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

/**
 * The stored normals in a fresh attribute, since the file's may be quantized,
 * with those that aren't a direction replaced by their triangles' normal and
 * those facing against their triangles, as `index` winds them, turned round.
 * The rest keep their exact values.
 * ponytail: morph target normals stay as they were, so a turned normal's
 * morphs still offset it the old way. Negate those too if a model shows it.
 */
function fixNormals(stored: Attribute, position: Attribute, index: number[]) {
  // Each vertex's triangles' normal, averaged by area.
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
    // Zero when no triangle with any area uses the vertex, so nothing shows
    // which way it should face.
    face.fromBufferAttribute(faces, i);
    if (face.lengthSq() > 0) {
      if (!isNormal(n)) {
        n.copy(face);
        fixed++;
      } else if (n.dot(face) < -SIDEWAYS * n.length()) {
        // Turned rather than replaced, which keeps the file's smoothing.
        n.negate();
        fixed++;
      }
    }
    n.toArray(values, 3 * i);
  }
  return { attribute: new Float32BufferAttribute(values, 3), fixed };
}
