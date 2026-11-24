import { Prisma, type PrismaClient } from "@prisma/client";

export type Db = Prisma.TransactionClient | PrismaClient;

export type AuditEntry = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Writes an audit log row. Pass the transaction client when the audited change
 * happens inside a transaction so both commit or roll back together.
 */
export async function writeAuditLog(db: Db, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: (entry.before ?? Prisma.DbNull) as Prisma.InputJsonValue,
      after: (entry.after ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
  });
}
