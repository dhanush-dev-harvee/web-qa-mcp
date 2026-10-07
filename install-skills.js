#!/usr/bin/env node
// Copies the Claude skills + agents shipped with this package into ~/.claude (so Claude Code knows how to use the web-qa tools).
// Works when the package is run straight from GitHub:   npx -y --package=github:<owner>/web-qa-mcp web-qa-skills
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dst = path.join(os.homedir(), '.claude');
let copied = 0;
for (const kind of ['skills', 'agents']) {
  const src = path.join(HERE, 'claude', kind);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.join(dst, kind), { recursive: true });
  fs.cpSync(src, path.join(dst, kind), { recursive: true });
  console.log(`Installed ${kind} -> ${path.join(dst, kind)}`);
  copied++;
}
console.log(copied ? '\nDone. Restart Claude Code to load the web-qa skills and agents.' : 'No skills/agents found in this package.');
