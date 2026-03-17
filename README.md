# DevForge v3.0

**One-click agentic engineer setup — ThinkPad L14 Gen 2 | one0 | Copenhagen**

---

## How to run

### Step 1 — Windows (PowerShell as Administrator)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/feisA0011/devforge/main/DevForge-Windows.ps1" -OutFile "$env:TEMP\DevForge-Windows.ps1"
& "$env:TEMP\DevForge-Windows.ps1"
```

The Windows script handles:
- Locale → English UK + Danish
- Timezone → Copenhagen (CET)
- Date format → dd/MM/yyyy
- Number format → Danish (1.000,00 / kr.)
- Remove Lithuanian locale
- WSL2 memory cap → 3GB + autoMemoryReclaim
- Windows Terminal, Git, Chrome
- Claude Desktop, ChatGPT Desktop
- WSL2 + Ubuntu 22.04 LTS
- Computer rename → one0-forge (on reboot)
- Auto-launches DevForge in WSL2

### Step 2 — WSL2 (auto-launched)

```bash
cd ~/devforge && node index.js
```

The WSL2 script handles:
- Hostname → one0-forge
- Git identity + SSH key + GPG signing
- Core CLIs (curl, jq, fzf, ripgrep, bat, tmux, zsh, neovim...)
- GitHub CLI (gh)
- Oh My Zsh
- NVM + Node.js LTS + pnpm + Python 3 + uv + Bun
- Docker Engine + gcloud + Supabase CLI
- Encrypted pass vault (GPG) — all API keys
- MCP servers (Filesystem, GitHub, Brave, Supabase, Slack)
- Claude Code CLI + Gemini CLI + Codex CLI
- 35+ shell aliases including memcheck

---

## Security

- SHA256 verified before every third-party installer
- All API keys stored in GPG-encrypted pass vault
- Zero plaintext keys ever written to .zshrc
- Idempotent — safe to run multiple times
- Resumable — saves state, picks up after failure
- Every change documented with how to undo it

---

## Machine

- Lenovo ThinkPad L14 Gen 2 (20X2S0XW00)
- Intel i3-1115G4 @ 3.00GHz (2 cores, 4 threads)
- 8GB DDR4-3200 (single channel — consider adding 2nd stick)
- WD SN730 NVMe SSD 256GB
- Windows 11 Pro Education Build 26100

---

## After setup

```bash
source ~/.zshrc       # activate aliases
gh auth login         # connect GitHub
gcloud init           # connect Google Cloud
claude                # launch Claude Code
memcheck              # see RAM usage
pass ls               # view encrypted vault
```

Browser bookmarks:
- Project IDX → https://idx.google.com
- Google AI Studio → https://aistudio.google.com
- Claude → https://claude.ai

---

*F=ma · feisA0011 · DevForge v3*
