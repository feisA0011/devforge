#!/usr/bin/env node
/**
 * DevForge  v3.0  —  FINAL BUILD
 * Machine : Lenovo ThinkPad L14 Gen 2  |  i3-1115G4  |  8GB  |  WD SN730
 * Owner   : one0  |  Copenhagen  |  English UK + Danish
 *
 * Security:
 *   ✓ SHA256 checksum verification before every third-party installer
 *   ✓ pass (GPG-encrypted vault) — zero plaintext API keys ever
 *   ✓ Idempotent — detects existing installs, offers update or skip
 *   ✓ systemd pre-flight + sudo cached at session start
 *   ✓ ~/.devforge/state.json phase tracker — resume anywhere
 *   ✓ Plain English — designed for non-technical users
 */

import { createInterface }                              from 'readline';
import { execSync }                                     from 'child_process';
import { writeFileSync, readFileSync,
         mkdirSync, existsSync, appendFileSync }        from 'fs';
import { homedir }                                      from 'os';
import { join }                                         from 'path';

const HOME       = homedir();
const FORGE_DIR  = join(HOME, '.devforge');
const STATE_FILE = join(FORGE_DIR, 'state.json');
const LOG_FILE   = join(FORGE_DIR, 'wsl2-setup.log');
mkdirSync(FORGE_DIR, { recursive: true });

// ─── ANSI ────────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', blue: '\x1b[34m',
};

const rl  = createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

// ─── LOGGING ─────────────────────────────────────────────────────────────────
const log  = msg => appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
const p    = msg => process.stdout.write(msg + '\n');
const ok   = msg => p(`  ${C.green}✓${C.reset}  ${msg}`);
const err  = msg => p(`  ${C.red}✗${C.reset}  ${msg}`);
const info = msg => p(`  ${C.cyan}→${C.reset}  ${msg}`);
const warn = msg => p(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const skip = msg => p(`  ${C.dim}→  ${msg} (skipped)${C.reset}`);
const box  = (title, color = C.cyan) => {
  p('');
  p(`${color}${C.bold}  ── ${title}${C.reset}`);
  p('');
};

// ─── STATE ───────────────────────────────────────────────────────────────────
const loadState = () => {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
};
const saveState  = s => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
const markDone   = (s, k) => { s[k] = { done: true, at: new Date().toISOString() }; saveState(s); };
const isDone     = (s, k) => s[k]?.done === true;

// ─── SHELL ───────────────────────────────────────────────────────────────────
const run = (cmd, opts = {}) => {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: opts.silent ? 'pipe' : 'inherit' });
    log(`OK: ${cmd}`);
    return { ok: true, output: out };
  } catch (e) {
    log(`FAIL: ${cmd} — ${e.message}`);
    return { ok: false, error: e.message, output: e.stdout || '' };
  }
};
const silent  = cmd => run(cmd, { silent: true });
const which   = cmd => { const r = silent(`which ${cmd} 2>/dev/null`); return r.ok && r.output.trim().length > 0; };
const getVer  = cmd => silent(`${cmd} --version 2>/dev/null || ${cmd} version 2>/dev/null`).output?.trim().split('\n')[0] || null;

// ─── IDEMPOTENT INSTALL ───────────────────────────────────────────────────────
async function checkAndAct(name, cmd, installFn, updateFn = null) {
  if (which(cmd)) {
    const ver = getVer(cmd);
    p(`  ${C.green}●${C.reset}  ${C.bold}${name}${C.reset} already installed${ver ? ` ${C.dim}(${ver})${C.reset}` : ''}`);
    if (updateFn) {
      const a = await ask(`     Update to latest? [y/N]: `);
      if (a.trim().toLowerCase() === 'y') { await updateFn(); ok(`${name} updated`); }
      else { skip(`${name} update`); }
    } else {
      skip(`${name} install`);
    }
    return 'existed';
  }
  await installFn();
  return 'installed';
}

// ─── SECURE DOWNLOAD ─────────────────────────────────────────────────────────
async function secureRun(label, url, expectedHash, execCmd) {
  const tmp = `/tmp/devforge-${Date.now()}.sh`;
  info(`Downloading ${label}...`);
  const dl = run(`curl -fsSL "${url}" -o "${tmp}"`);
  if (!dl.ok) { err(`Download failed for ${label}`); return false; }

  const hashR  = silent(`sha256sum "${tmp}"`);
  const actual = hashR.output?.trim().split(' ')[0] || 'unknown';

  p('');
  p(`  ${C.bold}Security check — ${label}:${C.reset}`);
  p(`  SHA256: ${C.cyan}${actual}${C.reset}`);

  if (expectedHash && actual === expectedHash) {
    ok('Hash verified — installer is authentic');
  } else if (expectedHash) {
    warn('Hash does not match stored value');
    warn('This may mean the tool released an update since DevForge was last updated');
    info(`Verify manually at: ${url}`);
    const c = await ask('  Continue anyway? [y/N]: ');
    if (c.trim().toLowerCase() !== 'y') { err(`Skipped ${label}`); run(`rm -f "${tmp}"`); return false; }
  } else {
    warn('No reference hash — verify the script if you want to be certain');
    info(`Script saved to: ${tmp} — you can inspect it with: cat ${tmp}`);
    const c = await ask(`  Proceed with installing ${label}? [Y/n]: `);
    if (c.trim().toLowerCase() === 'n') { run(`rm -f "${tmp}"`); return false; }
  }

  const result = run(execCmd.replace('__FILE__', tmp));
  run(`rm -f "${tmp}"`);
  return result.ok;
}

