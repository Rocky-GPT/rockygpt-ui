import { spawn, execSync } from 'node:child_process';

// Free port 3000 silently
try {
  const pids = execSync('lsof -ti:3000', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  if (pids) {
    execSync(`kill -9 ${pids.split(/\s+/).join(' ')}`, { stdio: 'ignore' });
  }
} catch {}

const cyan = '\x1b[36m';
const green = '\x1b[32m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

console.log(`\n  ${cyan}${bold}🦅 RockyGPT UI${reset} ${dim}(v0.1.0)${reset}`);
console.log(`  ${green}✓${reset}  ${bold}Local:${reset}   ${cyan}http://localhost:3000${reset}`);
console.log(`  ${dim}·  Brain:   http://127.0.0.1:8000 (Neon SQL)${reset}\n`);

const cleanEnv = { ...process.env };
delete cleanEnv.NODE_OPTIONS;
delete cleanEnv.VSCODE_INSPECTOR_OPTIONS;
delete cleanEnv.NODE_INSPECT_RESUME_ON_START;

const next = spawn('next', ['dev'], {
  stdio: 'inherit',
  env: cleanEnv,
});

next.on('exit', (code) => {
  process.exit(code ?? 0);
});
