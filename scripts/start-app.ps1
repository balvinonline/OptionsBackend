param(
  [int]$BackendPort = 5000,
  [int]$FrontendPort = 5173,
  [int]$BackendWaitSeconds = 8,
  [int]$FrontendWaitSeconds = 10,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("PATH", $null, "Process")
[Environment]::SetEnvironmentVariable("Path", (($machinePath, $userPath) | Where-Object { $_ }) -join ";", "Process")

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$python = "F:\Python\python.exe"
$backendOut = Join-Path $backendDir "backend-current.out.log"
$backendErr = Join-Path $backendDir "backend-current.err.log"
$frontendOut = Join-Path $root "vite-app.out.log"
$frontendErr = Join-Path $root "vite-app.err.log"

function Test-PortListening {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  return $null -ne $listener
}

function Wait-PortListening {
  param(
    [int]$Port,
    [int]$Seconds,
    [string]$Name
  )

  for ($i = 1; $i -le $Seconds; $i += 1) {
    if (Test-PortListening -Port $Port) {
      Write-Host "$Name ready."
      return $true
    }
    Write-Host "$Name starting... $i/$Seconds"
    Start-Sleep -Seconds 1
  }

  return (Test-PortListening -Port $Port)
}

function Get-LanAddress {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.PrefixOrigin -ne "WellKnown"
    } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress
  return $ip
}

if (-not (Test-Path $python)) {
  throw "Python not found at $python"
}

if (-not (Test-PortListening -Port $BackendPort)) {
  Write-Host "Starting backend on http://127.0.0.1:$BackendPort ..."
  Start-Process -FilePath $python `
    -ArgumentList @("-u", "server.py") `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr

  $backendReady = Wait-PortListening -Port $BackendPort -Seconds $BackendWaitSeconds -Name "Backend"

  if (-not $backendReady) {
    Write-Warning "Backend is not ready yet. Open the page anyway, or check: $backendErr"
  }
} else {
  Write-Host "Backend already running on http://127.0.0.1:$BackendPort"
}

if (-not (Test-PortListening -Port $FrontendPort)) {
  Write-Host "Starting dashboard on all network adapters, port $FrontendPort ..."
  Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev:vite", "--", "--host", "0.0.0.0", "--port", "$FrontendPort") `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $frontendOut `
    -RedirectStandardError $frontendErr

  $frontendReady = Wait-PortListening -Port $FrontendPort -Seconds $FrontendWaitSeconds -Name "Dashboard"

  if (-not $frontendReady) {
    Write-Warning "Dashboard is not ready yet. Check: $frontendErr"
  }
} else {
  Write-Host "Dashboard already running on port $FrontendPort"
}

$localUrl = "http://127.0.0.1:$FrontendPort/trade-focus"
$lanIp = Get-LanAddress
$lanUrl = if ($lanIp) { "http://$lanIp`:$FrontendPort/trade-focus" } else { "" }

Write-Host ""
Write-Host "Options Desk is ready."
Write-Host "Laptop: $localUrl"
if ($lanUrl) {
  Write-Host "Mobile on same router/Wi-Fi: $lanUrl"
}
Write-Host ""
Write-Host "Token note: Fyers can expire the token daily. If quotes fail, open Token once and save today's token."

if (-not $NoBrowser) {
  Start-Process $localUrl
}
