import { NuvioDialog } from "./nuvioDialog.js";

export function showLibraryStorageError(error) {
  if (!["LIBRARY_STORAGE_UNAVAILABLE", "LIBRARY_SYNC_STORAGE_UNAVAILABLE"].includes(error?.code)) return false;
  const dialog = new NuvioDialog({
    title: "Library change could not be confirmed",
    subtitle: "This device could not confirm that your change was safely saved. Check available browser storage and try again. Cloud sync was not started.",
    buttons: [{ label: "Close", onAction: () => dialog.destroy() }]
  }).mount(document.body);
  return true;
}
