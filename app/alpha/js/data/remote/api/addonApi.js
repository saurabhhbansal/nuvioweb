import { httpRequest } from "../../../core/network/httpClient.js";
import { addonFetch } from "../../../core/network/addonRequestScheduler.js";

export const AddonApi = {
  async getManifest(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  },

  async getMeta(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  },

  async getStreams(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  },

  async getSubtitles(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  }
};
