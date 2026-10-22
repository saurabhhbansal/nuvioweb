// Finds English copy written straight into the UI code instead of going
// through `t(...)`. Used by hardcodedUiStrings.test.mjs.
//
// It looks at the places where text reaches the screen:
//   - `el.textContent = "..."`, `innerText`, `placeholder`, `title`, `alt`,
//     `ariaLabel`, and `el.setAttribute("aria-label" | "title" | ..., "...")`
//   - `{ title: "...", label: "..." }` objects handed to dialogs and rows
//   - text between tags, and title/placeholder/alt/aria-label values, inside
//     any string or template literal that holds HTML markup, including
//     `${escapeHtml("...")}` holes
//
// Literals passed to other calls (such as the fallback given to `t(...)`) are
// skipped, and so are class names, ids, icon names, URLs and data attributes:
// only visible text and accessible labels count.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as espree from "espree";

const TEXT_PROPERTIES = new Set([
  "textContent",
  "innerText",
  "placeholder",
  "title",
  "alt",
  "ariaLabel"
]);
const TEXT_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt"]);
const COPY_KEYS = new Set([
  "title",
  "subtitle",
  "label",
  "message",
  "description",
  "placeholder",
  "ariaLabel"
]);
// Calls that only escape their argument, so a literal inside still shows.
const ESCAPE_CALL = /^escape/i;
const HTML_TAG_PATTERN = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/;
// Stands in for a `${...}` hole while reading a template literal's markup.
const HOLE = "\u0001";

