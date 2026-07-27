import { ApiError } from "@/lib/api/errors";

export type Pagination = {
  page: number;
  limit: number;
  offset: number;
};

function positiveInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, "INVALID_PAGINATION", "La paginación no es válida.");
  }
  return parsed;
}

export function paginationFrom(request: Request): Pagination {
  const url = new URL(request.url);
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const limit = Math.min(100, positiveInteger(url.searchParams.get("limit"), 25));
  return { page, limit, offset: (page - 1) * limit };
}
