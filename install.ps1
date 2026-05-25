#Requires -Version 5.1
<#
.SYNOPSIS
Registers or removes the strict skill package from this repository (Windows).

.PARAMETER Uninstall
Remove the strict skill registration instead of installing it.

.EXAMPLE
.\install.ps1
.\install.ps1 -Uninstall
#>

param(
    [switch]$Uninstall
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

# Resolve script directory, following any symlinks / junctions
$ScriptDir = if ($PSScriptRoot) {
    (Resolve-RealPath $PSScriptRoot)
} else {
    $PWD.Path
}

if ($Uninstall) {
    Write-Host "Uninstalling strict skills from: $ScriptDir"
    & npx skills remove --all -g -y
} else {
    $stageDir = New-StagingDir $ScriptDir
    try {
        Write-Host "Installing strict skills from: $ScriptDir"
        & npx skills add "$stageDir" -g -y
    } finally {
        Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned up staging directory"
    }
}
