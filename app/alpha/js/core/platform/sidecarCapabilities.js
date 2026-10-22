import { SIDECAR_DEPLOYMENT_FLAGS } from "../../config.js";

const flagKeys = Object.freeze({
  traktAuth: "NUVIO_ENABLE_TRAKT_BRIDGE",
  debrid: "NUVIO_ENABLE_DEBRID_BRIDGE",
  externalReturn: "NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE"
});

const messages = Object.freeze({
  traktAuth:
    "Trakt sign-in and refresh are unavailable on this site. Continue without Trakt, or use a site with a configured Trakt integration.",
  debrid:
    "TorBox playback and TorBox/Premiumize sign-in are unavailable on this site. Choose a direct compatible add-on source.",
  externalReturn:
    "Automatic progress and return notifications from external players are unavailable on this site. Use browser playback or update progress manually.",
  nativeMedia:
    "Native media processing is unavailable in this browser. Choose a browser-compatible source."
});

// Deployment permission to attempt fixed routes, not service-health or auth proof.
export function getSidecarCapabilities(runtime = globalThis) {
  const flags = runtime?.__NUVIO_ENV__ || SIDECAR_DEPLOYMENT_FLAGS;
  return Object.freeze({
    ...Object.fromEntries(
      Object.entries(flagKeys).map(([feature, key]) => [
        feature,
        Object.prototype.hasOwnProperty.call(flags, key) && flags[key] === "true"
      ])
    ),
    nativeMedia: false
  });
}

export function sidecarUnavailableMessage(feature) {
  return Object.prototype.hasOwnProperty.call(messages, feature)
    ? messages[feature]
    : "This integration is unavailable on this site.";
}

export function requireSidecarCapability(feature, runtime = globalThis) {
  if (getSidecarCapabilities(runtime)[feature] === true) return;
  const error = new Error(sidecarUnavailableMessage(feature));
  error.name = "SidecarUnavailableError";
  error.code = "SIDECAR_UNAVAILABLE";
  throw error;
}
