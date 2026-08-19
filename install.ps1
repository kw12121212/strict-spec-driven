#Requires -Version 5.1
<#
.SYNOPSIS
Registers or removes the strict skill package from this repository (Windows).
The install path bootstraps its own dependencies: bun is auto-installed if
missing, project deps are installed with `bun install`, and the global `skills`
CLI runs via bunx (npm exec / npx are kept as uninstall fallbacks).
Installing also removes the skills this repository has retired, listed in
retired-skills.json, so upgrading over an older checkout does not leave a
deleted slash command installed. Both paths name the skills they remove;
the skills CLI opens an interactive menu when given none.

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
    Write-Host 'Open a new terminal before invoking strict-spec-cli by name outside this session.'
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

# The global `skills` package. `bun x` runs the package's bin directly and,
# unlike npx, is immune to a colliding `npm run skills` script. npm exec / npx
# remain as uninstall fallbacks for when bun is already removed.
#
# PromptScript emits a non-fatal "does not support global skill installation"
# warning per skill (exit code stays 0) and does not block installation, so it
# is safe to ignore.
#
# The trailing `--` is needed for npm exec / npx to separate their own flags
# from the package's args, but bun passes `--` through to the skills CLI, which
# then rejects it as an unknown command ("Unknown command: --"), so the bunx
# invocation must omit it.
#
# We use `bun x` rather than `bunx` because the npm-installed `bunx.exe` shim
# panics ("reached unreachable code") on Windows 11 / bun 1.3.x when handed the
# package name and its args together; `bun x` invokes the same resolver via the
# stable `bun` binary and avoids the crash.
function Invoke-Skills {
    param([Parameter(Mandatory = $true)][string[]]$CommandArgs)

    if (Get-Command bun -ErrorAction SilentlyContinue) {
        $prefix = @('bun', 'x', 'skills@1.5.14')
    } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        $prefix = @('npm', 'exec', 'skills@1.5.14', '--')
    } elseif (Get-Command npx -ErrorAction SilentlyContinue) {
        $prefix = @('npx', 'skills@1.5.14', '--')
    } else {
        throw 'No runtime available to run the skills CLI (need bun, npm, or npx).'
    }

    $skillsArgs = $prefix[1..($prefix.Length - 1)] + $CommandArgs
    & $prefix[0] @skillsArgs
}

# The skill names this repository ships ('packaged'), the ones it used to ship ('retired'), and
# both together ('removable'). One implementation answers for both installers, so this file and
# install.sh cannot drift apart, and the retired names cannot be guessed from a name prefix:
# strict-ticket, strict-ticket-archive, and strict-ticket-dispatch carry none of the packaged
# family prefixes.
function Get-SkillNames {
    param([Parameter(Mandatory = $true)][ValidateSet('packaged', 'retired', 'removable')][string]$Set)

    Push-Location $ScriptDir
    try {
        $names = & bun scripts/skill-package-names.ts $Set
        if ($LASTEXITCODE -ne 0) { throw "Could not resolve the $Set strict skill names." }
    } finally {
        Pop-Location
    }
    return @($names | Where-Object { $_ -and $_.Trim().Length -gt 0 })
}

# Install bun from the official Windows installer when it is not already on PATH.
function Ensure-Bun {
    if (Get-Command bun -ErrorAction SilentlyContinue) { return }

    Write-Host 'bun not found; installing bun from https://bun.sh/install.ps1'
    # Windows PowerShell 5.1 may default to legacy TLS; require TLS 1.2 for irm.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    try {
        irm https://bun.sh/install.ps1 | iex
    } catch {
        throw "bun installer failed: $($_.Exception.Message)"
    }

    # The installer updates the persistent user PATH but not this session; expose
    # bun now so the build and bunx resolve it without opening a new terminal.
    $bunInstall = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME '.bun' }
    $bunBin = Join-Path $bunInstall 'bin'
    if (-not (Test-PathContainsEntry $env:PATH $bunBin)) {
        $env:PATH = "$bunBin;$env:PATH"
    }

    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        throw "bun was installed but is not on PATH; add $bunBin to PATH and rerun."
    }
}

