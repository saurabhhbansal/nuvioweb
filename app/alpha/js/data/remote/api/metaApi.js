import { httpRequest } from "../../../core/network/httpClient.js";
import { addonFetch } from "../../../core/network/addonRequestScheduler.js";

export const MetaApi = {
  async getMeta(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  }
};
