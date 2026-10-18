import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closureProblem } from "./check-progress.mjs";

export async function guardClosure(event, ledger, api) {
  if (event.action !== "closed" || !event.issue || event.issue.pull_request) return "ignored";
  const number = event.issue.number;
  const ticket = ledger.tickets.find((item) => item.number === number);
  const issue = await api(`issues/${number}`);
  if (issue.state !== "closed") return "already open";
  let pullRequest = null;
  if (ticket?.completion?.pr) {
    try { pullRequest = await api(`pulls/${ticket.completion.pr}`); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  const problem = closureProblem(ticket, pullRequest);
  if (!problem) return "ledger/merged-PR evidence verified";
  await api(`issues/${number}`, "PATCH", { state: "open" });
  await api(`issues/${number}/comments`, "POST", { body: `Reopened by the completion-evidence guard: ${problem}. Imported commit references and a closed label are not implementation evidence. Update the protected progress ledger and verify acceptance criteria before closing this ticket. See docs/RECOVERY_AUDIT.md.` });
  return `reopened: ${problem}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const repository = process.env.GITHUB_REPOSITORY;
  const ledger = JSON.parse(readFileSync(new URL("../docs/PROGRESS.json", import.meta.url), "utf8"));
  async function api(path, method = "GET", body) {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "nuvioweb-completion-guard", "X-GitHub-Api-Version": "2022-11-28" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const error = new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  console.log(`#${event.issue?.number}: ${await guardClosure(event, ledger, api)}`);
}