# node_modules is gitignored while bun.lock is tracked, so a fresh checkout must
# install project dependencies before building the native CLI. A non-empty
# node_modules can still be incomplete (a partially-resolved install, or deps
# added since the last install), so run `bun install` unconditionally: it is
# idempotent and fast against the tracked lockfile and guarantees the build
# sees every dependency.
function Ensure-ProjectDeps {
    Write-Host 'Installing project dependencies (bun install)'
    Push-Location $ScriptDir
    try {
        & bun install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}

# Resolve script directory, following any symlinks / junctions
$ScriptDir = if ($PSScriptRoot) {
    (Resolve-RealPath $PSScriptRoot)
} else {
    $PWD.Path
}
$ResolvedBinDir = Resolve-DefaultBinDir

# npm/Node is the preferred install channel on Windows: `npm install -g .` puts
# the CLI shim into npm's global bin directory, which is already on PATH, so the
# command is usable immediately in every terminal with no PATH edits and no
# 95MB native executable. When npm is unavailable we fall back to the bun
# `--compile` native executable installed into a user bin directory (with PATH
# management), which keeps Node.js unrequired.
function Test-NpmAvailable {
    [bool](Get-Command npm -ErrorAction SilentlyContinue)
}

# Build the CLI bundle. Both the npm and the bun-native install paths need a
# current dist/scripts/strict-spec-driven.js, so this is shared up front.
function Build-CliBundle {
    Ensure-Bun
    Ensure-ProjectDeps
    Write-Host 'Building strict-spec-cli bundle'
    Push-Location $ScriptDir
    try {
        & bun run build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}

if ($Uninstall) {
    Write-Host "Uninstalling strict skills from: $ScriptDir"
    # Removal is always given explicit names. 'skills remove -g' with none opens an interactive
    # selection menu, and a non-interactive session answers nothing and exits 0, so the uninstall
    # reports success having removed not one skill. Retired names are included so an uninstall also
    # clears skills that an older version of this repository installed.
    # An unresolved name list is reported and the uninstall carries on to the CLI and PATH cleanup,
    # exiting non-zero at the end, so this path behaves as install.sh does rather than aborting here.
    $skillRemovalFailed = $false
    $removableSkills = @()
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        try {
            $removableSkills = Get-SkillNames -Set 'removable'
        } catch {
            $skillRemovalFailed = $true
            Write-Warning $_.Exception.Message
        }
    } else {
        $skillRemovalFailed = $true
        Write-Warning 'bun is not on PATH, so the strict skill names could not be resolved.'
    }
    if ($skillRemovalFailed) {
        Write-Warning 'No skill was removed. Install bun and rerun this script; skill removal needs the name list it prints.'
    } elseif ($removableSkills.Count -gt 0) {
        Invoke-Skills -CommandArgs (@('remove', '-g', '-y') + $removableSkills)
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    if (Test-NpmAvailable) {
        Write-Host 'Uninstalling strict-spec-cli via npm'
        & npm uninstall -g strict-spec-driven
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    # Always clean up a native executable left by a prior bun-fallback install.
    Remove-Item -LiteralPath (Join-Path $ResolvedBinDir 'strict-spec-cli.exe') -Force -ErrorAction SilentlyContinue
    if ($NoPathUpdate) {
        Write-Host 'Skipping user PATH cleanup because -NoPathUpdate was provided'
    } elseif ($KeepPathOnUninstall) {
        Write-Host 'Leaving user PATH unchanged because -KeepPathOnUninstall was provided'
    } else {
        Remove-UserPathEntry $ResolvedBinDir
    }
    if ($skillRemovalFailed) { exit 1 }
} else {
    Build-CliBundle
    if (Test-NpmAvailable) {
        Write-Host 'Installing strict-spec-cli via npm (global)'
        Push-Location $ScriptDir
        try {
            & npm install -g .
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        } finally {
            Pop-Location
        }
        # npm-global install supersedes any native executable from a prior fallback install.
        Remove-Item -LiteralPath (Join-Path $ResolvedBinDir 'strict-spec-cli.exe') -Force -ErrorAction SilentlyContinue
        Write-Host 'strict-spec-cli installed via npm; available immediately on PATH (npm global bin).'
    } else {
        Write-Host 'npm not found; falling back to bun native executable'
        Write-Host 'Building strict-spec-cli native executable'
        Push-Location $ScriptDir
        try {
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
    }

    $stageDir = New-StagingDir $ScriptDir
    try {
        Write-Host "Installing strict skills from: $ScriptDir"
        Invoke-Skills -CommandArgs @('add', $stageDir, '-g', '-y')
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        # Adding never removes. Without this an upgrade over an older checkout leaves every skill
        # this repository has since retired installed on the machine, still offering a slash command
        # that no longer resolves. Names already absent are reported as not found and cost nothing,
        # so the whole list is passed rather than first working out which ones are installed.
        $retiredSkills = Get-SkillNames -Set 'retired'
        if ($retiredSkills.Count -gt 0) {
            Write-Host 'Removing retired strict skills:'
            foreach ($retiredSkill in $retiredSkills) { Write-Host "  $retiredSkill" }
            Invoke-Skills -CommandArgs (@('remove', '-g', '-y') + $retiredSkills)
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
    } finally {
        Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned up staging directory"
    }
}
