import { StateMutationError } from "@/engine/errors";
import { deleteStateValue, getStateValue, setStateValue } from "@/engine/state/path";
import { stateMutationPolicySchema } from "@/schemas";
import type { JsonValue, SimulationState, StateChange, StateMutationPolicy } from "@/types";

export const DEFAULT_MUTATION_POLICY: StateMutationPolicy = stateMutationPolicySchema.parse({});

export interface MutationOptions {
  /**
   * Engine- and content-authored effects are trusted and bypass the policy.
   * Only LLM proposals are policy-checked (§40).
   */
  trusted?: boolean;
  policy?: StateMutationPolicy;
}

export interface MutationResult {
  state: SimulationState;
  applied: StateChange[];
  rejected: Array<{ change: StateChange; reason: string }>;
}

/** Applies one change, throwing on anything the policy or the value types disallow. */
export function applyStateChange(
  state: SimulationState,
  change: StateChange,
  options: MutationOptions = {},
): SimulationState {
  const policy = options.policy ?? DEFAULT_MUTATION_POLICY;
  if (!options.trusted) assertAllowedByPolicy(change, policy);

  switch (change.operation) {
    case "set":
      return setStateValue(state, change.path, requireValue(change));
    case "delete":
      return deleteStateValue(state, change.path);
    case "increment":
    case "multiply": {
      const delta = asNumber(change, requireValue(change));
      const current = getStateValue(state, change.path);
      const base = current === undefined ? (change.operation === "increment" ? 0 : 1) : current;
      if (typeof base !== "number") {
        throw new StateMutationError(`cannot ${change.operation} a non-numeric value`, {
          path: change.path,
          current,
        });
      }
      const next = change.operation === "increment" ? base + delta : base * delta;
      return setStateValue(state, change.path, options.trusted ? next : clamp(next, policy));
    }
    case "append": {
      const current = getStateValue(state, change.path);
      const list = current === undefined ? [] : current;
      if (!Array.isArray(list)) {
        throw new StateMutationError("cannot append to a non-array value", {
          path: change.path,
          current,
        });
      }
      return setStateValue(state, change.path, [...(list as JsonValue[]), requireValue(change)]);
    }
  }
}

/**
 * Applies a batch of untrusted (LLM-proposed) changes, collecting rejections instead of
 * throwing so one bad proposal cannot abort a turn (§47).
 */
export function applyProposedChanges(
  state: SimulationState,
  changes: StateChange[],
  policy: StateMutationPolicy = DEFAULT_MUTATION_POLICY,
): MutationResult {
  let next = state;
  const applied: StateChange[] = [];
  const rejected: MutationResult["rejected"] = [];

  for (const change of changes) {
    try {
      next = applyStateChange(next, change, { policy });
      applied.push(change);
    } catch (error) {
      rejected.push({ change, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { state: next, applied, rejected };
}

function assertAllowedByPolicy(change: StateChange, policy: StateMutationPolicy): void {
  if (!policy.allowedOperations.includes(change.operation)) {
    throw new StateMutationError(`operation '${change.operation}' is not permitted for proposals`, {
      allowed: policy.allowedOperations,
    });
  }
  if (!policy.allowedPathPrefixes.some((prefix) => change.path.startsWith(prefix))) {
    throw new StateMutationError(`path '${change.path}' is outside the writable scopes`, {
      allowed: policy.allowedPathPrefixes,
    });
  }
  if (change.operation === "increment") {
    const delta = asNumber(change, requireValue(change));
    if (Math.abs(delta) > policy.maxIncrement) {
      throw new StateMutationError(
        `increment ${delta} exceeds maxIncrement ${policy.maxIncrement}`,
        { path: change.path },
      );
    }
  }
  if (change.operation === "set" && typeof change.value === "number") {
    const [min, max] = policy.numericRange;
    if (change.value < min || change.value > max) {
      throw new StateMutationError(`value ${change.value} is outside [${min}, ${max}]`, {
        path: change.path,
      });
    }
  }
}

function clamp(value: number, policy: StateMutationPolicy): number {
  const [min, max] = policy.numericRange;
  return Math.min(max, Math.max(min, value));
}

function requireValue(change: StateChange): JsonValue {
  if (change.value === undefined) {
    throw new StateMutationError(`operation '${change.operation}' requires a value`, {
      path: change.path,
    });
  }
  return change.value;
}

function asNumber(change: StateChange, value: JsonValue): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StateMutationError(`operation '${change.operation}' requires a finite number`, {
      path: change.path,
      value,
    });
  }
  return value;
}
