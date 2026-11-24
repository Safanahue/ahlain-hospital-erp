import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { TEST_DATABASE_URL, TEST_DB_PORT } from "./constants";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

let embedded: EmbeddedPostgres | null = null;

/**
 * Ensures a PostgreSQL is listening on TEST_DB_PORT and the dedicated
 * ahlain_erp_test database matches the Prisma schema. Reuses the dev cluster
 * when it is already running; otherwise starts the project-local one.
 */
export default async function globalSetup() {
  const running = await canConnect(TEST_DB_PORT);

  if (!running) {
    embedded = new EmbeddedPostgres({
      databaseDir: path.join(rootDir, ".data", "pg"),
      user: "postgres",
      password: "postgres",
      port: TEST_DB_PORT,
      persistent: true,
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
    });
    try {
      await embedded.initialise();
    } catch {
      // Already initialised — just start it.
    }
    await embedded.start();
  }

  // prisma db push creates the test database when it does not exist.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });

  return async () => {
    if (embedded) await embedded.stop();
  };
}
