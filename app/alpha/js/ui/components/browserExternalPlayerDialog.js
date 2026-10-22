import { NuvioDialog } from "./nuvioDialog.js";
import { I18n } from "../../i18n/index.js";
import {
  assessBrowserExternalHandoff,
  copyBrowserExternalStreamLink,
  downloadBrowserExternalPlaylist,
  getBrowserExternalPlayerDelivery,
  getBrowserExternalPlayerName,
  getBrowserExternalPlayerPlatform,
  getBrowserExternalPlayerStoreUrl,
  getManualBrowserExternalPlayerOptions
} from "./browserExternalPlayer.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function playerButtonLabel(player, delivery) {
  if (player === "chooser") return t("external_player_open_with", {}, "Open with…");
  if (delivery === "copy") return t("external_player_copy_link", {}, "Copy link");
  const name = getBrowserExternalPlayerName(player);
  if (delivery === "playlist") {
    return t("external_player_open_playlist", { player: name }, `Open in ${name} (playlist file)`);
  }
  return t("external_player_open_in", { player: name }, `Open in ${name}`);
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
  const launchable = players.filter(
    (id) => id === "chooser" || id === "copylink" || getBrowserExternalPlayerName(id)
  );
  const delivery = (player) => getBrowserExternalPlayerDelivery(player, platform);
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

  const downloadPlaylist = () => {
    const context = currentContext();
    if (context) report(downloadBrowserExternalPlaylist(context)
      ? t("external_player_download_done", {}, "Playlist downloaded. It contains the stream link; delete it when done.")
      : t("external_player_download_failed", {}, "Could not download the playlist. Copy the link instead."));
  };
  const copyLink = async () => {
    const context = currentContext();
    if (context) report(await copyBrowserExternalStreamLink(context)
      ? t("external_player_copy_done", {}, "Link copied. Paste it into your player's network stream option.")
      : t("external_player_copy_failed", {}, "Could not copy the link. Clipboard access may be blocked."));
  };
  const launchButtons = launchable.map((player, index) => action(playerButtonLabel(player, delivery(player)), index === 0, () => {
    if (delivery(player) === "playlist") return downloadPlaylist();
    if (delivery(player) === "copy") return copyLink();
    const context = currentContext();
    if (!context) return;
    let requested = false;
    try { requested = onLaunch?.(player, context) === true; } catch (_) { requested = false; }
    report(requested
      ? t("external_player_open_requested", {}, "Opening… If nothing opened, install the app or copy the link.")
      : t("external_player_open_failed", {}, "Could not open the player. Copy the link instead."));
  }));
  // Copy link is always on offer, as its own choice or as the last resort.
  const copyButton = launchable.includes("copylink")
    ? []
    : [action(t("external_player_copy_link", {}, "Copy link"), launchButtons.length === 0, copyLink)];
  const buttons = [...launchButtons, ...copyButton];

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
    subtitle: !blocked && launchable.some((player) => delivery(player) === "playlist")
      ? t("external_player_desktop_hint", {}, "The playlist file opens in VLC, or whichever player opens .m3u files")
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
          const name = getBrowserExternalPlayerName(player);
          link.textContent = t("external_player_get", { player: name }, `Get ${name}`);
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
