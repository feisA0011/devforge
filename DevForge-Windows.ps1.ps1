# ==============================================================================
# DevForge-Windows.ps1  v3.0  —  FINAL BUILD
# Machine : Lenovo ThinkPad L14 Gen 2  |  i3-1115G4  |  8GB  |  WD SN730 NVMe
# Owner   : one0  |  Locale: English UK + Danish  |  Timezone: Copenhagen
#
# HOW TO RUN — paste into PowerShell as Administrator:
#
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/feisA0011/devforge/main/DevForge-Windows.ps1" -OutFile "$env:TEMP\DevForge-Windows.ps1"
#   & "$env:TEMP\DevForge-Windows.ps1"
#
# SAFE      : Every step asks [Y/n] before running. Type q to pause anytime.
# AUDITABLE : Plain text — read every line before running.
# RESUMABLE : Saves state to ~/.devforge/windows-state.json after each step.
# REVERSIBLE: Every change documented with how to undo it.
# ==============================================================================

#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

$VERSION    = "3.0"
$FORGE_REPO = "https://github.com/feisA0011/devforge.git"
$LOG_DIR    = "$env:USERPROFILE\.devforge"
$LOG_FILE   = "$LOG_DIR\windows-setup.log"
$STATE_FILE = "$LOG_DIR\windows-state.json"

# ─── OUTPUT ──────────────────────────────────────────────────────────────────
function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ██████╗ ███████╗██╗   ██╗███████╗ ██████╗ ██████╗  ██████╗ ███████╗" -ForegroundColor Cyan
    Write-Host "  ██╔══██╗██╔════╝██║   ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝" -ForegroundColor Cyan
    Write-Host "  ██║  ██║█████╗  ██║   ██║█████╗  ██║   ██║██████╔╝██║  ███╗█████╗  " -ForegroundColor Cyan
    Write-Host "  ██║  ██║██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  " -ForegroundColor Cyan
    Write-Host "  ██████╔╝███████╗ ╚████╔╝ ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗" -ForegroundColor Cyan
    Write-Host "  ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  v$VERSION  |  ThinkPad L14 Gen 2  |  one0  |  Final Build" -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Section { param($t) Write-Host ""; Write-Host "  ── $t" -ForegroundColor Cyan; Write-Host "" }
function Write-Ok      { param($t) Write-Host "  ✓  $t" -ForegroundColor Green }
function Write-Skip    { param($t) Write-Host "  →  $t" -ForegroundColor DarkGray }
function Write-Step    { param($t) Write-Host "  ◈  $t" -ForegroundColor Yellow }
function Write-Warn    { param($t) Write-Host "  ⚠  $t" -ForegroundColor Yellow }
function Write-Err     { param($t) Write-Host "  ✗  $t" -ForegroundColor Red }
function Write-Info    { param($t) Write-Host "     $t" -ForegroundColor DarkGray }
function Write-Log {
    param($msg)
    $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
    Add-Content -Path $LOG_FILE -Value "[$ts] $msg" -ErrorAction SilentlyContinue
}

# ─── STATE ───────────────────────────────────────────────────────────────────
function Load-State {
    if (Test-Path $STATE_FILE) {
        try   { return Get-Content $STATE_FILE -Raw | ConvertFrom-Json }
        catch { return [PSCustomObject]@{} }
    }
    return [PSCustomObject]@{}
}
function Save-State { param($s) $s | ConvertTo-Json | Set-Content $STATE_FILE }
function Is-Done    { param($s,$k) return ($s.PSObject.Properties.Name -contains $k) -and ($s.$k -eq $true) }
function Mark-Done  { param($s,$k) $s | Add-Member -NotePropertyName $k -NotePropertyValue $true -Force; Save-State $s }

