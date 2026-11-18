import { latestBackupStatus } from "../src/server/backup";

const status = latestBackupStatus();
console.log(JSON.stringify(status));
if (!status.ok) process.exit(1);
