import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";

/** Thrown by API handlers; converted to a JSON error response. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function zodDetails(error: ZodError) {
  return error.flatten().fieldErrors;
}

/** Parse + validate a JSON request body with Zod. Every API input goes through this. */
export async function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  req: Request,
): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(400, "Validation failed", zodDetails(result.error));
  }
  return result.data;
}

/** Parse + validate URL query params with Zod. */
export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  req: Request,
): z.infer<T> {
  const url = new URL(req.url);
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) {
    throw new ApiError(400, "Validation failed", zodDetails(result.error));
  }
  return result.data;
}

/** Uniform JSON error response for all API routes. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: zodDetails(error) },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
