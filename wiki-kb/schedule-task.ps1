# Register (or remove) the Windows Task Scheduler job that keeps the wiki
# knowledge base in sync with Wikipedia.
#
#   .\schedule-task.ps1                 # daily at 03:30
#   .\schedule-task.ps1 -Time "04:00"   # daily at another time
#   .\schedule-task.ps1 -Weekly         # Sundays at -Time instead of daily
#   .\schedule-task.ps1 -Unregister     # remove the job
#
# The job runs: node check-updates.mjs --discover
# (revision sweep + new-article discovery + re-embed + sync log).

param(
    [string]$Time = "03:30",
    [switch]$Weekly,
    [switch]$Unregister
)

$taskName = "WikiKB-UpdateCheck"

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed scheduled task '$taskName'."
    exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot "check-updates.mjs"
$logDir = Join-Path $PSScriptRoot "data"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }
$log = Join-Path $logDir "update-check.log"

# cmd wrapper so stdout/stderr land in a log file we can inspect later
$argument = "/c `"`"$node`" `"$script`" --discover >> `"$log`" 2>&1`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $argument -WorkingDirectory $PSScriptRoot

if ($Weekly) {
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At $Time
} else {
    $trigger = New-ScheduledTaskTrigger -Daily -At $Time
}

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 6)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Wiki KB update check: sync the astronomy corpus with Wikipedia (wiki-kb/check-updates.mjs)" -Force | Out-Null

$cadence = if ($Weekly) { "weekly (Sunday $Time)" } else { "daily ($Time)" }
Write-Host "Registered '$taskName' $cadence."
Write-Host "Log: $log"
