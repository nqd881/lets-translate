export type TranslationMode = "lbl" | "all" | "smart";

type TranslationPart =
  | { kind: "literal"; text: string }
  | { kind: "translate"; text: string; prefix: string; continuationPrefix: string };

export function preprocessTranslation(text: string, mode: TranslationMode): TranslationPart[] {
  if (mode === "all") {
    return [{ kind: "translate", text, prefix: "", continuationPrefix: "" }];
  }

  const lines = [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)]
    .filter((match) => match[0].length > 0);
  const parts: TranslationPart[] = [];
  let pending: Extract<TranslationPart, { kind: "translate" }> | undefined;
  let separator = "";
  // Keep list nesting across hard breaks and blank lines, independently of translation blocks.
  const listContexts: { markerIndent: number; contentIndent: number }[] = [];
  const flush = (): void => {
    if (pending) {
      parts.push(pending);
      pending = undefined;
      parts.push({ kind: "literal", text: separator });
      separator = "";
    }
  };
  const indentationWidth = (indent: string): number => indent.replace(/\t/g, "    ").length;

  for (let i = 0; i < lines.length; i++) {
    const [, body, eol] = lines[i];
    if (mode === "lbl") {
      parts.push(body.trim()
        ? { kind: "translate", text: body, prefix: "", continuationPrefix: "" }
        : { kind: "literal", text: body });
      parts.push({ kind: "literal", text: eol });
      continue;
    }

    const fence = body.match(/^[ \t]*(`{3,}|~{3,})/);
    if (fence) {
      flush();
      let code = lines[i][0];
      const closing = new RegExp(`^[ \\t]*${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
      while (++i < lines.length) {
        code += lines[i][0];
        if (closing.test(lines[i][1])) {
          break;
        }
      }
      parts.push({ kind: "literal", text: code });
      continue;
    }
    if (!body.trim() || /^[ \t]*(?:={3,}|(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})[ \t]*$/.test(body)) {
      flush();
      parts.push({ kind: "literal", text: body + eol });
      continue;
    }

    const list = body.match(/^([ \t]*(?:[-*+\u2022]|\d+[.)])[ \t]+)(.*)$/);
    const heading = body.match(/^([ \t]*#{1,6}[ \t]+)(.*)$/);
    const setext = i + 1 < lines.length && /^[ \t]*(?:=+|-+)[ \t]*$/.test(lines[i + 1][1]);
    const indent = body.match(/^[ \t]*/)![0];
    const indentWidth = indentationWidth(indent);
    if (list) {
      flush();
      while (listContexts.length && listContexts[listContexts.length - 1].markerIndent >= indentWidth) {
        listContexts.pop();
      }
      listContexts.push({ markerIndent: indentWidth, contentIndent: indentationWidth(list[1]) });
    } else {
      let dedented = false;
      while (listContexts.length && indentWidth < listContexts[listContexts.length - 1].contentIndent) {
        listContexts.pop();
        dedented = true;
      }
      if (heading || dedented) {
        flush();
      }
    }

    const prefix = list?.[1] ?? heading?.[1] ?? indent;
    let content = list?.[2] ?? heading?.[2] ?? body.slice(indent.length);
    const closingHashes = heading ? content.match(/[ \t]+#+[ \t]*$/)?.[0] ?? "" : "";
    if (closingHashes) {
      content = content.slice(0, -closingHashes.length);
    }
    const hardBreak = eol ? content.match(/(?: {2,}|(?<!\\)(?:\\\\)*\\)$/)?.[0] ?? "" : "";
    if (hardBreak) {
      content = content.slice(0, -hardBreak.length);
    }
    if (!content.trim()) {
      flush();
      parts.push({ kind: "literal", text: body + eol });
      continue;
    }
    if (!pending) {
      pending = {
        kind: "translate", text: content.trim(), prefix,
        continuationPrefix: list ? " ".repeat(indentationWidth(prefix)) : indent
      };
    } else {
      pending.text += " " + content.trim();
    }
    separator = eol;
    if (heading || setext || hardBreak) {
      separator = closingHashes + hardBreak + eol;
      flush();
      if (setext) {
        parts.push({ kind: "literal", text: lines[++i][0] });
      }
    }
  }
  flush();
  return parts;
}

export async function translateWithMode(
  text: string,
  mode: TranslationMode,
  translate: (text: string) => Promise<string>
): Promise<string> {
  const parts = preprocessTranslation(text, mode);
  const results = parts.map((part) => part.kind === "literal" ? part.text : "");
  let next = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (!failed && next < parts.length) {
      const index = next++;
      const part = parts[index];
      if (part.kind === "literal") {
        continue;
      }
      try {
        const result = await translate(part.text);
        results[index] = part.prefix + result.replace(/\r\n|\n|\r/g,
          (eol) => eol + part.continuationPrefix);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, parts.length) }, worker));
  if (failed) {
    throw failure;
  }
  return results.join("");
}
