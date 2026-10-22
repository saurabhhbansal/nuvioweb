import { Router } from "../../navigation/router.js";
import { LocalStore } from "../../../core/storage/localStore.js";

export const GUEST_QR_BYPASS_KEY = "skipAuthQrGate";

// Shared by QR and browser email sign-in. This deliberately keeps the existing
// guest route and storage flags in one place rather than creating a second guest flow.
// A module of its own so the email sign-in screen does not pull in the QR
// screen, which is loaded only when it opens.
export function continueWithoutAccount() {
  LocalStore.set("hasSeenAuthQrOnFirstLaunch", true);
  LocalStore.set(GUEST_QR_BYPASS_KEY, true);
  Router.navigate(
    "home",
    {},
    {
      replaceHistory: true,
      skipStackPush: true
    }
  );
}
