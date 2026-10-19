// Add-on manifest failures reach the UI as browser-generated text, which differs
// between engines ("Failed to fetch" vs "NetworkError when attempting to fetch
// resource." vs "Load failed"). Present one stable, actionable message per cause
// while preserving provider-supplied HTTP status text. Pure and side-effect free.
const NETWORK_PATTERN =
  /failed to fetch|networkerror|load failed|network request failed|err_network|err_connection|connection (?:refused|reset)|network connection was lost/i;
const JSON_PATTERN =
  /json\.parse|unexpected (?:token|character|end)|unexpected eof|premature end|is not valid json|invalid json|json at position/i;
const MANIFEST_PATTERN =
  /is not a function|cannot read propert|reading '|invalid manifest|manifest is not|missing required field/i;

const NETWORK_MESSAGE =
  "Could not reach the add-on server. Check the URL, the server's CORS settings and your connection.";
const JSON_MESSAGE = "The add-on returned an invalid JSON response.";
const MANIFEST_MESSAGE = "The add-on manifest is not valid.";
const UNKNOWN_MESSAGE = "Unable to add that addon.";

export function describeAddonFetchFailure(result) {
  if (!result || result.status !== "error") return "";
  const message = typeof result.message === "string" ? result.message.trim() : "";
  // A provider HTTP status is authoritative content, not a transport artifact.
  if (result.code) return message;
  if (!message) return UNKNOWN_MESSAGE;
  if (NETWORK_PATTERN.test(message)) return NETWORK_MESSAGE;
  if (JSON_PATTERN.test(message)) return JSON_MESSAGE;
  if (MANIFEST_PATTERN.test(message)) return MANIFEST_MESSAGE;
  return message;
}
