import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma client must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
