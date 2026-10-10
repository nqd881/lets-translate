const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");

const moduleObject = { exports: {} };
const code = esbuild.transformSync(
  fs.readFileSync(path.join(__dirname, "../src/translation.ts"), "utf8"),
  { loader: "ts", format: "cjs", target: "node18" }
).code;
vm.runInNewContext(code, { module: moduleObject, exports: moduleObject.exports });
const { preprocessTranslation, translateWithMode } = moduleObject.exports;

async function checkTranslation(mode, source, inputs, expected) {
  const captured = [];
  const output = await translateWithMode(source, mode, async (text) => {
    captured.push(text);
    return text.toUpperCase();
  });
  assert.deepEqual(captured, inputs);
  assert.equal(output, expected);
}

test("preprocessing exposes literal and translation segments without provider calls", () => {
  // Normalize VM objects into this realm before strict structural comparison.
  const segments = JSON.parse(JSON.stringify(preprocessTranslation("one\ntwo\n\n", "smart")));
  assert.deepEqual(segments.filter((part) => part.kind === "translate"), [
    { kind: "translate", text: "one two", prefix: "", continuationPrefix: "" }
  ]);
  assert.equal(segments.filter((part) => part.kind === "literal").map((part) => part.text).join(""), "\n\n");
  assert.ok(segments.every((part) => part.kind === "literal" || part.kind === "translate"));
});

test("all sends the exact source once and returns the provider output unchanged", async () => {
  const source = "  first\r\n\r\n- second  \n```js\ncode\n```\n";
  const captured = [];
  const output = await translateWithMode(source, "all", async (text) => {
    captured.push(text);
    return "provider\nresult\r\n";
  });
  assert.deepEqual(captured, [source]);
  assert.equal(output, "provider\nresult\r\n");
});

test("lbl translates nonblank lines and preserves mixed separators and blank whitespace", async () => {
  await checkTranslation("lbl", "one\r\n\r\n \t\nsecond\nthird\r\n",
    ["one", "second", "third"], "ONE\r\n\r\n \t\nSECOND\nTHIRD\r\n");
});

test("smart joins soft breaks within paragraphs and preserves paragraph blanks", async () => {
  await checkTranslation("smart", "first line\nsecond line\n\n \t\nnext paragraph\ncontinued\n",
    ["first line second line", "next paragraph continued"],
    "FIRST LINE SECOND LINE\n\n \t\nNEXT PARAGRAPH CONTINUED\n");
});

test("smart retains CRLF paragraph separators", async () => {
  await checkTranslation("smart", "one\r\ntwo\r\n\r\nthree\r\n",
    ["one two", "three"], "ONE TWO\r\n\r\nTHREE\r\n");
});

test("blank-only lbl and smart inputs do not call the provider", async () => {
  for (const mode of ["lbl", "smart"]) {
    await checkTranslation(mode, "\r\n \t\n\n", [], "\r\n \t\n\n");
  }
});

test("smart joins list continuations while preserving markers and nested indentation", async () => {
  await checkTranslation("smart", "- first\n  continued\n  * nested\n    continuation\n- last\n",
    ["first continued", "nested continuation", "last"],
    "- FIRST CONTINUED\n  * NESTED CONTINUATION\n- LAST\n");
});

test("smart recognizes numbered and bullet list markers", async () => {
  await checkTranslation("smart", "1. first\n2) second\n* third\n+ fourth\n\u2022 fifth",
    ["first", "second", "third", "fourth", "fifth"],
    "1. FIRST\n2) SECOND\n* THIRD\n+ FOURTH\n\u2022 FIFTH");
});

test("smart preserves indentation for provider-added continuation lines", async () => {
  const captured = [];
  const output = await translateWithMode("  - first\n    continued", "smart", async (text) => {
    captured.push(text);
    return "translated\ncontinuation";
  });
  assert.deepEqual(captured, ["first continued"]);
  assert.equal(output, "  - translated\n    continuation");
});

test("smart preserves backtick and tilde fences without translating code", async () => {
  const source = "before\n\n```js\nconst value = 'keep';\n```\n\n~~~text\nkeep this too\n~~~\n\nafter";
  await checkTranslation("smart", source, ["before", "after"],
    "BEFORE\n\n```js\nconst value = 'keep';\n```\n\n~~~text\nkeep this too\n~~~\n\nAFTER");
});

