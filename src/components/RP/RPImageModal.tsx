import { useEffect, useRef, useState } from 'react';
import type { RPPersona } from '../../types';
import { useRPStore } from '../../store/rpStore';
import { useUIStore } from '../../store/uiStore';
import { generateAndSend } from '../../lib/rpImageSend';

const SIZES: { label: string; w: number; h: number }[] = [
  { label: 'Square 1024×1024', w: 1024, h: 1024 },
  { label: 'Portrait 832×1216', w: 832, h: 1216 },
  { label: 'Landscape 1216×832', w: 1216, h: 832 },
];

// Generate an image with the local ComfyUI backend and have the chosen
// persona "send" it into the conversation. The persona's appearance preset and
// LoRA (Edit persona → Local image) are applied automatically.
export function RPImageModal({
  sceneId,
  personas,
  onClose,
}: {
  sceneId: string;
  personas: RPPersona[];
  onClose: () => void;
}) {
  const toast = useUIStore((s) => s.toast);
  const updatePersona = useRPStore((s) => s.updatePersona);
  const persons = useRPStore((s) => s.persons);
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? '');
  const [prompt, setPrompt] = useState('');
  const [look, setLook] = useState('');
  const [personPick, setPersonPick] = useState('');
  const [sizeIdx, setSizeIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const persona = personas.find((p) => p.id === personaId) ?? null;
  const pickedPerson = persons.find((p) => p.id === personPick);

  // "Current look" and the selected person belong to the persona and persist
  // between generations.
  useEffect(() => {
    setLook(persona?.lookPrompt ?? '');
    setPersonPick(persona?.personId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const generate = async () => {
    if (!persona) return;
    const scenePrompt = prompt.trim();
    setBusy(true);
    setElapsed(0);
    setPreview(null);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      // Persist an edited "current look" and person switch so they stick.
      const lookTrimmed = look.trim();
      const patch: { lookPrompt?: string; personId?: string } = {};
      if (lookTrimmed !== (persona.lookPrompt ?? '')) patch.lookPrompt = lookTrimmed;
      if (personPick !== (persona.personId ?? '')) patch.personId = personPick;
      if (Object.keys(patch).length > 0) await updatePersona(persona.id, patch);
      const size = SIZES[sizeIdx];
      const image = await generateAndSend({
        persona: { ...persona, lookPrompt: lookTrimmed, personId: personPick },
        sceneId,
        scenePrompt,
        caption: scenePrompt ? `*sends a photo* — ${scenePrompt}` : '*sends a photo*',
        width: size.w,
        height: size.h,
      });
      setPreview(image);
      toast('Image sent to the conversation', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setBusy(false);
    }
  };

  return (
    <div data-rp-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">🎨 Generate an image</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-muted">From</label>
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.avatar} {p.name}
                  {p.loraName ? ' · LoRA' : ''}
                </option>
              ))}
            </select>
            <select
              value={sizeIdx}
              onChange={(e) => setSizeIdx(Number(e.target.value))}
              className="rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {SIZES.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {persons.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-muted">Person</label>
              <select
                value={personPick}
                onChange={(e) => setPersonPick(e.target.value)}
                title="Which trained face to use for this shot — switch anytime for a different mood/style"
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">None{persona?.loraName ? ' (legacy LoRA)' : ''}</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.status === 'training'}>
                    {p.name}
                    {p.status === 'training' ? ' — still training' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <input
              value={look}
              onChange={(e) => setLook(e.target.value)}
              placeholder="Current look (persists) — e.g. blonde hair, summer dress"
              className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p className="mt-0.5 text-xs text-text-muted">
              Sticks between shots until you change it — for temporary changes like hair color.
            </p>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="What's in the picture? e.g. sitting in a cafe, golden hour"
            className="w-full resize-none rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {pickedPerson ? (
            <p className="text-xs text-text-muted">
              Auto-applied: person “{pickedPerson.name}”
              {pickedPerson.triggerWord ? ` (${pickedPerson.triggerWord})` : ''}
              {pickedPerson.loraName ? ` · LoRA @ ${pickedPerson.loraStrength}` : ''}
              {persona?.imagePrompt ? ` · ${persona.imagePrompt}` : ''}
            </p>
          ) : (
            persona &&
            (persona.imagePrompt || persona.loraName) && (
              <p className="text-xs text-text-muted">
                Auto-applied from {persona.name}: {persona.imagePrompt || '(no preset)'}
                {persona.loraName ? ` · LoRA ${persona.loraName} @ ${persona.loraStrength}` : ''}
              </p>
            )
          )}

          {preview && (
            <img src={preview} alt="" className="max-h-72 w-full rounded-lg object-contain" />
          )}

          <button
            onClick={generate}
            disabled={busy || !persona}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? `Generating… ${elapsed}s` : 'Generate & send to chat'}
          </button>
          <p className="text-xs text-text-muted">
            Runs on your local ComfyUI. Flux typically takes 30–60s per image; the first one after
            a model load takes longer.
          </p>
        </div>
      </div>
    </div>
  );
}
