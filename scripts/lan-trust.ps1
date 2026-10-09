param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$certificatePath = Join-Path $PSScriptRoot '..\output\lan\common-ground-root.crt'
if (-not (Test-Path -LiteralPath $certificatePath)) { throw 'Run npm run lan:up first.' }
$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path -LiteralPath $certificatePath).Path)
$storePath = "Cert:\CurrentUser\Root\$($certificate.Thumbprint)"
if ($Remove) {
  if (Test-Path -LiteralPath $storePath) { Remove-Item -LiteralPath $storePath }
  Write-Host 'Common Ground certificate trust removed for this Windows user.'
} else {
  if ($certificate.NotAfter -le (Get-Date)) { throw 'The certificate has expired.' }
  if (-not (Test-Path -LiteralPath $storePath)) {
    Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
  }
  Write-Host "Common Ground local CA trusted for this Windows user. Thumbprint: $($certificate.Thumbprint)"
  Write-Host 'Restart your browser if it still shows a certificate error.'
}
