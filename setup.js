#!/usr/bin/env node
// One-command setup:  node setup.js [--all-browsers] [--claude-assets] [--register]
//   (default)        npm install (root + playwright-testing), install the Chromium browser, write mcp-config.generated.json
//   --all-browsers   also install Firefox and WebKit
//   --claude-assets  copy the skills + agents in ./claude to ~/.claude (so Claude Code knows how to use the tools)
//   --register       also add the server to Claude Code with `claude mcp add --scope user` (needs the claude CLI)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const flags = new Set(process.argv.slice(2));
const win = process.platform === 'win32';
const run = (cmd, args, cwd) => {
  console.log(`\n> ${cmd} ${args.join(' ')}   (${path.relative(HERE, cwd) || '.'})`);
  const r = spawnSync(win && cmd === 'npm' ? 'npm.cmd' : win && cmd === 'npx' ? 'npx.cmd' : cmd, args, { cwd, stdio: 'inherit', shell: win });
  if (r.status !== 0) { console.error(`\nFAILED: ${cmd} ${args.join(' ')}`); process.exit(r.status || 1); }
};

if (Number(process.versions.node.split('.')[0]) < 18) { console.error(`Node 18+ required (you have ${process.versions.node}).`); process.exit(1); }

run('npm', ['install'], HERE);
run('npm', ['install'], path.join(HERE, 'playwright-testing'));
run('npx', ['playwright', 'install', ...(flags.has('--all-browsers') ? [] : ['chromium'])], HERE);

const server = path.join(HERE, 'server.js').replace(/\\/g, '/');
const config = { mcpServers: { 'web-qa': { command: 'node', args: [server] } } };
fs.writeFileSync(path.join(HERE, 'mcp-config.generated.json'), JSON.stringify(config, null, 2));

if (flags.has('--claude-assets')) {
  const dst = path.join(os.homedir(), '.claude');
  for (const kind of ['skills', 'agents']) {
    const src = path.join(HERE, 'claude', kind);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.join(dst, kind), { recursive: true });
    fs.cpSync(src, path.join(dst, kind), { recursive: true });
    console.log(`Copied ${kind} -> ${path.join(dst, kind)}`);
  }
}
if (flags.has('--register')) run('claude', ['mcp', 'add', '--scope', 'user', 'web-qa', '--', 'node', server], HERE);

console.log(`
=====================================================================
 Web QA is installed.

 1) Connect it to Claude. Paste this into your MCP config
    (Claude Code: .mcp.json or ~/.claude.json, Claude Desktop: claude_desktop_config.json, Cursor: mcp.json):

${JSON.stringify(config, null, 2)}

    (also saved as mcp-config.generated.json)
    Claude Code one-liner:  claude mcp add --scope user web-qa -- node ${server}

 2) Start the UI:      npm run ui        -> http://localhost:4010
 3) Or the CLI:        node smoke.js https://example.com --audit
 4) Skills + agents:   node setup.js --claude-assets   (copies ./claude/* into ~/.claude)
=====================================================================`);
