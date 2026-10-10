const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");

const code = esbuild.transformSync(
  fs.readFileSync(path.join(__dirname, "../src/providers.ts"), "utf8"),
  { loader: "ts", format: "cjs", target: "node18" }
).code;
const now = 1700000000123;
const credentials = {
  "google.apiKey": "google-key",
  "deepl.apiKey": "deepl-key",
  "youdao.appKey": "app-key",
  "youdao.appSecret": "app-secret"
};
const responses = {
  google: { data: { translations: [{ translatedText: "translated &amp; text" }] } },
  deepl: { translations: [{ text: "translated text" }] },
  youdao: { translation: ["translated text"] }
};

function load(values = {}, respond = async () => ({ data: responses.google })) {
  const calls = [];
  const reads = [];
  const moduleObject = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleObject,
    exports: moduleObject.exports,
    URLSearchParams,
    Date: class extends Date { static now() { return now; } },
    require(name) {
      if (name === "crypto") return crypto;
      if (name === "axios") return {
        async post(...args) {
          calls.push(args);
          return respond(...args);
        }
      };
      throw new Error(`Unexpected runtime import: ${name}`);
    }
  });
  assert.deepEqual(Object.keys(moduleObject.exports), ["getTranslator"]);
  const translator = moduleObject.exports.getTranslator({
    get(key, fallback) {
      reads.push([key, fallback]);
      return Object.hasOwn(values, key) ? values[key] : fallback;
    }
  });
  return { translator, calls, reads };
}

// HTTP JSON objects originate in the VM; normalize before structural assertions.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("factory defaults and unknown providers use Google without a runtime VS Code import", async () => {
  for (const values of [{}, { provider: "unknown" }]) {
    const { translator, calls, reads } = load({ ...credentials, ...values });
    assert.equal(await translator.translate("hello", "auto", "vi"), "translated &amp; text");
    assert.deepEqual(reads, [["provider", "google"], ["google.apiKey", ""]]);
    assert.equal(calls[0][0], "https://translation.googleapis.com/language/translate/v2");
  }
});

test("Google sends query parameters with null body and omits auto or empty source", async () => {
  for (const source of ["auto", "", "zh-CN"]) {
    const { translator, calls } = load({ ...credentials, provider: "google" });
    assert.equal(await translator.translate("hello & world", source, "vi"), "translated &amp; text");
    assert.deepEqual(plain(calls), [[
      "https://translation.googleapis.com/language/translate/v2", null,
      { params: { q: "hello & world", target: "vi", key: "google-key",
        ...(source === "zh-CN" ? { source } : {}) } }
    ]]);
  }
});

test("DeepL preserves mappings, JSON body, authentication, and configured endpoint", async () => {
  const mappings = [
    ["zh-CN", "ZH-HANS"], ["ZH-TW", "ZH-HANT"], ["en", "EN"],
    ["en-US", "EN-US"], ["en-GB", "EN-GB"], ["pt", "PT-PT"],
    ["pt-BR", "PT-BR"], ["nb", "NB"], ["fr-CA", "FR"], ["vi", "VI"]
  ];
  for (const [language, mapped] of mappings) {
    const { translator, calls } = load({ ...credentials, provider: "deepl",
      "deepl.apiUrl": "https://api.deepl.com/v2/translate" },
    async () => ({ data: responses.deepl }));
    assert.equal(await translator.translate("hello", language, language), "translated text");
    assert.deepEqual(plain(calls), [["https://api.deepl.com/v2/translate",
      { text: ["hello"], target_lang: mapped, source_lang: mapped },
      { headers: { Authorization: "DeepL-Auth-Key deepl-key", "Content-Type": "application/json" } }
    ]]);
  }
});

test("DeepL default endpoint and auto or empty source omit source_lang", async () => {
  for (const source of ["auto", ""]) {
    const { translator, calls, reads } = load({ ...credentials, provider: "deepl" },
      async () => ({ data: responses.deepl }));
    await translator.translate("hello", source, "pt");
    assert.deepEqual(plain(calls[0]), ["https://api-free.deepl.com/v2/translate",
      { text: ["hello"], target_lang: "PT-PT" },
      { headers: { Authorization: "DeepL-Auth-Key deepl-key", "Content-Type": "application/json" } }
    ]);
    assert.deepEqual(reads, [["provider", "google"], ["deepl.apiKey", ""],
      ["deepl.apiUrl", "https://api-free.deepl.com/v2/translate"]]);
  }
});

