import { browserCapabilityEnvironment, detectDeviceCapabilities, readinessVerdict, requestPersistentSiteData } from "../../core/streams/deviceCapabilities.js";

// Operate-mode extension: incumbent dark tokens, normal-flow footer after app,
// Check first, readable details on demand; never a modal or playback gate.
export function mountBrowserCapabilityBanner({ document = globalThis.document, environment = browserCapabilityEnvironment(), detect = detectDeviceCapabilities } = {}) {
  const slot = document.createElement("div");
  slot.className = "browser-capability-slot";
  const notice = document.createElement("aside");
  notice.className = "browser-capability-banner";
  notice.setAttribute("aria-labelledby", "readiness-heading");
  notice.innerHTML = `
    <h2 id="readiness-heading">Check this browser</h2>
    <p>See playback predictions, not a guarantee. No media is downloaded or played by this check.</p>
    <p class="readiness-status" role="status" aria-label="Browser readiness result" aria-live="polite"></p>
    <div class="readiness-actions">
      <button type="button" class="readiness-primary">Check</button>
      <button type="button" class="readiness-continue">Continue without checking</button>
    </div>
    <details>
      <summary>Details and optional storage</summary>
      <p>Checking cannot install codecs, fix CORS, set forbidden headers or defeat blockers. It does not grant autoplay permission. Use Play again if your browser rejects playback.</p>
      <p>No camera, microphone or capability-profile upload. Notifications, sharing and file access are not requested here.</p>
      <div class="readiness-results"></div>
      <h3>Optional: keep site data</h3>
      <p>Ask your browser to protect this site's existing data from automatic eviction. This is not more space, a download or consent to processing. Clearing site data in browser settings removes it and may sign you out.</p>
      <button type="button" class="readiness-storage">Keep site data</button>
      <p class="readiness-storage-status" role="status" aria-label="Site data persistence result"></p>
      <p>No optional local processing starts here. Any future processing action must explain its CPU/battery use, downloads, temporary-storage bound and deletion before you choose it. Declining optional actions leaves ordinary free playback available.</p>
    </details>`;
  const check = notice.querySelector(".readiness-primary");
  const dismiss = notice.querySelector(".readiness-continue");
  const status = notice.querySelector(".readiness-status");
  const results = notice.querySelector(".readiness-results");
  const storage = notice.querySelector(".readiness-storage");
  const storageStatus = notice.querySelector(".readiness-storage-status");
  const player = document.getElementById("player");
  const Observer = document.defaultView?.MutationObserver;
  let disposed = false;
  const syncPlayer = () => {
    // Router changes this inline display. Do not cover any playback controls.
    notice.hidden = Boolean(player && player.style.display && player.style.display !== "none");
  };
  const observer = player && Observer ? new Observer(syncPlayer) : null;
  observer?.observe(player, { attributes: true, attributeFilter: ["style"] });
  syncPlayer();
  function close() {
    disposed = true;
    observer?.disconnect();
    const hadFocus = notice.contains(document.activeElement);
    // Do not shorten the scrolling document: that clamps scrollTop and moves
    // unrelated app controls. Retain only inert empty space after dismissal.
    slot.style.height = `${slot.getBoundingClientRect().height}px`;
    notice.remove();
    if (hadFocus) {
      // Return to the ordinary UI without hijacking a user's existing focus.
      const target = [...document.querySelectorAll('button, a[href], input, [tabindex="0"]')]
        .find((node) => node.getClientRects().length && !node.disabled);
      target?.focus({ preventScroll: true });
    }
  }
  dismiss.addEventListener("click", close);
  notice.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  });
  check.addEventListener("click", async () => {
    check.disabled = true;
    status.textContent = "Checking browser predictions…";
    try {
      const report = await detect(environment);
      if (disposed) return;
      status.textContent = readinessVerdict(report);
      results.replaceChildren();
      const line = (text) => {
        const p = document.createElement("p");
        p.textContent = text;
        results.append(p);
      };
      line(`${report.platform}; ${report.engine}. Labels are hints, not capability evidence.`);
      line(`API availability: ${Object.entries(report.features).map(([key, value]) => `${key}: ${value ? "available" : "unavailable"}`).join("; ")}. Availability is not configuration support.`);
      for (const sample of report.samples) {
        const config = sample.configuration;
        const decoding = sample.mediaCapabilities;
        line(`${sample.label}: ${config.contentType}, ${config.width}×${config.height}, ${config.bitrate} bit/s, ${config.framerate} fps. Predictions — native: ${sample.native}; MediaCapabilities video-only: ${decoding.videoDecoding ? (decoding.videoDecoding.supported ? "supported" : "unsupported") : decoding.decodingStatus}; MSE: ${sample.mse}; managed media: ${sample.managedMedia}; WebCodecs video: ${sample.webCodecsVideo}.`);
      }
      line(`WebCodecs audio-only: ${JSON.stringify(report.audio.configuration)} — ${report.audio.prediction}. No demux/sync pipeline is established by WebCodecs availability.`);
      line(`HDR display query: ${report.hdrDisplayQuery}; physical HDR/HEVC Main10 display output: unknown. Dolby Vision: only profile 5 sample predicted; other profiles/layers and output unknown. MKV predictions do not cover every track/container combination. Managed media requires an eligible playback setup (including remote-playback policy on iPhone).`);
      line(`Persistent storage: ${report.persistentStorage}; notification permission: ${report.notificationPermission}. Observed playback: ${report.observedPlayback}. No audio, stream, physical output or external-player success is certified.`);
      dismiss.textContent = "Continue";
      check.textContent = "Check again";
    } catch {
      if (!disposed) status.textContent = "The check could not finish. Continue with ordinary playback; no permission is required.";
    } finally { if (!disposed) check.disabled = false; }
  });
  storage.addEventListener("click", async () => {
    storage.disabled = true;
    storageStatus.textContent = "Asking the browser to keep site data…";
    const result = await requestPersistentSiteData(environment.navigator?.storage);
    if (disposed) return;
    storageStatus.textContent = result === "granted" ? "Browser reports persistent storage granted. Playback capability is unchanged." : result === "not-granted" ? "Browser did not grant persistent storage. Ordinary playback is unchanged." : "Persistent storage is unavailable or its result is unknown. Ordinary playback is unchanged.";
    storage.disabled = false;
  });
  slot.append(notice);
  document.body.append(slot);
  return { dismiss: close };
}
