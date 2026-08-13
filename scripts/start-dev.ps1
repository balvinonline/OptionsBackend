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

if (-not (Test-PortListening -Port 5000)) {
  Write-Host "Starting backend on http://127.0.0.1:5000 ..."
  Start-Process -FilePath $python `
    -ArgumentList @("-u", "server.py") `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError $backendErr

  $ready = Wait-PortListening -Port 5000 -Seconds 8 -Name "Backend"

  if (-not $ready) {
    Write-Warning "Backend did not start on port 5000. Check backend/backend-current.err.log."
  }
} else {
  Write-Host "Backend already running on http://127.0.0.1:5000"
}

npx vite --host 0.0.0.0 --port 5173
