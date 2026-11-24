import { requirePageUser } from "@/modules/auth/guards";
import { getActiveSmsProvider } from "@/modules/communication/gateway";
import TestSmsClient from "./TestSmsClient";

export const dynamic = "force-dynamic";

export default async function AdminTestSmsPage() {
  // 1. Strictly Admin Only Guard
  const user = await requirePageUser(["ADMIN"]);

  // 2. Read Active Provider Info
  const activeProvider = getActiveSmsProvider();

  return (
    <TestSmsClient
      adminName={user.name}
      providerName={activeProvider.name}
      isFast2Sms={activeProvider.name === "fast2sms"}
      isConfigured={activeProvider.isConfigured()}
    />
  );
}