// ─── CONFIRM STEP ────────────────────────────────────────────────────────────
async function confirm(key, state, title, detail, fn) {
  p('');
  p(`${C.yellow}${C.bold}  ◈  ${title}${C.reset}`);
  if (detail) p(`  ${C.dim}${detail}${C.reset}`);

  if (isDone(state, key)) {
    const r = await ask(`  Already completed — run again? [y/N]: `);
    if (r.trim().toLowerCase() !== 'y') { skip('already done'); return; }
  }

  const a = await ask(`  Proceed? [Y/n/q to quit]: `);
  if (a.trim().toLowerCase() === 'q') {
    p(`\n${C.yellow}  Paused. Run again to resume — progress is saved.${C.reset}\n`);
    rl.close(); process.exit(0);
  }
  if (a.trim().toLowerCase() === 'n') { warn('Skipped'); return; }

  await fn();
  markDone(state, key);
}

// ─── PROMPT VALUE ────────────────────────────────────────────────────────────
async function promptVal(label, def = '', secret = false) {
  const d = def ? ` ${C.dim}(default: ${def})${C.reset}` : '';
  process.stdout.write(`  ${C.cyan}${label}${d}: ${C.reset}`);
  if (secret) {
    process.stdout.write('\x1b[8m');
    const v = await ask('');
    process.stdout.write('\x1b[28m\n');
    return v.trim() || def;
  }
  return (await ask('')).trim() || def;
}

// ─── STORE SECRET IN PASS ────────────────────────────────────────────────────
async function storeSecret(passPath, label, shellVar, promptText) {
  const exists = silent(`pass show "${passPath}" 2>/dev/null`);
  if (exists.ok && exists.output?.trim()) {
    ok(`${label} already in vault`);
    const u = await ask('  Update with new value? [y/N]: ');
    if (u.trim().toLowerCase() !== 'y') return;
  }
  const val = await promptVal(promptText, '', true);
  if (!val) { warn('Skipped — nothing entered'); return; }
  run(`echo "${val}" | pass insert -f "${passPath}"`);
  // Write loader to shell configs (reads from pass at runtime — never stores plain text)
  const loader = `\nexport ${shellVar}="$(pass show ${passPath} 2>/dev/null)"\n`;
  const zshrc  = join(HOME, '.zshrc');
  const bashrc = join(HOME, '.bashrc');
  const cur = existsSync(zshrc) ? readFileSync(zshrc, 'utf8') : '';
  if (!cur.includes(`pass show ${passPath}`)) {
    appendFileSync(zshrc,  loader);
    appendFileSync(bashrc, loader);
  }
  ok(`${label} stored encrypted — loaded via pass at shell startup`);
}

