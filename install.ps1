#Requires -Version 5.1
<#
.SYNOPSIS
Registers or removes the strict skill package from this repository (Windows).

.PARAMETER Uninstall
Remove the strict skill registration instead of installing it.

.PARAMETER BinDir
Override the user bin directory for the native CLI.

.PARAMETER NoPathUpdate
Do not add or remove the native CLI bin directory from the current user's PATH.

.PARAMETER KeepPathOnUninstall
Leave the native CLI bin directory in the current user's PATH during uninstall.

.EXAMPLE
.\install.ps1
.\install.ps1 -Uninstall
#>

param(
    [switch]$Uninstall,
    [string]$BinDir = $env:STRICT_SPEC_BIN_DIR,
    [switch]$NoPathUpdate,
    [switch]$KeepPathOnUninstall
)

$ErrorActionPreference = 'Stop'

function Resolve-RealPath {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -ErrorAction Stop
    while ($item.LinkType) {
        $target = $item.Target
        if ($target -is [array]) { $target = $target[0] }
        if (-not $target) { break }
        if (-not [System.IO.Path]::IsPathRooted($target)) {
            $target = Join-Path (Split-Path $item.FullName -Parent) $target
        }
        $item = Get-Item -LiteralPath $target -ErrorAction Stop
    }
    return $item.FullName
}

function New-StagingDir {
    param([string]$SourceDir)

    # On Windows with core.symlinks=false, git stores symlinks as plain text
    # files. We build a staging copy in a temp directory where broken links
    # under skills/*/scripts are replaced with real junctions pointing to the
    # dist/scripts directory inside the source tree.

    $stageDir = Join-Path $env:TEMP "strict-spec-driven-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

    # Copy everything except skills/ (handled separately)
    Get-ChildItem -LiteralPath $SourceDir -Force | Where-Object {
        $_.Name -ne 'skills'
    } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $stageDir -Recurse -Force
    }

    # Copy skills/ and fix broken symlinks in the copy
    $srcSkills = Join-Path $SourceDir 'skills'
    $dstSkills = Join-Path $stageDir 'skills'
    Copy-Item -LiteralPath $srcSkills -Destination $dstSkills -Recurse -Force

    $fixed = 0
    Get-ChildItem -LiteralPath $dstSkills -Directory | ForEach-Object {
        $linkPath = Join-Path $_.FullName 'scripts'
        if (-not (Test-Path -LiteralPath $linkPath)) { return }

        $item = Get-Item -LiteralPath $linkPath -Force
        if ($item.LinkType) { return }
        if ($item.PSIsContainer) { return }

        $target = (Get-Content -LiteralPath $linkPath -Raw).Trim()
        if (-not $target) { return }

        # Resolve relative target against the *source* skill dir
        $srcSkillDir = Join-Path $srcSkills $_.Name
        $resolvedTarget = if ([System.IO.Path]::IsPathRooted($target)) {
            $target
        } else {
            [System.IO.Path]::GetFullPath((Join-Path $srcSkillDir $target))
        }

        if (-not (Test-Path -LiteralPath $resolvedTarget)) { return }

        Remove-Item -LiteralPath $linkPath -Force
        $null = & cmd.exe /c "mklink /J `"$linkPath`" `"$resolvedTarget`"" 2>&1
        $fixed++
    }

    if ($fixed -gt 0) {
        Write-Host "Fixed $fixed symlink(s) in staging directory"
    }

    return $stageDir
}

function Resolve-DefaultBinDir {
    if ($BinDir) {
        return $BinDir
    }
    if ($env:LOCALAPPDATA) {
        return (Join-Path $env:LOCALAPPDATA 'strict-spec-driven\bin')
    }
    if ($env:USERPROFILE) {
        return (Join-Path $env:USERPROFILE '.strict-spec-driven\bin')
    }
    return (Join-Path $HOME '.strict-spec-driven\bin')
}

function Normalize-PathEntry {
    param([string]$Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($fullPath)
    if ($fullPath -eq $root) {
        return $fullPath
    }
    return $fullPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
}

function Split-PathEntries {
    param([string]$PathValue)

    if (-not $PathValue) {
        return @()
    }
    return @($PathValue -split ';' | Where-Object { $_ -and $_.Trim().Length -gt 0 })
}

function Test-PathContainsEntry {
    param(
        [string]$PathValue,
        [string]$Directory
    )

    $wanted = Normalize-PathEntry $Directory
    foreach ($entry in (Split-PathEntries $PathValue)) {
        if ((Normalize-PathEntry $entry) -ieq $wanted) {
            return $true
        }
    }
    return $false
}

function Add-UserPathEntry {
    param([string]$Directory)

    $entry = Normalize-PathEntry $Directory
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    if (Test-PathContainsEntry $userPath $entry) {
        Write-Host "User PATH already contains: $entry"
    } else {
        $entries = Split-PathEntries $userPath
        $newPath = (@($entries) + $entry) -join ';'
        [System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
        Write-Host "Added to user PATH: $entry"
    }

    if (-not (Test-PathContainsEntry $env:PATH $entry)) {
        $env:PATH = (@(Split-PathEntries $env:PATH) + $entry) -join ';'
    }
    Write-Host 'Open a new terminal before invoking strict-spec-driven by name outside this session.'
}

function Remove-UserPathEntry {
    param([string]$Directory)

    $entry = Normalize-PathEntry $Directory
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (Test-PathContainsEntry $userPath $entry)) {
        Write-Host "User PATH does not contain: $entry"
        return
    }

    $remaining = @()
    foreach ($pathEntry in (Split-PathEntries $userPath)) {
        if ((Normalize-PathEntry $pathEntry) -ine $entry) {
            $remaining += $pathEntry
        }
    }
    [System.Environment]::SetEnvironmentVariable('Path', ($remaining -join ';'), 'User')
    Write-Host "Removed from user PATH: $entry"
}

# Resolve script directory, following any symlinks / junctions
$ScriptDir = if ($PSScriptRoot) {
    (Resolve-RealPath $PSScriptRoot)
} else {
    $PWD.Path
}
$ResolvedBinDir = Resolve-DefaultBinDir

if ($Uninstall) {
    Write-Host "Uninstalling strict skills from: $ScriptDir"
    & npm exec skills@1.5.9 -- remove -g
    Remove-Item -LiteralPath (Join-Path $ResolvedBinDir 'strict-spec-driven.exe') -Force -ErrorAction SilentlyContinue
    if ($NoPathUpdate) {
        Write-Host 'Skipping user PATH cleanup because -NoPathUpdate was provided'
    } elseif ($KeepPathOnUninstall) {
        Write-Host 'Leaving user PATH unchanged because -KeepPathOnUninstall was provided'
    } else {
        Remove-UserPathEntry $ResolvedBinDir
    }
} else {
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        throw 'bun is required to build the native strict-spec-driven executable'
    }
    Write-Host 'Building strict-spec-driven native executable'
    Push-Location $ScriptDir
    try {
        & bun run build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & bun scripts/build-native-cli.ts --install --bin-dir "$ResolvedBinDir"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
    if ($NoPathUpdate) {
        Write-Host 'Skipping user PATH update because -NoPathUpdate was provided'
    } else {
        Add-UserPathEntry $ResolvedBinDir
    }

    $stageDir = New-StagingDir $ScriptDir
    try {
        Write-Host "Installing strict skills from: $ScriptDir"
        & npm exec skills@1.5.9 -- add "$stageDir" -g -y
    } finally {
        Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned up staging directory"
    }
}
