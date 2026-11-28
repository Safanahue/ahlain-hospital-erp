import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function buildHref(
  basePath: string,
  query: Record<string, string | undefined>,
  page: number,
  pageParam: string,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set(pageParam, String(page));
  else params.delete(pageParam);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function Pagination({
  basePath,
  query,
  page,
  totalPages,
  total,
  pageSize,
  pageParam = "page",
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /** Query key used for the page number; use a distinct key when a page has
   *  more than one independently paginated table. */
  pageParam?: string;
}) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-navy">{from}–{to}</span> of{" "}
        <span className="font-medium text-navy">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Link
          href={buildHref(basePath, query, page - 1, pageParam)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={`inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium ${
            page <= 1
              ? "pointer-events-none opacity-40"
              : "text-navy hover:bg-page"
          }`}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Previous
        </Link>
        <Link
          href={buildHref(basePath, query, page + 1, pageParam)}
          aria-disabled={page >= totalPages}
          tabIndex={page >= totalPages ? -1 : undefined}
          className={`inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium ${
            page >= totalPages
              ? "pointer-events-none opacity-40"
              : "text-navy hover:bg-page"
          }`}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
