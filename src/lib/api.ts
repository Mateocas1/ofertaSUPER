import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function searchParamsToObject(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

export function badRequestResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        issues: error.flatten(),
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: "Bad request",
    },
    { status: 400 },
  );
}
