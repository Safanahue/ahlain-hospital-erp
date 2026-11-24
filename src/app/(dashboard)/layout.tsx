import { getPermissionsFor, requirePageUser } from "@/modules/auth/guards";
import Shell from "@/modules/shared/components/Shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();
  const permissions = await getPermissionsFor(user);

  return (
    <Shell
      user={{ name: user.name, email: user.email, role: user.role }}
      permissions={[...permissions]}
    >
      {children}
    </Shell>
  );
}
