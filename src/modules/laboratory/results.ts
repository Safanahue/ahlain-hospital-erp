import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModulePermission } from "@/modules/auth/require-permission";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import { saveResultsSchema, type SaveResultsInput } from "./schemas";
import {
  flagResult,
  formatReferenceRange,
  parseNumericResult,
  resolveRangeForPatient,
} from "./ranges";

async function assertCanAccessLab(actor: User) {
  await requireModulePermission(actor, "lab.results");
}

/**
 * Saves structured readings for a lab order, snapshotting the unit, reference
 * interval and HIGH/LOW flag of every parameter. The flag is computed on the
 * server from configured ranges — the client cannot set it.
 */
export async function saveOrderResults(
  orderId: string,
  rawInput: SaveResultsInput,
  actor: User,
) {
  await assertCanAccessLab(actor);
  const input = saveResultsSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const order = await tx.labOrder.findUnique({
      where: { id: orderId },
      include: { patient: true },
    });
    if (!order) throw new ApiError(404, "Lab order not found");
    if (order.status === "VERIFIED" || order.status === "CANCELLED") {
      throw new ApiError(400, `Cannot enter results for a lab order that is ${order.status}`);
    }

    const templateId = input.templateId ?? order.templateId ?? null;
    const parameters = templateId
      ? await tx.labTemplateParameter.findMany({
          where: { templateId },
          include: { ranges: true },
        })
      : [];

    const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]));
    const byName = new Map(parameters.map((parameter) => [parameter.name.toLowerCase(), parameter]));

    const rows = input.results.map((row, index) => {
      const parameter =
        (row.parameterId ? byId.get(row.parameterId) : undefined) ??
        byName.get(row.parameterName.toLowerCase()) ??
        null;
      const range = parameter
        ? resolveRangeForPatient(parameter.ranges, {
            age: order.patient.age,
            gender: order.patient.gender,
          })
        : null;

      const unit = (row.unit || parameter?.unit || "").trim();
      const renderedRange =
        row.referenceRange?.trim() || (range ? formatReferenceRange(range, unit) : null);

      return {
        orderId,
        parameterId: parameter?.id ?? null,
        section: row.section?.trim() || parameter?.section || null,
        parameterName: row.parameterName.trim(),
        resultValue: row.resultValue.trim(),
        unit,
        referenceRange: renderedRange,
        flag: flagResult(parseNumericResult(row.resultValue), range),
        sortOrder: row.sortOrder ?? parameter?.sortOrder ?? index,
      };
    });

    await tx.labOrderResult.deleteMany({ where: { orderId } });
    await tx.labOrderResult.createMany({ data: rows });

    const summary = rows
      .map((row) => `${row.parameterName}: ${row.resultValue}${row.unit ? ` ${row.unit}` : ""}`)
      .join("\n");
    const referenceSummary =
      rows
        .map((row) => (row.referenceRange ? `${row.parameterName}: ${row.referenceRange}` : null))
        .filter(Boolean)
        .slice(0, 3)
        .join("; ") || null;

    const updated = await tx.labOrder.update({
      where: { id: orderId },
      data: {
        status: "RESULT_ENTERED",
        templateId,
        resultValue: summary,
        referenceRange: referenceSummary,
        ...(input.findings !== undefined
          ? { findings: input.findings?.trim() || null }
          : {}),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "LAB_RESULTS_ENTERED",
      entity: "LabOrder",
      entityId: orderId,
      before: { status: order.status, templateId: order.templateId },
      after: {
        status: updated.status,
        templateId,
        parameterCount: rows.length,
        flagged: rows.filter((row) => row.flag === "HIGH" || row.flag === "LOW").length,
      },
    });

    return { order: updated, results: rows };
  });
}

/** Everything the printable report needs, including the stored snapshot rows. */
export async function getOrderReport(id: string) {
  return prisma.labOrder.findUnique({
    where: { id },
    include: {
      patient: true,
      orderedBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
      template: { select: { id: true, name: true, category: true } },
      results: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
}