# ─── CONFIRM ─────────────────────────────────────────────────────────────────
function Confirm-Step {
    param($state, $key, $title, $detail = "", $undo = "")
    Write-Host ""
    Write-Host "  ◈  $title" -ForegroundColor Yellow
    if ($detail) { Write-Info $detail }
    if ($undo)   { Write-Info "Undo: $undo" }
    if (Is-Done $state $key) {
        $r = Read-Host "     Already completed — run again? [y/N]"
        if ($r -ne 'y') { Write-Skip "Skipped (already done)"; return $false }
    }
    $a = Read-Host "     Proceed? [Y/n/q to quit]"
    if ($a -eq 'q') { Write-Warn "Paused. Run again to resume — progress saved."; exit 0 }
    if ($a -eq 'n') { Write-Warn "Skipped"; return $false }
    return $true
}

function Test-Cmd { param($c) return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# ─── ADMIN ───────────────────────────────────────────────────────────────────
function Assert-Admin {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) {
        Write-Err "Needs Administrator."
        Write-Info "Right-click PowerShell → Run as Administrator → run again."
        Read-Host "Press Enter to exit"; exit 1
    }
    Write-Ok "Running as Administrator"
}

# ─── APP CONTROL ─────────────────────────────────────────────────────────────
function Check-AppControl {
    $cipFiles = Get-ChildItem "$env:SystemRoot\System32\CodeIntegrity\CiPolicies\Active\" -Filter "*.cip" -ErrorAction SilentlyContinue
    if ($cipFiles -and $cipFiles.Count -gt 0) {
        Write-Warn "App Control for Business is active."
        Write-Info "All apps we install are Microsoft/vendor signed — they will pass through."
        Write-Info "If anything is blocked: Windows Security → App and browser control → Smart App Control."
        Write-Host ""
        Read-Host "  Press Enter to continue"
        Write-Log "App Control active — user informed"
    } else {
        Write-Ok "App Control — no blocking policies"
    }
}

# ─── WINDOWS VERSION ─────────────────────────────────────────────────────────
function Assert-WindowsVersion {
    $build  = [System.Environment]::OSVersion.Version.Build
    $winVer = (Get-CimInstance Win32_OperatingSystem).Caption
    Write-Ok "OS: $winVer (Build $build)"
    if ($build -lt 19041) {
        Write-Err "WSL2 requires Windows 10 Build 19041+. Update Windows first."
        exit 1
    }
    Write-Log "OS verified: $winVer Build $build"
}

