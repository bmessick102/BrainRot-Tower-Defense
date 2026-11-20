// Test helper: the string literals of a JavaScript source file (quoted strings and the text parts of template
// literals; comments skipped), each as { text, line }. Small hand-rolled scanner: good enough for this
// project's sources (no regex literals containing quotes).

export function stringLiterals(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  // Template literal: collect its text parts; ${...} expressions are scanned as code (they can hold strings).
  const template = () => {
    let text = '', start = line;
    i++; // the opening backtick
    while (i < n) {
      const c = src[i];
      if (c === '\\') { text += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && src[i + 1] === '{') {
        out.push({ text, line: start });
        text = '';
        i += 2;
        code(1);
        start = line;
        continue;
      }
      if (c === '\n') line++;
      text += c;
      i++;
    }
    out.push({ text, line: start });
  };
  const quoted = (q) => {
    let text = '';
    const start = line;
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { text += src.slice(i, i + 2); i += 2; continue; }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++;
    out.push({ text, line: start });
  };
  // Code until the matching close brace (depth > 0) or the end of the file.
  const code = (depth) => {
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end < 0 ? n : end + 2;
        for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
        i = stop;
        continue;
      }
      if (c === '"' || c === "'") { quoted(c); continue; }
      if (c === '`') { template(); continue; }
      if (depth > 0) {
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) { i++; return; }
      }
      i++;
    }
  };
  code(0);
  return out;
}
