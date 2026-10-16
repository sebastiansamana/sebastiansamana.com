param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$WorkerDirName)
$ErrorActionPreference='Stop'
$taskDirectory=Join-Path $PSScriptRoot ('runtime\workers\'+$WorkerDirName)
$taskOwnershipFile=Join-Path $taskDirectory 'ownership.json'
if(-not(Test-Path -LiteralPath $taskOwnershipFile)){Write-Output 'Ownership not yet available; controller must release its COM instance.';exit 2}
$taskOwnership=Get-Content -LiteralPath $taskOwnershipFile -Raw|ConvertFrom-Json
$taskSafety=Get-Content -LiteralPath (Join-Path $taskDirectory 'safety.json') -Raw|ConvertFrom-Json
$taskWorkerId=[int]$taskOwnership.pid
if($taskOwnership.workerId -ne $taskSafety.workerId -or $taskWorkerId -le 0 -or @($taskSafety.protectedRhinoPids) -contains $taskWorkerId){throw 'Refusing unowned or protected worker'}
$taskWorker=Get-Process -Id $taskWorkerId -ErrorAction SilentlyContinue
if($null -eq $taskWorker){exit 0}
if($taskWorker.ProcessName -ne 'Rhino' -or $taskWorker.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$taskOwnership.processStartTicksUtc){throw 'Worker process identity changed; refusing cleanup'}
& "$env:SystemRoot\System32\taskkill.exe" /PID $taskWorkerId /T /F
if($LASTEXITCODE -ne 0 -and (Get-Process -Id $taskWorkerId -ErrorAction SilentlyContinue)){throw 'Owned worker cleanup failed'}
