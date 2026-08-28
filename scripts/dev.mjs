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

let bannerPrinted = false;

function printBanner() {
  if (bannerPrinted) return;
  bannerPrinted = true;
  try {
    execSync('clear -x', { stdio: 'inherit' });
  } catch {
    process.stdout.write('\x1b[H\x1b[2J');
  }
  console.log(`\n  ${cyan}${bold}🦅 RockyGPT UI${reset} ${dim}(v0.1.0 · Next.js 16)${reset}`);
  console.log(`  ${green}✓${reset}  ${bold}Local:${reset}    ${cyan}http://localhost:3000${reset}`);
  console.log(`  ${dim}·  Backend:${reset}  ${dim}http://127.0.0.1:8000 (Python Brain ➔ Neon)${reset}\n`);
}

const cleanEnv = { ...process.env };
delete cleanEnv.NODE_OPTIONS;
delete cleanEnv.VSCODE_INSPECTOR_OPTIONS;
delete cleanEnv.NODE_INSPECT_RESUME_ON_START;

const next = spawn('next', ['dev'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: cleanEnv,
});

function handleStream(stream, isError = false) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line) continue;
      if (
        line.includes('Debugger listening') ||
        line.includes('Debugger attached') ||
        line.includes('Waiting for the debugger') ||
        line.includes('node scripts/dev.mjs')
      ) {
        continue;
      }

      if (line.includes('Ready in') || line.includes('Local:')) {
        printBanner();
        continue;
      }

      if (!bannerPrinted) {
        if (line.includes('GET ') || line.includes('POST ') || line.includes('Compiled') || line.includes('Environments')) {
          printBanner();
        }
      }

      if (bannerPrinted) {
        if (isError) {
          process.stderr.write(`${line}\n`);
        } else {
          process.stdout.write(`${line}\n`);
        }
      }
    }
  });
}

handleStream(next.stdout, false);
handleStream(next.stderr, true);

setTimeout(() => {
  printBanner();
}, 1000);

next.on('exit', (code) => {
  process.exit(code ?? 0);
});

