import { execSync } from "child_process";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TEST_DATABASE_URL } from "../constants";

/**
 * Runs the real `prisma/seed.ts` entrypoint exactly as `npm run db:seed`
 * does, against the dedicated test database.
 */
function runSeed() {
  execSync("npx tsx prisma/seed.ts", {
    cwd: path.resolve(__dirname, "..", ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
    timeout: 90_000,
  });
}

const SEED_EMAILS = [
  "admin@ahlain.in",
  "billing@ahlain.in",
  "accounts@ahlain.in",
  "doctor@ahlain.in",
  "cardiologist@ahlain.in",
  "dentist@ahlain.in",
  "reception@ahlain.in",
  "nurse@ahlain.in",
  "lab@ahlain.in",
  "pharmacy@ahlain.in",
];

async function snapshot() {
  const [users, services, invoices, payments] = await Promise.all([
    prisma.user.findMany(),
    prisma.serviceCatalog.findMany(),
    prisma.invoice.count(),
    prisma.payment.count(),
  ]);
  const devUsers = users.filter((u) => SEED_EMAILS.includes(u.email));
  return {
    userCount: users.length,
    devEmails: devUsers.map((u) => u.email).sort(),
    devRoles: [...new Set(devUsers.map((u) => u.role))].sort(),
    plaintextHashes: users.filter((u) => !u.passwordHash.startsWith("$2")),
    serviceCount: services.length,
    serviceCodes: services.map((s) => s.code).sort(),
    invalidPrices: services.filter(
      (s) => !Number.isInteger(s.pricePaise) || s.pricePaise < 0,
    ),
    invoiceCount: invoices,
    paymentCount: payments,
  };
}

describe("Wave 0 — development seed", () => {
  beforeAll(() => {
    runSeed();
  }, 120_000);

  it("seeds every role, hashed passwords and the full service catalog", async () => {
    const snap = await snapshot();

    // One development user per email, every role represented.
    expect(snap.devEmails).toEqual([...SEED_EMAILS].sort());
    expect(snap.devEmails).toHaveLength(new Set(snap.devEmails).size);
    expect(snap.devRoles).toEqual([...Object.values(Role)].sort());

    // Passwords are bcrypt hashes, never plaintext.
    expect(snap.plaintextHashes).toHaveLength(0);

    // 15 unique service codes, integer non-negative paise prices.
    expect(snap.serviceCount).toBe(15);
    expect(snap.serviceCodes).toHaveLength(
      new Set(snap.serviceCodes).size,
    );
    expect(snap.invalidPrices).toHaveLength(0);

    // Phase 1 billing data still seeds correctly.
    expect(snap.invoiceCount).toBe(15);
    expect(snap.paymentCount).toBe(12);
  }, 60_000);

  it("is idempotent — a second run creates no duplicate users or services", async () => {
    const first = await snapshot();

    runSeed();

    const second = await snapshot();
    expect(second.userCount).toBe(first.userCount);
    expect(second.devEmails).toEqual(first.devEmails);
    expect(second.serviceCount).toBe(first.serviceCount);
    expect(second.serviceCodes).toEqual(first.serviceCodes);
    expect(second.invoiceCount).toBe(first.invoiceCount);
    expect(second.paymentCount).toBe(first.paymentCount);
  }, 120_000);
});
