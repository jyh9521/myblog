param([switch]$Install,[switch]$Uninstall,[switch]$Validate,[string]$Callback)
$ErrorActionPreference='Stop'
$scheme='npf5c38e31cd085304b'
$key="HKCU:\Software\Classes\$scheme"
$directory=Join-Path $env:LOCALAPPDATA 'BLFY\NintendoCallback'
$handler=Join-Path $directory 'nintendo-callback.ps1'
if($Install){
  if(Test-Path -LiteralPath $key){
    $existing=(Get-ItemProperty -LiteralPath "$key\shell\open\command").'(default)'
    if(!$existing.Contains($handler)){throw 'An existing Nintendo protocol handler is installed. It was not changed.'}
  }
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  if($PSCommandPath -ne $handler){Copy-Item -LiteralPath $PSCommandPath -Destination $handler -Force}
  New-Item -Path "$key\shell\open\command" -Force | Out-Null
  Set-Item -LiteralPath $key -Value 'URL:BLFY Nintendo Callback'
  New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -Force | Out-Null
  $command='"'+$env:SystemRoot+'\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$handler+'" -Callback "%1"'
  Set-Item -LiteralPath "$key\shell\open\command" -Value $command
  Write-Output 'Nintendo callback handler installed. Reopen the official login from the blog.'
  exit
}
if($Uninstall){
  if(Test-Path -LiteralPath "$key\shell\open\command"){
    $existing=(Get-ItemProperty -LiteralPath "$key\shell\open\command").'(default)'
    if(!$existing.Contains($handler)){throw 'This protocol handler is not managed by BLFY.'}
    Remove-Item -LiteralPath $key -Recurse
  }
  Write-Output 'Nintendo callback handler removed.'
  exit
}
if(!$Callback -or $Callback.Length -gt 8192){throw 'Invalid callback.'}
$uri=[Uri]$Callback
if($uri.Scheme -ne $scheme -or $uri.Host -ne 'auth'){throw 'Invalid callback.'}
$parameters=@{}
foreach($pair in $uri.Fragment.TrimStart('#').Split('&')){ $parts=$pair.Split('=',2);if($parts.Length -eq 2){$parameters[$parts[0]]=[Uri]::UnescapeDataString($parts[1])} }
if($parameters.state -notmatch '^[a-zA-Z0-9_-]{43}$' -or !$parameters.session_token_code){throw 'Invalid callback.'}
if($Validate){Write-Output 'Valid Nintendo callback.';exit}
# The fragment is not sent in HTTP requests. The admin clears it before submitting.
$destination='https://blog.blfy.cc/sveltia/accounts.html#nintendo-result='+[Uri]::EscapeDataString($Callback)
Start-Process $destination
