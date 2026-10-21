import { NuvioDialog } from "./nuvioDialog.js";
import {
  assessBrowserExternalHandoff,
  copyBrowserExternalStreamLink,
  downloadBrowserExternalPlaylist,
  getBrowserExternalPlayerPlatform,
  getBrowserExternalPlayerStoreUrl,
  getManualBrowserExternalPlayerOptions
} from "./browserExternalPlayer.js";

const PLAYER_NAMES = { infuse: "Infuse (8.4.7+)", vlc: "VLC" };

// Deliberately keep the chooser after delivery: a browser cannot detect whether
// the app exists, opened, fetched the URL, or actually played it.
export function showBrowserExternalPlayerDialog({
  getContext,
  onLaunch,
  onDismiss,
  players = getManualBrowserExternalPlayerOptions()
}) {
  const initial = getContext();
  const assessment = assessBrowserExternalHandoff(initial || {});
  const platform = getBrowserExternalPlayerPlatform();
  const previousFocus = document.activeElement;
  let status;
  const report = (text) => { if (status) status.textContent = text; };
  const currentContext = () => {
    const current = getContext();
    if (!current || current.mediaUrl !== initial?.mediaUrl || current.subtitleUrl !== initial?.subtitleUrl) {
      report("The selected stream changed. Cancel and open this menu again.");
      return null;
    }
    const check = assessBrowserExternalHandoff(current);
    if (!check.allowed) { report(check.reason); return null; }
    return current;
  };
  const action = (label, onAction) => ({ label, className: "desktop-external-player-choice", onAction });
  const buttons = assessment.allowed ? [
    ...players.filter((id) => PLAYER_NAMES[id]).map((player) => action(`Open in ${PLAYER_NAMES[player]}`, () => {
      const context = currentContext();
      if (!context) return;
      try {
        const requested = onLaunch?.(player, context) === true;
        report(requested
          ? "Open requested, not confirmed playback. If nothing opened, use Player setup or copy the link. Return to this tab manually; progress is not automatic."
          : "Could not request opening the player. Use Player setup or copy the link; you can stay in Nuvio.");
      } catch (_) {
        report("Could not request opening the player. Use Player setup or copy the link.");
      }
    })),
    ...(platform === "other" ? [action("Download .m3u playlist", () => {
      const context = currentContext();
      if (context) report(downloadBrowserExternalPlaylist(context)
        ? "Playlist download requested. Open it in an installed player such as VLC. This does not confirm playback; progress stays manual. Delete the file when finished: it contains the full stream URL."
        : "Could not download the playlist. Try Copy stream link instead.");
    })] : []),
    action("Copy stream link", async () => {
      const context = currentContext();
      if (context) report(await copyBrowserExternalStreamLink(context)
        ? "Stream link copied. Paste it into your installed player's Open network stream control. Clear the clipboard when finished. Playback and progress are not confirmed."
        : "Could not copy the stream link. Clipboard access may be unavailable or denied.");
    }),
    action("Player setup / nothing opened?", () => {
      report(platform === "other"
        ? "Install a player such as VLC, then open the downloaded .m3u file or paste the link into Open network stream. No protocol handler is assumed. Return here manually to continue in Nuvio."
        : "Install your chosen app using its link below, then retry Open. Your browser may ask permission or report a missing app. No app is detected automatically. Return here manually to continue in Nuvio.");
    })
  ] : [];
  let dialog;
  let dismissed = false;
  const finish = () => {
    if (dismissed) return;
    dismissed = true;
    previousFocus?.focus?.();
    onDismiss?.();
  };
  buttons.push({
    label: "Cancel / stay in Nuvio",
    className: "desktop-external-player-cancel",
    onAction: () => dialog.destroy({ afterExit: finish })
  });
  dialog = new NuvioDialog({
    title: "Open in another player",
    subtitle: assessment.allowed
      ? "A native player may handle formats this browser cannot. Install it first; 4K, Dolby Vision and Atmos depend on the app, device and output."
      : "This source cannot use the URL-only hand-off.",
    panelClassName: "desktop-external-player-dialog external-handoff-dialog",
    actionsClassName: "desktop-external-player-actions",
    content: () => {
      const content = document.createElement("div");
      content.className = "external-handoff-details";
      status = document.createElement("p");
      status.setAttribute("role", "status");
      status.textContent = assessment.allowed
        ? "The player, clipboard or playlist receives the full stream URL, which may grant provider access. Browser cookies and request headers are not transferred. Return to this tab manually; progress is not automatic."
        : assessment.reason;
      content.appendChild(status);
      if (assessment.allowed) {
        const limits = document.createElement("p");
        limits.textContent = platform === "ios"
          ? "VLC is free; Infuse may require Pro. Infuse can receive subtitle/resume details; VLC and copy carry only the video URL."
          : "Video URL only: subtitles and resume are not transferred. Install a player such as the free VLC app.";
        content.appendChild(limits);
      }
      if (assessment.allowed && players.length) {
        const installs = document.createElement("p");
        installs.className = "external-handoff-installs";
        players.filter((id) => PLAYER_NAMES[id]).forEach((player) => {
          const link = document.createElement("a");
          link.href = getBrowserExternalPlayerStoreUrl({ player, platform });
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = `Get ${PLAYER_NAMES[player]}`;
          installs.appendChild(link);
        });
        content.appendChild(installs);
      }
      return content;
    },
    buttons,
    onDismiss: finish
  }).mount(document.body);
  return dialog;
}
