const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");
const manifest = require("../package.json");

test("scrolling redraws one translation block without resetting its lifetime", async () => {
  class Position {
    constructor(line, character) { Object.assign(this, { line, character }); }
    isEqual(other) { return this.line === other.line && this.character === other.character; }
  }
  class Range {
    constructor(start, end) { Object.assign(this, { start, end }); }
    intersection(other) {
      return this.start.line <= other.end.line && this.end.line >= other.start.line
        ? this : undefined;
    }
  }
  const source = new Range(new Position(8, 0), new Position(10, 5));
  const selection = Object.assign(source, {
    anchor: source.start, active: source.end, isEmpty: false
  });
  const document = {
    uri: "test", version: 1, lineCount: 40,
    getText: () => "hello\nworld\nagain"
  };
  const editor = {
    document, selection,
    visibleRanges: [new Range(new Position(0, 0), new Position(19, 10))],
    decorations: [],
    setDecorations(type, values) { this.decorations = values; }
  };
  const handlers = {}, commands = {}, timers = new Map();
  let timeout = 0, timerId = 0, requests = 0, outputShows = 0;
  let mode;
  let popupMaxWidth;
  let apiKey = "fake";
  let targetLanguage;
  let responseGate;
  let inputGate;
  let outputDisposed = false;
  let decorationDisposed = false;
  let input = "hello\nworld\nagain";
  let translated = "translated ' \\\nsecond\nthird";
  const captured = [];
  const targets = [];
  const configurationReads = [];
  const errors = [];
  document.getText = () => input;
  const register = (name) => (callback) => {
    handlers[name] = callback;
    return { dispose: () => { delete handlers[name]; } };
  };
  const vscode = {
    Position, Range,
    TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2 },
    ProgressLocation: { Notification: 15 },
    window: {
      activeTextEditor: editor,
      showInformationMessage() {}, showWarningMessage() {},
      showErrorMessage(message) { errors.push(message); },
      createOutputChannel: (name) => {
        assert.equal(name, "Let's Translate");
        return {
          dispose: () => { outputDisposed = true; },
          appendLine() { assert.equal(outputDisposed, false, "cleanup logs before Output is disposed"); },
          show() { outputShows++; }
        };
      },
      createTextEditorDecorationType: () => ({ dispose: () => { decorationDisposed = true; } }),
      withProgress: async (options, callback) => callback(),
      onDidChangeTextEditorSelection: register("selection"),
      onDidChangeActiveTextEditor: register("editor"),
      onDidChangeTextEditorVisibleRanges: register("viewport"),
      showInputBox: async () => {
        if (inputGate) await inputGate;
        return input;
      }
    },
    workspace: {
      getConfiguration: (section) => {
        configurationReads.push(section);
        const settings = section === "lets-translate" ? {
            provider: "google", "google.apiKey": apiKey, popupTimeout: timeout,
             translationMode: mode, popupMaxWidth, targetLanguage
          } : {};
        return { get: (key, fallback) => settings[key] ?? fallback };
      },
      onDidChangeTextDocument: register("document")
    },
    commands: {
      registerCommand: (name, callback) => {
        assert.equal(commands[name], undefined, `command ${name} must not be overwritten`);
        commands[name] = callback;
        return { dispose: () => { delete commands[name]; } };
      }
    }
  };
  const axios = {
    post: async (url, body, options) => {
      requests++;
      captured.push(options.params.q);
      targets.push(options.params.target);
      if (responseGate) await responseGate;
      return { data: { data: { translations: [{ translatedText: translated }] } } };
    }
  };
  const moduleObject = { exports: {} };
  const code = esbuild.buildSync({
    entryPoints: [path.join(__dirname, "../src/extension.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", target: "node18",
    external: ["vscode", "axios", "crypto"]
  }).outputFiles[0].text;
  vm.runInNewContext(code, {
    module: moduleObject, exports: moduleObject.exports,
    console: { log() {} },
    require: (name) => name === "vscode" ? vscode : name === "axios" ? axios : require(name),
    setTimeout: (callback, ms) => {
      const id = ++timerId;
      timers.set(id, { callback, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id)
  });
  const context = { subscriptions: [] };
  await moduleObject.exports.activate(context);
  for (const command of manifest.contributes.commands) {
    assert.equal(typeof commands[command.command], "function", "manifest commands match registrations");
  }
  assert.deepEqual(Object.keys(commands).sort(), manifest.contributes.commands.map((item) => item.command).sort(),
    "only the contributed commands are registered");
  const translate = commands["lets-translate.translateSelection"];
  const style = () => editor.decorations[0].renderOptions.before.textDecoration;
  const scroll = (start, end) => {
    editor.visibleRanges = [new Range(new Position(start, 0), new Position(end, 10))];
    handlers.viewport({ textEditor: editor });
  };

  await translate();
  assert.deepEqual(captured, ["hello world again"], "smart is the default for selected text");
  assert.deepEqual(targets, ["vi"], "the runtime default target is Vietnamese");
  assert.equal(timers.size, 0, "default has no timeout");
  assert.match(style(), /max-width: calc\(80ch \+ 10px\)/, "default maximum width is 80 columns");
  assert.equal(editor.decorations.length, 1, "multiline text uses one decoration");
  assert.equal((style().match(/\\a /g) ?? []).length, 2, "all three translated lines are retained");
  assert.match(style(), /\\27 /, "quotes are escaped in CSS content");
  assert.match(style(), /\\5c /, "backslashes are escaped in CSS content");
  assert.match(style(), /translateY\(-84px\)/, "place above when there is room");
  scroll(8, 19);
  assert.match(style(), /translateY\(63px\)/, "place below near viewport top");
  scroll(9, 19);
  assert.equal(editor.decorations[0].range.start.line, 9, "use a visible anchor for partial selection");
  assert.match(style(), /translateY\(42px\)/);
  editor.visibleRanges[0].start = new Position(9, 3);
  handlers.viewport({ textEditor: editor });
  assert.equal(editor.decorations[0].range.start.character, 3, "anchor in the visible wrapped segment");
  scroll(12, 25);
  assert.equal(editor.decorations.length, 0, "hide when source is off-screen");
  scroll(0, 19);
  assert.equal(editor.decorations.length, 1, "restore on scroll back");
  assert.equal(requests, 1, "scrolling does not request more translations");

  timeout = 3;
  await translate();
  const [id, timer] = [...timers.entries()][0];
  assert.equal(timer.ms, 3000);
  scroll(8, 19);
  scroll(12, 25);
  scroll(0, 19);
  assert.equal(timers.size, 1);
  assert.equal(timers.get(id), timer, "scrolling must preserve the existing timer");
  scroll(12, 25);
  timer.callback();
  scroll(0, 19);
  assert.equal(editor.decorations.length, 0, "expired hidden results must not return");
  assert.equal(timers.size, 0);

  timeout = 0;
  await translate();
  handlers.selection({ textEditor: editor, kind: 1, selections: [selection] });
  assert.equal(editor.decorations.length, 1, "keyboard events do not dismiss");
  scroll(12, 25);
  handlers.document({ document });
  scroll(0, 19);
  assert.equal(editor.decorations.length, 0, "document edits clear hidden results");
  await translate();
  const moved = { anchor: new Position(15, 0), active: new Position(15, 0) };
  handlers.selection({ textEditor: editor, kind: 2, selections: [moved] });
  scroll(0, 19);
  assert.equal(editor.decorations.length, 0, "mouse dismissal must survive redraw");
  assert.equal(outputShows, 0);

  mode = "all";
  input = "  first\r\n\r\n- second  ";
  translated = "one\ntwo\nthree\nfour";
  await translate();
  assert.equal(captured.at(-1), input, "all sends the untrimmed selected text");
  assert.equal((style().match(/\\a /g) ?? []).length, 3, "provider-added lines are not truncated");
  translated = "single paragraph";
  await translate();
  assert.equal((style().match(/\\a /g) ?? []).length, 0, "no padding to the source line count");

  mode = "lbl";
  input = "one\n\ntwo";
  await commands["lets-translate.translateInput"]();
  assert.deepEqual(captured.slice(-2), ["one", "two"], "input translation uses the configured mode");
  mode = undefined;
  input = "one\ncontinued\n\n- item\n  continued";
  await commands["lets-translate.translateInput"]();
  assert.deepEqual(captured.slice(-2), ["one continued", "item continued"], "input defaults to smart");
  assert.equal(outputShows, 0);
  popupMaxWidth = 20;
  mode = "all";
  input = "source";
  translated = "alpha beta gamma delta epsilon";
  await translate();
  assert.match(style(), /max-width: calc\(20ch \+ 10px\)/);
  assert.equal((style().match(/\\a /g) ?? []).length, 2, "placement uses three wrapped display lines");
  assert.match(style(), /translateY\(-84px\)/, "wrapped height is used for above-source positioning");
  assert.match(style(), /epsilon/, "the paragraph ending is displayed");
  const callsBeforeScroll = requests;
  scroll(8, 19);
  assert.match(style(), /translateY\(63px\)/, "wrapped box repositions below on scroll");
  assert.equal(requests, callsBeforeScroll, "display wrapping makes no extra translation requests");
  scroll(0, 19);
  targetLanguage = "en";
  await translate();
  assert.equal(targets.at(-1), "en", "explicit target language overrides the default");
  targetLanguage = undefined;

  let release;
  responseGate = new Promise((resolve) => { release = resolve; });
  const pendingSelection = translate();
  editor.selection = {
    start: new Position(12, 0), end: new Position(12, 5),
    anchor: new Position(12, 0), active: new Position(12, 5), isEmpty: false
  };
  release();
  await pendingSelection;
  assert.equal(editor.decorations[0].range.start.line, 8, "pending requests retain the original selection anchor");
  editor.selection = selection;

  responseGate = new Promise((resolve) => { release = resolve; });
  const pendingEdit = translate();
  document.version++;
  handlers.document({ document });
  release();
  await pendingEdit;
  assert.equal(editor.decorations.length, 0, "document edits prevent stale results from appearing");
  responseGate = undefined;
  responseGate = new Promise((resolve) => { release = resolve; });
  const pendingEditorSwitch = translate();
  const originalEditor = vscode.window.activeTextEditor;
  vscode.window.activeTextEditor = undefined;
  handlers.editor();
  release();
  await pendingEditorSwitch;
  assert.equal(editor.decorations.length, 0, "editor switches prevent pending results from appearing");
  vscode.window.activeTextEditor = originalEditor;
  responseGate = undefined;
  assert.equal(errors.length, 0);
  apiKey = undefined;
  const requestsBeforeMissingKey = requests;
  await translate();
  assert.equal(requests, requestsBeforeMissingKey, "a missing API key prevents a provider request");
  assert.equal(errors.pop(), "Google API key is not configured.");
  assert.ok(configurationReads.every((section) => section === "lets-translate" || section === "editor"),
    "only extension and editor settings are read");
  apiKey = "fake";
  timeout = 3;
  await translate();
  let releaseSuccess, rejectFailure, releaseInput;
  responseGate = new Promise((resolve) => { releaseSuccess = resolve; });
  const lateSuccess = translate();
  responseGate = new Promise((resolve, reject) => { rejectFailure = reject; });
  const lateFailure = translate();
  inputGate = new Promise((resolve) => { releaseInput = resolve; });
  const lateInput = commands["lets-translate.translateInput"]();
  const requestsBeforeDisposal = requests;
  for (const subscription of context.subscriptions) subscription.dispose();
  releaseSuccess();
  rejectFailure(new Error("late provider failure"));
  releaseInput();
  await Promise.all([lateSuccess, lateFailure, lateInput]);
  assert.equal(requests, requestsBeforeDisposal, "input resolving after disposal cannot start a request");
  assert.equal(errors.length, 0, "late provider completion must not display errors or reject commands");
  assert.equal(timers.size, 0, "disposal cancels timers");
  assert.equal(editor.decorations.length, 0, "disposal clears the rendered result");
  assert.equal(decorationDisposed, true, "popup owns decoration disposal");
  assert.equal(outputDisposed, true, "logging owns Output channel disposal");
  assert.deepEqual(Object.keys(handlers), [], "popup owns and removes all event listeners");
  assert.deepEqual(Object.keys(commands), [], "command registrations are disposed");

});

test("release metadata exposes only project commands and settings and preserves language support", () => {
  const lock = require("../package-lock.json");
  assert.equal(manifest.name, "lets-translate");
  assert.equal(manifest.displayName, "Let's Translate");
  assert.equal(manifest.publisher, "nqd881");
  assert.equal(manifest.repository.url, "https://github.com/nqd881/lets-translate.git");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.packages[""].name, manifest.name);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
  const contributed = manifest.contributes.commands.map((item) => item.command);
  assert.deepEqual(contributed, ["lets-translate.translateSelection", "lets-translate.translateInput"]);
  assert.ok(manifest.contributes.commands.every((item) => item.category === "Let's Translate"));
  for (const item of manifest.contributes.keybindings) assert.ok(contributed.includes(item.command));
  for (const item of manifest.contributes.menus["editor/context"]) assert.ok(contributed.includes(item.command));
  assert.deepEqual(manifest.activationEvents, contributed.map((command) => `onCommand:${command}`));
  const settings = manifest.contributes.configuration.properties;
  assert.ok(Object.keys(settings).every((key) => key.startsWith("lets-translate.")));
  for (const language of ["sourceLanguage", "targetLanguage"]) {
    const schema = settings[`lets-translate.${language}`];
    assert.equal(schema.enum.length, schema.enumItemLabels.length);
    assert.ok(schema.enum.includes("zh-CN") && schema.enum.includes("zh-TW"));
    assert.ok(schema.enumItemLabels.every((label) => !/\p{Script=Han}/u.test(label)));
  }
  assert.equal(settings["lets-translate.targetLanguage"].default, "vi");
  assert.equal(settings["lets-translate.translationMode"].default, "smart");
});
