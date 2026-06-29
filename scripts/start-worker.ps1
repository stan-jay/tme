$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$requirements = Join-Path $root "apps\worker\requirements.txt"
$worker = Join-Path $root "apps\worker\app.py"
$workerUrl = $env:TME_WORKER_URL
if ([string]::IsNullOrWhiteSpace($workerUrl)) {
  $workerUrl = "http://127.0.0.1:5000"
}

function Resolve-Python {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) { return $python.Source }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) { return $py.Source }

  throw "Python was not found. Install Python 3.11+ and ensure 'python' is available on PATH."
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

function Test-WorkerHealth {
  $uri = [Uri]$workerUrl
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $connect = $client.BeginConnect($uri.Host, $uri.Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(1000, $false)) {
      return $false
    }
    $client.EndConnect($connect)
    return $true
  } catch {
    return $false
  } finally {
    if ($client) { $client.Close() }
  }
}

if (Test-WorkerHealth) {
  Write-Host "Port $workerUrl is already listening; treating TME worker as running."
  exit 0
}

$systemPython = Resolve-Python

if (-not (Test-Path $venvPython)) {
  Write-Host "Creating Python virtual environment at .venv..."
  Invoke-Checked $systemPython -m venv (Join-Path $root ".venv")
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $venvPython -m pip --version *> $null
$pipCheckExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($pipCheckExitCode -ne 0) {
  Write-Host "Bootstrapping pip into .venv..."
  Invoke-Checked $systemPython -m pip --python $venvPython install --upgrade pip
}

Write-Host "Installing worker dependencies..."
Invoke-Checked $venvPython -m pip install --upgrade pip
Invoke-Checked $venvPython -m pip install -r $requirements

if (Test-WorkerHealth) {
  Write-Host "Port $workerUrl is already listening; treating TME worker as running."
  exit 0
}

Write-Host "Starting TME worker on $workerUrl ..."
Invoke-Checked $venvPython $worker
