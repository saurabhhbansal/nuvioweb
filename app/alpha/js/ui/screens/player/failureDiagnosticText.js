// Translated copy for a playback failure diagnostic.
//
// The diagnostic itself (core/player/failureDiagnostics.js) stays in English
// because it is also the exported report. What the player shows is looked up
// here by cause and next action, with the report's English as the fallback.

function keyPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function diagnosticExplanation(diagnostic, t) {
  if (!diagnostic) return "";
  const cause = String(diagnostic.cause || "");
  const key = cause.startsWith("unknown-at-")
    ? "player_diagnostic_cause_unknown"
    : `player_diagnostic_cause_${keyPart(cause)}`;
  const status = diagnostic.observed?.httpStatus;
  return t(key, [status ?? ""], diagnostic.explanation || "");
}

export function diagnosticNextAction(diagnostic, t) {
  const action = diagnostic?.nextAction;
  if (!action) return "";
  // Activation failures share the "choose-source" action but need other advice.
  const key =
    diagnostic.cause === "activation-required"
      ? "player_diagnostic_action_activation"
      : `player_diagnostic_action_${keyPart(action.id)}`;
  return t(key, {}, action.label || "");
}
