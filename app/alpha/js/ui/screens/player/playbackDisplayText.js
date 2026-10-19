export function normalizePlaybackDisplayLineBreaks(value = "") {
  return String(value ?? "").replace(/\\r\\n|\\n|\\r/g, "\n");
}
// Messages are composed from translated fragments that may already end with
// punctuation. Appending an unconditional full stop reads as a typo, so only
// add one when the sentence has no terminator.
export function ensureSentenceEnding(value = "") {
  const text = String(value ?? "").trim();
  if (!text) return text;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
