import "server-only";
import type { Prisma, User } from "@prisma/client";
import type { z } from "zod";
import { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/modules/auth/authorize";
import { LAB_PRESET_MANAGE_ROLES, LAB_PRESET_VIEW_ROLES } from "@/modules/auth/roles";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import {
  createTemplateSchema,
  updateTemplateSchema,
  duplicateTemplateSchema,
  templateParameterSchema,
  type CreateTemplateInput,
  type DuplicateTemplateInput,
  type UpdateTemplateInput,
} from "./schemas";

type ParsedTemplateParameter = z.infer<typeof templateParameterSchema>;

const templateInclude = {
  parameters: {
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { ranges: { orderBy: [{ gender: "asc" }, { ageMinYears: "asc" }] } },
  },
} satisfies Prisma.LabReportTemplateInclude;

export type TemplateWithParameters = Prisma.LabReportTemplateGetPayload<{
  include: typeof templateInclude;
}>;

function assertCanView(actor: User) {
  const result = authorize({ role: actor.role, active: actor.active }, LAB_PRESET_VIEW_ROLES);
  if (!result.ok) throw new ApiError(result.status, result.message);
}

function assertCanManage(actor: User) {
  const result = authorize({ role: actor.role, active: actor.active }, LAB_PRESET_MANAGE_ROLES);
  if (!result.ok) throw new ApiError(result.status, result.message);
}

function parameterCreateData(input: ParsedTemplateParameter[]) {
  return input.map((parameter, index) => ({
    section: parameter.section?.trim() || "",
    name: parameter.name.trim(),
    unit: parameter.unit?.trim() || "",
    dataType: parameter.dataType ?? "NUMERIC",
    sortOrder: parameter.sortOrder ?? index,
    ranges: {
      create: parameter.ranges.map((range) => ({
        gender: range.gender ?? "Both",
        ageMinYears: range.ageMinYears ?? null,
        ageMaxYears: range.ageMaxYears ?? null,
        minValue: range.minValue ?? null,
        maxValue: range.maxValue ?? null,
        displayRange: range.displayRange?.trim() || null,
        notes: range.notes?.trim() || null,
      })),
    },
  }));
}

export async function listTemplates(query?: {
  q?: string;
  category?: string;
  includeInactive?: boolean;
}): Promise<TemplateWithParameters[]> {
  const where: Prisma.LabReportTemplateWhereInput = {};
  if (!query?.includeInactive) where.active = true;
  if (query?.category) where.category = query.category;
  if (query?.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { category: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }

  return prisma.labReportTemplate.findMany({
    where,
    include: templateInclude,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function getTemplate(id: string): Promise<TemplateWithParameters | null> {
  return prisma.labReportTemplate.findUnique({ where: { id }, include: templateInclude });
}

export async function getTemplatesForViewer(actor: User): Promise<TemplateWithParameters[]> {
  assertCanView(actor);
  return listTemplates({ includeInactive: true });
}

export async function createTemplate(rawInput: CreateTemplateInput, actor: User) {
  assertCanManage(actor);
  const input = createTemplateSchema.parse(rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const template = await tx.labReportTemplate.create({
        data: {
          name: input.name.trim(),
          category: input.category?.trim() || "Haematology",
          description: input.description?.trim() || null,
          active: input.active ?? true,
          createdById: actor.id,
          parameters: { create: parameterCreateData(input.parameters) },
        },
        include: templateInclude,
      });

      await writeAuditLog(tx, {
        userId: actor.id,
        action: "LAB_TEMPLATE_CREATED",
        entity: "LabReportTemplate",
        entityId: template.id,
        before: null,
        after: {
          id: template.id,
          name: template.name,
          category: template.category,
          parameterCount: template.parameters.length,
        },
      });

      return template;
    });
  } catch (error) {
    if (error instanceof PrismaNS.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, `A report preset named "${input.name}" already exists. Pick another name.`);
    }
    throw error;
  }
}

export async function updateTemplate(id: string, rawInput: UpdateTemplateInput, actor: User) {
  assertCanManage(actor);
  const input = updateTemplateSchema.parse(rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.labReportTemplate.findUnique({
        where: { id },
        include: templateInclude,
      });
      if (!before) throw new ApiError(404, "Report preset not found");

      if (input.parameters) {
        // Replacing the parameter list cascades its ranges. Issued reports keep
        // their own snapshot rows (LabOrderResult), so history is unaffected.
        await tx.labTemplateParameter.deleteMany({ where: { templateId: id } });
      }

      const updated = await tx.labReportTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.category !== undefined ? { category: input.category.trim() || "Haematology" } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.parameters
            ? { parameters: { create: parameterCreateData(input.parameters) } }
            : {}),
        },
        include: templateInclude,
      });

      await writeAuditLog(tx, {
        userId: actor.id,
        action: "LAB_TEMPLATE_UPDATED",
        entity: "LabReportTemplate",
        entityId: updated.id,
        before: {
          name: before.name,
          category: before.category,
          parameterCount: before.parameters.length,
        },
        after: {
          name: updated.name,
          category: updated.category,
          parameterCount: updated.parameters.length,
        },
      });

      return updated;
    });
  } catch (error) {
    if (error instanceof PrismaNS.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, `A report preset named "${input.name}" already exists. Pick another name.`);
    }
    throw error;
  }
}

export async function deleteTemplate(id: string, actor: User) {
  assertCanManage(actor);

  return prisma.$transaction(async (tx) => {
    const before = await tx.labReportTemplate.findUnique({
      where: { id },
      include: templateInclude,
    });
    if (!before) throw new ApiError(404, "Report preset not found");

    await tx.labReportTemplate.delete({ where: { id } });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "LAB_TEMPLATE_DELETED",
      entity: "LabReportTemplate",
      entityId: id,
      before: {
        id: before.id,
        name: before.name,
        category: before.category,
        parameterCount: before.parameters.length,
      },
      after: null,
    });

    return { success: true, deletedId: id };
  });
}

/** Copies a preset (parameters + ranges) under a new unique name. */
export async function duplicateTemplate(
  id: string,
  rawInput: DuplicateTemplateInput,
  actor: User,
) {
  assertCanManage(actor);
  const input = duplicateTemplateSchema.parse(rawInput ?? {});

  const source = await prisma.labReportTemplate.findUnique({ where: { id }, include: templateInclude });
  if (!source) throw new ApiError(404, "Report preset not found");

  let name = input.name?.trim();
  if (!name) {
    const base = `${source.name} (Copy)`;
    name = base;
    let suffix = 2;
    while (await prisma.labReportTemplate.findUnique({ where: { name } })) {
      name = `${source.name} (Copy ${suffix})`;
      suffix += 1;
    }
  }

  return createTemplate(
    {
      name,
      category: source.category,
      description: source.description ?? undefined,
      active: true,
      parameters: source.parameters.map((parameter, index) => ({
        section: parameter.section,
        name: parameter.name,
        unit: parameter.unit,
        dataType: parameter.dataType as "NUMERIC" | "TEXT",
        sortOrder: index,
        ranges: parameter.ranges.map((range) => ({
          gender: range.gender as "Male" | "Female" | "Both",
          ageMinYears: range.ageMinYears,
          ageMaxYears: range.ageMaxYears,
          minValue: range.minValue,
          maxValue: range.maxValue,
          displayRange: range.displayRange,
          notes: range.notes,
        })),
      })),
    },
    actor,
  );
}
