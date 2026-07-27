import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { ApiError } from "@/lib/api/errors";

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
      return await handler(request, route);
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

      console.error("API_UNHANDLED_ERROR", error);
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
