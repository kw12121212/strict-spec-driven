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

function Repair-SkillScriptLinks {
    param([string]$RootDir)

    # On Windows with core.symlinks=false, git stores symlinks as plain text
    # files containing the target path. Each skills/*/scripts should be a
    # directory symlink/junction pointing to ../../dist/scripts.
    $skillsDir = Join-Path $RootDir 'skills'
    if (-not (Test-Path -LiteralPath $skillsDir)) { return }

    $fixed = 0
    Get-ChildItem -LiteralPath $skillsDir -Directory | ForEach-Object {
        $linkPath = Join-Path $_.FullName 'scripts'
        if (-not (Test-Path -LiteralPath $linkPath)) { return }

        $item = Get-Item -LiteralPath $linkPath -Force
        # A real symlink/junction has LinkType set; a plain file means broken
        if ($item.LinkType) { return }
        if ($item.PSIsContainer) { return }

        # Read the intended symlink target (e.g. "../../dist/scripts")
        $target = (Get-Content -LiteralPath $linkPath -Raw).Trim()
        if (-not $target) { return }

        $resolvedTarget = if ([System.IO.Path]::IsPathRooted($target)) {
            $target
        } else {
            [System.IO.Path]::GetFullPath((Join-Path $_.FullName $target))
        }

        if (-not (Test-Path -LiteralPath $resolvedTarget)) {
            Write-Warning "Skipping $linkPath : target $resolvedTarget not found"
            return
        }

        Remove-Item -LiteralPath $linkPath -Force
        # mklink /J creates a directory junction (no admin rights needed)
        $null = & cmd.exe /c "mklink /J `"$linkPath`" `"$resolvedTarget`"" 2>&1
        $fixed++
    }

    if ($fixed -gt 0) {
        Write-Host "Repaired $fixed broken symlink(s) under skills/"
    }
}

# Resolve script directory, following any symlinks / junctions
$ScriptDir = if ($PSScriptRoot) {
    (Resolve-RealPath $PSScriptRoot)
} else {
    $PWD.Path
}

if ($Uninstall) {
    Write-Host "Uninstalling strict skills from: $ScriptDir"
    & npx skills remove -g
} else {
    Repair-SkillScriptLinks $ScriptDir
    Write-Host "Installing strict skills from: $ScriptDir"
    & npx skills add "$ScriptDir" -g -y
}
