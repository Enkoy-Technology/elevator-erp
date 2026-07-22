export interface PageQuery {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const normalizePageQuery = (
  pageRaw?: string,
  pageSizeRaw?: string,
): PageQuery => {
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      Number.parseInt(pageSizeRaw ?? String(DEFAULT_PAGE_SIZE), 10) ||
        DEFAULT_PAGE_SIZE,
    ),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
};

export const toPaginatedResult = <T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> => ({
  items,
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});
