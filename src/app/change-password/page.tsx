import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/auth/guards";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Change password – AHLAIN HOSPITAL ERP" };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal text-lg font-bold text-white">
            A
          </div>
          <h1 className="text-lg font-semibold text-navy">Change password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.name} · {user.email}
          </p>
        </div>
        <div className="card p-6">
          <ChangePasswordForm forced={user.mustChangePassword} />
        </div>
      </div>
    </div>
  );
}
