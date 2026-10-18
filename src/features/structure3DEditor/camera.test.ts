import { describe, expect, it } from "vitest";
import { BoxGeometry, MathUtils, Mesh, PerspectiveCamera } from "three";
import { OrbitControls } from "three-stdlib";
import { frameObject, orbitCamera, zoomCamera } from "./camera";

// A camera two meters in front of the origin, looking at it.
function frontView(aspect = 1) {
  const camera = new PerspectiveCamera(45, aspect);
  camera.position.set(0, 0, 2);
  return { camera, controls: new OrbitControls(camera) };
}

describe("orbitCamera", () => {
  it("moves the camera the way the arrow points, keeping its distance", () => {
    const { camera, controls } = frontView();

    orbitCamera(controls, "left");
    expect(camera.position.x).toBeLessThan(0);

    orbitCamera(controls, "right");
    orbitCamera(controls, "right");
    expect(camera.position.x).toBeGreaterThan(0);

    orbitCamera(controls, "up");
    expect(camera.position.y).toBeGreaterThan(0);

    orbitCamera(controls, "down");
    orbitCamera(controls, "down");
    expect(camera.position.y).toBeLessThan(0);

    expect(controls.getDistance()).toBeCloseTo(2);
  });
});

describe("zoomCamera", () => {
  it("moves the camera towards its target and back", () => {
    const { controls } = frontView();

    zoomCamera(controls, "in");
    expect(controls.getDistance()).toBeLessThan(2);

    zoomCamera(controls, "out");
    expect(controls.getDistance()).toBeCloseTo(2);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
  });
});

describe("frameObject", () => {
  // A 1 m cube's bounding sphere has a radius of half its diagonal.
  const cubeRadius = Math.sqrt(3) / 2;
  const cubeAt = (x: number, y: number, z: number) => {
    const cube = new Mesh(new BoxGeometry(1, 1, 1));
    cube.position.set(x, y, z);
    return cube;
  };

  it("centers on the object and fits it in view, looking from the same side", () => {
    const { camera, controls } = frontView();

    frameObject(controls, cubeAt(3, 1, 0));

    expect(controls.target.x).toBeCloseTo(3);
    expect(controls.target.y).toBeCloseTo(1);
    expect(controls.target.z).toBeCloseTo(0);
    expect(camera.position.x).toBeCloseTo(3);
    expect(camera.position.y).toBeCloseTo(1);
    expect(camera.position.z).toBeGreaterThan(0);
    expect(controls.getDistance()).toBeCloseTo(
      cubeRadius / Math.sin(MathUtils.degToRad(22.5)),
    );
  });

  it("backs off further when the view is narrower than it is tall", () => {
    const { controls: square } = frontView(1);
    const { controls: narrow } = frontView(0.5);

    frameObject(square, cubeAt(0, 0, 0));
    frameObject(narrow, cubeAt(0, 0, 0));

    expect(narrow.getDistance()).toBeGreaterThan(square.getDistance());
  });
});
