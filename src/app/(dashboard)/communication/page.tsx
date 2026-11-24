import { requirePageUser } from "@/modules/auth/guards";
import { getSmsLogs } from "@/modules/communication/sms-service";
import { getSmsTemplates } from "@/modules/communication/templates";
import { getActiveSmsProvider } from "@/modules/communication/gateway";
import SmsManagerClient from "./SmsManagerClient";

export const dynamic = "force-dynamic";

export default async function CommunicationPage() {
  // Guard: Accessible by Administrator
  const user = await requirePageUser(["ADMIN"]);

  const [logsData, templates] = await Promise.all([
    getSmsLogs({ take: 50, skip: 0 }),
    Promise.resolve(getSmsTemplates()),
  ]);

  const activeProvider = getActiveSmsProvider();

  const formattedLogs = {
    total: logsData.total,
    items: logsData.items.map((item) => ({
      id: item.id,
      to: item.to,
      body: item.body,
      kind: item.kind,
      status: item.status as "SENT" | "FAILED" | "SKIPPED",
      provider: item.provider,
      providerMessageId: item.providerMessageId,
      error: item.error,
      entityId: item.entityId,
      createdAt: item.createdAt.toISOString(),
      sentBy: item.sentBy,
    })),
  };

  return (
    <SmsManagerClient
      initialLogs={formattedLogs}
      initialTemplates={templates}
      gatewayType={activeProvider.name}
    />
  );
}