test("smart preserves an unterminated fenced block including CRLF", async () => {
  await checkTranslation("smart", "before\r\n\r\n```js\r\nunchanged\r\n",
    ["before"], "BEFORE\r\n\r\n```js\r\nunchanged\r\n");
});

test("smart preserves explicit Markdown hard-break markers and their newlines", async () => {
  await checkTranslation("smart", "one  \r\ntwo\\\nthree   \nfour",
    ["one", "two", "three", "four"], "ONE  \r\nTWO\\\nTHREE   \nFOUR");
});

test("smart preserves ATX prefixes and optional closing hashes", async () => {
  await checkTranslation("smart", "# title\n\n  ## another title ##\n\nbody\ncontinued",
    ["title", "another title", "body continued"],
    "# TITLE\n\n  ## ANOTHER TITLE ##\n\nBODY CONTINUED");
});

test("smart translates setext titles but retains underline headings", async () => {
  await checkTranslation("smart", "title\n=====\n\nsubtitle\n-----\n\nbody",
    ["title", "subtitle", "body"], "TITLE\n=====\n\nSUBTITLE\n-----\n\nBODY");
});

test("smart preserves short setext underlines, separators, and empty markers", async () => {
  await checkTranslation("smart", "title\n=\n\nsubtitle\n--\n\n- - -\n# \n- ",
    ["title", "subtitle"], "TITLE\n=\n\nSUBTITLE\n--\n\n- - -\n# \n- ");
});

test("smart keeps abbreviation and decimal punctuation inside a complete paragraph", async () => {
  await checkTranslation("smart", "Dr. Smith measured 3.14 units.\nIt worked, e.g. for this sample.",
    ["Dr. Smith measured 3.14 units. It worked, e.g. for this sample."],
    "DR. SMITH MEASURED 3.14 UNITS. IT WORKED, E.G. FOR THIS SAMPLE.");
});

test("smart retains list context across hard breaks and nested items without absorbing outside prose", async () => {
  await checkTranslation("smart", "- first  \n  continued\nOutside paragraph",
    ["first", "continued", "Outside paragraph"], "- FIRST  \n  CONTINUED\nOUTSIDE PARAGRAPH");
  await checkTranslation("smart", "- parent\n  - child\n  parent continuation\nOutside paragraph",
    ["parent", "child", "parent continuation", "Outside paragraph"],
    "- PARENT\n  - CHILD\n  PARENT CONTINUATION\nOUTSIDE PARAGRAPH");
});

test("smart translates a wrapped setext heading as one block", async () => {
  await checkTranslation("smart", "A heading wrapped\nacross two lines\n---",
    ["A heading wrapped across two lines"], "A HEADING WRAPPED ACROSS TWO LINES\n---");
});

test("translations remain ordered despite different completion order and never exceed three active calls", async () => {
  const captured = [], pending = new Map();
  let active = 0, maximum = 0;
  const result = translateWithMode("one\ntwo\nthree\nfour\nfive", "lbl", (text) => {
    captured.push(text);
    maximum = Math.max(maximum, ++active);
    return new Promise((resolve) => pending.set(text, () => {
      active--;
      resolve(text.toUpperCase());
    }));
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  await tick();
  assert.deepEqual(captured, ["one", "two", "three"]);
  pending.get("three")();
  await tick();
  assert.deepEqual(captured, ["one", "two", "three", "four"]);
  pending.get("four")();
  await tick();
  assert.deepEqual(captured, ["one", "two", "three", "four", "five"]);
  pending.get("five")();
  pending.get("two")();
  pending.get("one")();
  assert.equal(await result, "ONE\nTWO\nTHREE\nFOUR\nFIVE");
  assert.equal(maximum, 3);
  assert.equal(active, 0);
});

test("a provider failure rejects the whole operation and stops dequeuing", async () => {
  const captured = [], pending = new Map();
  const failure = new Error("provider unavailable");
  const result = translateWithMode("one\ntwo\nthree\nfour\nfive", "lbl", (text) => {
    captured.push(text);
    return new Promise((resolve, reject) => pending.set(text, { resolve, reject }));
  });
  const rejection = assert.rejects(result, (error) => error === failure);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, ["one", "two", "three"]);
  pending.get("two").reject(failure);
  await new Promise((resolve) => setImmediate(resolve));
  // Already-running calls may finish, but no queued work may start after failure.
  pending.get("one").resolve("ONE");
  pending.get("three").resolve("THREE");
  await rejection;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(captured, ["one", "two", "three"]);
});
