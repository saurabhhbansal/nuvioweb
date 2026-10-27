import { httpRequest } from "../../../core/network/httpClient.js";
import { addonFetch } from "../../../core/network/addonRequestScheduler.js";

export const StreamApi = {
  async getStreams(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  }
};