# ==============================================================================
# PHASE 0 — LOCALE & IDENTITY
# Safe registry writes. Fully reversible via Settings → Time & Language.
# ==============================================================================
function Set-LocaleAndIdentity {
    param($state)
    Write-Section "Phase 0 — Locale, identity & timezone"

    # Timezone
    if (Confirm-Step $state "timezone" `
        "Set timezone to Copenhagen (Central European Time)" `
        "UTC+1 winter / UTC+2 summer — correct for Denmark" `
        "Settings → Time & Language → Date & Time → Time zone") {
        try {
            Set-TimeZone -Id "Central European Standard Time"
            Write-Ok "Timezone set to Copenhagen (CET)"
            Write-Log "Timezone: Central European Standard Time"
            Mark-Done $state "timezone"
        } catch { Write-Err "Timezone failed: $_" }
    }

    # Display language English UK
    if (Confirm-Step $state "language" `
        "Set display language to English (United Kingdom)" `
        "Windows menus, dialogs and messages will be in English UK" `
        "Settings → Time & Language → Language → remove English UK") {
        try {
            # Install English UK language pack
            $lpExists = Get-WinUserLanguageList | Where-Object { $_.LanguageTag -eq 'en-GB' }
            if (-not $lpExists) {
                $langList = New-WinUserLanguageList "en-GB"
                $langList[0].InputMethodTips.Add("0809:00000809")
                Set-WinUserLanguageList $langList -Force
            }
            Set-WinUILanguageOverride -Language "en-GB"
            Set-WinSystemLocale -SystemLocale "en-GB"
            Write-Ok "Display language set to English UK"
            Write-Log "Language: en-GB"
            Mark-Done $state "language"
        } catch { Write-Err "Language failed: $_"; Write-Info "Set manually: Settings → Time & Language → Language" }
    }

    # Keyboard layouts — English UK + Danish
    if (Confirm-Step $state "keyboard" `
        "Add keyboard layouts: English UK + Danish" `
        "Switch between them with Win+Space" `
        "Settings → Time & Language → Language → keyboard options") {
        try {
            $langList = Get-WinUserLanguageList
            # Add English UK if missing
            $enGB = $langList | Where-Object { $_.LanguageTag -eq 'en-GB' }
            if (-not $enGB) {
                $langList.Add([Microsoft.InternationalSettings.Commands.WinUserLanguage]::new('en-GB'))
            }
            # Add Danish if missing
            $da = $langList | Where-Object { $_.LanguageTag -eq 'da-DK' }
            if (-not $da) {
                $langList.Add([Microsoft.InternationalSettings.Commands.WinUserLanguage]::new('da-DK'))
            }
            Set-WinUserLanguageList $langList -Force
            Write-Ok "Keyboard layouts: English UK + Danish (Win+Space to switch)"
            Write-Log "Keyboards: en-GB + da-DK"
            Mark-Done $state "keyboard"
        } catch { Write-Err "Keyboard failed: $_"; Write-Info "Add manually: Settings → Time & Language → Language" }
    }

    # Date format — UK style dd/MM/yyyy
    if (Confirm-Step $state "dateformat" `
        "Set date format to dd/MM/yyyy (English UK style)" `
        "e.g. 17/03/2026 instead of 2026.03.17" `
        "Settings → Time & Language → Region → change data formats") {
        try {
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sShortDate" -Value "dd/MM/yyyy"
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sLongDate"  -Value "dd MMMM yyyy"
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sTimeFormat" -Value "HH:mm:ss"
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sShortTime" -Value "HH:mm"
            Write-Ok "Date format: dd/MM/yyyy  |  Time: 24h"
            Write-Log "Date format: dd/MM/yyyy"
            Mark-Done $state "dateformat"
        } catch { Write-Err "Date format failed: $_" }
    }

    # Number/currency format — Danish (. thousands, , decimal)
    if (Confirm-Step $state "numberformat" `
        "Set number format to Danish standard (1.000,00 / DKK)" `
        "Decimal separator: comma. Thousands separator: period." `
        "Settings → Time & Language → Region → change data formats") {
        try {
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sDecimal"   -Value ","
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sThousand"  -Value "."
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sCurrency"  -Value "kr."
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "iCurrency"  -Value "3"
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sMonDecSep" -Value ","
            Set-ItemProperty -Path "HKCU:\Control Panel\International" -Name "sMonThouSep" -Value "."
            Write-Ok "Number format: Danish (1.000,00  |  kr. currency)"
            Write-Log "Number format: Danish"
            Mark-Done $state "numberformat"
        } catch { Write-Err "Number format failed: $_" }
    }

    # Remove Lithuanian locale (optional — only if it exists)
    if (Confirm-Step $state "remove_lt" `
        "Remove Lithuanian keyboard/locale from language list" `
        "Cleans up previous owner's settings" `
        "Settings → Time & Language → Language → add Lithuanian back") {
        try {
            $langList = Get-WinUserLanguageList
            $lt = $langList | Where-Object { $_.LanguageTag -like 'lt*' }
            if ($lt) {
                $langList.Remove($lt)
                Set-WinUserLanguageList $langList -Force
                Write-Ok "Lithuanian locale removed"
                Write-Log "Lithuanian locale removed"
            } else {
                Write-Skip "Lithuanian locale not found — already clean"
            }
            Mark-Done $state "remove_lt"
        } catch { Write-Err "Remove locale failed: $_" }
    }
}

