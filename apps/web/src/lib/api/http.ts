import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { ApiError } from "@/lib/api/errors";
import { withDbScope } from "@/lib/db-scope";

export type RouteParams = {
  params: Promise<Record<string, string>>;
};

type ApiHandler = (
  request: Request,
  route?: RouteParams,
) => Promise<Response> | Response;

export function api(handler: ApiHandler): ApiHandler {
  return async (request, route) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("origin");
        const expected = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
        if (origin && origin !== new URL(expected).origin) {
          throw new ApiError(403, "INVALID_ORIGIN", "El origen de la solicitud no está permitido.");
        }
        if (Number(request.headers.get("content-length") ?? 0) > 8 * 1024 * 1024) {
          throw new ApiError(413, "PAYLOAD_TOO_LARGE", "El archivo supera el límite permitido.");
        }
      }
      const result = await withDbScope(() => handler(request, route));
      result.headers.set("Cache-Control", "private, no-store");
      return result;
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          },
          { status: error.status },
        );
      }

      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Los datos enviados no son válidos.",
              details: error.flatten(),
            },
          },
          { status: 422 },
        );
      }

      console.error("API_UNHANDLED_ERROR", error instanceof Error ? error.name : "UnknownError");
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "No pudimos completar la operación.",
          },
        },
        { status: 500 },
      );
    }
  };
}

export async function jsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Se requiere application/json.");
  }

  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, "INVALID_JSON", "El cuerpo JSON no es válido.");
    }
    throw error;
  }
}

export function response(
  data: unknown,
  init: ResponseInit & { status?: number } = {},
): NextResponse {
  return NextResponse.json({ data }, init);
}

export function paginated(
  data: unknown[],
  pagination: { page: number; limit: number; total: number },
): NextResponse {
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  return NextResponse.json({
    data,
    pagination: {
      ...pagination,
      pages,
      hasNext: pagination.page < pages,
      hasPrevious: pagination.page > 1,
    },
  });
}
