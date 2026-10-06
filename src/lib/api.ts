import { EngineError } from "@/engine/errors";
import { NextResponse } from "next/server";

export function isDebugEnabled(): boolean {
  return process.env.SCENARIA_DEBUG === "1";
}

/**
 * Engine errors carry structured details and are safe to surface; anything else is
 * reported as a 500 without leaking internals.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof EngineError) {
    return NextResponse.json(
      { error: error.message, name: error.name, details: error.details },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: "internal engine error" }, { status: 500 });
}

export async function handle<T>(run: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (error) {
    return errorResponse(error);
  }
}
