import { Box3, MathUtils, Object3D, PerspectiveCamera, Sphere } from "three";
import { OrbitControls } from "three-stdlib";

const ORBIT_STEP = MathUtils.degToRad(15);

// About four notches of the scroll wheel.
const ZOOM_STEP = 0.8;

// Keeps the camera off the target when framing something with no size.
const MIN_FRAMED_RADIUS = 0.05;

export type OrbitDirection = "left" | "right" | "up" | "down";

export function orbitCamera(
  controls: OrbitControls,
  direction: OrbitDirection,
) {
  const azimuth = controls.getAzimuthalAngle();
  const polar = controls.getPolarAngle();
  if (direction === "left") controls.setAzimuthalAngle(azimuth - ORBIT_STEP);
  if (direction === "right") controls.setAzimuthalAngle(azimuth + ORBIT_STEP);
  if (direction === "up") controls.setPolarAngle(polar - ORBIT_STEP);
  if (direction === "down") controls.setPolarAngle(polar + ORBIT_STEP);
}

export function zoomCamera(controls: OrbitControls, direction: "in" | "out") {
  if (direction === "in") controls.dollyIn(ZOOM_STEP);
  else controls.dollyOut(ZOOM_STEP);
}

export function frameObject(controls: OrbitControls, object: Object3D) {
  const camera = controls.object;
  if (!(camera instanceof PerspectiveCamera)) return;
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
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
