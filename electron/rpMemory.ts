import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getRpVaultPath } from './db';

// Role-Play memory lives in a dedicated Obsidian vault the user picks for the RP
// side — deliberately separate from the main app's Brain vault (WickedBrain/).
// Files are written into a WickedRP/ subfolder of that vault so they're browsable
// and editable in Obsidian. If no RP vault is chosen yet, we fall back to a
// folder under userData so memory still works out of the box. One markdown file
// per persona accumulates dated summaries so a long relationship survives
// history trimming.

const RP_SUBDIR = 'WickedRP';

function memoryRoot(): string {
  const base = getRpVaultPath() || app.getPath('userData');
  const root = path.join(base, RP_SUBDIR);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

// One stable file per persona id (id is appended so renames never collide).
function memoryFile(personaId: string): string {
  return path.join(memoryRoot(), `persona-${personaId}.md`);
}

export function readMemory(personaId: string): string {
  try {
    return fs.readFileSync(memoryFile(personaId), 'utf-8');
  } catch {
    return '';
  }
}

// Append a new dated summary block to the persona's memory file.
export function appendMemory(personaId: string, personaName: string, summary: string): void {
  const file = memoryFile(personaId);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (!fs.existsSync(file)) {
    const header = `# Memory — ${personaName}\n\nLong-term memory for this persona, written by the RP agent as conversations get long.\n`;
    fs.writeFileSync(file, header, 'utf-8');
  }
  const block = `\n## ${stamp}\n\n${summary.trim()}\n`;
  fs.appendFileSync(file, block, 'utf-8');
}

export function clearMemory(personaId: string): void {
  try {
    fs.rmSync(memoryFile(personaId), { force: true });
  } catch {
    /* nothing to clear */
  }
}

export function openMemoryFolder(): Promise<string> {
  return Promise.resolve(shell.openPath(memoryRoot()));
}
