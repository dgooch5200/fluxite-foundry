import mark from "./AppLogoMark.svg?raw";
import indexHtml from "../../../index.html?raw";

test("index.html loading screen draws the current app mark", () => {
  const paths = [...mark.matchAll(/\bd=(['"])(.*?)\1/g)].map((m) => m[2]);
  expect(paths).toHaveLength(2);
  for (const d of paths) {
    expect(indexHtml).toContain(`d="${d}"`);
  }
});
