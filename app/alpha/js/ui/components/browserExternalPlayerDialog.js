import { NuvioDialog } from "./nuvioDialog.js";
import { I18n } from "../../i18n/index.js";
import {
  assessBrowserExternalHandoff,
  copyBrowserExternalStreamLink,
  downloadBrowserExternalPlaylist,
  getBrowserExternalPlayerPlatform,
  getBrowserExternalPlayerStoreUrl,
  getManualBrowserExternalPlayerOptions
} from "./browserExternalPlayer.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

const PLAYER_NAMES = { lenna: "Lenna", outplayer: "Outplayer", infuse: "Infuse", vlc: "VLC" };

function playerButtonLabel(player) {
  if (player === "chooser") return t("external_player_open_with", {}, "Open with…");
  return t("external_player_open_in", { player: PLAYER_NAMES[player] }, `Open in ${PLAYER_NAMES[player]}`);
}

// One primary action per platform, everything else secondary. The chooser stays
// open after delivery: a browser cannot tell whether the app opened or played.
export function showBrowserExternalPlayerDialog({
  getContext,
  onLaunch,
  onDismiss,
  players = getManualBrowserExternalPlayerOptions()
}) {
  const initial = getContext();
  const assessment = assessBrowserExternalHandoff(initial || {});
  const needsHeaders = assessment.code === "headers-required";
  const blocked = !assessment.allowed;
  const platform = getBrowserExternalPlayerPlatform();
  const launchable = platform === "other"
    ? []
    : players.filter((id) => id === "chooser" || PLAYER_NAMES[id]);
  const previousFocus = document.activeElement;
  let status;
  const report = (text) => { if (status) status.textContent = text; };
  const currentContext = () => {
    const current = getContext();
    if (!current || current.mediaUrl !== initial?.mediaUrl || current.subtitleUrl !== initial?.subtitleUrl) {
      report(t("external_player_stream_changed", {}, "The selected stream changed. Close this and open it again."));
      return null;
    }
    const check = assessBrowserExternalHandoff(current);
    if (!check.allowed) { report(blockedMessage(check)); return null; }
    return current;
  };
  const action = (label, primary, onAction) => ({
    label,
    disabled: blocked,
    className: `desktop-external-player-choice ${primary ? "external-handoff-primary" : "external-handoff-secondary"}`,
    onAction
  });

  const launchButtons = launchable.map((player, index) => action(playerButtonLabel(player), index === 0, () => {
    const context = currentContext();
    if (!context) return;
    let requested = false;
    try { requested = onLaunch?.(player, context) === true; } catch (_) { requested = false; }
    report(requested
      ? t("external_player_open_requested", {}, "Opening… If nothing opened, install the app or copy the link.")
      : t("external_player_open_failed", {}, "Could not open the player. Copy the link instead."));
  }));
  const downloadButton = platform === "other" ? [action(t("external_player_download_m3u", {}, "Download .m3u"), true, () => {
    const context = currentContext();
    if (context) report(downloadBrowserExternalPlaylist(context)
      ? t("external_player_download_done", {}, "Playlist downloaded. It contains the stream link; delete it when done.")
      : t("external_player_download_failed", {}, "Could not download the playlist. Copy the link instead."));
  })] : [];
  const copyButton = action(t("external_player_copy_link", {}, "Copy link"), false, async () => {
    const context = currentContext();
    if (context) report(await copyBrowserExternalStreamLink(context)
      ? t("external_player_copy_done", {}, "Link copied. Paste it into your player's network stream option.")
      : t("external_player_copy_failed", {}, "Could not copy the link. Clipboard access may be blocked."));
  });
  const buttons = [...launchButtons, ...downloadButton, copyButton];

  let dialog;
  let dismissed = false;
  const finish = () => {
    if (dismissed) return;
    dismissed = true;
    previousFocus?.focus?.();
    onDismiss?.();
  };
  buttons.push({
    label: t("common.cancel", {}, "Cancel"),
    className: "desktop-external-player-cancel",
    onAction: () => dialog.destroy({ afterExit: finish })
  });
  dialog = new NuvioDialog({
    title: t("external_player_title", {}, "Open in another player"),
    subtitle: platform === "other" && !blocked
      ? t("external_player_desktop_hint", {}, "Open the .m3u with VLC or mpv")
      : "",
    panelClassName: "desktop-external-player-dialog external-handoff-dialog",
    actionsClassName: "desktop-external-player-actions",
    content: () => {
      const content = document.createElement("div");
      content.className = "external-handoff-details";
      if (needsHeaders) {
        const badge = document.createElement("span");
        badge.className = "external-handoff-badge";
        badge.textContent = t("external_player_needs_headers", {}, "Needs headers");
        content.appendChild(badge);
      }
      status = document.createElement("p");
      status.setAttribute("role", "status");
      status.textContent = blocked
        ? blockedMessage(assessment)
        : t("external_player_link_only", {}, "Only the stream link is sent. Return here when you're done.");
      content.appendChild(status);
      const installs = blocked ? [] : launchable
        .map((player) => ({ player, href: getBrowserExternalPlayerStoreUrl({ player, platform }) }))
        .filter((entry) => entry.href);
      if (installs.length) {
        const row = document.createElement("p");
        row.className = "external-handoff-installs";
        installs.forEach(({ player, href }) => {
          const link = document.createElement("a");
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = t("external_player_get", { player: PLAYER_NAMES[player] }, `Get ${PLAYER_NAMES[player]}`);
          row.appendChild(link);
        });
        content.appendChild(row);
      }
      return content;
    },
    buttons,
    onDismiss: finish
  }).mount(document.body);
  return dialog;
}

function blockedMessage(assessment) {
  return assessment.code === "headers-required"
    ? t("external_player_headers_blocked", {}, "This source requires request headers, which external players can't receive. Pick another source.")
    : t("external_player_invalid_url", {}, "This link can't be opened outside the browser. Pick another source.");
}
