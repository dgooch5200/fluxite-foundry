import { describe, test, expect } from "vitest";
import { getFileExtension } from "./state";

describe("getFileExtension", () => {
  test("names glTF models by their conventional extensions", () => {
    expect(getFileExtension("model/gltf-binary")).toBe("glb");
    expect(getFileExtension("model/gltf+json")).toBe("gltf");
  });
});
