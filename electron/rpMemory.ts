import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getRpVaultPath } from './db';
import type { RPPersona } from '../src/types';

// Role-Play memory lives in a dedicated Obsidian vault the user picks for the RP
// side — deliberately separate from the main app's Brain vault (WickedBrain/).
// Inside it we keep:
//   WickedRP/Personas/  — one markdown profile per persona (so the roster is
//                         visible/editable in Obsidian as soon as it's created)
//   WickedRP/Scenes/    — one file per group conversation, accumulating dated
//                         summaries so long scenes survive history trimming.
// If no RP vault is chosen yet we fall back to a folder under userData.

const RP_SUBDIR = 'WickedRP';

function memoryRoot(): string {
  const base = getRpVaultPath() || app.getPath('userData');
  const root = path.join(base, RP_SUBDIR);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function subdir(name: string): string {
  const dir = path.join(memoryRoot(), name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

// Find a file in `dir` whose frontmatter carries the given `id:` line.
function findFileById(dir: string, idLine: string): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const full = path.join(dir, name);
    try {
      const head = fs.readFileSync(full, 'utf-8').slice(0, 600);
      if (head.includes(idLine)) return full;
    } catch {
      /* skip unreadable */
    }
  }
  return null;
}

// ---------- Persona profiles ----------

export function writePersonaProfile(persona: RPPersona): void {
  const dir = subdir('Personas');
  const idLine = `rp_persona_id: ${persona.id}`;
  const content =
    `---\n` +
    `title: ${persona.name}\n` +
    `type: rp-persona\n` +
    `${idLine}\n` +
    `avatar: ${persona.avatar}\n` +
    `model: ${persona.model}\n` +
    `is_me: ${persona.isMe}\n` +
    `---\n\n` +
    `# ${persona.avatar} ${persona.name}${persona.isMe ? ' (you)' : ''}\n\n` +
    `## Character\n\n${persona.description.trim() || '_No description yet._'}\n` +
    (persona.greeting.trim() ? `\n## Opening line\n\n${persona.greeting.trim()}\n` : '');

  const existing = findFileById(dir, idLine);
  if (existing) {
    fs.writeFileSync(existing, content, 'utf-8');
    return;
  }
  let base = slugify(persona.name);
  let target = path.join(dir, `${base}.md`);
  let counter = 1;
  while (fs.existsSync(target)) {
    target = path.join(dir, `${base}-${counter}.md`);
    counter++;
  }
  fs.writeFileSync(target, content, 'utf-8');
}

export interface ParsedProfile {
  id: string;
  name: string;
  avatar: string;
  description: string;
  greeting: string;
}

// Pull a section's body out of the profile markdown (text under "## Heading"
// up to the next "## " or end of file).
function section(body: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`, 'i');
  const m = re.exec(body);
  return m ? m[1].trim() : '';
}

// Read every persona profile back out of the vault (so edits made in Obsidian
// can flow back into the app). Returns only the story-relevant fields.
export function readPersonaProfiles(): ParsedProfile[] {
  const dir = path.join(memoryRoot(), 'Personas');
  if (!fs.existsSync(dir)) return [];
  const out: ParsedProfile[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    let raw = '';
    try {
      raw = fs.readFileSync(path.join(dir, name), 'utf-8');
    } catch {
      continue;
    }
    const fmMatch = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(raw);
    if (!fmMatch) continue;
    const fm: Record<string, string> = {};
    for (const line of fmMatch[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    const id = fm.rp_persona_id;
    if (!id) continue;
    const body = fmMatch[2];
    const description = section(body, 'Character').replace(/^_No description yet\._$/, '');
    out.push({
      id,
      name: fm.title || '',
      avatar: fm.avatar || '🎭',
      description,
      greeting: section(body, 'Opening line'),
    });
  }
  return out;
}

export function deletePersonaProfile(personaId: string): void {
  const dir = path.join(memoryRoot(), 'Personas');
  const existing = findFileById(dir, `rp_persona_id: ${personaId}`);
  if (existing) {
    try {
      fs.rmSync(existing, { force: true });
    } catch {
      /* ignore */
    }
  }
}

// Re-write every persona profile — used when the vault is first chosen or the RP
// side opens, so existing personas appear in the vault without needing an edit.
export function syncPersonaProfiles(personas: RPPersona[]): void {
  for (const p of personas) writePersonaProfile(p);
}

// ---------- Scene memory ----------

function sceneFile(sceneId: string): string {
  const dir = subdir('Scenes');
  const existing = findFileById(dir, `rp_scene_id: ${sceneId}`);
  return existing ?? path.join(dir, `scene-${sceneId}.md`);
}

export function readMemory(sceneId: string): string {
  try {
    return fs.readFileSync(sceneFile(sceneId), 'utf-8');
  } catch {
    return '';
  }
}

export function appendMemory(sceneId: string, sceneName: string, summary: string): void {
  const file = sceneFile(sceneId);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (!fs.existsSync(file)) {
    const header =
      `---\ntitle: ${sceneName}\ntype: rp-scene\nrp_scene_id: ${sceneId}\n---\n\n` +
      `# Memory — ${sceneName}\n\nLong-term memory for this conversation, written by the RP agent as it gets long.\n`;
    fs.writeFileSync(file, header, 'utf-8');
  }
  fs.appendFileSync(file, `\n## ${stamp}\n\n${summary.trim()}\n`, 'utf-8');
}

export function clearMemory(sceneId: string): void {
  try {
    fs.rmSync(sceneFile(sceneId), { force: true });
  } catch {
    /* nothing to clear */
  }
}

export function openMemoryFolder(): Promise<string> {
  return Promise.resolve(shell.openPath(memoryRoot()));
}
