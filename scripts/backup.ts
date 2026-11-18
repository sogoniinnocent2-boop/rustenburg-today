import { createBackup } from "../src/server/backup";

try {
  const result = createBackup();
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Backup failed");
  process.exit(1);
}