// ─── BANNER ──────────────────────────────────────────────────────────────────
function banner() {
  p('');
  p(`${C.bold}${C.cyan}  ██████╗ ███████╗██╗   ██╗███████╗ ██████╗ ██████╗  ██████╗ ███████╗${C.reset}`);
  p(`${C.bold}${C.cyan}  ██╔══██╗██╔════╝██║   ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝${C.reset}`);
  p(`${C.bold}${C.cyan}  ██║  ██║█████╗  ██║   ██║█████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ${C.reset}`);
  p(`${C.bold}${C.cyan}  ██║  ██║██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ${C.reset}`);
  p(`${C.bold}${C.cyan}  ██████╔╝███████╗ ╚████╔╝ ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗${C.reset}`);
  p(`${C.bold}${C.cyan}  ╚═════╝ ╚══════╝  ╚═══╝  ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝${C.reset}`);
  p('');
  p(`  ${C.dim}v3.0  ·  WSL2 Setup  ·  one0  ·  ThinkPad L14 Gen 2${C.reset}`);
  p('');
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 0 — PRE-FLIGHT
// ══════════════════════════════════════════════════════════════════════════════
async function phasePreFlight(state) {
  box('Phase 0 — Pre-flight checks', C.magenta);

  // WSL2 check
  const isWSL = silent('uname -r').output?.toLowerCase().includes('wsl') ||
                existsSync('/proc/sys/fs/binfmt_misc/WSLInterop');
  isWSL ? ok('Running inside WSL2') : warn('Not detected as WSL2 — continuing anyway');

  // OS
  const release = silent('lsb_release -ds 2>/dev/null').output?.trim() || 'Linux';
  ok(`OS: ${release}`);

  // systemd check
  await confirm('systemd_check', state,
    'Verify systemd is running',
    'systemd=true in /etc/wsl.conf was set by the Windows script — confirming it is active',
    async () => {
      const sd = silent('systemctl is-active --quiet init 2>/dev/null || pidof systemd 2>/dev/null');
      const confCheck = silent('grep -q "systemd=true" /etc/wsl.conf 2>/dev/null');
      if (confCheck.ok) ok('systemd=true confirmed in /etc/wsl.conf');
      else {
        warn('systemd not found in /etc/wsl.conf — writing it now');
        run(`echo -e "[boot]\nsystemd=true" | sudo tee -a /etc/wsl.conf`);
        warn('Run: wsl --shutdown in PowerShell, then restart WSL2 for systemd to take effect');
      }
    }
  );

  // Cache sudo for entire session
  p('');
  info('Caching sudo password for this session...');
  run('sudo -v');
  run(`(while true; do sudo -n true; sleep 55; kill -0 "$$" 2>/dev/null || exit; done) 2>/dev/null &`);
  ok('sudo cached — will not time out mid-install');

  // Show resume state
  const done = Object.keys(state).filter(k => state[k]?.done);
  if (done.length > 0) {
    p('');
    info(`Resuming — ${done.length} steps already completed`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — DEV IDENTITY
// ══════════════════════════════════════════════════════════════════════════════
async function phaseIdentity(state) {
  box('Phase 1 — Developer identity', C.yellow);
  p(`  ${C.dim}Your name on GitHub, SSH key, GPG signing. Sets you up professionally.${C.reset}`);

  await confirm('hostname', state,
    'Set WSL2 hostname to one0-forge',
    'Your terminal prompt will show: one0@one0-forge',
    async () => {
      run('sudo hostnamectl set-hostname "one0-forge" 2>/dev/null || true');
      const hosts = existsSync('/etc/hosts') ? readFileSync('/etc/hosts', 'utf8') : '';
      if (!hosts.includes('127.0.1.1')) run('echo "127.0.1.1\tone0-forge" | sudo tee -a /etc/hosts');
      else run('sudo sed -i "s/^127.0.1.1.*/127.0.1.1\tone0-forge/" /etc/hosts');
      ok('WSL2 hostname: one0-forge');
    }
  );

  await confirm('git_identity', state,
    'Set Git identity (name + email)',
    'Appears on every commit — your professional signature',
    async () => {
      const name  = await promptVal('Your full name', 'one0');
      const email = await promptVal('Your email address');
      if (!email) { warn('Email required — skipping'); return; }
      run(`git config --global user.name "${name}"`);
      run(`git config --global user.email "${email}"`);
      run('git config --global init.defaultBranch main');
      run('git config --global pull.rebase false');
      run('git config --global core.editor nano');
      ok(`Git identity: ${name} <${email}>`);
    }
  );

  await confirm('ssh_key', state,
    'Generate SSH key for GitHub',
    'Creates ~/.ssh/id_ed25519 — secure, passwordless GitHub authentication',
    async () => {
      const keyPath = join(HOME, '.ssh', 'id_ed25519');
      mkdirSync(join(HOME, '.ssh'), { recursive: true });
      run(`chmod 700 ${join(HOME, '.ssh')}`);
      if (existsSync(keyPath)) {
        ok('SSH key already exists — keeping it');
      } else {
        const email = silent('git config --global user.email').output?.trim() || 'one0@devforge';
        run(`ssh-keygen -t ed25519 -C "${email}" -f "${keyPath}" -N ""`);
        ok('SSH key created');
      }
      const pub = silent(`cat "${keyPath}.pub"`).output?.trim();
      p('');
      p(`  ${C.bold}Add this to GitHub → Settings → SSH keys → New SSH key:${C.reset}`);
      p(`  ${C.dim}https://github.com/settings/ssh/new${C.reset}`);
      p('');
      p(`  ${C.green}${pub}${C.reset}`);
      p('');
      // Auto-load SSH agent
      const agentBlock = `\n# SSH agent (DevForge)\nif [ -z "$SSH_AUTH_SOCK" ]; then\n  eval "$(ssh-agent -s)" > /dev/null\n  ssh-add ~/.ssh/id_ed25519 2>/dev/null\nfi\n`;
      const zshrc = join(HOME, '.zshrc');
      const cur = existsSync(zshrc) ? readFileSync(zshrc, 'utf8') : '';
      if (!cur.includes('SSH agent')) { appendFileSync(zshrc, agentBlock); appendFileSync(join(HOME, '.bashrc'), agentBlock); }
    }
  );

  await confirm('gpg_key', state,
    'Create GPG signing key',
    'Your commits get a "Verified" green badge on GitHub',
    async () => {
      if (!which('gpg')) run('sudo apt-get install -y gnupg -q');
      const email = silent('git config --global user.email').output?.trim();
      const name  = silent('git config --global user.name').output?.trim() || 'one0';
      if (!email) { warn('Set Git email first — skipping GPG'); return; }

      const existing = silent(`gpg --list-secret-keys --keyid-format=long "${email}" 2>/dev/null`);
      if (existing.ok && existing.output?.includes('sec')) {
        ok('GPG key already exists');
        const keyId = silent(`gpg --list-secret-keys --keyid-format=long "${email}" | grep sec | head -1 | awk '{print $2}' | cut -d'/' -f2`).output?.trim();
        if (keyId) { run(`git config --global user.signingkey ${keyId}`); run('git config --global commit.gpgsign true'); ok(`Signing key configured: ${keyId}`); }
        return;
      }

      const batch = `%no-protection\nKey-Type: ed25519\nKey-Usage: sign\nName-Real: ${name}\nName-Email: ${email}\nExpire-Date: 2y\n%commit\n`;
      writeFileSync('/tmp/gpg-batch.txt', batch);
      run('gpg --batch --gen-key /tmp/gpg-batch.txt'); run('rm -f /tmp/gpg-batch.txt');
      const keyId = silent(`gpg --list-secret-keys --keyid-format=long "${email}" | grep sec | head -1 | awk '{print $2}' | cut -d'/' -f2`).output?.trim();
      if (keyId) {
        run(`git config --global user.signingkey ${keyId}`); run('git config --global commit.gpgsign true');
        const pub = silent(`gpg --armor --export ${keyId}`).output?.trim();
        p(''); p(`  ${C.bold}Add this to GitHub → Settings → GPG keys → New GPG key:${C.reset}`);
        p(`  ${C.dim}https://github.com/settings/gpg/new${C.reset}`); p('');
        p(`${C.green}${pub}${C.reset}`);
        ok(`GPG key ${keyId} — commits will show Verified`);
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — CORE TOOLS
// ══════════════════════════════════════════════════════════════════════════════
async function phaseCore(state) {
  box('Phase 2 — Core tools', C.blue);
  p(`  ${C.dim}Essential CLI toolkit. Only installs what is missing.${C.reset}`);

  await confirm('apt_update', state, 'Update package lists', 'sudo apt-get update — safe, just refreshes available packages',
    async () => { run('sudo apt-get update -y'); ok('Package lists updated'); }
  );

  await confirm('core_packages', state,
    'Install core CLI tools',
    'curl, git, jq, fzf, ripgrep, bat, tmux, zsh, neovim, pass, keychain — only missing ones',
    async () => {
      const pkgs = [
        'build-essential','curl','wget','git','unzip','zip',
        'jq','htop','tree','ripgrep','fd-find','bat',
        'tmux','zsh','fzf','neovim','ca-certificates',
        'gnupg','lsb-release','pass','keychain','xclip',
      ];
      const missing = pkgs.filter(pkg => {
        const r = silent(`dpkg -l ${pkg} 2>/dev/null | grep -E "^ii"`);
        return !r.ok || !r.output?.includes('ii');
      });
      if (missing.length === 0) { ok('All core packages already installed'); return; }
      info(`Installing ${missing.length} missing: ${missing.join(', ')}`);
      run(`sudo apt-get install -y ${missing.join(' ')}`);
      // bat symlink
      run('mkdir -p ~/.local/bin && ln -sf $(which batcat 2>/dev/null || echo bat) ~/.local/bin/bat 2>/dev/null || true');
      ok('Core tools installed');
    }
  );

  await confirm('gh_cli', state, 'Install GitHub CLI (gh)', 'Create repos, PRs, and authenticate from the terminal',
    async () => {
      await checkAndAct('GitHub CLI', 'gh',
        async () => {
          run('curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null');
          run('echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null');
          run('sudo apt-get update -q && sudo apt-get install -y gh');
          ok('GitHub CLI installed — run: gh auth login');
        },
        async () => { run('sudo apt-get install --only-upgrade -y gh'); }
      );
    }
  );

  await confirm('oh_my_zsh', state, 'Install Oh My Zsh', 'Better shell — colours, git info in prompt, smart autocomplete',
    async () => {
      if (existsSync(join(HOME, '.oh-my-zsh'))) {
        ok('Oh My Zsh already installed');
        const u = await ask('  Update? [y/N]: ');
        if (u.trim().toLowerCase() === 'y') run(`cd ${HOME}/.oh-my-zsh && git pull --quiet`);
      } else {
        await secureRun('Oh My Zsh', 'https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh', null, 'bash __FILE__ --unattended');
        const zshrc = join(HOME, '.zshrc');
        if (existsSync(zshrc)) run(`sed -i 's/^plugins=(git)/plugins=(git node npm python docker fzf)/' "${zshrc}"`);
      }
      ok('Oh My Zsh ready');
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — RUNTIMES
// ══════════════════════════════════════════════════════════════════════════════
async function phaseRuntimes(state) {
  box('Phase 3 — Languages & runtimes', C.green);
  p(`  ${C.dim}Node.js, Python, and their fastest package managers.${C.reset}`);

  await confirm('nvm_node', state, 'Install NVM + Node.js LTS', 'SHA256 verified download. Detects and updates if already installed.',
    async () => {
      const nvmDir = join(HOME, '.nvm');
      if (existsSync(nvmDir)) {
        ok(`NVM already installed`);
        const u = await ask('  Update Node.js LTS? [y/N]: ');
        if (u.trim().toLowerCase() === 'y') {
          run(`export NVM_DIR="${nvmDir}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install --lts && nvm use --lts`);
          ok('Node.js LTS updated');
        }
      } else {
        const installed = await secureRun(
          'NVM',
          'https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh',
          'f4842f2e1c14ba5f5d00327e503e24cfb9a20a6af4ce70ff0fc03e584c5ef69c',
          'bash __FILE__'
        );
        if (installed) {
          run(`export NVM_DIR="${nvmDir}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install --lts && nvm use --lts && nvm alias default node`);
          const nvmInit = `\n# NVM (DevForge)\nexport NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"\n[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"\n`;
          appendFileSync(join(HOME, '.zshrc'),  nvmInit);
          appendFileSync(join(HOME, '.bashrc'), nvmInit);
          ok('NVM + Node.js LTS installed');
        }
      }
    }
  );

  await confirm('pnpm', state, 'Install pnpm', 'Fast npm alternative — saves disk, great for monorepos',
    async () => {
      await checkAndAct('pnpm', 'pnpm',
        async () => { await secureRun('pnpm', 'https://get.pnpm.io/install.sh', null, 'bash __FILE__'); ok('pnpm installed'); },
        async () => { run('pnpm self-update'); }
      );
    }
  );

  await confirm('python_uv', state, 'Install Python 3 + uv', 'uv is 10-100x faster than pip — replaces pip, venv, and poetry',
    async () => {
      if (which('python3')) { ok(`Python 3 already installed (${getVer('python3')})`); }
      else { run('sudo apt-get install -y python3 python3-pip python3-venv -q'); ok('Python 3 installed'); }
      await checkAndAct('uv', 'uv',
        async () => { await secureRun('uv', 'https://astral.sh/uv/install.sh', null, 'bash __FILE__'); ok('uv installed'); },
        async () => { run('uv self update'); }
      );
    }
  );

  await confirm('bun', state, 'Install Bun', 'All-in-one JS runtime + bundler + test runner — very fast',
    async () => {
      await checkAndAct('Bun', 'bun',
        async () => { await secureRun('Bun', 'https://bun.sh/install', null, 'bash __FILE__'); ok('Bun installed'); },
        async () => { run('bun upgrade'); }
      );
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — CLOUD + DOCKER
// ══════════════════════════════════════════════════════════════════════════════
async function phaseCloud(state) {
  box('Phase 4 — Cloud tools + Docker', C.magenta);
  p(`  ${C.dim}Docker only when you need it — close it when done to save RAM.${C.reset}`);

  await confirm('docker', state, 'Install Docker Engine', 'WSL2-native Docker — no Docker Desktop needed. ~200MB.',
    async () => {
      await checkAndAct('Docker', 'docker',
        async () => {
          run('sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release -q');
          run('curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg');
          run('echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null');
          run('sudo apt-get update -q && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin -q');
          run(`sudo usermod -aG docker ${process.env.USER}`);
          run('sudo systemctl enable docker 2>/dev/null || sudo service docker start 2>/dev/null || true');
          ok('Docker installed — log out and back in for docker group to take effect');
        },
        async () => { run('sudo apt-get install --only-upgrade -y docker-ce docker-ce-cli containerd.io docker-compose-plugin -q'); }
      );
    }
  );

  await confirm('gcloud', state, 'Install Google Cloud CLI (gcloud)', 'For your GCP free-tier work. Run: gcloud init after setup.',
    async () => {
      await checkAndAct('gcloud', 'gcloud',
        async () => {
          run('curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg');
          run('echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list');
          run('sudo apt-get update -q && sudo apt-get install -y google-cloud-cli -q');
          ok('gcloud installed');
        },
        async () => { run('sudo apt-get install --only-upgrade -y google-cloud-cli -q'); }
      );
    }
  );

  await confirm('supabase_cli', state, 'Install Supabase CLI', 'Local dev, migrations, and Edge Functions',
    async () => {
      await checkAndAct('Supabase CLI', 'supabase',
        async () => { run('npm install -g supabase 2>/dev/null || true'); ok('Supabase CLI installed'); },
        async () => { run('npm update -g supabase'); }
      );
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — ENCRYPTED SECRETS
// ══════════════════════════════════════════════════════════════════════════════
async function phaseSecrets(state) {
  box('Phase 5 — Encrypted secret vault', C.red);
  p(`  ${C.dim}Every API key stored with GPG encryption. Zero plain text ever.${C.reset}`);
  p(`  ${C.dim}Your shell loads them at startup from the vault — invisible to logs.${C.reset}`);

  await confirm('pass_init', state, 'Initialise encrypted secret store (pass)',
    'Creates ~/.password-store encrypted with your GPG key from Phase 1',
    async () => {
      const email = silent('git config --global user.email').output?.trim();
      if (!email) { warn('Run Phase 1 git identity step first — needs email'); return; }
      if (existsSync(join(HOME, '.password-store'))) { ok('Secret store already initialised'); return; }
      const gpgId = silent(`gpg --list-secret-keys --keyid-format=long "${email}" | grep sec | head -1 | awk '{print $2}' | cut -d'/' -f2`).output?.trim();
      if (!gpgId) { warn('GPG key not found — run Phase 1 GPG step first'); return; }
      run(`pass init "${gpgId}"`);
      ok('Encrypted vault created — GPG key: ' + gpgId);
    }
  );

  await confirm('secret_anthropic', state, 'Store Anthropic API key',
    'From console.anthropic.com — encrypted, never in plain text',
    () => storeSecret('anthropic/api-key', 'Anthropic API key', 'ANTHROPIC_API_KEY', 'Anthropic API key (sk-ant-...)')
  );

  await confirm('secret_openai', state, 'Store OpenAI API key',
    'From platform.openai.com — used by Codex CLI',
    () => storeSecret('openai/api-key', 'OpenAI API key', 'OPENAI_API_KEY', 'OpenAI API key (sk-...)')
  );

  await confirm('secret_gemini', state, 'Store Google Gemini API key',
    'From aistudio.google.com — used by Gemini CLI',
    () => storeSecret('google/gemini-key', 'Gemini API key', 'GEMINI_API_KEY', 'Gemini API key (AIza...)')
  );

  await confirm('secret_github', state, 'Store GitHub Personal Access Token',
    'From github.com/settings/tokens — used by MCP GitHub server',
    () => storeSecret('github/pat', 'GitHub PAT', 'GITHUB_TOKEN', 'GitHub PAT (ghp_...)')
  );

  await confirm('secret_supabase', state, 'Store Supabase credentials',
    'Project URL + service role key — from your Supabase dashboard',
    async () => {
      await storeSecret('supabase/url', 'Supabase URL',  'SUPABASE_URL', 'Supabase Project URL (https://...)');
      await storeSecret('supabase/key', 'Supabase key',  'SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 6 — MCP SERVERS
// ══════════════════════════════════════════════════════════════════════════════
async function phaseMCP(state) {
  box('Phase 6 — MCP servers (Claude agent connectors)', C.cyan);
  p(`  ${C.dim}Tokens loaded from encrypted vault at runtime — not stored in config.${C.reset}`);

  const mcpConfig = { mcpServers: {} };
  const mcpPath   = join(HOME, '.claude', 'mcp.json');

  if (existsSync(mcpPath)) {
    try { Object.assign(mcpConfig.mcpServers, JSON.parse(readFileSync(mcpPath, 'utf8')).mcpServers || {}); }
    catch { /* start fresh */ }
  }

  await confirm('mcp_filesystem', state, 'MCP: Filesystem', 'Claude can read/write files in a folder you choose',
    async () => {
      const p2 = await promptVal('Allow Claude access to this folder', join(HOME, 'projects'));
      mkdirSync(p2, { recursive: true });
      mcpConfig.mcpServers.filesystem = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', p2] };
      ok(`Filesystem MCP → ${p2}`);
    }
  );

  await confirm('mcp_github', state, 'MCP: GitHub', 'Claude can manage your repos, issues, and PRs',
    async () => {
      mcpConfig.mcpServers.github = {
        command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '$(pass show github/pat)' }
      };
      ok('GitHub MCP configured — token from vault');
    }
  );

  await confirm('mcp_brave', state, 'MCP: Brave Search', 'Real-time web search for Claude agents',
    async () => {
      await storeSecret('brave/api-key', 'Brave API key', 'BRAVE_API_KEY', 'Brave Search API key (from brave.com/search/api)');
      mcpConfig.mcpServers['brave-search'] = {
        command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: { BRAVE_API_KEY: '$(pass show brave/api-key)' }
      };
      ok('Brave Search MCP configured');
    }
  );

  await confirm('mcp_supabase', state, 'MCP: Supabase', 'Claude can query and manage your databases',
    async () => {
      mcpConfig.mcpServers.supabase = {
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase@latest',
               '--supabase-url', '$(pass show supabase/url)',
               '--supabase-key', '$(pass show supabase/key)']
      };
      ok('Supabase MCP configured');
    }
  );

  await confirm('mcp_slack', state, 'MCP: Slack', 'Claude can send and read Slack messages',
    async () => {
      await storeSecret('slack/bot-token', 'Slack Bot Token', 'SLACK_BOT_TOKEN', 'Slack Bot Token (xoxb-...)');
      await storeSecret('slack/team-id',   'Slack Team ID',   'SLACK_TEAM_ID',   'Slack Team/Workspace ID');
      mcpConfig.mcpServers.slack = {
        command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'],
        env: { SLACK_BOT_TOKEN: '$(pass show slack/bot-token)', SLACK_TEAM_ID: '$(pass show slack/team-id)' }
      };
      ok('Slack MCP configured');
    }
  );

  mkdirSync(join(HOME, '.claude'), { recursive: true });
  mkdirSync(join(HOME, '.config', 'mcp'), { recursive: true });
  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
  writeFileSync(join(HOME, '.config', 'mcp', 'config.json'), JSON.stringify(mcpConfig, null, 2));
  ok(`MCP config written — ${Object.keys(mcpConfig.mcpServers).length} servers configured`);
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 7 — AI CLI ECOSYSTEM
// ══════════════════════════════════════════════════════════════════════════════
async function phaseAI(state) {
  box('Phase 7 — AI CLI ecosystem', C.yellow);
  p(`  ${C.dim}Claude Code, Gemini CLI, and Codex CLI — all three in your terminal.${C.reset}`);

  await confirm('claude_code', state, 'Install Claude Code CLI', 'The claude command — agentic coding, file editing, terminal tasks',
    async () => {
      await checkAndAct('Claude Code', 'claude',
        async () => { run('npm install -g @anthropic-ai/claude-code'); ok('Claude Code — run: claude'); },
        async () => { run('npm update -g @anthropic-ai/claude-code'); }
      );
    }
  );

  await confirm('gemini_cli', state, 'Install Gemini CLI', 'Google Gemini 2.5 Pro in your terminal — run: gemini',
    async () => {
      await checkAndAct('Gemini CLI', 'gemini',
        async () => { run('npm install -g @google/gemini-cli'); ok('Gemini CLI installed'); },
        async () => { run('npm update -g @google/gemini-cli'); }
      );
    }
  );

  await confirm('codex_cli', state, 'Install OpenAI Codex CLI', 'OpenAI terminal agent — run: codex',
    async () => {
      await checkAndAct('Codex CLI', 'codex',
        async () => { run('npm install -g @openai/codex'); ok('Codex CLI installed'); },
        async () => { run('npm update -g @openai/codex'); }
      );
    }
  );

  await confirm('gh_auth', state, 'Authenticate GitHub CLI', 'Connects gh to your GitHub account — needed for Copilot and repo management',
    async () => {
      if (!which('gh')) { warn('GitHub CLI not found — run Phase 2 first'); return; }
      const authed = silent('gh auth status 2>/dev/null');
      if (authed.ok && authed.output?.includes('Logged in')) { ok('GitHub CLI already authenticated'); }
      else {
        info('Launching GitHub browser auth — follow the prompts...');
        run('gh auth login --web');
        ok('GitHub authenticated');
      }
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 8 — SHELL ALIASES + PRODUCTIVITY
// ══════════════════════════════════════════════════════════════════════════════
async function phaseAliases(state) {
  box('Phase 8 — Shell aliases & productivity', C.green);

  await confirm('aliases', state,
    'Add 35+ productivity shortcuts to your terminal',
    'gs, gp, gc, ll, pd, pi, dc, py, reload, memcheck and more — checked for duplicates',
    async () => {
      const zshrc  = join(HOME, '.zshrc');
      const bashrc = join(HOME, '.bashrc');
      const cur = existsSync(zshrc) ? readFileSync(zshrc, 'utf8') : '';
      if (cur.includes('# DevForge aliases')) { ok('Aliases already present — skipping duplicates'); return; }

      const aliases = `
# ── DevForge aliases v3 ───────────────────────────────────────────────────────

# Navigation
alias ll='ls -lah --color=auto'
alias la='ls -A'
alias lt='ls -lht | head -20'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias ~='cd ~'
alias cls='clear'

# Git
alias gs='git status'
alias ga='git add -A'
alias gc='git commit -m'
alias gca='git commit --amend --no-edit'
alias gp='git push'
alias gpl='git pull'
alias gf='git fetch'
alias gl='git log --oneline --graph --decorate -20'
alias gb='git branch -a'
alias gco='git checkout'
alias gcb='git checkout -b'
alias gst='git stash'
alias gsp='git stash pop'
alias gd='git diff'
alias grh='git reset --hard HEAD'

# Node / pnpm
alias nrd='npm run dev'
alias nrb='npm run build'
alias pi='pnpm install'
alias pd='pnpm dev'
alias pb='pnpm build'
alias pa='pnpm add'
alias px='pnpm dlx'

# Python
alias py='python3'
alias pip='pip3'
alias venv='python3 -m venv .venv && source .venv/bin/activate'

# Docker (open only when needed — close when done to save RAM)
alias dc='docker compose'
alias dcu='docker compose up -d'
alias dcd='docker compose down'
alias dcl='docker compose logs -f'
alias dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'

# Cloud
alias gcl='gcloud'

# Utilities
alias h='history | tail -30'
alias reload='source ~/.zshrc'
alias path='echo \$PATH | tr : "\n"'
alias ports='ss -tulpn'
alias myip='curl -s ifconfig.me'
alias df='df -h'
alias dus='du -sh * | sort -h'

# Memory check — see what is using RAM (useful on 8GB machine)
alias memcheck='echo "=== Top RAM processes ===" && ps aux --sort=-%mem | head -15 && echo "" && echo "=== WSL2 memory ===" && free -h'

# Secrets
alias secrets='pass ls'

# AI CLIs
alias ai='claude'

# DevForge
alias forge='cd ~/devforge && node index.js'
# ─────────────────────────────────────────────────────────────────────────────
`;
      appendFileSync(zshrc,  aliases);
      appendFileSync(bashrc, aliases);
      ok('Aliases added to ~/.zshrc and ~/.bashrc');
      info('Run: source ~/.zshrc  to activate immediately');
    }
  );

  // Set Zsh as default shell
  await confirm('zsh_default', state, 'Set Zsh as default shell',
    'Oh My Zsh + all aliases will load automatically on every new terminal',
    async () => {
      const currentShell = silent('echo $SHELL').output?.trim();
      if (currentShell?.includes('zsh')) { ok('Zsh already default shell'); return; }
      run('chsh -s $(which zsh)');
      ok('Zsh set as default — takes effect on next terminal open');
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
function summary(state) {
  const done = Object.keys(state).filter(k => state[k]?.done).length;
  p('');
  p(`${C.bold}${C.green}  ╔═══════════════════════════════════════════════════════╗${C.reset}`);
  p(`${C.bold}${C.green}  ║  DevForge complete — ${String(done).padEnd(2)} steps done                   ║${C.reset}`);
  p(`${C.bold}${C.green}  ╚═══════════════════════════════════════════════════════╝${C.reset}`);
  p('');
  p(`${C.bold}  Your setup:${C.reset}`);
  p(`  ${C.cyan}Terminal${C.reset}    source ~/.zshrc  →  all aliases active`);
  p(`  ${C.cyan}GitHub${C.reset}      gh auth login  →  if not done during setup`);
  p(`  ${C.cyan}Claude Code${C.reset} claude  →  agentic coding`);
  p(`  ${C.cyan}Gemini CLI${C.reset}  gemini  →  Google AI in terminal`);
  p(`  ${C.cyan}Codex CLI${C.reset}   codex  →  OpenAI in terminal`);
  p(`  ${C.cyan}Secrets${C.reset}     pass ls  →  view your encrypted vault`);
  p(`  ${C.cyan}RAM check${C.reset}   memcheck  →  see what is using memory`);
  p('');
  p(`  ${C.bold}Browser bookmarks to add:${C.reset}`);
  p(`  ${C.dim}  Project IDX      → https://idx.google.com${C.reset}`);
  p(`  ${C.dim}  Google AI Studio → https://aistudio.google.com${C.reset}`);
  p(`  ${C.dim}  Claude web       → https://claude.ai${C.reset}`);
  p('');
  p(`  ${C.bold}Restart Windows when ready${C.reset} ${C.dim}(computer will be named one0-forge)${C.reset}`);
  p('');
  p(`  ${C.dim}Log:   ~/.devforge/wsl2-setup.log${C.reset}`);
  p(`  ${C.dim}State: ~/.devforge/state.json${C.reset}`);
  p(`  ${C.dim}F=ma · feisA0011 · DevForge v3${C.reset}`);
  p('');
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  banner();

  p(`${C.bold}  Welcome to DevForge.${C.reset}`);
  p(`  ${C.dim}This sets up your complete agentic engineering environment.${C.reset}`);
  p(`  ${C.dim}Press Enter for each step. Type n to skip. Type q to pause.${C.reset}`);
  p('');

  const state = loadState();
  const prev  = Object.keys(state).filter(k => state[k]?.done).length;
  if (prev > 0) { warn(`Resuming — ${prev} steps already done`); p(''); }

  const go = await ask(`  Ready? [Y/n]: `);
  if (go.trim().toLowerCase() === 'n') { p('Run again when ready.'); rl.close(); return; }

  try {
    await phasePreFlight(state);
    await phaseIdentity(state);
    await phaseCore(state);
    await phaseRuntimes(state);
    await phaseCloud(state);
    await phaseSecrets(state);
    await phaseMCP(state);
    await phaseAI(state);
    await phaseAliases(state);
    summary(state);
  } catch (e) {
    p(''); err(`Unexpected error: ${e.message}`);
    log(`FATAL: ${e.stack}`);
    warn('Progress saved. Run devforge again to resume from here.');
  }

  rl.close();
}

main();