# ==============================================================================
# PHASE 1 — EXECUTION POLICY + MEMORY
# ==============================================================================
function Set-SystemPrep {
    param($state)
    Write-Section "Phase 1 — System preparation"

    if (Confirm-Step $state "exec_policy" `
        "Set PowerShell execution policy (current user only)" `
        "Allows signed scripts to run — does NOT change system-wide policy" `
        "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Restricted") {
        Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
        Write-Ok "Execution policy: RemoteSigned for current user"
        Write-Log "Execution policy set"
        Mark-Done $state "exec_policy"
    }

    if (Confirm-Step $state "wsl_memory" `
        "Write WSL2 memory config (.wslconfig)" `
        "Caps WSL2 at 3GB + autoMemoryReclaim — keeps Windows responsive on 8GB" `
        "Delete C:\Users\PC\.wslconfig") {
        $cfg = "$env:USERPROFILE\.wslconfig"
        $existing = if (Test-Path $cfg) { Get-Content $cfg -Raw } else { "" }
        if ($existing -match "memory=") {
            Write-Skip ".wslconfig already has memory setting — not overwriting"
            Write-Info "Current: $cfg"
        } else {
            $content = @"
# DevForge — ThinkPad L14 Gen 2 (8GB RAM, WD SN730 NVMe)
# Generated: $(Get-Date -Format 'yyyy-MM-dd')
[wsl2]
memory=3GB
processors=2
swap=2GB
autoMemoryReclaim=gradual
localhostForwarding=true
"@
            Set-Content -Path $cfg -Value $content
            Write-Ok ".wslconfig written — WSL2 capped at 3GB, autoMemoryReclaim=gradual"
            Write-Log ".wslconfig written"
        }
        Mark-Done $state "wsl_memory"
    }
}

