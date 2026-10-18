import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const IGNORED = new Set(['.git', 'node_modules', 'dist', '.cache', 'coverage']);

function walk(dir) {
  const output = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(item.name)) continue;
    const target = resolve(dir, item.name);
    if (item.isDirectory()) output.push(...walk(target));
    else if (item.isFile() && item.name.endsWith('.md')) output.push(target);
  }
  return output;
}

function extractLinks(markdown) {
  const cleaned = markdown.replace(/^\s*(\x60{3}|~{3})[^\n]*\n[\s\S]*?^\s*\1[^\n]*$/gm, '');
  return [...cleaned.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/g)].map(match => match[1]);
}

export function checkMarkdownDocs(root) {
  const absoluteRoot = resolve(root);
  const errors = [];
  let links = 0;
  const files = walk(absoluteRoot);
  for (const file of files) {
    const contents = readFileSync(file, 'utf8');
    for (const original of extractLinks(contents)) {
      const url = original.trim().replace(/^<|>$/g, '').split(/\s+"/)[0];
      if (!url || url.startsWith('#') || /^[a-z][\w+.-]*:/i.test(url) || url.startsWith('//')) continue;
      links++;
      let decoded;
      try { decoded = decodeURIComponent(url.split(/[?#]/, 1)[0]); }
      catch { errors.push(relative(absoluteRoot, file) + ': invalid encoded URL ' + url); continue; }
      const target = decoded.startsWith('/')
        ? resolve(absoluteRoot, '.' + decoded)
        : resolve(dirname(file), decoded);
      if (target !== absoluteRoot && !target.startsWith(absoluteRoot + sep)) {
        errors.push(relative(absoluteRoot, file) + ': link escapes repository: ' + url);
      } else if (!existsSync(target)) {
        errors.push(relative(absoluteRoot, file) + ': missing link target: ' + url);
      }
    }
  }
  return { files: files.length, links, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find(x => x.startsWith('--root='));
  const root = arg ? arg.slice('--root='.length) : process.cwd();
  const result = checkMarkdownDocs(root);
  console.log('Checked ' + result.files + ' Markdown files and ' + result.links + ' local links.');
  for (const error of result.errors) console.error(error);
  process.exitCode = result.errors.length ? 1 : 0;
}
