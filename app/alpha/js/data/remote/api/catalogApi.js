import { httpRequest } from "../../../core/network/httpClient.js";
import { addonFetch } from "../../../core/network/addonRequestScheduler.js";

export const CatalogApi = {
  async getCatalog(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  }
};
