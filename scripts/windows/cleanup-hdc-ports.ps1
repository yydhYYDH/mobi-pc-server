param(
    [string]$ApiBase = "http://127.0.0.1:18188",
    [string]$HdcPath = "hdc"
)

$ErrorActionPreference = "Stop"
$phonePorts = @(8090, 15001, 19124)

function Get-AppReverseMappings {
    $output = & $HdcPath fport ls 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "hdc fport ls failed: $output"
    }

    return @(
        foreach ($line in $output) {
            if ($line -match '^(?<target>\S+)\s+tcp:(?<phone>\d+)\s+tcp:(?<pc>\d+)\s+\[Reverse\]$') {
                if ($phonePorts -contains [int]$Matches.phone) {
                    "$($Matches.target) tcp:$($Matches.phone) -> tcp:$($Matches.pc)"
                }
            }
        }
    )
}

Write-Host "Requesting backend HDC cleanup at $ApiBase/api/devices/hdc/cleanup"
$response = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/devices/hdc/cleanup" -TimeoutSec 20
if ($response.status -ne "ok") {
    throw "Backend cleanup failed: $($response | ConvertTo-Json -Compress)"
}

$remaining = Get-AppReverseMappings
if ($remaining.Count -gt 0) {
    throw "Backend cleanup completed but mappings remain: $($remaining -join '; ')"
}

Write-Host "Backend HDC cleanup verified."
