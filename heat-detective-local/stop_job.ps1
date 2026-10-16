param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$JobDirName)
$ErrorActionPreference = 'Stop'
$taskDirectory = Join-Path $PSScriptRoot ('runtime\jobs\' + $JobDirName)
$taskOwnershipFile = Join-Path $taskDirectory 'ownership.json'
if (-not (Test-Path -LiteralPath $taskOwnershipFile)) { Write-Output 'Ownership not yet available; launcher must release its COM instance.'; exit 2 }
$taskOwnership = Get-Content -LiteralPath $taskOwnershipFile -Raw | ConvertFrom-Json
$taskRequest = Get-Content -LiteralPath (Join-Path $taskDirectory 'request.json') -Raw | ConvertFrom-Json
$taskWorkerId = [int]$taskOwnership.pid
if ($taskWorkerId -le 0 -or @($taskRequest.protectedRhinoPids) -contains $taskWorkerId) { throw 'Refusing a protected process.' }
$taskWorker = Get-Process -Id $taskWorkerId -ErrorAction SilentlyContinue
if ($null -eq $taskWorker) { Write-Output 'Owned worker already closed.'; exit 0 }
if ($taskWorker.ProcessName -ne 'Rhino' -or $taskWorker.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$taskOwnership.processStartTicksUtc) { throw 'Process identity differs; refusing cleanup.' }
# Kill only the recorded new worker and its descendants, never all Rhino processes.
& "$env:SystemRoot\System32\taskkill.exe" /PID $taskWorkerId /T /F
if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $taskWorkerId -ErrorAction SilentlyContinue)) { throw 'Owned worker cleanup failed.' }
