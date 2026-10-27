import { httpRequest } from "../../../core/network/httpClient.js";
import { addonFetch } from "../../../core/network/addonRequestScheduler.js";

export const SubtitleApi = {
  async getSubtitles(url, options = {}) {
    return httpRequest(url, {
      ...options,
      includeSessionAuth: false,
      fetchImpl: addonFetch
    });
  }
};
