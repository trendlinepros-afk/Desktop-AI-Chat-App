import { useEffect, useRef, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useUIStore } from '../../store/uiStore';
import type { RPPerson } from '../../types';

// Watches Persons whose LoRA isn't finished yet and keeps the top-bar status
// honest about what's actually happening:
//   waiting  → the dataset is prepared but the user hasn't pressed Start in
//              FluxGym (amber chip; click it for the exact steps)
//   training → FluxGym's output folder exists, so a run is really going
//              (pulsing chip; click opens FluxGym's live log)
// Transitions are detected automatically from the outputs folder, and the
// finished .safetensors is installed into ComfyUI without user involvement.

const POLL_MS = 20_000;

export function TrainingWatcher() {
  const persons = useRPStore((s) => s.persons);
  const updatePerson = useRPStore((s) => s.updatePerson);
  const toast = useUIStore((s) => s.toast);
  const [checkpoints, setCheckpoints] = useState<Record<string, number>>({});
  const [helpFor, setHelpFor] = useState<RPPerson | null>(null);
  const finalizing = useRef<Set<string>>(new Set());

  const active = persons.filter(
    (p) => (p.status === 'waiting' || p.status === 'training') && p.datasetSlug
  );
  const waiting = active.filter((p) => p.status === 'waiting');
  const training = active.filter((p) => p.status === 'training');

  useEffect(() => {
    if (active.length === 0) return;
    let alive = true;

    const check = async () => {
      for (const person of active) {
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
          } else if (person.status === 'waiting' && res.started) {
            // The user pressed Start in FluxGym — now it's really training.
            await updatePerson(person.id, { status: 'training' });
            toast(`🧬 Training started for "${person.name}"`, 'success');
          } else if (person.status === 'training' && !res.started) {
            // Claimed to be training but FluxGym never started (e.g. created
            // before WICKED tracked this, or the run was never kicked off).
            await updatePerson(person.id, { status: 'waiting' });
          }
        } catch (err) {
          finalizing.current.delete(person.id);
          // Installing can fail (e.g. ComfyUI folder not set) — log rather
          // than toast-spamming every poll.
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
    // Re-arm when the set of unfinished persons (or their states) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.map((p) => p.id + p.status).join(',')]);

  if (active.length === 0) return null;

  const trainDone = training.length === 1 ? (checkpoints[training[0].datasetSlug] ?? 0) : 0;

  return (
    <>
      {waiting.length > 0 && (
        <button
          onClick={() => setHelpFor(waiting[0])}
          title="The dataset is ready but training hasn't been started in FluxGym yet — click for the steps"
          className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-500 hover:bg-yellow-500/20"
        >
          🧬 {waiting.length === 1 ? waiting[0].name : `${waiting.length} people`}: press Start in
          FluxGym — click for steps
        </button>
      )}
      {training.length > 0 && (
        <button
          onClick={() => window.polyglot.fluxGymOpenUi()}
          title={
            `Training in FluxGym: ${training.map((p) => p.name).join(', ')}. ` +
            'Click to open FluxGym and watch the live progress log. WICKED installs the LoRA automatically when it finishes.'
          }
          className="animate-pulse rounded-lg border border-edge px-2 py-1 text-xs text-text-muted hover:text-text-primary"
        >
          🧬 Training {training.length === 1 ? training[0].name : `${training.length} people`}
          {trainDone > 0 ? ` · ${trainDone} checkpoint${trainDone === 1 ? '' : 's'}` : '…'}
        </button>
      )}

      {helpFor && (
        <div
          data-rp-modal
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setHelpFor(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-edge px-5 py-3">
              <h2 className="font-semibold">🧬 Start training “{helpFor.name}”</h2>
              <button
                onClick={() => setHelpFor(null)}
                className="text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="text-text-muted">
                The photos and captions are prepared — FluxGym just needs you to press Start. In
                FluxGym:
              </p>
              <ol className="list-inside list-decimal space-y-1.5 text-xs text-text-muted">
                <li>
                  Set <strong className="text-text-primary">The name of your LoRA</strong> to
                  exactly <code className="text-text-primary">{helpFor.datasetSlug}</code> (WICKED
                  uses it to find the result).
                </li>
                <li>
                  Set <strong className="text-text-primary">Trigger word</strong> to{' '}
                  <code className="text-text-primary">{helpFor.triggerWord}</code>.
                </li>
                <li>
                  Drag <strong className="text-text-primary">all files</strong> (photos + .txt
                  captions) from the dataset folder into the “Upload your images” box.
                </li>
                <li>Leave the default settings and press “Start training”.</li>
              </ol>
              <p className="text-xs text-text-muted">
                This chip flips to “Training” by itself once the run starts, and the finished LoRA
                installs into ComfyUI automatically.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => window.polyglot.fluxGymOpenUi()}
                  className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/90"
                >
                  Open FluxGym ↗
                </button>
                <button
                  onClick={() => window.polyglot.fluxGymOpenDataset(helpFor.datasetSlug)}
                  className="rounded-lg border border-edge px-3 py-2 text-xs text-text-muted hover:text-text-primary"
                >
                  📂 Open dataset folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
