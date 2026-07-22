[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [string]$OutputPath,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $scriptDir 'fsu-mod-manifest.json'

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Missing manifest: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$patchPath = Join-Path $scriptDir $manifest.patchFile
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path

if (-not $OutputPath) {
    $directory = Split-Path -Parent $resolvedInput
    $name = Split-Path -Leaf $resolvedInput
    if ($name.EndsWith('.user.js', [StringComparison]::OrdinalIgnoreCase)) {
        $name = $name.Substring(0, $name.Length - '.user.js'.Length) + '_mod.user.js'
    } else {
        $name = $name + '_mod.user.js'
    }
    $OutputPath = Join-Path $directory $name
}

$absoluteOutput = [IO.Path]::GetFullPath($OutputPath)
if ((Test-Path -LiteralPath $absoluteOutput) -and -not $Force) {
    throw "Output already exists: $absoluteOutput. Use -Force to replace it."
}

$inputHash = (Get-FileHash -LiteralPath $resolvedInput -Algorithm SHA256).Hash.ToUpperInvariant()
if ($inputHash -eq $manifest.originSha256) {
    Write-Host "FSU upstream hash matches the verified $($manifest.upstreamVersion) baseline."
} else {
    Write-Warning "FSU upstream hash differs from the verified baseline. The script will only continue if git apply can match every patch context. Full review and live validation remain required."
    Write-Host "Expected: $($manifest.originSha256)"
    Write-Host "Actual:   $inputHash"
}

$tempRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ("fsu-patch-" + [Guid]::NewGuid().ToString('N'))))
$tempFile = Join-Path $tempRoot $manifest.patchTargetPath

try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    Copy-Item -LiteralPath $resolvedInput -Destination $tempFile

    Push-Location $tempRoot
    try {
        & git -c core.autocrlf=false -c core.eol=lf apply --check --whitespace=nowarn $patchPath
        if ($LASTEXITCODE -ne 0) {
            throw 'FSU patch compatibility check failed. No output file was changed.'
        }

        & git -c core.autocrlf=false -c core.eol=lf apply --whitespace=nowarn $patchPath
        if ($LASTEXITCODE -ne 0) {
            throw 'FSU patch application failed. No output file was changed.'
        }
    } finally {
        Pop-Location
    }

    & node --check $tempFile
    if ($LASTEXITCODE -ne 0) {
        throw 'Patched FSU failed JavaScript syntax validation.'
    }

    $resultHash = (Get-FileHash -LiteralPath $tempFile -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($inputHash -eq $manifest.originSha256 -and $resultHash -ne $manifest.modifiedSha256) {
        throw "Patched hash mismatch. Expected $($manifest.modifiedSha256), got $resultHash."
    }

    $outputDirectory = Split-Path -Parent $absoluteOutput
    if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }
    Copy-Item -LiteralPath $tempFile -Destination $absoluteOutput -Force

    Write-Host "Patched FSU written to: $absoluteOutput"
    Write-Host "SHA256: $resultHash"
} finally {
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($tempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $tempRoot)) {
        [IO.Directory]::Delete($tempRoot, $true)
    }
}
