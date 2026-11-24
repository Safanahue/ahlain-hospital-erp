import type { ServiceCatalog } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ServiceListQuery } from "./schemas";

export type ServiceListResult = {
  items: ServiceCatalog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Server-side paginated service catalog list: search (code / name) plus
 * department, category and active/inactive filters.
 */
export async function listServices(
  query: ServiceListQuery,
): Promise<ServiceListResult> {
  const { page, pageSize, q, department, category, active } = query;

  const where = {
    ...(department ? { department } : {}),
    ...(category ? { category } : {}),
    ...(active !== undefined ? { active } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.serviceCatalog.count({ where }),
    prisma.serviceCatalog.findMany({
      where,
      orderBy: [{ active: "desc" }, { code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getService(id: string): Promise<ServiceCatalog | null> {
  return prisma.serviceCatalog.findUnique({ where: { id } });
}