# ==============================================================================
# PHASE 2 — WINGET + WINDOWS TOOLS
# ==============================================================================
function Install-WindowsTools {
    param($state)
    Write-Section "Phase 2 — Windows tools"

    # Winget
    if (Confirm-Step $state "winget" `
        "Ensure winget is installed" `
        "Microsoft's official package manager — used for all app installs") {
        if (Test-Cmd "winget") {
            Write-Skip "winget already available ($(winget --version))"
        } else {
            try {
                $tmp = "$env:TEMP\AppInstaller.msixbundle"
                Invoke-WebRequest -Uri "https://aka.ms/getwinget" -OutFile $tmp -UseBasicParsing
                Add-AppxPackage $tmp -ErrorAction Stop
                Remove-Item $tmp -ErrorAction SilentlyContinue
                Write-Ok "winget installed"
                Write-Log "winget installed"
            } catch {
                Write-Warn "Automatic winget install failed."
                Write-Info "Open Microsoft Store → search 'App Installer' → Install → re-run."
                Read-Host "Press Enter when done"
            }
        }
        Mark-Done $state "winget"
    }

    # Helper
    function Install-App {
        param([string]$Id, [string]$Name, [string]$CheckCmd="", [string]$CheckPath="")
        $have = $false
        if ($CheckCmd -and (Test-Cmd $CheckCmd))    { $have = $true }
        if ($CheckPath -and (Test-Path $CheckPath)) { $have = $true }
        if (-not $have) {
            $listed = winget list --id $Id --exact 2>$null | Select-String $Id
            if ($listed) { $have = $true }
        }
        if ($have) {
            Write-Skip "$Name already installed"
            $u = Read-Host "     Update $Name? [y/N]"
            if ($u -eq 'y') {
                winget upgrade --id $Id --silent --accept-package-agreements --accept-source-agreements 2>$null
                Write-Ok "$Name updated"
                Write-Log "$Name updated"
            }
            return
        }
        Write-Step "Installing $Name..."
        try {
            winget install --id $Id --silent --accept-package-agreements --accept-source-agreements
            Write-Ok "$Name installed"
            Write-Log "$Name installed ($Id)"
        } catch {
            Write-Warn "$Name install failed — try manually: winget install $Id"
            Write-Log "$Name failed: $_"
        }
    }

    if (Confirm-Step $state "win_terminal" `
        "Install Windows Terminal" `
        "Modern terminal with tabs, WSL2 profiles, and fast rendering" `
        "winget uninstall Microsoft.WindowsTerminal") {
        Install-App "Microsoft.WindowsTerminal" "Windows Terminal" "wt"
        Mark-Done $state "win_terminal"
    }

    if (Confirm-Step $state "git_win" `
        "Install Git for Windows" `
        "Git on the Windows side + credential manager shared with WSL2" `
        "winget uninstall Git.Git") {
        Install-App "Git.Git" "Git for Windows" "git"
        Mark-Done $state "git_win"
    }

    if (Confirm-Step $state "chrome" `
        "Install Google Chrome" `
        "For Project IDX (cloud IDE) and Google AI Studio" `
        "winget uninstall Google.Chrome") {
        Install-App "Google.Chrome" "Google Chrome" "" "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
        Mark-Done $state "chrome"
    }
}

# ==============================================================================
# PHASE 3 — AI DESKTOP APPS
# ==============================================================================
function Install-AIApps {
    param($state)
    Write-Section "Phase 3 — AI desktop apps"

    function Install-App {
        param([string]$Id, [string]$Name, [string]$CheckCmd="", [string]$CheckPath="")
        $have = $false
        if ($CheckCmd -and (Test-Cmd $CheckCmd))    { $have = $true }
        if ($CheckPath -and (Test-Path $CheckPath)) { $have = $true }
        if (-not $have) {
            $listed = winget list --id $Id --exact 2>$null | Select-String $Id
            if ($listed) { $have = $true }
        }
        if ($have) {
            Write-Skip "$Name already installed"
            $u = Read-Host "     Update $Name? [y/N]"
            if ($u -eq 'y') {
                winget upgrade --id $Id --silent --accept-package-agreements --accept-source-agreements 2>$null
                Write-Ok "$Name updated"; Write-Log "$Name updated"
            }
            return
        }
        Write-Step "Installing $Name..."
        try {
            winget install --id $Id --silent --accept-package-agreements --accept-source-agreements
            Write-Ok "$Name installed"; Write-Log "$Name installed ($Id)"
        } catch {
            Write-Warn "$Name failed — try: winget install $Id"
            Write-Log "$Name failed: $_"
        }
    }

    if (Confirm-Step $state "claude_desktop" `
        "Install Claude Desktop" `
        "Anthropic's official Windows app — chat, Projects, computer use" `
        "winget uninstall Anthropic.Claude") {
        Install-App "Anthropic.Claude" "Claude Desktop" "" "$env:LOCALAPPDATA\AnthropicClaude\claude.exe"
        Mark-Done $state "claude_desktop"
    }

    if (Confirm-Step $state "chatgpt_desktop" `
        "Install ChatGPT Desktop" `
        "OpenAI's official Windows app — GPT-4o, voice mode" `
        "winget uninstall OpenAI.ChatGPT") {
        Install-App "OpenAI.ChatGPT" "ChatGPT Desktop" "" "$env:LOCALAPPDATA\Programs\ChatGPT\ChatGPT.exe"
        Mark-Done $state "chatgpt_desktop"
    }
}

# ==============================================================================
# PHASE 4 — WSL2 + UBUNTU
# ==============================================================================
function Install-WSL2AndUbuntu {
    param($state)
    Write-Section "Phase 4 — WSL2 + Ubuntu 22.04"

    if (Confirm-Step $state "wsl2_features" `
        "Enable WSL2 features" `
        "Activates Windows Subsystem for Linux and Virtual Machine Platform" `
        "Windows Features → turn off both features") {

        $wslF = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -ErrorAction SilentlyContinue
        $vmF  = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -ErrorAction SilentlyContinue
        $needsReboot = $false

        if ($wslF.State -ne 'Enabled') {
            Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart | Out-Null
            $needsReboot = $true
            Write-Ok "WSL feature enabled"
        } else { Write-Skip "WSL feature already enabled" }

        if ($vmF.State -ne 'Enabled') {
            Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart | Out-Null
            $needsReboot = $true
            Write-Ok "Virtual Machine Platform enabled"
        } else { Write-Skip "Virtual Machine Platform already enabled" }

        if ($needsReboot) {
            Mark-Done $state "wsl2_features"
            Write-Host ""
            Write-Warn "A restart is required to continue."
            Write-Warn "After restarting: run this script again — it will resume from here."
            $r = Read-Host "  Restart now? [Y/n]"
            if ($r -ne 'n') { Restart-Computer -Force }
            else { Write-Warn "Restart manually then run again."; exit 0 }
        }

        wsl --set-default-version 2 2>$null
        wsl --update 2>$null
        Write-Ok "WSL2 set as default, kernel updated"
        Write-Log "WSL2 ready"
        Mark-Done $state "wsl2_features"
    }

    if (Confirm-Step $state "ubuntu" `
        "Install Ubuntu 22.04 LTS" `
        "Downloads ~500MB. You will set a Linux username and password — remember these." `
        "wsl --unregister Ubuntu-22.04") {

        $distros = wsl --list --quiet 2>$null
        if ($distros -match "Ubuntu") {
            Write-Skip "Ubuntu already installed"
            wsl --list --verbose
        } else {
            Write-Step "Installing Ubuntu 22.04 LTS (~500MB)..."
            winget install --id Canonical.Ubuntu.2204 --silent --accept-package-agreements --accept-source-agreements
            Write-Ok "Ubuntu 22.04 LTS installed"
            Write-Host ""
            Write-Warn "Ubuntu will open and ask you to create a username and password."
            Write-Warn "This is your Linux account. Choose a simple username (e.g. one0)."
            Write-Warn "Remember this password — you will need it for sudo commands."
            Write-Host ""
            Read-Host "  Press Enter after you have set your Ubuntu username and password"
            Write-Log "Ubuntu 22.04 installed"
        }
        Mark-Done $state "ubuntu"
    }
}

# ==============================================================================
# PHASE 5 — WSL2 BOOTSTRAP + DEVFORGE LAUNCH
# ==============================================================================
function Bootstrap-AndLaunch {
    param($state)
    Write-Section "Phase 5 — Bootstrap WSL2 + launch DevForge"

    if (Confirm-Step $state "wsl2_config" `
        "Write WSL2 system config (wsl.conf)" `
        "Enables systemd, sets mount options, disables Windows PATH pollution in WSL2") {

        wsl -d Ubuntu-22.04 -- bash -c @'
sudo tee /etc/wsl.conf > /dev/null << 'EOF'
[boot]
systemd=true

[automount]
enabled=true
options=metadata,umask=22,fmask=11

[interop]
appendWindowsPath=false
EOF
echo "wsl.conf written"
'@
        Write-Ok "WSL2 wsl.conf written (systemd enabled)"
        Write-Log "wsl.conf written"
        Mark-Done $state "wsl2_config"
    }

    if (Confirm-Step $state "node_bootstrap" `
        "Install Node.js in WSL2 (bootstrap)" `
        "Minimal install so DevForge can run — DevForge will upgrade to NVM+LTS") {

        $node = wsl -d Ubuntu-22.04 -- bash -c "which node 2>/dev/null || which nodejs 2>/dev/null" 2>$null
        if ($node) {
            Write-Skip "Node.js already present in WSL2"
        } else {
            wsl -d Ubuntu-22.04 -- bash -c "sudo apt-get update -q && sudo apt-get install -y nodejs npm git curl 2>/dev/null"
            Write-Ok "Node.js bootstrapped in WSL2"
            Write-Log "Node.js bootstrapped"
        }
        Mark-Done $state "node_bootstrap"
    }

    if (Confirm-Step $state "clone_devforge" `
        "Clone DevForge into WSL2" `
        "Clones feisA0011/devforge to ~/devforge — pulls latest if already cloned") {

        $exists = wsl -d Ubuntu-22.04 -- bash -c "[ -d ~/devforge ] && echo yes || echo no" 2>$null
        if ($exists -match "yes") {
            wsl -d Ubuntu-22.04 -- bash -c "cd ~/devforge && git pull --quiet 2>/dev/null"
            Write-Ok "DevForge updated to latest"
        } else {
            wsl -d Ubuntu-22.04 -- bash -c "git clone $FORGE_REPO ~/devforge 2>/dev/null"
            Write-Ok "DevForge cloned to ~/devforge"
            Write-Log "DevForge cloned"
        }
        Mark-Done $state "clone_devforge"
    }

    # Computer name — LAST step, requires reboot
    if (Confirm-Step $state "computer_name" `
        "Rename computer from DESKTOP-E617IPD to one0-forge" `
        "Takes effect after the reboot at the end of this script" `
        "Rename-Computer -NewName 'DESKTOP-E617IPD'") {
        try {
            Rename-Computer -NewName "one0-forge" -Force -ErrorAction Stop
            Write-Ok "Computer name set to one0-forge (takes effect after reboot)"
            Write-Log "Computer renamed to one0-forge"
            Mark-Done $state "computer_name"
        } catch { Write-Err "Rename failed: $_" }
    }

    # Launch DevForge in WSL2
    if (Confirm-Step $state "launch_devforge" `
        "Launch DevForge inside WSL2" `
        "Opens a new terminal window and starts the WSL2 setup phase automatically") {
        Write-Host ""
        Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Green
        Write-Host "  │  Windows setup complete!                            │" -ForegroundColor Green
        Write-Host "  │  Launching DevForge in WSL2...                      │" -ForegroundColor Green
        Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Green
        Write-Host ""
        Start-Sleep -Seconds 2
        if (Test-Cmd "wt") {
            wt -d . wsl -d Ubuntu-22.04 -- bash -c "cd ~/devforge && node index.js; exec bash"
        } else {
            Start-Process "wsl" -ArgumentList "-d", "Ubuntu-22.04", "--", "bash", "-c", "cd ~/devforge && node index.js; exec bash"
        }
        Write-Log "DevForge launched in WSL2"
        Mark-Done $state "launch_devforge"
    }
}

