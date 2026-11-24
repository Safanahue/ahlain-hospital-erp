import { TEST_DATABASE_URL } from "./constants";

// Must run before any Prisma client is instantiated.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AUTH_SECRET = "test-secret";
