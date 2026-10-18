import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function closureProblem(ticket, pullRequest) {
  if (!ticket) return "ticket has no completion-ledger entry";
  if (ticket.status === "cancelled" && ticket.decision) return null;
  if (ticket.status !== "verified") return "acceptance criteria are not verified";
  const evidence = ticket.completion;
  if (!Number.isInteger(evidence?.pr) || !evidence?.verification?.length || !evidence?.documents?.length) {
    return "completion evidence is incomplete";
  }
  if (pullRequest?.number !== evidence.pr || !pullRequest.merged_at) return "evidence PR is not merged";
  return null;
}

export function validateProgress(ledger, root) {
  const errors = [];
  const ids = new Set(ledger.tickets.map((ticket) => ticket.number));
  if (ids.size !== ledger.tickets.length) errors.push("duplicate ticket numbers");
  const statuses = new Set(["verified", "in_progress", "blocked_external", "pending", "ready", "cancelled"]);
  for (const ticket of ledger.tickets) {
    const prefix = `#${ticket.number}`;
    if (!Number.isInteger(ticket.number) || !ticket.title || !statuses.has(ticket.status)) errors.push(`${prefix}: invalid identity/status`);
    for (const dependency of ticket.dependencies ?? []) if (!ids.has(dependency)) errors.push(`${prefix}: unknown dependency #${dependency}`);
    if (ticket.status === "blocked_external" && !ticket.blocker) errors.push(`${prefix}: missing external blocker`);
    if (ticket.status === "cancelled" && !ticket.decision) errors.push(`${prefix}: missing cancellation decision`);
    if (ticket.status === "verified") {
      const problem = closureProblem(ticket, { number: ticket.completion?.pr, merged_at: "validated separately by closure guard" });
      if (problem) errors.push(`${prefix}: ${problem}`);
      for (const path of ticket.completion?.documents ?? []) if (!existsSync(resolve(root, path))) errors.push(`${prefix}: missing evidence document ${path}`);
      for (const dependency of ticket.dependencies ?? []) if (ledger.tickets.find((item) => item.number === dependency)?.status !== "verified") errors.push(`${prefix}: unverified dependency #${dependency}`);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const ledger = JSON.parse(readFileSync(new URL("../docs/PROGRESS.json", import.meta.url), "utf8"));
  const errors = validateProgress(ledger, root);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log(`Progress ledger valid: ${ledger.tickets.length} tickets; ${ledger.tickets.filter((ticket) => ticket.status === "verified").length} evidence-backed completions.`);
}