# ==============================================================================
# SUMMARY
# ==============================================================================
function Write-Summary {
    param($state)
    $done = ($state.PSObject.Properties | Where-Object { $_.Value -eq $true }).Count
    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Green
    Write-Host "  │  DevForge Windows phase complete                    │" -ForegroundColor Green
    Write-Host "  │  $done steps done  |  log: ~/.devforge/windows-setup.log  │" -ForegroundColor DarkGray
    Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "  1.  Complete the setup inside the WSL2 terminal that just opened" -ForegroundColor DarkGray
    Write-Host "  2.  When WSL2 setup is done — restart this machine" -ForegroundColor DarkGray
    Write-Host "  3.  After restart: computer will be named one0-forge" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Browser bookmarks to add:" -ForegroundColor White
    Write-Host "  →  Project IDX     : https://idx.google.com" -ForegroundColor DarkGray
    Write-Host "  →  Google AI Studio: https://aistudio.google.com" -ForegroundColor DarkGray
    Write-Host "  →  Claude web      : https://claude.ai" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Log file  : $LOG_FILE" -ForegroundColor DarkGray
    Write-Host "  State file: $STATE_FILE" -ForegroundColor DarkGray
    Write-Host ""
}

# ==============================================================================
# MAIN
# ==============================================================================
function Main {
    New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null
    Write-Banner
    Assert-Admin
    Assert-WindowsVersion
    Check-AppControl

    Write-Host "  Machine : Lenovo ThinkPad L14 Gen 2" -ForegroundColor DarkGray
    Write-Host "  CPU     : i3-1115G4  |  RAM: 8GB  |  SSD: WD SN730 NVMe" -ForegroundColor DarkGray
    Write-Host "  Owner   : one0  |  Locale: English UK + Danish  |  TZ: Copenhagen" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Press Enter (or Y) to do each step." -ForegroundColor DarkGray
    Write-Host "  Type n to skip any step. Type q to pause and save progress." -ForegroundColor DarkGray
    Write-Host "  Every step shows what it does and how to undo it." -ForegroundColor DarkGray
    Write-Host ""

    $state    = Load-State
    $donePrev = ($state.PSObject.Properties | Where-Object { $_.Value -eq $true }).Count
    if ($donePrev -gt 0) {
        Write-Warn "Resuming — $donePrev steps already completed."
        Write-Host ""
    }

    $go = Read-Host "  Ready to start? [Y/n]"
    if ($go -eq 'n') { Write-Host "  Run again when ready."; exit 0 }

    Set-LocaleAndIdentity   $state
    Set-SystemPrep          $state
    Install-WindowsTools    $state
    Install-AIApps          $state
    Install-WSL2AndUbuntu   $state
    Bootstrap-AndLaunch     $state
    Write-Summary           $state

    Read-Host "  Press Enter to close"
}

Main
