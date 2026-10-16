param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$WorkerDirName)
$ErrorActionPreference='Stop'
$taskDirectory=Join-Path $PSScriptRoot ('runtime\workers\'+$WorkerDirName)
$taskStop=Join-Path $taskDirectory 'stop.flag'
$taskState=Join-Path $taskDirectory 'state.json'
$taskRhino=$null
function Write-WorkerState([string]$State,[string]$Message='') {
    @{state=$State;message=$Message;at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $taskState -Encoding UTF8
}
try {
    Write-WorkerState 'starting' 'Starting a new private Rhino instance'
    if(Test-Path -LiteralPath $taskStop){throw 'Warmup cancelled'}
    $taskRhino=New-Object -ComObject Rhino.Application.8
    $taskRhino.Visible=0
    $taskRhino.ReleaseWithoutClosing=0
    $taskDeadline=(Get-Date).AddSeconds(120)
    while($taskRhino.IsInitialized() -eq 0){
        if((Get-Date) -gt $taskDeadline -or (Test-Path -LiteralPath $taskStop)){throw 'Warmup cancelled or timed out'}
        Start-Sleep -Milliseconds 200
    }
    if(Test-Path -LiteralPath $taskStop){throw 'Warmup cancelled'}
    $taskPrepare=Join-Path $taskDirectory 'prepare.py'
    if($taskRhino.RunScript('_-RunPythonScript "'+$taskPrepare+'"',0) -ne 1){throw 'Private worker preparation script failed'}
    $taskPrepared=Get-Content -LiteralPath (Join-Path $taskDirectory 'prepared.json') -Raw|ConvertFrom-Json
    if(-not $taskPrepared.ready){throw $taskPrepared.message}
    Write-WorkerState 'ready' 'Private Rhino and Grasshopper are warm'
    $taskLastCommand=''
    $taskLastUsed=[DateTime]::UtcNow
    while(-not(Test-Path -LiteralPath $taskStop)) {
        $taskHeartbeat=Get-Item -LiteralPath (Join-Path $taskDirectory 'owner-heartbeat') -ErrorAction SilentlyContinue
        if($null -eq $taskHeartbeat -or ([DateTime]::UtcNow-$taskHeartbeat.LastWriteTimeUtc).TotalSeconds -gt 30){break}
        if(([DateTime]::UtcNow-$taskLastUsed).TotalMinutes -gt 60){break}
        $taskCommandPath=Join-Path $taskDirectory 'command.json'
        if(Test-Path -LiteralPath $taskCommandPath){
            $taskCommand=Get-Content -LiteralPath $taskCommandPath -Raw|ConvertFrom-Json
            if($taskCommand.commandId -ne $taskLastCommand){
                if($taskCommand.jobDirName -notmatch '^[a-f0-9]{12}$'){throw 'Invalid private job directory'}
                $taskLastCommand=$taskCommand.commandId
                $taskJobDirectory=Join-Path $PSScriptRoot ('runtime\jobs\'+$taskCommand.jobDirName)
                Write-WorkerState 'busy' ('Calculating job '+$taskCommand.jobDirName)
                $taskRun=Join-Path $taskJobDirectory 'run.py'
                if($taskRhino.RunScript('_-RunPythonScript "'+$taskRun+'"',0) -ne 1){throw 'Private calculation script failed'}
                $taskCleanup=Get-Content -LiteralPath (Join-Path $taskJobDirectory 'cleanup.json') -Raw|ConvertFrom-Json
                if(-not $taskCleanup.readyForReuse){throw ('Worker reset failed: '+$taskCleanup.message)}
                @{jobDirName=$taskCommand.jobDirName;commandId=$taskLastCommand;completedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDirectory 'completion.json') -Encoding UTF8
                $taskLastUsed=[DateTime]::UtcNow
                Write-WorkerState 'ready' 'Private worker reset and ready'
            }
        }
        Start-Sleep -Milliseconds 100
    }
    Write-WorkerState 'stopped' 'Private worker stopped after request or idle period'
} catch {
    Write-WorkerState 'failed' $_.Exception.Message
    throw
} finally {
    if($null -ne $taskRhino){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskRhino)}
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
