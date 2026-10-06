import { StatePathError } from "@/engine/errors";
import type { JsonValue, SimulationState } from "@/types";

export const STATE_ROOTS = ["world", "relationships", "scenario", "conversation"] as const;
export type StateRoot = (typeof STATE_ROOTS)[number];

type Container = Record<string, unknown>;

function isContainer(value: unknown): value is Container {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Splits a dotted path and asserts its root is one of the four state scopes (§9).
 * Keeping root validation here means every reader and writer rejects the same paths.
 */
export function parseStatePath(path: string): { root: StateRoot; segments: string[] } {
  const segments = path.split(".");
  const [root, ...rest] = segments;
  if (root === undefined || !(STATE_ROOTS as readonly string[]).includes(root)) {
    throw new StatePathError(`state path must start with one of ${STATE_ROOTS.join(" | ")}`, { path });
  }
  if (rest.length === 0) {
    throw new StatePathError("state path must address a value inside a scope, not the scope itself", {
      path,
    });
  }
  if (rest.some((segment) => segment.length === 0)) {
    throw new StatePathError("state path contains an empty segment", { path });
  }
  return { root: root as StateRoot, segments: rest };
}

export function getStateValue(state: SimulationState, path: string): unknown {
  const { root, segments } = parseStatePath(path);
  let cursor: unknown = state[root];
  for (const segment of segments) {
    if (!isContainer(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

export function hasStatePath(state: SimulationState, path: string): boolean {
  const { root, segments } = parseStatePath(path);
  let cursor: unknown = state[root];
  for (const segment of segments) {
    if (!isContainer(cursor) || !(segment in cursor)) return false;
    cursor = cursor[segment];
  }
  return true;
}

/** Returns a structurally shared copy with `path` written; the input state is never mutated. */
export function setStateValue(
  state: SimulationState,
  path: string,
  value: JsonValue,
): SimulationState {
  const { root, segments } = parseStatePath(path);
  return { ...state, [root]: writeInto(state[root] as Container, segments, value) };
}

export function deleteStateValue(state: SimulationState, path: string): SimulationState {
  const { root, segments } = parseStatePath(path);
  return { ...state, [root]: deleteFrom(state[root] as Container, segments) };
}

function writeInto(container: Container, segments: string[], value: JsonValue): Container {
  const [head, ...rest] = segments;
  if (head === undefined) throw new StatePathError("empty write path");
  if (rest.length === 0) return { ...container, [head]: value };
  const child = container[head];
  return { ...container, [head]: writeInto(isContainer(child) ? child : {}, rest, value) };
}

function deleteFrom(container: Container, segments: string[]): Container {
  const [head, ...rest] = segments;
  if (head === undefined) throw new StatePathError("empty delete path");
  if (!(head in container)) return container;
  if (rest.length === 0) {
    const next = { ...container };
    delete next[head];
    return next;
  }
  const child = container[head];
  if (!isContainer(child)) return container;
  return { ...container, [head]: deleteFrom(child, rest) };
}

export function emptySimulationState(): SimulationState {
  return { world: {}, relationships: {}, scenario: {}, conversation: {} };
}