test("Youdao form body signs short, boundary, and truncated long text with a fixed clock", async () => {
  const fixtures = [
    ["hello & world", "hello & world"],
    ["0123456789abcdefghij", "0123456789abcdefghij"],
    ["0123456789abcdefghijk", "012345678921bcdefghijk"],
    ["0123456789--middle--ABCDEFGHIJ", "012345678930ABCDEFGHIJ"]
  ];
  for (const [text, input] of fixtures) {
    const { translator, calls, reads } = load({ ...credentials, provider: "youdao" },
      async () => ({ data: responses.youdao }));
    assert.equal(await translator.translate(text, "auto", "zh-CN"), "translated text");
    const [url, body, options] = calls[0];
    assert.equal(calls.length, 1);
    assert.equal(url, "https://openapi.youdao.com/api");
    assert.ok(body instanceof URLSearchParams);
    assert.deepEqual(Object.fromEntries(body), {
      q: text, from: "auto", to: "zh-CHS", appKey: "app-key",
      salt: "1700000000123", curtime: "1700000000", signType: "v3",
      sign: crypto.createHash("sha256")
        .update(`app-key${input}17000000001231700000000app-secret`).digest("hex")
    });
    assert.equal(new URLSearchParams(body.toString()).get("q"), text);
    assert.deepEqual(plain(options), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert.deepEqual(reads, [["provider", "google"], ["youdao.appKey", ""], ["youdao.appSecret", ""]]);
  }
});

test("Youdao maps explicit source and target codes and lowercases unknown codes", async () => {
  const mappings = [
    ["zh-CN", "zh-CHS"], ["ZH-TW", "zh-CHT"], ["pt-BR", "pt"],
    ...["en", "ja", "ko", "fr", "de", "es", "pt", "ru", "it", "nl", "pl",
      "ar", "th", "vi", "id", "ms", "tr", "uk", "en-US"].map((code) => [code, code.toLowerCase()]),
    ["", ""]
  ];
  for (const [language, mapped] of mappings) {
    const { translator, calls } = load({ ...credentials, provider: "youdao" },
      async () => ({ data: responses.youdao }));
    await translator.translate("hello", language, language);
    assert.equal(calls[0][1].get("from"), mapped);
    assert.equal(calls[0][1].get("to"), mapped);
  }
});

test("missing credentials fail before any HTTP request", async () => {
  const fixtures = [
    [{}, "Google API key is not configured."],
    [{ provider: "google", "google.apiKey": "" }, "Google API key is not configured."],
    [{ provider: "deepl" }, "DeepL API key is not configured."],
    [{ provider: "youdao" }, "Youdao appKey/appSecret are not configured."],
    [{ provider: "youdao", "youdao.appKey": "app-key" }, "Youdao appKey/appSecret are not configured."],
    [{ provider: "youdao", "youdao.appSecret": "app-secret" }, "Youdao appKey/appSecret are not configured."]
  ];
  for (const [values, message] of fixtures) {
    const { translator, calls } = load(values);
    await assert.rejects(translator.translate("hello", "auto", "vi"), { message });
    assert.equal(calls.length, 0);
  }
});

test("missing or empty translations preserve provider errors", async () => {
  for (const provider of ["google", "deepl", "youdao"]) {
    const message = provider === "youdao" ? "Youdao translation failed (errorCode=unknown)."
      : `${provider === "google" ? "Google" : "DeepL"} translation failed.`;
    const empty = {
      google: { data: { translations: [{ translatedText: "" }] } },
      deepl: { translations: [{ text: "" }] },
      youdao: { translation: [""] }
    };
    for (const data of [undefined, {}, empty[provider]]) {
      const { translator, calls } = load({ ...credentials, provider }, async () => ({ data }));
      await assert.rejects(translator.translate("hello", "auto", "vi"), { message });
      assert.equal(calls.length, 1);
    }
  }
});

test("Youdao reports response error codes with the existing unknown fallback", async () => {
  for (const errorCode of ["401", 108, "", 0]) {
    const { translator } = load({ ...credentials, provider: "youdao" },
      async () => ({ data: { errorCode } }));
    await assert.rejects(translator.translate("hello", "auto", "vi"), {
      message: `Youdao translation failed (errorCode=${errorCode || "unknown"}).`
    });
  }
});

test("all providers propagate the original network error", async () => {
  for (const provider of ["google", "deepl", "youdao"]) {
    const error = new Error("network unavailable");
    const { translator, calls } = load({ ...credentials, provider }, async () => { throw error; });
    await assert.rejects(translator.translate("hello", "auto", "vi"), (caught) => caught === error);
    assert.equal(calls.length, 1);
  }
});