// Two or more letters in a row: a word someone would read.
function looksLikeCopy(value) {
  const text = String(value || "")
    .replace(/&[a-zA-Z]+;|&#\d+;/g, " ")
    .trim();
  if (!/[A-Za-z]{2,}/.test(text)) return false;
  // A lone lowercase token is an icon ligature (`play_arrow`), a class or a
  // key, not a sentence.
  if (/^[a-z0-9_.-]+$/.test(text)) return false;
  // A colour value.
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return false;
  // A class list such as `focusable is-playable`.
  if (/^[a-z0-9_.\s-]+$/.test(text) && /[-_]/.test(text)) return false;
  // An attribute assembled in a hole, such as `style="..."`.
  if (/[\w-]+=["']/.test(text)) return false;
  // A lone URL or path is not copy.
  if (/^(?:https?:|mailto:|\.{0,2}\/)\S*$/.test(text)) return false;
  return true;
}

function normalize(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function staticPieces(node) {
  if (!node) return [];
  if (node.type === "Literal" && typeof node.value === "string") return [node.value];
  if (node.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked ?? "");
  return [];
}

function propertyName(member) {
  if (!member || member.type !== "MemberExpression") return null;
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  if (member.property.type === "Literal") return String(member.property.value);
  return null;
}

function calleeName(call) {
  const callee = call?.callee;
  if (callee?.type === "Identifier") return callee.name;
  return propertyName(callee);
}

// Strings a value expression produces directly, without a (non-escaping) call.
function directStrings(node) {
  if (!node) return [];
  switch (node.type) {
    case "Literal":
    case "TemplateLiteral":
      return [staticPieces(node).join(" ")];
    case "ConditionalExpression":
      return [...directStrings(node.consequent), ...directStrings(node.alternate)];
    case "LogicalExpression":
      return [...directStrings(node.left), ...directStrings(node.right)];
    case "BinaryExpression":
      return node.operator === "+"
        ? [...directStrings(node.left), ...directStrings(node.right)]
        : [];
    case "CallExpression":
      return ESCAPE_CALL.test(calleeName(node) || "") ? directStrings(node.arguments[0]) : [];
    default:
      return [];
  }
}

// Walks markup once, tracking whether it is inside a tag and inside a quoted
// attribute. Text outside tags is copy; inside a tag only the values of
// title/placeholder/alt/aria-label are. Also returns which `${...}` holes sit
// in such a place, so a literal inside one of them can be checked too.
function copyInMarkup(markup) {
  const found = [];
  const copyHoles = new Set();
  let hole = 0;
  const texts = [];
  let text = "";
  let inTag = false;
  let quote = "";
  let attrName = "";
  let attrValue = "";
  let pendingName = "";

  for (let i = 0; i < markup.length; i += 1) {
    const ch = markup[i];
    if (ch === HOLE) {
      if (!inTag || (quote && TEXT_ATTRIBUTES.has(attrName))) copyHoles.add(hole);
      hole += 1;
    }
    if (!inTag) {
      if (ch === "<" && /[a-zA-Z/!]/.test(markup[i + 1] || "")) {
        texts.push(text);
        text = "";
        inTag = true;
        pendingName = "";
      } else {
        text += ch;
      }
      continue;
    }
    if (quote) {
      if (ch === quote) {
        if (TEXT_ATTRIBUTES.has(attrName)) found.push(...attrValue.split(HOLE));
        quote = "";
        attrValue = "";
      } else {
        attrValue += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      attrName = pendingName.replace(/\s*=\s*$/, "").trim().toLowerCase();
      pendingName = "";
    } else if (ch === ">") {
      inTag = false;
    } else if (/\s/.test(ch)) {
      pendingName = /=\s*$/.test(pendingName) ? pendingName + ch : "";
    } else {
      pendingName += ch;
    }
  }
  if (!inTag) texts.push(text);

  texts.forEach((piece, index) => {
    // The first piece may be the tail of a tag opened in another literal,
    // such as `" alt="` or `px;--x:`. Copy rarely holds quotes, `=` or `;`.
    if (index === 0 && /["=;]/.test(piece)) return;
    found.push(...piece.split(HOLE));
  });
  return { found, copyHoles };
}

function walk(node, visit, parent = null, insideCall = false) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent, insideCall);
  const escaping = node.type === "CallExpression" && ESCAPE_CALL.test(calleeName(node) || "");
  const nowInsideCall =
    insideCall || (!escaping && (node.type === "CallExpression" || node.type === "NewExpression"));
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => walk(item, visit, node, nowInsideCall));
    } else if (child && typeof child.type === "string") {
      walk(child, visit, node, nowInsideCall);
    }
  }
}

export function findHardcodedCopy(source) {
  const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", loc: true });
  const results = [];
  const add = (text, node) => {
    const value = normalize(text);
    if (looksLikeCopy(value)) results.push({ text: value, line: node.loc.start.line });
  };

  walk(ast, (node, parent, insideCall) => {
    // el.textContent = "..." and friends.
    if (node.type === "AssignmentExpression") {
      const name = propertyName(node.left);
      if (name && TEXT_PROPERTIES.has(name)) {
        for (const text of directStrings(node.right)) if (!text.includes("<")) add(text, node);
      }
      return;
    }

    // el.setAttribute("aria-label", "...").
    if (
      node.type === "CallExpression" &&
      calleeName(node) === "setAttribute" &&
      node.arguments[0]?.type === "Literal" &&
      TEXT_ATTRIBUTES.has(node.arguments[0].value)
    ) {
      for (const text of directStrings(node.arguments[1])) add(text, node);
      return;
    }

    // { title: "...", label: "..." } handed to dialogs and setting rows.
    if (node.type === "Property" && !node.computed) {
      const key = node.key.type === "Identifier" ? node.key.name : node.key.value;
      if (COPY_KEYS.has(key)) {
        for (const text of directStrings(node.value)) if (!text.includes("<")) add(text, node);
      }
      return;
    }

    // Any literal holding markup, wherever it ends up. Literals passed to a
    // call are skipped, so `t("key", {}, "<b>x</b>")` is fine.
    if ((node.type === "TemplateLiteral" || node.type === "Literal") && !insideCall) {
      if (parent?.type === "TaggedTemplateExpression") return;
      const pieces = staticPieces(node);
      if (!pieces.length) return;
      const joined = pieces.join(HOLE);
      if (!HTML_TAG_PATTERN.test(joined)) return;
      const { found, copyHoles } = copyInMarkup(joined);
      for (const text of found) add(text, node);
      // `${escapeHtml(muted ? "Unmute" : "Mute")}` is copy in the markup too.
      // Nested markup is checked as its own literal.
      (node.expressions || []).forEach((expression, index) => {
        if (!copyHoles.has(index)) return;
        for (const text of directStrings(expression)) if (!text.includes("<")) add(text, node);
      });
    }
  });

  return results;
}

export async function listUiFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.name.endsWith(".js") && !entry.name.includes(".test.")) files.push(full);
    }
  }
  await visit(root);
  return files.sort();
}

// { "js/ui/x.js": ["Text", ...] }, sorted, with paths relative to appRoot.
export async function scanUi(appRoot) {
  const report = {};
  for (const file of await listUiFiles(path.join(appRoot, "js/ui"))) {
    const found = findHardcodedCopy(await readFile(file, "utf8"));
    if (!found.length) continue;
    const key = path.relative(appRoot, file).split(path.sep).join("/");
    report[key] = found.map((item) => item.text).sort();
  }
  return report;
}
