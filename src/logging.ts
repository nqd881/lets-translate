import * as vscode from "vscode";

export type Logger = (message: string) => void;

export function createLogger(): { log: Logger; dispose(): void } {
  const outputChannel = vscode.window.createOutputChannel("Let's Translate");
  let disposed = false;
  return {
    log: (message) => {
      if (disposed) {
        return;
      }
      const time = new Date().toISOString();
      outputChannel.appendLine(`[${time}] ${message}`);
    },
    dispose: () => {
      if (!disposed) {
        disposed = true;
        outputChannel.dispose();
      }
    }
  };
}

export function formatPreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) {
    return normalized;
  }
  return `${normalized.slice(0, 80)}...`;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}
