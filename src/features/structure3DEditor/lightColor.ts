// The colors E1.73-3's abstracted color control schemes ask for, as three.js
// colors in its linear working space, for drawing a beam's light.

import { Color, MathUtils, Matrix3, SRGBColorSpace, Vector3 } from "three";
import { EmitterColorScheme } from "app/persistentState";

// CIE 1931 XYZ to linear sRGB, for the D65 white point.
// prettier-ignore
const XYZ_TO_LINEAR_SRGB = new Matrix3().set(
   3.2404542, -1.5371385, -0.4985314,
  -0.969266,   1.8760108,  0.041556,
   0.0556434, -0.2040259,  1.0572252,
);

/**
 * A color scaled down until no channel is past 1, and with negative channels,
 * from chromaticities outside what sRGB can show, raised to 0.
 */
export function fitToWhite(color: Color): Color {
  color.setRGB(
    Math.max(color.r, 0),
    Math.max(color.g, 0),
    Math.max(color.b, 0),
  );
  const brightest = Math.max(color.r, color.g, color.b);
  return brightest > 1 ? color.multiplyScalar(1 / brightest) : color;
}

function fromXyz(x: number, y: number, z: number): Color {
  const rgb = new Vector3(x, y, z).applyMatrix3(XYZ_TO_LINEAR_SRGB);
  return fitToWhite(new Color(rgb.x, rgb.y, rgb.z));
}

// A chromaticity as a color at full brightness.
function fromChromaticity(x: number, y: number): Color {
  if (y <= 0) return new Color(0, 0, 0);
  const color = fromXyz(x / y, 1, (1 - x - y) / y);
  const brightest = Math.max(color.r, color.g, color.b);
  return brightest > 0 ? color.multiplyScalar(1 / brightest) : color;
}

// CIE 1976 u'v' to CIE 1931 xy.
function fromUv(u: number, v: number): Color {
  const d = 6 * u - 16 * v + 12;
  return d === 0
    ? new Color(0, 0, 0)
    : fromChromaticity((9 * u) / d, (4 * v) / d);
}

// The Planckian locus in CIE 1960 uv, by Krystek's approximation, which holds
// from 1000 K to 15000 K.
function planckianUv(kelvin: number): [number, number] {
  const t = MathUtils.clamp(kelvin, 1000, 15000);
  return [
    (0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t) /
      (1 + 8.42420235e-4 * t + 7.08145163e-7 * t * t),
    (0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t) /
      (1 - 2.89741816e-5 * t + 1.61456053e-7 * t * t),
  ];
}

// A correlated color temperature and its tint, in Duv: how far, in CIE 1960
// uv, the color sits above (green) or below (magenta) the Planckian locus.
function fromCct(kelvin: number, duv: number): Color {
  const [u, v] = planckianUv(kelvin);
  const [u2, v2] = planckianUv(kelvin + 1);
  // The locus's normal, turned to point above it, toward higher v.
  const length = Math.hypot(u2 - u, v2 - v) || 1;
  let [nu, nv] = [-(v2 - v) / length, (u2 - u) / length];
  if (nv < 0) [nu, nv] = [-nu, -nv];
  // CIE 1960 v is 2/3 of CIE 1976 v'.
  return fromUv(u + duv * nu, (v + duv * nv) * 1.5);
}

// Display (sRGB) components from 0 to 1.
function fromSrgb(r: number, g: number, b: number): Color {
  const clamp = (value: number) => MathUtils.clamp(value, 0, 1);
  return new Color().setRGB(clamp(r), clamp(g), clamp(b), SRGBColorSpace);
}

function fromHsv(hueDegrees: number, saturation: number, value: number): Color {
  const h = (((hueDegrees % 360) + 360) % 360) / 360;
  const s = MathUtils.clamp(saturation, 0, 1);
  const v = MathUtils.clamp(value, 0, 1);
  const lightness = v * (1 - s / 2);
  const hslSaturation =
    lightness === 0 || lightness === 1
      ? 0
      : (v - lightness) / Math.min(lightness, 1 - lightness);
  return new Color().setHSL(h, hslSaturation, lightness, SRGBColorSpace);
}

// Each scheme's components, by the names the emitters structure gives them,
// and the color their values ask for, in that order.
const SCHEMES: Record<
  EmitterColorScheme,
  { components: string[]; color: (values: number[]) => Color }
> = {
  rgb: {
    components: ["red", "green", "blue"],
    color: ([r, g, b]) => fromSrgb(r!, g!, b!),
  },
  cmy: {
    components: ["cyan", "magenta", "yellow"],
    color: ([c, m, y]) => fromSrgb(1 - c!, 1 - m!, 1 - y!),
  },
  hsv: {
    components: ["hue", "saturation", "value"],
    color: ([h, s, v]) => fromHsv(h!, s!, v!),
  },
  xy: { components: ["x", "y"], color: ([x, y]) => fromChromaticity(x!, y!) },
  xyz: {
    components: ["x", "y", "z"],
    color: ([x, y, z]) => fromXyz(x!, y!, z!),
  },
  uv: { components: ["u", "v"], color: ([u, v]) => fromUv(u!, v!) },
  cct: { components: ["cct", "tint"], color: ([k, duv]) => fromCct(k!, duv!) },
};

/**
 * The color a scheme asks for, given its components' values by name.
 * Undefined if a component has no value.
 */
export function schemeColor(
  scheme: EmitterColorScheme,
  components: Readonly<Partial<Record<string, number>>>,
): Color | undefined {
  const { components: names, color } = SCHEMES[scheme];
  const values = names.map((name) => components[name]);
  return values.every((value) => value !== undefined)
    ? color(values as number[])
    : undefined;
}
