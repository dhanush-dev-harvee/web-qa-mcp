#!/usr/bin/env node
// Adds the web-qa MCP server to Claude's config files, so no `claude` command-line tool is needed.
//   npx -y --package=github:dhanush-dev-harvee/web-qa-mcp web-qa-register [--source <npx source>] [--name web-qa] [--remove]
// Writes to (when they exist or can be created):
//   - Claude Code and the desktop app's Code tab:  ~/.claude.json            (user-level "mcpServers")
//   - Claude Desktop chat:  Windows %APPDATA%\Claude\claude_desktop_config.json, macOS ~/Library/Application Support/Claude/, Linux ~/.config/Claude/
// A timestamped backup is made before any file is changed, and a file that is not valid JSON is never overwritten.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const name = opt('--name', 'web-qa');
const source = opt('--source', 'github:dhanush-dev-harvee/web-qa-mcp');
const remove = args.includes('--remove');
const win = process.platform === 'win32';

// Windows needs the command shell to start npx; macOS and Linux can start it directly.
const launch = win ? { command: 'cmd', args: ['/c', 'npx', '-y', source] } : { command: 'npx', args: ['-y', source] };

const home = os.homedir();
const desktopDir = win ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude')
  : process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'Claude') : path.join(home, '.config', 'Claude');
const targets = [
  { label: 'Claude Code / desktop app Code tab', file: path.join(home, '.claude.json'), create: true, stdio: true },
  { label: 'Claude Desktop chat', file: path.join(desktopDir, 'claude_desktop_config.json'), create: fs.existsSync(desktopDir), stdio: false },
];

let changed = 0;
for (const t of targets) {
  const exists = fs.existsSync(t.file);
  if (!exists && !t.create) { console.log(`- ${t.label}: skipped (not installed: ${t.file})`); continue; }
  let json = {};
  if (exists) {
    try { json = JSON.parse(fs.readFileSync(t.file, 'utf8') || '{}'); }
    catch (e) { console.log(`- ${t.label}: NOT changed, the file is not valid JSON (${e.message.slice(0, 60)}): ${t.file}`); continue; }
    const bak = `${t.file}.bak-webqa-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
    fs.copyFileSync(t.file, bak);
  }
  json.mcpServers = json.mcpServers || {};
  if (remove) {
    if (!json.mcpServers[name]) { console.log(`- ${t.label}: "${name}" was not there`); continue; }
    delete json.mcpServers[name];
  } else json.mcpServers[name] = t.stdio ? { type: 'stdio', ...launch, env: {} } : { ...launch };
  fs.mkdirSync(path.dirname(t.file), { recursive: true });
  fs.writeFileSync(t.file, JSON.stringify(json, null, 2));
  console.log(`- ${t.label}: ${remove ? 'removed' : 'added'} "${name}" in ${t.file}`);
  changed++;
}
console.log(changed
  ? `\nDone. Now FULLY QUIT and reopen Claude (on Windows also close it from the system tray), then ask: "Use ${name} to run a quick check on https://example.com".\nThe first call takes a few minutes because it downloads the project and a browser.`
  : '\nNothing was changed.');
