param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskUrl = 'http://127.0.0.1:8767/heat-detective/'
$taskExpectedModel = '53aa21467ee80479c45d0cc523f4d19bce3d8898b674de66cc22a82172a66ea6'
function Get-BridgeHealth {
    try { Invoke-RestMethod -Uri 'http://127.0.0.1:8767/api/health' -TimeoutSec 2 }
    catch { $null }
}
$taskHealth = Get-BridgeHealth
if ($null -eq $taskHealth) {
    $taskNode = Get-Command node.exe -ErrorAction Stop
    $taskRuntime = Join-Path $PSScriptRoot 'runtime'
    if (-not (Test-Path -LiteralPath $taskRuntime -PathType Container)) {
        throw 'Prepared runtime folder is missing. Launch from the prepared Hackathon project.'
    }
    $taskServer = Join-Path $PSScriptRoot 'server.mjs'
    $taskProcess = Start-Process -FilePath $taskNode.Source -ArgumentList ('"' + $taskServer + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRuntime 'bridge.stdout.log') -RedirectStandardError (Join-Path $taskRuntime 'bridge.stderr.log') -PassThru
    $taskDeadline = (Get-Date).AddSeconds(30)
    while ($null -eq $taskHealth -and (Get-Date) -lt $taskDeadline) {
        Start-Sleep -Milliseconds 500
        $taskHealth = Get-BridgeHealth
        $taskProcess.Refresh()
        if ($taskProcess.HasExited -and $null -eq $taskHealth) {
            throw 'The bridge stopped during startup. Read runtime\bridge.stderr.log.'
        }
    }
}
if ($null -eq $taskHealth) { throw 'Local bridge did not become ready within 30 seconds.' }
if ($taskHealth.modelSha256 -ne $taskExpectedModel) { throw 'Port 8767 is occupied by another service. This launcher will not replace it.' }
if (-not $taskHealth.ready) { throw ('Local bridge is not ready: ' + $taskHealth.message) }
Write-Output ('Heat Detective is ready at ' + $taskUrl)
if (-not $NoBrowser) { Start-Process $taskUrl }
