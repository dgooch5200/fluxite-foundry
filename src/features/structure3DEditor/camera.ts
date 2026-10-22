import { Box3, MathUtils, Object3D, PerspectiveCamera, Sphere } from "three";
import { OrbitControls } from "three-stdlib";

const ORBIT_STEP = MathUtils.degToRad(15);

// Zooming in multiplies the camera's distance from its target by this, and
// zooming out divides by it: about four notches of the scroll wheel.
const ZOOM_STEP = 0.8;

// Keeps the camera off the target when framing something with no size.
const MIN_FRAMED_RADIUS = 0.05;

export type OrbitDirection = "left" | "right" | "up" | "down";

/** Moves the camera a step around its target, the way the arrow points on screen. */
export function orbitCamera(
  controls: OrbitControls,
  direction: OrbitDirection,
) {
  const azimuth = controls.getAzimuthalAngle();
  // Measured down from straight above the target.
  const polar = controls.getPolarAngle();
  if (direction === "left") controls.setAzimuthalAngle(azimuth - ORBIT_STEP);
  if (direction === "right") controls.setAzimuthalAngle(azimuth + ORBIT_STEP);
  if (direction === "up") controls.setPolarAngle(polar - ORBIT_STEP);
  if (direction === "down") controls.setPolarAngle(polar + ORBIT_STEP);
}

/** Moves the camera a step towards its target, or away from it. */
export function zoomCamera(controls: OrbitControls, direction: "in" | "out") {
  if (direction === "in") controls.dollyIn(ZOOM_STEP);
  else controls.dollyOut(ZOOM_STEP);
}

/**
 * Turns the camera on an object, or on several together, and moves it along the
 * direction it already looks from, close enough that they fill the view.
 */
export function frameObject(
  controls: OrbitControls,
  objects: Object3D | Object3D[],
) {
  const camera = controls.object;
  if (!(camera instanceof PerspectiveCamera)) return;
  const box = new Box3();
  for (const object of [objects].flat()) {
    object.updateWorldMatrix(true, true);
    box.expandByObject(object);
  }
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new Sphere());

  // The narrower of the vertical and horizontal fields of view decides.
  const halfFov = MathUtils.degToRad(camera.fov) / 2;
  const fitAngle = Math.min(
    halfFov,
    Math.atan(Math.tan(halfFov) * camera.aspect),
  );
  const distance =
    Math.max(sphere.radius, MIN_FRAMED_RADIUS) / Math.sin(fitAngle);
  const direction = camera.position.clone().sub(controls.target).normalize();

  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  controls.update();
}
