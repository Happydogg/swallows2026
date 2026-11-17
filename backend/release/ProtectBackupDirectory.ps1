# Invoked locally before sensitive backup files are written. No database/network access.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Directory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($identity)
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $Directory -AclObject $acl
# Replacing the DACL removes inherited AND explicit grants to other users.
