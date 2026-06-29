$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendEnv = Join-Path $projectRoot 'apps\backend\.env'

if (-not (Test-Path -LiteralPath $backendEnv)) {
    throw "Missing backend environment file: $backendEnv"
}

$passwordLine = Get-Content -LiteralPath $backendEnv |
    Where-Object { $_ -match '^REDIS_PASSWORD=' } |
    Select-Object -First 1

if (-not $passwordLine) {
    throw 'REDIS_PASSWORD is missing from apps/backend/.env'
}

$redisPassword = ($passwordLine -replace '^REDIS_PASSWORD=', '').Trim().Trim('"')
if (-not $redisPassword) {
    throw 'REDIS_PASSWORD cannot be empty'
}

$keepAlive = Start-Process -FilePath 'wsl.exe' `
    -ArgumentList @('-d', 'Ubuntu', '--', 'sleep', 'infinity') `
    -WindowStyle Hidden `
    -PassThru

try {
    Start-Sleep -Seconds 2
    & wsl -d Ubuntu -u root -- systemctl start redis-server
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not start Redis inside Ubuntu WSL'
    }

    # WSL mirrored networking (networkingMode=mirrored in %USERPROFILE%\.wslconfig)
    # exposes Redis on the host loopback, so the backend connects via 127.0.0.1
    # and no longer depends on the drifting WSL NAT address.
    $escapedPassword = [Uri]::EscapeDataString($redisPassword)
    $env:REDIS_URL = "redis://:$escapedPassword@127.0.0.1:6379"
    $env:PIPELINE_QUEUE_DRIVER = 'redis'

    Write-Host 'Redis ready at 127.0.0.1:6379 (WSL mirrored); starting TME backend with BullMQ.'
    Set-Location -LiteralPath $projectRoot
    & npm --workspace '@tme/backend' run start:dev
    exit $LASTEXITCODE
}
finally {
    if ($keepAlive -and -not $keepAlive.HasExited) {
        Stop-Process -Id $keepAlive.Id -Force -ErrorAction SilentlyContinue
    }
}
