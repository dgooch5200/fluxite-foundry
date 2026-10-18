import mark from "./AppLogoMark.svg?raw";
import indexHtml from "../../../index.html?raw";

// The loading screen in index.html paints before any JS runs, so it carries
// its own copy of the mark's paths instead of importing this file.
test("index.html loading screen draws the current app mark", () => {
  const paths = [...mark.matchAll(/\bd=(['"])(.*?)\1/g)].map((m) => m[2]);
  expect(paths).toHaveLength(2);
  for (const d of paths) {
    expect(indexHtml).toContain(`d="${d}"`);
  }
});
