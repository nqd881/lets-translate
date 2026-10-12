import * as vscode from "vscode";
import { layoutTranslation } from "./popup-layout";
import type { Logger } from "./logging";

export function createInlinePopup(log: Logger): {
  show(editor: vscode.TextEditor, range: vscode.Range, translated: string): void;
  dispose(): void;
} {
  const decorationType = vscode.window.createTextEditorDecorationType({});
  let decorationTimer: NodeJS.Timeout | undefined;
  let disposed = false;
  let activeDecoration:
    | {
        editor: vscode.TextEditor;
        range: vscode.Range;
        selection: vscode.Selection;
        lines: string[];
        width: number;
        maxWidth: number;
      }
    | undefined;

  const clear = (reason: string): void => {
    if (decorationTimer) {
      clearTimeout(decorationTimer);
      decorationTimer = undefined;
    }
    if (!activeDecoration) {
      return;
    }
    activeDecoration.editor.setDecorations(decorationType, []);
    activeDecoration = undefined;
    log(`Inline translation cleared | reason=${reason}`);
  };

  const isSameSelection = (a: vscode.Selection, b: vscode.Selection): boolean =>
    a.active.isEqual(b.active) && a.anchor.isEqual(b.anchor);

  const render = (): void => {
    if (!activeDecoration) {
      return;
    }
    const { editor, range, lines, width, maxWidth } = activeDecoration;
    const visible = editor.visibleRanges.find((candidate) => candidate.intersection(range));
    if (!visible) {
      editor.setDecorations(decorationType, []);
      return;
    }

    const lineCount = lines.length;
    const anchorLine = Math.max(range.start.line, visible.start.line);
    const above = range.start.line - lineCount - 1;
    const below = range.end.line + 1;
    const firstLine = visible.start.line + 1;
    const lastLine = visible.end.line - lineCount;
    const displayLine = above >= firstLine
      ? above
      : below <= lastLine
        ? below
        : Math.max(firstLine, Math.min(above, lastLine));

    const editorConfig = vscode.workspace.getConfiguration("editor", editor.document.uri);
    const fontSize = editorConfig.get<number>("fontSize", 14);
    const configuredLineHeight = editorConfig.get<number>("lineHeight", 0);
    const lineHeight = configuredLineHeight === 0
      ? Math.round(fontSize * 1.5)
      : configuredLineHeight < 8
        ? Math.round(fontSize * configuredLineHeight)
        : configuredLineHeight;
    // VS Code truncates contentText at newlines. Escape CSS content for one multiline block.
    const content = lines.join("\n").replace(/[\\'\x00-\x1f\x7f]/g,
      (character) => `\\${character.codePointAt(0)!.toString(16)} `);
    const position = new vscode.Position(anchorLine,
      anchorLine === visible.start.line ? visible.start.character : 0);
    editor.setDecorations(decorationType, [{
      range: new vscode.Range(position, position),
      renderOptions: {
        before: {
          contentText: "",
          backgroundColor: new vscode.ThemeColor("editorHoverWidget.background"),
          color: new vscode.ThemeColor("editorHoverWidget.foreground"),
          border: "2px solid",
          borderColor: new vscode.ThemeColor("focusBorder"),
          textDecoration:
            `none; content: '${content}'; border-radius: 3px; ` +
            `padding: 0 4px; width: calc(${width}ch + 12px); ` +
            `max-width: calc(${maxWidth}ch + 12px); ` +
            "font-style: normal; font-weight: 400; font-size: inherit; font-family: inherit; " +
            `line-height: ${lineHeight}px; position: absolute; top: 0; ` +
            "display: inline-block; white-space: pre; z-index: 1000; pointer-events: none; " +
            `transform: translateY(${(displayLine - anchorLine) * lineHeight}px); ` +
            "height: auto; box-sizing: border-box; margin: 0; overflow: visible;"
        }
      }
    }]);
  };

  const show = (editor: vscode.TextEditor, range: vscode.Range, translated: string): void => {
    if (disposed) {
      return;
    }
    clear("replaced");
    const config = vscode.workspace.getConfiguration("lets-translate", editor.document.uri);
    const layout = layoutTranslation(translated, config.get<number>("popupMaxWidth", 80));
    activeDecoration = { editor, range, selection: editor.selection, ...layout };
    render();
    log(`Inline translation displayed | anchor=${range.start.line}:${range.start.character} lines=${layout.lines.length} maxWidth=${layout.maxWidth}`);

    const timeout = config.get<number>("popupTimeout", 0);
    if (Number.isFinite(timeout) && timeout > 0) {
      decorationTimer = setTimeout(() => clear("timeout"), Math.min(timeout * 1000, 2147483647));
    }
  };

  const listeners = [
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (event.textEditor === activeDecoration?.editor) {
        render();
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (!activeDecoration || event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
        return;
      }
      if (event.textEditor !== activeDecoration.editor) {
        clear("selection-change-editor");
        return;
      }
      if (event.selections[0] && !isSameSelection(event.selections[0], activeDecoration.selection)) {
        clear("selection-change");
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => clear("active-editor-change")),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === activeDecoration?.editor.document) {
        clear("text-input");
      }
    })
  ];

  return {
    show,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      clear("disposed");
      for (const listener of listeners) {
        listener.dispose();
      }
      decorationType.dispose();
    }
  };
}
