import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// Role-Play memory is stored in its OWN folder under userData, deliberately kept
// separate from the Obsidian Brain vault (WickedBrain/). Nothing the RP side
// produces ever touches the main app's memory. One markdown file per persona
// accumulates dated summaries so a long relationship survives history trimming.

const RP_SUBDIR = 'WickedRP';

function memoryRoot(): string {
  const root = path.join(app.getPath('userData'), RP_SUBDIR);
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
