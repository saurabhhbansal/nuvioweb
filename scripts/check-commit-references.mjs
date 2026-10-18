import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function closingReferences(message, repository) {
  const found = new Set();
  const reference = String.raw`(?:https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+|(?:[\w.-]+\/[\w.-]+)?#\d+)`;
  const directives = new RegExp(String.raw`\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s*:?\s+(${reference}(?:(?:\s*(?:,|;|\band\b)\s*|\s+)${reference})*)`, "gi");
  for (const directive of message.matchAll(directives)) {
    const references = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)|(?:([\w.-]+\/[\w.-]+))?#(\d+)/g;
    for (const ref of directive[1].matchAll(references)) {
      const owner = ref[1] || ref[3];
      if (!owner || owner.toLowerCase() === repository.toLowerCase()) found.add(Number(ref[2] || ref[4]));
    }
  }
  return [...found];
}

export function scanCommits(base, head, repository, cwd = process.cwd()) {
  const output = execFileSync("git", ["log", "-z", "--format=%H%n%B", `${base}..${head}`], { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return output.split("\0").filter(Boolean).flatMap((record) => {
    const [sha, ...body] = record.trimStart().split("\n");
    return closingReferences(body.join("\n"), repository).map((issue) => ({ sha, issue }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) throw new Error("Usage: node scripts/check-commit-references.mjs BASE [HEAD]");
  const repository = process.env.GITHUB_REPOSITORY || "saurabhhbansal/nuvioweb";
  let collisions;
  try { collisions = scanCommits(base, head, repository); }
  catch { console.error("Commit preflight could not read the requested ancestry; verify refs and subprocess permissions."); process.exit(1); }
  for (const [label, text] of [["PR title", process.env.PR_TITLE], ["PR description", process.env.PR_BODY]]) {
    for (const issue of closingReferences(text || "", repository)) collisions.push({ sha: label, issue });
  }
  if (collisions.length) {
    for (const { sha, issue } of collisions) console.error(`${sha}: closing reference #${issue} can close a local roadmap ticket`);
    console.error("Preserve upstream history. Resolve the import collision before merge; use Refs in project commits and close issues explicitly after evidence verification.");
    process.exitCode = 1;
  } else console.log("New commit ancestry contains no local issue-closing directives.");
}
