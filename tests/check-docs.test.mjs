import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMarkdownDocs } from '../scripts/check-docs.mjs';

function withRepo(testBody) {
  const root = mkdtempSync(join(tmpdir(), 'nuvio-docs-'));
  try { return testBody(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('accepts local relative links, anchors and external URLs', () => withRepo(root => {
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'guide.md'), '# Guide\n');
  writeFileSync(join(root, 'README.md'), '[Guide](docs/guide.md#intro) [Web](https://example.org/) [Here](#section)');
  assert.deepEqual(checkMarkdownDocs(root).errors, []);
}));

test('rejects missing local targets', () => withRepo(root => {
  writeFileSync(join(root, 'README.md'), '[Broken](docs/missing.md)');
  assert.match(checkMarkdownDocs(root).errors[0], /missing link target/);
}));

test('rejects relative links outside the repository', () => withRepo(root => {
  writeFileSync(join(root, 'README.md'), '[Outside](../secret.md)');
  assert.match(checkMarkdownDocs(root).errors[0], /link escapes repository/);
}));

test('ignores Markdown links in fenced code blocks', () => withRepo(root => {
  writeFileSync(join(root, 'README.md'), '\x60\x60\x60md\n[Example](not-real.md)\n\x60\x60\x60\n');
  assert.deepEqual(checkMarkdownDocs(root).errors, []);
}));
