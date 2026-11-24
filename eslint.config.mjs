import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "public/**",
      "prisma/**/*.ts",
    ],
  },
  ...nextConfig,
];

export default config;
