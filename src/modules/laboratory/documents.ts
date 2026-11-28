import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReportDocumentQuery = {
  q?: string;
  from?: string;
  to?: string;
  linked?: "all" | "linked" | "unlinked";
  page?: number;
  pageSize?: number;
};

/** Historical report archive: searchable, never hidden by a default date filter. */
export async function listReportDocuments(query: ReportDocumentQuery = {}) {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(query.pageSize ?? 20)));
  const where: Prisma.LabReportDocumentWhereInput = {};

  if (query.linked === "linked") where.patientId = { not: null };
  if (query.linked === "unlinked") where.patientId = null;
  if (query.from || query.to) {
    where.reportDate = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    };
  }
  if (query.q?.trim()) {
    const term = query.q.trim();
    where.OR = [
      { filename: { contains: term, mode: "insensitive" } },
      { reportNo: { contains: term, mode: "insensitive" } },
      { testName: { contains: term, mode: "insensitive" } },
      { patient: { name: { contains: term, mode: "insensitive" } } },
      { patient: { uhid: { contains: term, mode: "insensitive" } } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.labReportDocument.count({ where }),
    prisma.labReportDocument.findMany({
      where,
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        filename: true,
        sourceFolder: true,
        reportNo: true,
        reportDate: true,
        testName: true,
        sizeBytes: true,
        sha256: true,
        matchConfidence: true,
        createdAt: true,
        patient: { select: { id: true, name: true, uhid: true } },
        order: { select: { id: true, orderNo: true } },
      },
    }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listReportDocumentsForZip(ids?: string[]) {
  return prisma.labReportDocument.findMany({
    where: ids?.length ? { id: { in: ids.slice(0, 500) } } : {},
    orderBy: [{ reportDate: "desc" }, { filename: "asc" }],
    select: { id: true, filename: true, bytes: true, patient: { select: { uhid: true } } },
  });
}

export async function getReportDocument(id: string) {
  return prisma.labReportDocument.findUnique({ where: { id } });
}
