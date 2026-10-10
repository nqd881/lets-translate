import * as vscode from "vscode";
import { createLogger, formatError } from "./logging";
import { createInlinePopup } from "./inline-popup";
import { translateText } from "./translation-service";

console.log("Let's Translate: File loaded");

export function activate(context: vscode.ExtensionContext): void {
  console.log("Let's Translate is now active!");
  vscode.window.showInformationMessage("Let's Translate is now active!");
  const logger = createLogger();
  const { log } = logger;
  const popup = createInlinePopup(log);
  let disposed = false;
  context.subscriptions.push({ dispose: () => { disposed = true; } }, popup, logger);

  const runTranslateSelection = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    log("Translate Selection invoked.");
    const editor = vscode.window.activeTextEditor;
    const range = editor?.selection;
    const documentVersion = editor?.document.version;
    const selectionText = range ? editor?.document.getText(range) : undefined;

    if (!selectionText?.trim()) {
      vscode.window.showWarningMessage("No text selected.");
      return;
    }

    try {
      const translated = await translateText(selectionText, log);
      if (disposed) {
        return;
      }
      log(`Translate Selection translated | length=${translated.length}`);
      if (editor && range && vscode.window.activeTextEditor === editor &&
          editor.document.version === documentVersion) {
        popup.show(editor, range, translated);
      }
    } catch (error) {
      if (disposed) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      log("Translate Selection failed.");
      log(formatError(error));
      vscode.window.showErrorMessage(message);
    }
  };

  const translateSelection = vscode.commands.registerCommand(
    "lets-translate.translateSelection",
    runTranslateSelection
  );

  const translateInput = vscode.commands.registerCommand(
    "lets-translate.translateInput",
    async () => {
      if (disposed) {
        return;
      }
      log("Translate Input invoked.");
      const input = await vscode.window.showInputBox({
        prompt: "Enter text to translate",
        ignoreFocusOut: true
      });

      if (disposed || !input?.trim()) {
        return;
      }

      try {
        const translated = await translateText(input, log);
        if (disposed) {
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const range = new vscode.Range(editor.selection.active, editor.selection.active);
          popup.show(editor, range, translated);
        } else {
          vscode.window.setStatusBarMessage(translated, 8000);
        }
      } catch (error) {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        log("Translate Input failed.");
        log(formatError(error));
        vscode.window.showErrorMessage(message);
      }
    }
  );

  context.subscriptions.push(translateSelection, translateInput);
}

export function deactivate(): void {
  void 0;
}
