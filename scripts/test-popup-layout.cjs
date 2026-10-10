const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");

const moduleObject = { exports: {} };
const code = esbuild.transformSync(
  fs.readFileSync(path.join(__dirname, "../src/popup-layout.ts"), "utf8"),
  { loader: "ts", format: "cjs", target: "node18" }
).code;
vm.runInNewContext(code, { module: moduleObject, exports: moduleObject.exports });
const { layoutTranslation } = moduleObject.exports;
const contentLines = (layout) => Array.from(layout.lines, (line) => line.slice(5));

test("short translations stay compact without synthetic trailing padding", () => {
  const layout = layoutTranslation("hello");
  assert.equal(layout.maxWidth, 80);
  assert.equal(layout.width, 10);
  assert.deepEqual(contentLines(layout), ["hello"]);
});

test("long paragraphs wrap at spaces and retain their complete ending", () => {
  const source = "alpha beta gamma delta epsilon";
  const layout = layoutTranslation(source, 20);
  assert.deepEqual(contentLines(layout), ["alpha beta ", "gamma delta ", "epsilon"]);
  assert.equal(contentLines(layout).join(""), source);
  assert.ok(layout.lines.every((line) => line.length <= 20));
  assert.ok(layout.width <= 20);
});

test("URLs and long words wrap without losing characters", () => {
  for (const source of ["x".repeat(200), "https://example.com/" + "longpath".repeat(20)]) {
    const layout = layoutTranslation(source, 30);
    assert.equal(contentLines(layout).join(""), source);
    assert.ok(layout.lines.every((line) => line.length <= 30));
    assert.ok(layout.width <= 30);
  }
});

test("paragraph breaks, blank lines, CRLF, and original trailing spaces survive layout", () => {
  assert.deepEqual(contentLines(layoutTranslation("first\r\n\r\n\r\nsecond  \r\n")),
    ["first", "", "", "second  ", ""]);
});

test("list continuation lines align with content rather than repeat the marker", () => {
  for (const marker of ["- ", "* ", "+ ", "12. ", "3) ", "\u2022 "]) {
    const prefix = "  " + marker;
    const source = "one two three four five six seven eight";
    const layout = layoutTranslation(prefix + source, 25);
    const lines = contentLines(layout);
    assert.ok(lines[0].startsWith(prefix));
    assert.ok(lines.slice(1).every((line) => line.startsWith(" ".repeat(prefix.length))));
    assert.equal(lines[0].slice(prefix.length) + lines.slice(1).map((line) => line.slice(prefix.length)).join(""), source);
    assert.ok(layout.width <= 25);
  }
});

test("indented text keeps its indentation and tabs are expanded for predictable width", () => {
  const source = "one two three four five six";
  const lines = contentLines(layoutTranslation("\t" + source, 25));
  assert.ok(lines.every((line) => line.startsWith("    ")));
  assert.equal(lines.map((line) => line.slice(4)).join(""), source);
});

test("CJK text uses two columns per character and remains complete", () => {
  const source = "\u4e2d\u6587\u6d4b\u8bd5".repeat(10);
  const layout = layoutTranslation(source, 20);
  assert.equal(contentLines(layout).join(""), source);
  assert.ok(contentLines(layout).every((line) => [...line].length <= 7));
  assert.ok(layout.width <= 20);
});

test("emoji, combining accents, flags, and ZWJ families are never split into partial graphemes", () => {
  const graphemes = ["\u{1f600}", "e\u0301", "\u{1f1fb}\u{1f1f3}",
    "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}", "1\ufe0f\u20e3"];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const grapheme of graphemes) {
    const source = grapheme.repeat(30);
    const layout = layoutTranslation(source, 20);
    assert.equal(contentLines(layout).join(""), source);
    for (const line of contentLines(layout)) {
      assert.ok([...segmenter.segment(line)].every((part) => part.segment === grapheme));
    }
    assert.ok(layout.width <= 20);
  }
});

test("excessive indentation still makes progress without dropping source text", () => {
  const source = " ".repeat(50) + "ending";
  const layout = layoutTranslation(source, 20);
  assert.ok(layout.width <= 20);
  assert.equal(contentLines(layout).join(""), source);
});

test("invalid settings use the default or clamp to the supported range", () => {
  assert.equal(layoutTranslation("text", NaN).maxWidth, 80);
  assert.equal(layoutTranslation("text", Infinity).maxWidth, 80);
  assert.equal(layoutTranslation("text", 0).maxWidth, 20);
  assert.equal(layoutTranslation("text", 500).maxWidth, 240);
  assert.equal(layoutTranslation("text", 40.5).maxWidth, 40);
});
