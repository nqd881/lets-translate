import axios from "axios";
import * as crypto from "crypto";
import type * as vscode from "vscode";

export interface Translator {
  translate(text: string, source: string, target: string): Promise<string>;
}

class GoogleTranslator implements Translator {
  constructor(private readonly apiKey: string) {}

  async translate(text: string, source: string, target: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Google API key is not configured.");
    }

    const params: Record<string, string> = {
      q: text,
      target,
      key: this.apiKey
    };

    if (source && source !== "auto") {
      params.source = source;
    }

    const response = await axios.post(
      "https://translation.googleapis.com/language/translate/v2",
      null,
      { params }
    );

    const translated = response.data?.data?.translations?.[0]?.translatedText;
    if (!translated) {
      throw new Error("Google translation failed.");
    }

    return translated;
  }
}

class DeepLTranslator implements Translator {
  constructor(private readonly apiKey: string, private readonly apiUrl: string) {}

  async translate(text: string, source: string, target: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("DeepL API key is not configured.");
    }

    // DeepL uses uppercase language codes and specific formats
    const targetLang = this.mapLanguageCode(target);

    const body: Record<string, unknown> = {
      text: [text],
      target_lang: targetLang
    };

    if (source && source !== "auto") {
      body.source_lang = this.mapLanguageCode(source);
    }

    const response = await axios.post(this.apiUrl, body, {
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        "Content-Type": "application/json"
      }
    });

    const translated = response.data?.translations?.[0]?.text;
    if (!translated) {
      throw new Error("DeepL translation failed.");
    }

    return translated;
  }

  private mapLanguageCode(code: string): string {
    // DeepL uses uppercase codes with specific mappings
    const map: Record<string, string> = {
      "zh-cn": "ZH-HANS",
      "zh-tw": "ZH-HANT",
      "en": "EN",
      "en-us": "EN-US",
      "en-gb": "EN-GB",
      "pt": "PT-PT",
      "pt-br": "PT-BR",
      "nb": "NB",
    };
    const lower = code.toLowerCase();
    return map[lower] || code.split("-")[0].toUpperCase();
  }
}

class YoudaoTranslator implements Translator {
  constructor(private readonly appKey: string, private readonly appSecret: string) {}

  private mapLanguageCode(code: string): string {
    // Youdao uses specific language codes
    const map: Record<string, string> = {
      "zh-cn": "zh-CHS",
      "zh-tw": "zh-CHT",
      "en": "en",
      "ja": "ja",
      "ko": "ko",
      "fr": "fr",
      "de": "de",
      "es": "es",
      "pt": "pt",
      "pt-br": "pt",
      "ru": "ru",
      "it": "it",
      "nl": "nl",
      "pl": "pl",
      "ar": "ar",
      "th": "th",
      "vi": "vi",
      "id": "id",
      "ms": "ms",
      "tr": "tr",
    };
    const lower = code.toLowerCase();
    return map[lower] || code.toLowerCase();
  }

  async translate(text: string, source: string, target: string): Promise<string> {
    if (!this.appKey || !this.appSecret) {
      throw new Error("Youdao appKey/appSecret are not configured.");
    }

    const salt = Date.now().toString();
    const curtime = Math.floor(Date.now() / 1000).toString();
    const input = this.truncate(text);
    const signStr = this.appKey + input + salt + curtime + this.appSecret;
    const sign = crypto.createHash("sha256").update(signStr).digest("hex");

    const params = new URLSearchParams({
      q: text,
      from: source === "auto" ? "auto" : this.mapLanguageCode(source),
      to: this.mapLanguageCode(target),
      appKey: this.appKey,
      salt,
      sign,
      signType: "v3",
      curtime
    });

    const response = await axios.post("https://openapi.youdao.com/api", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const translated = response.data?.translation?.[0];
    if (!translated) {
      const errorCode = response.data?.errorCode || "unknown";
      throw new Error(`Youdao translation failed (errorCode=${errorCode}).`);
    }

    return translated;
  }

  private truncate(text: string): string {
    if (text.length <= 20) {
      return text;
    }

    return text.slice(0, 10) + text.length + text.slice(-10);
  }
}

export function getTranslator(config: vscode.WorkspaceConfiguration): Translator {
  const provider = config.get<string>("provider", "google");

  if (provider === "deepl") {
    const apiKey = config.get<string>("deepl.apiKey", "");
    const apiUrl = config.get<string>("deepl.apiUrl", "https://api-free.deepl.com/v2/translate");
    return new DeepLTranslator(apiKey, apiUrl);
  }

  if (provider === "youdao") {
    const appKey = config.get<string>("youdao.appKey", "");
    const appSecret = config.get<string>("youdao.appSecret", "");
    return new YoudaoTranslator(appKey, appSecret);
  }

  const apiKey = config.get<string>("google.apiKey", "");
  return new GoogleTranslator(apiKey);
}
