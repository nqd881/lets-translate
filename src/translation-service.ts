import * as vscode from "vscode";
import { getTranslator } from "./providers";
import { translateWithMode, type TranslationMode } from "./translation";
import { formatPreview, type Logger } from "./logging";

export async function translateText(text: string, log: Logger): Promise<string> {
  const config = vscode.workspace.getConfiguration("lets-translate");
  const source = config.get<string>("sourceLanguage", "auto");
  const target = config.get<string>("targetLanguage", "vi");
  const translator = getTranslator(config);
  const provider = config.get<string>("provider", "google");
  const mode = config.get<TranslationMode>("translationMode", "smart");

  log(`Translate start | provider=${provider} mode=${mode} source=${source} target=${target}`);
  log(`Text length=${text.length} preview="${formatPreview(text)}"`);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Translating...",
      cancellable: false
    },
    async () => {
      const result = await translateWithMode(text, mode,
        (block) => translator.translate(block, source, target));
      log(`Translate success | mode=${mode} length=${result.length}`);
      return result;
    }
  );
}
