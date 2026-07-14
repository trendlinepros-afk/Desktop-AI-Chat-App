import type { RPPersona } from '../types';
import { useRPStore } from '../store/rpStore';

// Shared by the 🎨 manual dialog and the 📷 auto scene shot: generate with the
// persona's identity preset + current look + scene prompt, then post the image
// into the conversation as the persona's message and into their gallery.

export function buildImagePrompt(persona: RPPersona, scenePrompt: string): string {
  return [(persona.imagePrompt ?? '').trim(), (persona.lookPrompt ?? '').trim(), scenePrompt.trim()]
    .filter(Boolean)
    .join(', ');
}

export async function generateAndSend(opts: {
  persona: RPPersona;
  sceneId: string;
  scenePrompt: string; // scene part only (preset + look are added here)
  caption: string;
  width?: number;
  height?: number;
}): Promise<string> {
  const fullPrompt = buildImagePrompt(opts.persona, opts.scenePrompt);
  if (!fullPrompt) throw new Error('Describe the image (or set an appearance preset on the persona).');

  const result = await window.polyglot.comfyGenerate({
    prompt: fullPrompt,
    loraName: opts.persona.loraName || undefined,
    loraStrength: opts.persona.loraStrength,
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
