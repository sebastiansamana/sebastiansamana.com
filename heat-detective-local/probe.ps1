$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskRhino = $null
try {
    $taskRhino = New-Object -ComObject Rhino.Application.8
    $taskRhino.Visible = 0
    $taskRhino.ReleaseWithoutClosing = 0
    $taskDeadline = (Get-Date).AddSeconds(120)
    while ($taskRhino.IsInitialized() -eq 0) {
        if ((Get-Date) -gt $taskDeadline) { throw 'New Rhino automation instance did not initialise within 120 seconds.' }
        Start-Sleep -Milliseconds 500
    }
    $taskScript = Join-Path $taskRoot 'probe.py'
    $taskResult = $taskRhino.RunScript('_-RunPythonScript "' + $taskScript + '"', 0)
    Write-Output "Isolated Rhino RunScript returned $taskResult"
    $taskOutput = Join-Path $taskRoot 'runtime\probe.json'
    if (Test-Path -LiteralPath $taskOutput) { Get-Content -LiteralPath $taskOutput -Raw }
    else { throw 'Probe did not produce its output file.' }
} finally {
    if ($null -ne $taskRhino) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskRhino) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
