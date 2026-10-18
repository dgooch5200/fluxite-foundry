import { describe, test, expect } from "vitest";
import { acceptsMediaType } from "./ResourceDefaultValue";

// A file the browser could not identify, as it reports for glTF models.
function untypedFile(name: string): File {
  return new File([], name);
}

describe("acceptsMediaType", () => {
  test("accepts a file whose reported type matches", () => {
    const file = new File([], "logo.png", { type: "image/png" });
    expect(acceptsMediaType(file, "image/png")).toBe(true);
  });

  test("accepts an untyped file by the extension of the expected type", () => {
    expect(
      acceptsMediaType(untypedFile("fixture.glb"), "model/gltf-binary"),
    ).toBe(true);
    expect(
      acceptsMediaType(untypedFile("FIXTURE.GLB"), "model/gltf-binary"),
    ).toBe(true);
  });

  test("accepts a generic binary file by the extension of the expected type", () => {
    const file = new File([], "fixture.glb", {
      type: "application/octet-stream",
    });
    expect(acceptsMediaType(file, "model/gltf-binary")).toBe(true);
  });

  test("rejects an untyped file with the wrong extension", () => {
    expect(acceptsMediaType(untypedFile("logo.png"), "model/gltf-binary")).toBe(
      false,
    );
  });

  test("rejects a typed file of a different type, whatever its name", () => {
    const file = new File([], "fixture.glb", { type: "image/png" });
    expect(acceptsMediaType(file, "model/gltf-binary")).toBe(false);
  });
});
