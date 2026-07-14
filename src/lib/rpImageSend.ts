import type { RPPerson, RPPersona } from '../types';
import { useRPStore } from '../store/rpStore';

// Shared by the 🎨 manual dialog and the 📷 auto scene shot: generate with the
// persona's identity (its selected Person, or the legacy per-persona preset),
// plus current look + scene prompt, then post the image into the conversation
// as the persona's message and into their gallery.

// The Person selected on a persona, if any (and it must be trained/ready).
export function personFor(persona: RPPersona): RPPerson | undefined {
  const person = useRPStore.getState().personById(persona.personId);
  return person && person.status === 'ready' ? person : undefined;
}

// Layered prompt: trigger word → person preset → persona style notes →
// current look → this shot's scene. The trigger is only injected when the
// preset doesn't already mention it, so nothing is ever doubled.
export function buildImagePrompt(persona: RPPersona, scenePrompt: string): string {
  const person = personFor(persona);
  const parts: string[] = [];
  if (person) {
    const preset = person.imagePrompt.trim();
    if (person.triggerWord && !preset.toLowerCase().includes(person.triggerWord.toLowerCase())) {
      parts.push(`photo of ${person.triggerWord}`);
    }
    parts.push(preset);
  }
  parts.push((persona.imagePrompt ?? '').trim(), (persona.lookPrompt ?? '').trim(), scenePrompt.trim());
  return parts.filter(Boolean).join(', ');
}

export async function generateAndSend(opts: {
  persona: RPPersona;
  sceneId: string;
  scenePrompt: string; // scene part only (identity + look are added here)
  caption: string;
  width?: number;
  height?: number;
}): Promise<string> {
  const fullPrompt = buildImagePrompt(opts.persona, opts.scenePrompt);
  if (!fullPrompt) throw new Error('Describe the image (or give the persona a person/preset).');

  const person = personFor(opts.persona);
  const result = await window.polyglot.comfyGenerate({
    prompt: fullPrompt,
    loraName: (person ? person.loraName : opts.persona.loraName) || undefined,
    loraStrength: person ? person.loraStrength : opts.persona.loraStrength,
    width: opts.width ?? 1024,
    height: opts.height ?? 1024,
  });

  await window.polyglot.rpAddPersonaImage(opts.persona.id, result.image);
  const saved = await window.polyglot.rpSaveSceneMessage({
    sceneId: opts.sceneId,
    senderPersonaId: opts.persona.id,
    content: opts.caption,
    image: result.image,
  });
  useRPStore.setState((s) => ({ messages: [...s.messages, saved] }));
  return result.image;
}
