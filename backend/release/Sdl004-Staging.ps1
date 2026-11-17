# Windows PowerShell 5.1+/PowerShell 7. Default Plan performs NO database connection.
[CmdletBinding()]
param(
    [ValidateSet('Plan','Backup','Preflight','Inspect','ValidateLocalRestore')][string]$Operation = 'Plan',
    [string]$ConfirmProject,
    [string]$CaFile,
    [string]$HistoryManifest,
    [string]$BackupDirectory,
    [string]$RestoreDatabase,
    [int]$RestorePort = 6543,
    [switch]$ApprovedLiveBackup,
    [switch]$Quiescent,
    [switch]$ApprovedReadOnlyPreflight,
    [switch]$ApprovedLocalValidation
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$project = 'wvurolqbjhuckkkjiiiv'
$backupTool = Join-Path $PSScriptRoot 'staging-backup.mjs'
$preflightTool = Join-Path $PSScriptRoot 'run-staging-preflight.mjs'
Get-Command node -ErrorAction Stop | Out-Null
if ($Operation -eq 'Plan') {
    & node $backupTool --plan
    if ($LASTEXITCODE -ne 0) { throw 'Local plan failed.' }
    return
}
if ($Operation -eq 'Inspect') {
    if (-not $BackupDirectory) { throw 'Supply -BackupDirectory.' }
    & node $backupTool --inspect --directory $BackupDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Local backup integrity inspection failed.' }
    return
}
if ($Operation -eq 'Backup' -and (-not $ApprovedLiveBackup -or -not $Quiescent)) {
    throw 'Separate live backup approval and a quiescent source acknowledgement are required.'
}
if ($Operation -eq 'Preflight' -and -not $ApprovedReadOnlyPreflight) {
    throw 'Separate approval for live read-only preflight is required.'
}
if ($Operation -eq 'ValidateLocalRestore') {
    if (-not $ApprovedLocalValidation -or -not $BackupDirectory -or $RestoreDatabase -notmatch '^sdl004_restore_[a-z0-9_]+$' -or $RestorePort -lt 1024 -or $RestorePort -gt 65535 -or $RestorePort -eq 5432) {
        throw 'Approved, isolated local validation needs a backup folder, sdl004_restore_ database and dedicated local port.'
    }
} else {
    if ($ConfirmProject -cne $project) { throw 'Supply the exact staging project reference.' }
    if (-not $CaFile -or -not (Test-Path -LiteralPath $CaFile -PathType Leaf)) { throw 'Approved staging TLS CA file required.' }
}
if ($Operation -eq 'Preflight' -and (-not $HistoryManifest -or -not (Test-Path -LiteralPath $HistoryManifest -PathType Leaf))) {
    throw 'Supply the reviewed migration-history manifest.'
}
# Avoid entering credentials on the command line or in a saved connection string.
$secret = Read-Host 'Database password (masked; never pasted into scripts or chat)' -AsSecureString
$oldStagingPassword = $env:SDL004_STAGING_DB_PASSWORD
$oldStagingUrl = $env:SDL004_STAGING_DB_URL
$oldRestorePassword = $env:SDL004_RESTORE_DB_PASSWORD
try {
    $password = [System.Net.NetworkCredential]::new('', $secret).Password
    if ($Operation -eq 'Backup') {
        $env:SDL004_STAGING_DB_PASSWORD = $password
        & node $backupTool --execute-backup --approved-live-backup --quiescent --confirm-project $ConfirmProject --ca $CaFile
    } elseif ($Operation -eq 'Preflight') {
        $encodedPassword = [Uri]::EscapeDataString($password)
        $env:SDL004_STAGING_DB_URL = 'postgresql://postgres:' + $encodedPassword + '@db.' + $project + '.supabase.co:5432/postgres'
        $oldCa = $env:SDL004_STAGING_CA_FILE
        try {
            $env:SDL004_STAGING_CA_FILE = $CaFile
            & node $preflightTool --confirm-project $ConfirmProject --manifest $HistoryManifest
        } finally { $env:SDL004_STAGING_CA_FILE = $oldCa }
    } else {
        $env:SDL004_RESTORE_DB_PASSWORD = $password
        & node $backupTool --validate-local-restore --approved-local-validation --directory $BackupDirectory --database $RestoreDatabase --port $RestorePort
    }
    if ($LASTEXITCODE -ne 0) { throw 'Operation failed; do not treat an incomplete export as a recoverable backup.' }
} finally {
    $env:SDL004_STAGING_DB_PASSWORD = $oldStagingPassword
    $env:SDL004_STAGING_DB_URL = $oldStagingUrl
    $env:SDL004_RESTORE_DB_PASSWORD = $oldRestorePassword
    $password = $null
    $encodedPassword = $null
    $secret.Dispose()
}
