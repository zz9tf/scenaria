import type { Prisma } from "@prisma/client";
import type { JsonValue } from "@/types";

/** Prisma's Json column type is wider than our domain's; these keep the casts in one place. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function fromJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : (value as T);
}

export function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, JsonValue> {
  return fromJson<Record<string, JsonValue>>(value, {});
}

export function jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return fromJson<string[]>(value, []);
}
