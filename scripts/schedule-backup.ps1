$task = "RustenburgTodayBackup"
$command = Join-Path $PSScriptRoot "run-backup.cmd"
schtasks /Create /F /SC DAILY /ST 02:10 /TN $task /TR "`"$command`""
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
schtasks /Query /TN $task /FO LIST /V
