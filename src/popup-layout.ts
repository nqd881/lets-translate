const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemeWidth(text: string): number {
  if (/^\p{Mark}+$/u.test(text)) {
    return 0;
  }
  if (/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text)) {
    return 2;
  }
  const cp = text.codePointAt(0)!;
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x2fa1f)
  ) ? 2 : 1;
}

function visualWidth(text: string): number {
  return [...segmenter.segment(text)].reduce((width, part) => width + graphemeWidth(part.segment), 0);
}

export function layoutTranslation(text: string, configuredWidth = 80): {
  lines: string[];
  width: number;
  maxWidth: number;
} {
  const maxWidth = Number.isFinite(configuredWidth)
    ? Math.max(20, Math.min(240, Math.floor(configuredWidth)))
    : 80;
  const contentWidth = maxWidth - 5;
  const wrapped: string[] = [];

  for (const sourceLine of text.replace(/\r\n|\r/g, "\n").split("\n")) {
    const line = sourceLine.replace(/\t/g, "    ");
    const indent = line.match(/^ */)![0];
    const listPrefix = line.match(/^[ ]*(?:[-*+\u2022]|\d+[.)])[ ]+/)?.[0];
    // Excessive indentation is wrapped as content rather than removing text or exhausting the width.
    const firstPrefix = indent.length <= contentWidth - 2 ? indent : "";
    const continuationPrefix = " ".repeat(Math.min(
      listPrefix?.length ?? firstPrefix.length, contentWidth - 2));
    const characters = [...segmenter.segment(line.slice(firstPrefix.length))]
      .map((part) => ({ text: part.segment, width: graphemeWidth(part.segment) }));
    if (!characters.length) {
      wrapped.push(firstPrefix);
      continue;
    }

    let start = 0;
    while (start < characters.length) {
      const prefix = start === 0 ? firstPrefix : continuationPrefix;
      const available = contentWidth - prefix.length;
      let end = start;
      let width = 0;
      let wordBreak = start;
      while (end < characters.length && width + characters[end].width <= available) {
        width += characters[end].width;
        if (/^\s+$/u.test(characters[end].text)) {
          wordBreak = end + 1;
        }
        end++;
      }
      if (end < characters.length && wordBreak > start) {
        end = wordBreak;
      }
      wrapped.push(prefix + characters.slice(start, end).map((part) => part.text).join(""));
      start = end;
    }
  }

  const lines = wrapped.map((line, index) => `${index === 0 ? " \u{1f310}  " : "     "}${line}`);
  return { lines, width: lines.reduce((width, line) => Math.max(width, visualWidth(line)), 0), maxWidth };
}
