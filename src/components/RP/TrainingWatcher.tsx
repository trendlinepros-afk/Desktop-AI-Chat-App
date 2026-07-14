import { useEffect, useRef, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useUIStore } from '../../store/uiStore';

// Watches Persons whose LoRA is still training in FluxGym. Polls the outputs
// folder; when the final .safetensors lands it is copied into ComfyUI's
// models/loras automatically and the Person flips to ready — the user never
// touches a model file. Renders as a small 🧬 chip in the RP top bar.

const POLL_MS = 30_000;

export function TrainingWatcher() {
  const persons = useRPStore((s) => s.persons);
  const updatePerson = useRPStore((s) => s.updatePerson);
  const toast = useUIStore((s) => s.toast);
  const [checkpoints, setCheckpoints] = useState<Record<string, number>>({});
  const finalizing = useRef<Set<string>>(new Set());

  const training = persons.filter((p) => p.status === 'training' && p.datasetSlug);

  useEffect(() => {
    if (training.length === 0) return;
    let alive = true;

    const check = async () => {
      for (const person of training) {
        if (finalizing.current.has(person.id)) continue;
        try {
          const res = await window.polyglot.fluxGymCheckTraining(person.datasetSlug);
          if (!alive) return;
          setCheckpoints((prev) => ({ ...prev, [person.datasetSlug]: res.checkpoints }));
          if (res.done) {
            finalizing.current.add(person.id);
            const loraName = await window.polyglot.fluxGymInstallLora(person.datasetSlug);
            await updatePerson(person.id, { loraName, status: 'ready' });
            toast(`🧬 "${person.name}" finished training — installed and ready to use`, 'success');
            finalizing.current.delete(person.id);
          }
        } catch (err) {
          finalizing.current.delete(person.id);
          // Installing can fail (e.g. ComfyUI folder not set) — surface once
          // per poll rather than spamming.
          if (alive) console.warn('[training]', (err as Error).message);
        }
      }
    };

    check();
    const t = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // Re-arm when the set of in-training persons changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training.map((p) => p.id).join(',')]);

  if (training.length === 0) return null;

  const label =
    training.length === 1 ? training[0].name : `${training.length} people`;
  const done = training.length === 1 ? (checkpoints[training[0].datasetSlug] ?? 0) : 0;

  return (
    <span
      title={
        `Training in FluxGym: ${training.map((p) => p.name).join(', ')}. ` +
        'WICKED installs the LoRA into ComfyUI automatically when it finishes.'
      }
      className="animate-pulse rounded-lg border border-edge px-2 py-1 text-xs text-text-muted"
    >
      🧬 Training {label}
      {done > 0 ? ` · ${done} checkpoint${done === 1 ? '' : 's'}` : '…'}
    </span>
  );
}
