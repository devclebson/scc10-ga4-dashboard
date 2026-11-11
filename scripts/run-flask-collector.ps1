param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$PropertyId = $env:SCC10_PROPERTY_ID,
    [string]$DatabasePath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data\scc10-flask.sqlite'),
    [string]$CredentialPath = (Join-Path $env:LOCALAPPDATA 'SCC10\secrets\ga4-service-account.json'),
    [string]$LockPath = '',
    [int]$IntervalSeconds = 30,
    [int]$Cycles = 1,
    [int]$RetentionDays = 0,
    [string]$BackupPath = ''
)

$ErrorActionPreference = 'Stop'
if (-not $PropertyId) { throw 'Informe -PropertyId ou defina SCC10_PROPERTY_ID.' }
if (-not (Test-Path $CredentialPath)) { throw "Credencial não encontrada: $CredentialPath" }

$python = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "Python do ambiente não encontrado: $python" }

$env:GOOGLE_SERVICE_ACCOUNT_FILE = $CredentialPath
$env:SCC10_PROPERTY_ID = $PropertyId
$env:SCC10_DB_PATH = $DatabasePath
if ($LockPath) { $env:SCC10_COLLECTOR_LOCK_PATH = $LockPath }

Push-Location $ProjectRoot
try {
    $arguments = @('run_flask_collector.py', '--loop', '--interval', $IntervalSeconds, '--cycles', $Cycles)
    if ($RetentionDays -gt 0) { $arguments += @('--retention-days', $RetentionDays) }
    if ($BackupPath) { $arguments += @('--backup-path', $BackupPath) }
    & $python @arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
