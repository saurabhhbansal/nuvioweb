// Recovery coordinator (#12 units 3-4): ties the reviewed pieces together.
//
// planAudioRecovery decides what may be offered; createRecoveryOperation records
// what was attempted and caps it; this module makes the two atomic so a caller
// cannot plan the same offer twice or exceed the operation's budget.
//
// Pure: no network, no player mutation, no persistence, no logging. The caller
// executes the returned action; this module only decides and records it.

import { RECOVERY_ACTIONS, planAudioRecovery } from "./playbackRecoveryPolicy.js";
import {
  RECOVERY_OPERATION_ACTION,
  RECOVERY_OPERATION_REASONS,
  createRecoveryOperation
} from "./recoveryOperation.js";

export const COORDINATOR_REASONS = Object.freeze({
  NONE: "none",
  NOT_STARTED: "not-started",
  INVALID_REQUEST: "invalid-request",
  STALE_GENERATION: "stale-generation",
  CLOSED: "operation-closed",
  ATTEMPT_REFUSED: "attempt-refused"
});

export function createRecoveryCoordinator({ generation } = {}) {
  const operation = createRecoveryOperation({ generation });

  const validGeneration = Number.isSafeInteger(generation) && generation > 0;

  return {
    get generation() {
      return generation;
    },

    isCurrent(candidateGeneration) {
      return operation.isCurrent(candidateGeneration);
    },

    // Record the rendition that failed. A coordinator that never started can
    // still be planned (it will simply be told why nothing may be offered).
    begin(failedTrackKey) {
      if (!validGeneration) {
        return { ok: false, reason: COORDINATOR_REASONS.INVALID_REQUEST };
      }
      const result = operation.begin(failedTrackKey, generation);
      return { ok: result.ok, reason: result.ok ? COORDINATOR_REASONS.NONE : result.reason };
    },

    // Plan and, when the plan proposes a track, record the attempt atomically.
    // A refused record is reported instead of the proposed action, so a caller
    // can never execute something the operation did not accept.
    plan({ tracks = [], lastConfirmedTrackKey = "", failure = null } = {}) {
      if (!validGeneration) {
        return {
          action: RECOVERY_ACTIONS.NONE,
          trackKey: null,
          reason: COORDINATOR_REASONS.INVALID_REQUEST,
          recorded: false
        };
      }
      if (operation.state !== "open") {
        return {
          action: RECOVERY_ACTIONS.NONE,
          trackKey: null,
          reason: COORDINATOR_REASONS.CLOSED,
          recorded: false
        };
      }
      const snapshot = operation.snapshot();
      const plan = planAudioRecovery({
        generation,
        currentGeneration: generation,
        tracks,
        failedTrackKey: snapshot.failedTrackKey || "",
        lastConfirmedTrackKey,
        failure,
        attempts: {
          alternate: snapshot.alternateAttempts,
          restore: snapshot.restoreAttempts
        }
      });
      if (
        plan.action !== RECOVERY_ACTIONS.OFFER_TRACK &&
        plan.action !== RECOVERY_ACTIONS.RESTORE_TRACK
      ) {
        return { ...plan, recorded: false };
      }
      const kind =
        plan.action === RECOVERY_ACTIONS.OFFER_TRACK
          ? RECOVERY_OPERATION_ACTION.ALTERNATE
          : RECOVERY_OPERATION_ACTION.RESTORE;
      const record =
        kind === RECOVERY_OPERATION_ACTION.ALTERNATE
          ? operation.offerAlternate(plan.trackKey, generation)
          : operation.offerRestore(plan.trackKey, generation);
      if (!record.ok) {
        const reason =
          record.reason === RECOVERY_OPERATION_REASONS.NOT_STARTED
            ? COORDINATOR_REASONS.NOT_STARTED
            : record.reason;
        return {
          action: RECOVERY_ACTIONS.UNSUPPORTED,
          trackKey: null,
          reason,
          recorded: false
        };
      }
      return { ...plan, recorded: true };
    },

    // Close on completion, cancellation, navigation, stop or source change.
    close(reason) {
      return operation.close(reason);
    },

    invalidate(candidateGeneration, reason) {
      return operation.invalidate(candidateGeneration, reason);
    },

    snapshot() {
      return operation.snapshot();
    }
  };
}
