import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENTRYPOINTS = [
  "README.md", "AGENTS.md", "CLAUDE.md", "docs",
  ".github/ISSUE_TEMPLATE", ".github/PULL_REQUEST_TEMPLATE.md"
];

// Archived process docs are kept for history only; their links are not maintained.
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
export function isArchived(repoRoot, location) {
  const inside = relative(resolve(repoRoot), resolve(location)).split(sep).join("/");
  return inside === "docs/archive" || inside.startsWith("docs/archive/");
}

export function collectMarkdownFiles(location, repoRoot = ROOT) {
  if (!existsSync(location) || isArchived(repoRoot, location)) return [];
  if (!statSync(location).isDirectory()) return location.endsWith(".md") ? [location] : [];
  return readdirSync(location, { withFileTypes: true }).flatMap((item) => {
    if (SKIPPED_DIRECTORIES.has(item.name)) return [];
    const full = join(location, item.name);
    return item.isDirectory() ? collectMarkdownFiles(full, repoRoot)
      : item.isFile() && full.endsWith(".md") ? [full] : [];
  });
}

export function extractLocalLinks(markdown) {
  const withoutFences = markdown.replace(/^ {0,3}(?:\x60{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}(?:\x60{3,}|~{3,})[^\n]*$/gm, "");
  const links = [];
  const pattern = /!?\[[^\]\n]*\]\((<[^>\n]+>|[^)\n]+)\)/g;
  for (const match of withoutFences.matchAll(pattern)) {
    let destination = match[1].trim();
    if (destination.startsWith("<") && destination.endsWith(">")) {
      destination = destination.slice(1, -1);
    } else {
      destination = destination.split(/\s+["']/)[0];
    }
    if (!destination || destination.startsWith("#")
      || /^[a-z][\w+.-]*:/i.test(destination) || destination.startsWith("//")) continue;
    links.push(destination);
  }
  return links;
}

export function findBrokenLinks(repoRoot, entrypoints = ENTRYPOINTS) {
  const absoluteRoot = resolve(repoRoot);
  const failures = [];
  for (const entry of entrypoints) {
    for (const file of collectMarkdownFiles(resolve(absoluteRoot, entry), absoluteRoot)) {
      for (const link of extractLocalLinks(readFileSync(file, "utf8"))) {
        const targetPart = link.split(/[?#]/, 1)[0];
        let decoded;
        try { decoded = decodeURIComponent(targetPart); }
        catch {
          failures.push({ file: relative(absoluteRoot, file), link, reason: "invalid URL encoding" });
          continue;
        }
        if (isAbsolute(decoded)) {
          failures.push({ file: relative(absoluteRoot, file), link, reason: "absolute file path" });
          continue;
        }
        const target = resolve(dirname(file), decoded);
        const inside = relative(absoluteRoot, target);
        if (inside === ".." || inside.startsWith(".." + sep)) {
          failures.push({ file: relative(absoluteRoot, file), link, reason: "path escapes repository" });
        } else if (!existsSync(target)) {
          failures.push({ file: relative(absoluteRoot, file), link, reason: "target does not exist" });
        }
      }
    }
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = findBrokenLinks(ROOT);
  if (errors.length) {
    for (const error of errors) console.error(error.file + ": " + error.link + " — " + error.reason);
    console.error("Found " + errors.length + " broken local Markdown link(s).");
    process.exitCode = 1;
  } else {
    console.log("Documentation check passed: all inspected local Markdown links resolve.");
  }
}
