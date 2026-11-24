import { requirePagePermission } from "@/modules/auth/guards";
import { prisma } from "@/lib/prisma";
import { getHospitalSettings } from "@/modules/billing/queries";
import SettingsForm from "@/modules/settings/components/SettingsForm";
import StaffManager from "@/modules/settings/components/StaffManager";
import { resolvePermissions } from "@/modules/auth/permissions";
import Link from "next/link";
import { History } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const currentUser = await requirePagePermission("users.manage");
  const [users, overrides, settings] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.userPermission.findMany({
      select: { userId: true, permission: true, allowed: true },
    }),
    getHospitalSettings(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link
          href="/settings/audit"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-page"
        >
          <History className="h-4 w-4" aria-hidden />
          Login activity &amp; audit log
        </Link>
      </div>

      <StaffManager
        currentUserId={currentUser.id}
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          mustChangePassword: user.mustChangePassword,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          permissions: [
            ...resolvePermissions(
              user.role,
              overrides.filter((override) => override.userId === user.id),
            ),
          ],
        }))}
      />

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Hospital settings</h2>
          <p className="card-subtitle">
            Shown on receipts and payment requests
          </p>
        </div>
        <SettingsForm
          settings={{
            hospitalName: settings.hospitalName,
            address: settings.address,
            upiId: settings.upiId,
            upiQrImageUrl: settings.upiQrImageUrl,
            receiptFooter: settings.receiptFooter,
            termsText: settings.termsText,
            logoImageUrl: settings.logoImageUrl,
            tagline: settings.tagline,
            phone: settings.phone,
            email: settings.email,
            website: settings.website,
            gstin: settings.gstin,
            signatureImageUrl: settings.signatureImageUrl,
          }}
        />
      </section>
    </div>
  );
}
