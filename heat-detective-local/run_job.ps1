param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12}$')][string]$JobDirName)
$ErrorActionPreference = 'Stop'
$taskRhino = $null
try {
    $taskRhino = New-Object -ComObject Rhino.Application.8
    $taskRhino.Visible = 0
    $taskRhino.ReleaseWithoutClosing = 0
    $taskDeadline = (Get-Date).AddSeconds(120)
    while ($taskRhino.IsInitialized() -eq 0) {
        if ((Get-Date) -gt $taskDeadline) { throw 'New Rhino did not initialise within 120 seconds.' }
        Start-Sleep -Milliseconds 500
    }
    $taskScript = Join-Path $PSScriptRoot ('runtime\jobs\' + $JobDirName + '\run.py')
    if (-not (Test-Path -LiteralPath $taskScript -PathType Leaf)) { throw 'Prepared job script missing.' }
    $taskResult = $taskRhino.RunScript('_-RunPythonScript "' + $taskScript + '"', 0)
    if ($taskResult -ne 1) { throw 'Rhino did not run the prepared job script.' }
} finally {
    if ($null -ne $taskRhino) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskRhino) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
