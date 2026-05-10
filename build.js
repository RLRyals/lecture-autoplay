const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'bookmarklet-source.js');
const src = fs.readFileSync(srcPath, 'utf8');

// Light minify: strip line comments, collapse whitespace conservatively.
// Mid-line `// comment` will eat the rest of the file once newlines collapse,
// so strip them too — but only when they're outside string/regex literals.
function stripLineComments(s) {
  let out = '';
  let i = 0;
  let inStr = null; // ', ", `
  let inRe = false;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\' && i + 1 < s.length) { out += n; i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (inRe) {
      out += c;
      if (c === '\\' && i + 1 < s.length) { out += n; i += 2; continue; }
      if (c === '/') inRe = false;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i++; continue; }
    if (c === '/' && n === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    // detect regex literal start (very rough heuristic): `/` after operator-ish char
    if (c === '/' && /[=(,;:!&|?{}\[\n]/.test(out.slice(-1) || '\n')) {
      inRe = true; out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

let code = stripLineComments(src)
  .replace(/\r/g, '')
  .replace(/[ \t\n]+/g, ' ')
  .trim();

// Build the javascript: URL using encodeURIComponent, but keep some unreserved chars
// readable for inspection. encodeURIComponent encodes everything except A-Z a-z 0-9 - _ . ! ~ * ' ( )
// That is exactly the right set for embedding inside an href value.
const encoded = encodeURIComponent(code);
const href = 'javascript:' + encoded;

fs.writeFileSync(path.join(__dirname, 'bookmarklet.href.txt'), href, 'utf8');
console.log('written ' + href.length + ' chars to bookmarklet.href.txt');
