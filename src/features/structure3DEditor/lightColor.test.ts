import { describe, expect, test } from "vitest";
import { Color } from "three";
import { schemeColor } from "./lightColor";

function expectColor(
  actual: Color | undefined,
  expected: number[],
  digits = 2,
) {
  expect(actual).toBeDefined();
  actual!
    .toArray()
    .forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, digits));
}

describe("schemeColor", () => {
  test("reads RGB and CMY as display colors", () => {
    expectColor(schemeColor("rgb", { red: 1, green: 0, blue: 0 }), [1, 0, 0]);
    // Half in sRGB is about a fifth in linear light.
    expectColor(
      schemeColor("rgb", { red: 0.5, green: 0.5, blue: 0.5 }),
      [0.214, 0.214, 0.214],
    );
    expectColor(
      schemeColor("cmy", { cyan: 0, magenta: 1, yellow: 1 }),
      [1, 0, 0],
    );
  });

  test("reads hue in degrees", () => {
    expectColor(
      schemeColor("hsv", { hue: 120, saturation: 1, value: 1 }),
      [0, 1, 0],
    );
    expectColor(
      schemeColor("hsv", { hue: 480, saturation: 1, value: 1 }),
      [0, 1, 0],
    );
    expectColor(
      schemeColor("hsv", { hue: 0, saturation: 0, value: 1 }),
      [1, 1, 1],
    );
  });

  test("makes D65 white from its xy, u'v' and XYZ", () => {
    expectColor(schemeColor("xy", { x: 0.3127, y: 0.329 }), [1, 1, 1]);
    expectColor(schemeColor("uv", { u: 0.1978, v: 0.4683 }), [1, 1, 1]);
    expectColor(schemeColor("xyz", { x: 0.9505, y: 1, z: 1.089 }), [1, 1, 1]);
  });

  test("keeps colors outside sRGB from going negative", () => {
    const deepRed = schemeColor("xy", { x: 0.7, y: 0.29 })!;

    expect(Math.min(deepRed.r, deepRed.g, deepRed.b)).toBe(0);
    expect(deepRed.r).toBe(1);
  });

  test("warms with a lower color temperature, and tints green above the locus", () => {
    const daylight = schemeColor("cct", { cct: 6504, tint: 0 })!;
    const tungsten = schemeColor("cct", { cct: 3000, tint: 0 })!;
    const green = schemeColor("cct", { cct: 4000, tint: 0.02 })!;
    const magenta = schemeColor("cct", { cct: 4000, tint: -0.02 })!;

    expect(Math.min(daylight.r, daylight.g, daylight.b)).toBeGreaterThan(0.85);
    expect(tungsten.r).toBeGreaterThan(tungsten.g);
    expect(tungsten.g).toBeGreaterThan(tungsten.b);
    expect(green.g / green.r).toBeGreaterThan(magenta.g / magenta.r);
  });

  test("is undefined while a component has no value", () => {
    expect(schemeColor("rgb", { red: 1, green: 1 })).toBeUndefined();
  });
});
