// Cloudflare Pages route for /api/trakt/*. The logic and its tests live in
// deploy/cloudflare/traktAuthEdge.mjs.
import { handleTraktAuth } from "../../../deploy/cloudflare/traktAuthEdge.mjs";

export function onRequest({ request, env }) {
  return handleTraktAuth(request, env);
}
