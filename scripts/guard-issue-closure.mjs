import { readFileSync } from "node:fs";
import { closureProblem } from "./check-progress.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
if (event.action === "closed" && event.issue && !event.issue.pull_request) {
  const repository = process.env.GITHUB_REPOSITORY;
  const number = event.issue.number;
  const ledger = JSON.parse(readFileSync(new URL("../docs/PROGRESS.json", import.meta.url), "utf8"));
  const ticket = ledger.tickets.find((item) => item.number === number);
  async function api(path, method = "GET", body) {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "nuvioweb-completion-guard", "X-GitHub-Api-Version": "2022-11-28" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  const issue = await api(`issues/${number}`);
  if (issue.state === "closed") {
    const pullRequest = ticket?.completion?.pr ? await api(`pulls/${ticket.completion.pr}`) : null;
    const problem = closureProblem(ticket, pullRequest);
    if (problem) {
      await api(`issues/${number}`, "PATCH", { state: "open" });
      await api(`issues/${number}/comments`, "POST", { body: `Reopened by the completion-evidence guard: ${problem}. Imported commit references and a closed label are not implementation evidence. Update the protected progress ledger and verify acceptance criteria before closing this ticket. See docs/RECOVERY_AUDIT.md.` });
      console.log(`Reopened #${number}: ${problem}`);
    } else console.log(`#${number}: closure has ledger/merged-PR evidence.`);
  }
}
