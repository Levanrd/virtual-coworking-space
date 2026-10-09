# Run in an Administrator PowerShell on the HOST only.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Open PowerShell as Administrator, then run this script again. No firewall settings were changed.'
}
$names = @('CommonGround-LAN-HTTPS', 'CommonGround-LAN-TURN-TCP', 'CommonGround-LAN-TURN-UDP')
if ($Remove) {
  foreach ($name in $names) {
    Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  }
  Write-Host 'Common Ground LAN firewall rules removed.'
  exit
}
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\.env.lan') -Raw
if ($config -notmatch '(?m)^LAN_IP=(\d{1,3}(?:\.\d{1,3}){3})\r?$') { throw 'Run npm run lan:up first.' }
$lanAddress = $Matches[1]
$interface = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $lanAddress
$profile = Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex
if ($profile.NetworkCategory -notin @('Private', 'Public')) {
  throw 'This script supports personal Private or Public networks only. Ask your network administrator about managed networks.'
}
foreach ($name in $names) {
  Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
$settings = @{
  Direction = 'Inbound'; Action = 'Allow'; Profile = $profile.NetworkCategory.ToString()
  RemoteAddress = 'LocalSubnet'; LocalAddress = $lanAddress
  InterfaceAlias = $interface.InterfaceAlias
}
New-NetFirewallRule @settings -Name $names[0] -DisplayName 'Common Ground LAN HTTPS' -Protocol TCP -LocalPort 8443 | Out-Null
New-NetFirewallRule @settings -Name $names[1] -DisplayName 'Common Ground LAN TURN TCP' -Protocol TCP -LocalPort 3478 | Out-Null
New-NetFirewallRule @settings -Name $names[2] -DisplayName 'Common Ground LAN TURN UDP' -Protocol UDP -LocalPort '3478','45000-45100' | Out-Null
Write-Host "LAN rules enabled for $lanAddress on $($interface.InterfaceAlias), $($profile.NetworkCategory) profile, local subnet only."
