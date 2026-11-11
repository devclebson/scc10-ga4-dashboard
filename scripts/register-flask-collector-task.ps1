param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$TaskName = 'SCC10 Flask Collector',
    [string]$PropertyId = $env:SCC10_PROPERTY_ID,
    [string]$DatabasePath = (Join-Path $env:LOCALAPPDATA 'SCC10\data\scc10-flask.sqlite'),
    [string]$CredentialPath = (Join-Path $env:LOCALAPPDATA 'SCC10\secrets\ga4-service-account.json'),
    [int]$IntervalMinutes = 1,
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
if (-not $PropertyId) { throw 'Informe -PropertyId ou defina SCC10_PROPERTY_ID.' }
if ($IntervalMinutes -lt 1) { throw '-IntervalMinutes deve ser pelo menos 1.' }
if (-not (Test-Path $CredentialPath)) { throw "Credencial não encontrada: $CredentialPath" }
$wrapper = Join-Path $ProjectRoot 'scripts\run-flask-collector.ps1'
if (-not (Test-Path $wrapper)) { throw "Wrapper não encontrado: $wrapper" }

$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$wrapper`" -ProjectRoot `"$ProjectRoot`" -PropertyId $PropertyId -DatabasePath `"$DatabasePath`" -CredentialPath `"$CredentialPath`" -Cycles 1"
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)

if (-not $Apply) {
    [pscustomobject]@{
        TaskName = $TaskName
        IntervalMinutes = $IntervalMinutes
        Action = "PowerShell.exe $arguments"
        DatabasePath = $DatabasePath
        ApplyCommand = "& `"$PSCommandPath`" -PropertyId $PropertyId -DatabasePath `"$DatabasePath`" -Apply"
    } | Format-List
    return
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description 'Coleta realtime GA4 do SCC10 pelo worker Flask.' -Force | Out-Null
Write-Output "Tarefa registrada: $TaskName"
