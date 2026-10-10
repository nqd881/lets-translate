# Let's Translate

Translate selected text inline in VS Code with [Google Translate](https://docs.cloud.google.com/translate/docs/reference/rest), [DeepL](https://www.deepl.com/), or [Youdao](https://ai.youdao.com/).

The extension ID is `nqd881.lets-translate`, version `1.0.0`. Source code is available at [nqd881/lets-translate](https://github.com/nqd881/lets-translate). Install a local VSIX package using the instructions below.

## Features

- **Inline translation**: Display results above or below the source without modifying the original content.
- **Translation modes**: Choose smart paragraph/list translation (default), whole-text translation, or line-by-line translation, displayed in one uniform rectangular background.
- **Context menu and shortcuts**: Translate selected text from the editor menu or a keyboard shortcut.
- **Input translation**: Translate text entered through an input box without selecting text.
- **Multiple providers**: Choose Google, DeepL, or Youdao.
- **36 languages**: Searchable source/target language dropdowns, including Simplified and Traditional Chinese.
- **Configurable dismissal**: No automatic timeout by default. Results also clear on mouse selection changes, document edits, or editor switches.

## Local Installation

Use Node.js >= 20 for the current VSIX packaging tool, with npm >= 9. Run these commands from this project directory:

```bash
npm ci
npx @vscode/vsce package
code --install-extension lets-translate-1.0.0.vsix
```

Packaging automatically runs `vscode:prepublish` (`npm run compile`) and creates `lets-translate-1.0.0.vsix`. You can also install that file through **Extensions: Install from VSIX...**. The root directory remains `vscode-translation-cc`.

Configure a translation provider and its credentials before translating. Selected
or entered text is sent to that provider; provider fees and limits may apply.

## Marketplace Publication

The first release is prepared for browser upload; creating a VSIX does not publish it.

1. Sign in to [Marketplace publisher management](https://marketplace.visualstudio.com/manage).
2. Create or select a publisher with ID `nqd881` that you control. If that ID is unavailable, update `package.json` and the release metadata to your registered ID before rebuilding.
3. Run `npm test`, `npx tsc --noEmit`, and `npx @vscode/vsce package` from this project directory.
4. Under the publisher, choose **New extension**, select **Visual Studio Code**, and upload `lets-translate-1.0.0.vsix`.
5. Complete the publication flow and wait for Marketplace validation. No publishing token needs to be stored in this project or shared in chat.

The intended listing URL is `https://marketplace.visualstudio.com/items?itemName=nqd881.lets-translate`; it becomes usable only after a successful publication.

## Usage

### Translate Selected Text

1. Select text in the editor.
2. Press `Ctrl+Shift+T` (Windows/Linux) or `Cmd+4` (macOS), use **Translate Selected** in the context menu, or run **Let's Translate: Translate Selected** from the Command Palette.
3. The translation appears inline near the selected text.

### Translate Input Text

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **Let's Translate: Translate Input**.
3. Enter the text to translate.
4. The translation appears inline at the cursor position. Without an active editor, the result uses an eight-second status-bar message instead.

### Commands and Shortcuts

| Command ID | Command Palette Action |
|---|---|
| `lets-translate.translateSelection` | Let's Translate: Translate Selected |
| `lets-translate.translateInput` | Let's Translate: Translate Input |

| Shortcut | Platform | Command |
|---|---|---|
| `Ctrl+Shift+T` | Windows / Linux | `lets-translate.translateSelection` |
| `Cmd+4` | macOS | `lets-translate.translateSelection` |

Use the command IDs above to assign custom shortcuts in **Keyboard Shortcuts** if the defaults conflict with another extension. All extension preferences and credentials use the `lets-translate.*` settings namespace.

## Configuration

Open **Settings** (`Ctrl+,` / `Cmd+,`) and search for `lets-translate` or **Let's Translate**.

### General

| Setting | Default | Description |
|---|---|---|
| `lets-translate.provider` | `google` | Translation provider: `google`, `deepl`, or `youdao` |
| `lets-translate.sourceLanguage` | `auto` | Source language (searchable dropdown, supports 36 languages) |
| `lets-translate.targetLanguage` | `vi` | Target language (searchable dropdown, supports 36 languages) |
| `lets-translate.translationMode` | `smart` | Translation unit for both selected text and input text: `lbl`, `all`, or `smart` |
| `lets-translate.popupTimeout` | `0` | Seconds before automatic dismissal. `0` disables the timer; positive values enable it. |
| `lets-translate.popupMaxWidth` | `80` | Maximum display width in approximate character columns (`20` to `240`); long text wraps instead of being truncated |

Vietnamese (`vi`) is the default target language when no target is configured. An explicit `lets-translate.targetLanguage` setting in user or workspace settings overrides this default; existing language choices are not reset.

For example, use `"lets-translate.popupTimeout": 5` for a five-second timeout. The setting is read when each translation is displayed.

Use `"lets-translate.popupMaxWidth": 50` for a narrower translation box, for example in a split editor. The limit includes the five-column icon gutter, but excludes the small CSS border and padding. Short results stay compact. Long paragraphs wrap at word boundaries; URLs and words without spaces wrap at Unicode grapheme boundaries, keeping emoji and combining characters intact. CJK characters are estimated as two columns. Paragraph breaks and list indentation remain, and tabs expand to four spaces for display. No trailing spaces are added to equalize line widths. The setting applies to the next translation in all three modes.

Wrapping affects only the displayed result, not the text sent to the provider. Popup placement uses the wrapped line count, and scrolling does not retranslate the text or restart its timeout. Width is approximate, not the editor's measured pixel width: use a smaller setting for narrow panes. Very tall translations can still exceed the viewport vertically; no text is deliberately truncated, but this decoration-based box does not provide internal scrolling.

The inline box uses editor decorations, not a native popup. Foreground styling is best-effort and cannot place it above every VS Code UI layer. The translation is rendered as one multiline block and repositioned above or below the source when the editor scrolls. If the source selection leaves the viewport, the box hides; scrolling back restores it unless it has expired or been dismissed. Scrolling does not restart the timeout or send another translation request. Placement uses approximate line heights; word wrap, folded code, oversized results, and viewport edges can still cause clipping.

The box is non-interactive: clicks pass through to the editor. Mouse clicks that change selection dismiss it, but arbitrary workbench clicks or clicks that leave selection unchanged may not. Keyboard cursor movement alone does not dismiss it; document edits and editor switches do. Logs remain available in **Output > Let's Translate** without opening Output automatically. The inline overlay has no supported inside/outside click detection.

### Translation Modes

`lets-translate.translationMode` applies to both **Let's Translate: Translate Selected** and **Let's Translate: Translate Input**. The default is `smart`.

| Mode | Behavior |
|---|---|
| `smart` | Join soft line breaks within each paragraph or list item before translating. Preserve paragraph blank lines, list markers and indentation, headings, explicit Markdown hard breaks, and fenced code. |
| `all` | Send the entire source unchanged in one provider request. Formatting in the result depends on the provider. |
| `lbl` | Translate each nonblank line separately. Preserve blank lines and the source's LF/CRLF separators. |

For example, with `smart`, this source sends `A sentence wrapped across lines.` and `A list item continued here.` as two separate translation requests:

```text
A sentence wrapped
across lines.

- A list item
  continued here.
```

The result contains one translated paragraph, the original blank line, and one translated list item retaining `- `. If a provider returns multiple lines for a list item, continuation lines retain the item's indentation. The overlay uses the wrapped display line count, not the number of selected source lines.

Smart mode recognizes numbered lists (`1.` and `1)`), bullets (`-`, `*`, `+`, and `•`), ATX headings (`# Title`, including optional closing hashes), and setext headings (a title followed by `===` or `---`). A hard break made with two or more trailing spaces or a trailing backslash keeps its original marker and newline. Backtick and tilde fenced code blocks are left unchanged, including an unterminated fence through the end of the input.

This is lightweight structure preservation, not a full Markdown parser. Inline code is not protected, and text is not split into sentence-sized chunks. Large paragraphs or `all` inputs may still exceed provider limits. Modes do not change the selected provider, source/target languages, language-code mapping, or API credentials, and do not add provider batching or DeepL-specific options.

For `lbl` and `smart`, at most three translation requests run simultaneously. Results remain in source order even when requests finish out of order. If any request fails, the operation rejects without displaying a partial result and stops starting queued requests; requests already in flight may still finish.

### Google Translate

| Setting | Default | Description |
|---|---|---|
| `lets-translate.google.apiKey` | `""` | Google Cloud Translation API key ([Get one here](https://console.cloud.google.com/apis/credentials)) |

### DeepL

| Setting | Default | Description |
|---|---|---|
| `lets-translate.deepl.apiKey` | `""` | DeepL API authentication key ([Get one here](https://www.deepl.com/pro-api)) |
| `lets-translate.deepl.apiUrl` | `https://api-free.deepl.com/v2/translate` | API endpoint. Use `https://api.deepl.com/v2/translate` for DeepL Pro |

If you see `DeepL API key is not configured`, enter a key under the settings namespace in the Settings UI or in `settings.json`:

```json
{
  "lets-translate.provider": "deepl",
  "lets-translate.deepl.apiKey": "YOUR_DEEPL_API_KEY"
}
```

### Youdao

| Setting | Default | Description |
|---|---|---|
| `lets-translate.youdao.appKey` | `""` | Youdao application key ([Apply here](https://ai.youdao.com/console/)) |
| `lets-translate.youdao.appSecret` | `""` | Youdao application secret |

### Supported Languages

Chinese (Simplified), Chinese (Traditional), English, Japanese, Korean, French, German, Spanish, Portuguese, Portuguese (Brazil), Russian, Italian, Dutch, Polish, Arabic, Thai, Vietnamese, Indonesian, Malay, Turkish, Ukrainian, Czech, Danish, Finnish, Greek, Hungarian, Swedish, Norwegian, Romanian, Slovak, Bulgarian, Estonian, Latvian, Lithuanian, Slovenian, Croatian.

### Provider Notes

| Provider | Website | Notes |
|---|---|---|
| **Google** | [cloud.google.com](https://docs.cloud.google.com/translate/docs/reference/rest) | Requires a Google Cloud Translation API key. Supports `auto` source detection. |
| **DeepL** | [deepl.com](https://www.deepl.com/) | Free tier uses `api-free.deepl.com`. Language codes are automatically mapped (e.g. `zh-CN` to `ZH-HANS`). |
| **Youdao** | [ai.youdao.com](https://ai.youdao.com/) | Uses v3 signature. Language codes are automatically mapped (e.g. `zh-CN` to `zh-CHS`). |

## Development

### Prerequisites and Setup

Building and tests require Node.js >= 18 and npm >= 9; the current VSIX packaging tool requires Node.js >= 20. Run setup commands from this project directory:

```bash
npm ci
```

### Source Layout

The extension uses seven flat files under `src/`:

| File | Responsibility |
|---|---|
| `extension.ts` | Activation, command registration, and extension lifecycle |
| `providers.ts` | Provider factory, HTTP requests, language mappings, and signing |
| `translation-service.ts` | Configured translation orchestration and progress reporting |
| `translation.ts` | Translation modes, structure preservation, and request concurrency |
| `inline-popup.ts` | Inline decorations, placement, scrolling, and dismissal |
| `popup-layout.ts` | Unicode-aware wrapping and display dimensions |
| `logging.ts` | Output logging and diagnostic formatting |

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development mode with watch |
| `npm run compile` | Build the production bundle |
| `npm test` | Run provider payload/signing/error, translation-mode, Unicode wrapping, and mocked popup scrolling/lifetime checks |
| `node --test scripts/test-translation-modes.cjs` | Test translation preprocessing, reconstruction, ordering, concurrency, and failures without provider credentials or generated build files |
| `node --test scripts/test-providers.cjs` | Test provider selection, payloads, mappings, credentials, signatures, and errors with mocked HTTP and no VS Code runtime |

Start `npm run dev` to watch for changes and rebuild automatically. This checkout does not include an F5 launch configuration. Launch a development window from the project directory:

```bash
code --new-window --extensionDevelopmentPath="$PWD"
```

Configure the provider and settings in that window. Disable an installed copy of `nqd881.lets-translate` if you see duplicate actions. After rebuilding, run **Developer: Reload Window** in the development window.

### Local Verification

From the project directory, install the locked dependencies and check the build:

```bash
npm ci
npx tsc --noEmit
npm test
npm run compile
code --new-window --extensionDevelopmentPath="$PWD"
```

Automated checks use mocks or controlled provider promises; they do not establish real API behavior. In the Extension Development Host, open a text file and configure your provider and credentials for these manual checks:

1. Remove `lets-translate.popupTimeout`, translate a selection, and wait at least 15 seconds. The translation should stay visible.
2. Set `"lets-translate.popupTimeout": 3`, translate again, and check that it clears about three seconds after appearing. Reset it to `0` to disable the timer.
3. With the timeout disabled, move the cursor using arrow keys. The box should remain. Click another editor location that changes selection, including immediately after display; it should clear.
4. Translate again, then edit the document or switch to another editor. The box should clear.
5. Test single-line and multiline selections near the top and middle of the viewport, including with word wrap enabled. Decorations can still be clipped or obscured by other VS Code UI; this is not a native hover guarantee.
6. Close the bottom panel. Run **Let's Translate: Translate Selected** and **Let's Translate: Translate Input**. Output should not open, including when a provider reports an error. Open **Output > Let's Translate** manually to inspect logs.
7. Move the cursor while a selection translation request is pending. The result should stay anchored to the original selection. Editing the document or switching editors while waiting should prevent that result from appearing.
8. With the timeout set to `0`, translate three or more lines and scroll using the mouse wheel outside the box. The result should remain one block and reposition as needed. Scroll the source completely out of view, then back: the box should hide and return without another translation request.
9. Set the timeout to `5`, translate, and keep scrolling. The result should still expire about five seconds after display. If it expires while off-screen, scrolling back must not restore it.
10. Leave `lets-translate.popupMaxWidth` unset and translate a long paragraph. It should wrap within about 80 columns, including the icon gutter. Check that the ending is present. Set `"lets-translate.popupMaxWidth": 40` and translate again; the box should become narrower and taller, with placement based on the wrapped height.
11. Test wrapped list items, paragraph breaks, a long URL, CJK text, and emoji. List continuation lines should align with item content, blank lines should remain, and words without spaces should wrap without losing characters. Test the narrower setting in a split editor and repeat the scroll/timeout checks.

### Manual Translation Mode Checks

1. Remove `lets-translate.translationMode` to use the `smart` default. Select the sample under **Translation Modes** and run **Let's Translate: Translate Selected**. Check that wrapped paragraph/list lines join, the blank line and list marker remain, and the overlay fits the returned text rather than the original selection's line count.
2. Add an indented nested list, `1.` and `1)` items, ATX and setext headings, and explicit hard breaks (two trailing spaces or a backslash). Check that structural markers remain. Include backtick and tilde fenced code, then an unterminated fence; code should stay unchanged.
3. Set `lets-translate.translationMode` to `lbl` and translate a multiline selection containing blank lines. Check that lines translate individually and blank lines remain. Repeat with an LF file and a CRLF file.
4. Set the mode to `all` and translate the same selection. The provider receives the whole selection; do not expect the extension to restore formatting changed by the provider.
5. Repeat **Let's Translate: Translate Input** under each mode with a short input, keeping the same provider and source/target languages. Return the mode to `smart` afterward.
6. Simulate a provider failure (for example, temporarily use an invalid API key). Check that an error is reported and no partial translation appears. Restore valid credentials. Request ordering, the three-request concurrency limit, and stopping queued requests on failure are covered by `node --test scripts/test-translation-modes.cjs` with controlled provider promises.

## License

[MIT](LICENSE.md).
