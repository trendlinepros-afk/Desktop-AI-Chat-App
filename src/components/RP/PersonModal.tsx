import { useEffect, useState } from 'react';
import { useRPStore } from '../../store/rpStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import type { FluxGymStatus, TrainingImage } from '../../types';

// Create or edit a "Person" — a reusable visual identity (trained LoRA +
// trigger word + appearance preset). Creating one offers two paths:
//   1. Train a new face from 10–30 photos (guided FluxGym pipeline)
//   2. Wrap a LoRA that's already installed in ComfyUI
// `personId === null` means create; a created Person's id is handed back so
// the persona editor can select it immediately.

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'person'
  );
}

const MIN_PHOTOS = 5;
const IDEAL_MIN = 10;
const IDEAL_MAX = 30;

type Mode = 'choose' | 'train' | 'existing' | 'edit';
type TrainStep = 1 | 2 | 3;

export function PersonModal({
  personId,
  onClose,
}: {
  personId: string | null;
  onClose: (createdId?: string) => void;
}) {
  const persons = useRPStore((s) => s.persons);
  const createPerson = useRPStore((s) => s.createPerson);
  const updatePerson = useRPStore((s) => s.updatePerson);
  const deletePerson = useRPStore((s) => s.deletePerson);
  const saveSettings = useSettingsStore((s) => s.save);
  const toast = useUIStore((s) => s.toast);

  const existing = personId ? persons.find((p) => p.id === personId) : null;

  const [mode, setMode] = useState<Mode>(existing ? 'edit' : 'choose');
  const [step, setStep] = useState<TrainStep>(1);
  const [busy, setBusy] = useState(false);

  // Shared form fields (used by all modes).
  const [name, setName] = useState(existing?.name ?? '');
  const [trigger, setTrigger] = useState(existing?.triggerWord ?? '');
  const [triggerTouched, setTriggerTouched] = useState(!!existing);
  const [imagePrompt, setImagePrompt] = useState(existing?.imagePrompt ?? '');
  const [loraName, setLoraName] = useState(existing?.loraName ?? '');
  const [loraStrength, setLoraStrength] = useState(existing?.loraStrength ?? 0.85);

  // Train path state.
  const [photos, setPhotos] = useState<TrainingImage[]>([]);
  const [gym, setGym] = useState<FluxGymStatus | null>(null);
  const [prepared, setPrepared] = useState<{ slug: string; dir: string; personId: string } | null>(
    null
  );

  // Existing-LoRA path needs the installed list.
  const [loras, setLoras] = useState<string[]>([]);
  useEffect(() => {
    window.polyglot
      .comfyListModels()
      .then((m) => setLoras(m.loras))
      .catch(() => setLoras([]));
  }, []);

  // FluxGym status feeds the train step; keep it fresh while that UI is up.
  useEffect(() => {
    if (mode !== 'train' && !(mode === 'edit' && existing?.status === 'training')) return;
    let alive = true;
    const poll = () =>
      window.polyglot.fluxGymGetStatus().then((s) => {
        if (alive) setGym(s);
      });
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mode, existing?.status]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, busy]);

  const slug = existing?.datasetSlug || slugify(name);
  const effectiveTrigger = triggerTouched && trigger ? trigger : slug.replace(/-/g, '_');

  const setNameAndTrigger = (v: string) => {
    setName(v);
    if (!triggerTouched) setTrigger(slugify(v).replace(/-/g, '_'));
  };

  const pickPhotos = async () => {
    const picked = await window.polyglot.fluxGymPickImages();
    if (picked.length === 0) return;
    // Merge, de-duplicated by path, keeping earlier picks first.
    setPhotos((prev) => {
      const seen = new Set(prev.map((p) => p.path));
      return [...prev, ...picked.filter((p) => !seen.has(p.path))];
    });
  };

  const chooseGymFolder = async () => {
    const p = await window.polyglot.fluxGymChooseFolder();
    if (!p) return;
    await saveSettings({ fluxGymPath: p });
    setGym(await window.polyglot.fluxGymGetStatus());
  };

  // Train path, step 3: write the dataset and create the Person as 'training'.
  const prepareAndCreate = async () => {
    if (!name.trim()) return toast('Give this person a name first', 'error');
    setBusy(true);
    try {
      const res = await window.polyglot.fluxGymPrepareDataset(
        slug,
        effectiveTrigger,
        photos.map((p) => p.path)
      );
      const person = await createPerson({
        name: name.trim(),
        triggerWord: effectiveTrigger,
        imagePrompt: imagePrompt.trim() || `photo of ${effectiveTrigger}`,
        loraStrength,
        status: 'training',
        datasetSlug: slug,
        previewImage: photos[0]?.thumb ?? '',
      });
      setPrepared({ slug, dir: res.dir, personId: person.id });
      toast(`Dataset ready — ${res.count} photos prepared`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const createFromExisting = async () => {
    if (!name.trim()) return toast('Give this person a name', 'error');
    if (!loraName) return toast('Pick the LoRA file this person uses', 'error');
    setBusy(true);
    try {
      const person = await createPerson({
        name: name.trim(),
        triggerWord: trigger.trim(),
        imagePrompt: imagePrompt.trim() || (trigger.trim() ? `photo of ${trigger.trim()}` : ''),
        loraName,
        loraStrength,
        status: 'ready',
      });
      toast('Person created', 'success');
      onClose(person.id);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!existing) return;
    if (!name.trim()) return toast('Give this person a name', 'error');
    await updatePerson(existing.id, {
      name: name.trim(),
      triggerWord: trigger.trim(),
      imagePrompt: imagePrompt.trim(),
      loraName,
      loraStrength,
    });
    toast('Person updated', 'success');
    onClose();
  };

  const onDelete = async () => {
    if (!existing) return;
    if (
      !confirm(
        `Delete "${existing.name}"? Personas using it fall back to no LoRA. The LoRA file itself stays in ComfyUI.`
      )
    )
      return;
    await deletePerson(existing.id);
    toast('Person deleted', 'info');
    onClose();
  };

  const launchGym = async () => {
    const res = await window.polyglot.fluxGymLaunch();
    toast(res.message, res.started ? 'success' : 'info');
  };

  const photoCountNote =
    photos.length < MIN_PHOTOS
      ? `Add at least ${MIN_PHOTOS} — ${IDEAL_MIN}–${IDEAL_MAX} is the sweet spot`
      : photos.length < IDEAL_MIN
        ? `Will work, but ${IDEAL_MIN}–${IDEAL_MAX} photos gives a much more faithful face`
        : photos.length > IDEAL_MAX
          ? 'More than 30 mostly just slows training down — consider trimming'
          : 'Perfect amount';

  const gymPanel = (
    <div className="rounded-lg border border-edge bg-surface/50 p-3 text-sm">
      {!gym ? (
        <span className="text-text-muted">Checking FluxGym…</span>
      ) : !gym.installed ? (
        <div className="space-y-2">
          <p>
            <span className="font-medium">FluxGym not found.</span>{' '}
            <span className="text-text-muted">
              It's the free tool that trains the face model. Install it with Pinokio (one click),
              or point WICKED at its folder if it's already installed.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.polyglot.openExternal('https://pinokio.computer')}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              Get Pinokio
            </button>
            <button
              onClick={chooseGymFolder}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              I have it — choose folder…
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className={gym.running ? 'text-green-500' : 'text-text-muted'}>
            {gym.running ? '● FluxGym is running' : '○ FluxGym found, not running'}
          </span>
          {!gym.running && (
            <button
              onClick={launchGym}
              className="rounded-lg border border-edge px-3 py-1 text-xs text-accent hover:bg-accent/10"
            >
              ▶ Start it
            </button>
          )}
          {gym.running && (
            <button
              onClick={() => window.polyglot.fluxGymOpenUi()}
              className="rounded-lg border border-edge px-3 py-1 text-xs text-accent hover:bg-accent/10"
            >
              Open FluxGym ↗
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div data-rp-modal className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">
            {mode === 'edit'
              ? `Edit person — ${existing?.name ?? ''}`
              : mode === 'train'
                ? `New person — step ${step} of 3`
                : mode === 'existing'
                  ? 'New person — from an installed LoRA'
                  : 'Create a new person'}
          </h2>
          <button onClick={() => onClose()} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* ---------- Mode chooser ---------- */}
          {mode === 'choose' && (
            <>
              <p className="text-sm text-text-muted">
                A <strong>person</strong> is a face your characters can wear in generated photos.
                Make several for the same character (different moods, styles, eras) and switch
                between them anytime.
              </p>
              <button
                onClick={() => setMode('train')}
                className="w-full rounded-xl border border-edge bg-surface/50 p-4 text-left hover:border-accent"
              >
                <div className="text-sm font-semibold">🧬 Train a new face from photos</div>
                <p className="mt-1 text-xs text-text-muted">
                  Pick 10–30 photos of the person and WICKED walks you through training a LoRA with
                  FluxGym — no manual file wrangling. Training takes a while (often 1–2 hours), but
                  it's one click and you can keep chatting meanwhile.
                </p>
              </button>
              <button
                onClick={() => setMode('existing')}
                className="w-full rounded-xl border border-edge bg-surface/50 p-4 text-left hover:border-accent"
              >
                <div className="text-sm font-semibold">📦 Use a LoRA I already have</div>
                <p className="mt-1 text-xs text-text-muted">
                  Already trained one, or downloaded a LoRA into ComfyUI's models\loras folder? Wrap
                  it as a person so it's one click from any persona.
                </p>
              </button>
            </>
          )}

          {/* ---------- Train path ---------- */}
          {mode === 'train' && step === 1 && (
            <>
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Person name — include the mood/style if you'll make more than one
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setNameAndTrigger(e.target.value)}
                  placeholder="e.g. Sarah — casual   /   Sarah — gothic"
                  className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Trigger word</label>
                <input
                  value={effectiveTrigger}
                  onChange={(e) => {
                    setTriggerTouched(true);
                    setTrigger(e.target.value.replace(/\s+/g, '_'));
                  }}
                  className="w-full rounded-lg border border-edge bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                />
                <p className="mt-1 text-xs text-text-muted">
                  A made-up word the model learns to associate with this face. WICKED picked one
                  from the name — you almost never need to change it, and it gets added to image
                  prompts automatically.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Appearance notes (optional) — always added to this person's photos
                </label>
                <input
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder={`e.g. photo of ${effectiveTrigger} woman, red hair, elegant style`}
                  className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </>
          )}

          {mode === 'train' && step === 2 && (
            <>
              <div className="flex items-center justify-between">
                <button
                  onClick={pickPhotos}
                  className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90"
                >
                  ＋ Choose photos…
                </button>
                <span
                  className={`text-sm ${
                    photos.length >= IDEAL_MIN && photos.length <= IDEAL_MAX
                      ? 'text-green-500'
                      : photos.length >= MIN_PHOTOS
                        ? 'text-yellow-500'
                        : 'text-text-muted'
                  }`}
                >
                  {photos.length} selected — {photoCountNote}
                </span>
              </div>
              {photos.length > 0 && (
                <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto">
                  {photos.map((p) => (
                    <div key={p.path} className="group relative">
                      {p.thumb ? (
                        <img
                          src={p.thumb}
                          alt={p.name}
                          title={p.name}
                          className="h-20 w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-surface text-xs text-text-muted">
                          {p.name}
                        </div>
                      )}
                      <button
                        onClick={() => setPhotos((prev) => prev.filter((x) => x.path !== p.path))}
                        className="absolute -right-1 -top-1 hidden rounded-full bg-black/70 px-1 text-xs text-white group-hover:block"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-edge bg-surface/50 p-3 text-xs text-text-muted">
                <p className="mb-1 font-medium text-text-primary">What makes training work well:</p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>One person only — no group shots</li>
                  <li>Mix it up: close-ups and full body, different angles, lighting and outfits</li>
                  <li>Sharp faces — skip blurry, filtered or sunglasses-covered shots</li>
                  <li>Same face throughout = same mood; use a separate person per look</li>
                </ul>
              </div>
            </>
          )}

          {mode === 'train' && step === 3 && !prepared && (
            <>
              {gymPanel}
              <div className="rounded-lg border border-edge bg-surface/50 p-3 text-sm">
                <p className="mb-1 font-medium">Ready to prepare:</p>
                <ul className="space-y-0.5 text-xs text-text-muted">
                  <li>
                    Person: <span className="text-text-primary">{name || '(unnamed)'}</span> ·
                    trigger <code className="text-text-primary">{effectiveTrigger}</code>
                  </li>
                  <li>
                    {photos.length} photos → FluxGym dataset{' '}
                    <code className="text-text-primary">{slug}</code>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-text-muted">
                  WICKED copies the photos into FluxGym's dataset folder, writes the trigger-word
                  caption files, and then watches for the finished LoRA — when it appears it's
                  installed into ComfyUI automatically.
                </p>
              </div>
              <button
                onClick={prepareAndCreate}
                disabled={busy || !gym?.installed}
                className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {busy ? 'Preparing…' : 'Prepare dataset & create person'}
              </button>
            </>
          )}

          {mode === 'train' && step === 3 && prepared && (
            <>
              {gymPanel}
              <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 text-sm">
                <p className="mb-2 font-medium">✅ Dataset prepared. Now start the training:</p>
                <ol className="list-inside list-decimal space-y-1.5 text-xs text-text-muted">
                  <li>
                    Open FluxGym (button above) and set{' '}
                    <span className="text-text-primary">
                      LoRA name to exactly <code>{prepared.slug}</code>
                    </span>{' '}
                    — that's how WICKED finds the result.
                  </li>
                  <li>
                    Set the trigger word to <code className="text-text-primary">{effectiveTrigger}</code>.
                  </li>
                  <li>
                    Drag <strong>all files</strong> (photos + .txt captions) from the dataset folder
                    into FluxGym's upload box.{' '}
                    <button
                      onClick={() => window.polyglot.fluxGymOpenDataset(prepared.slug)}
                      className="text-accent underline"
                    >
                      Open dataset folder
                    </button>
                  </li>
                  <li>The default training settings are good — hit “Start training”.</li>
                  <li>
                    That's it. Leave FluxGym running; WICKED shows a 🧬 chip in the top bar and
                    installs the LoRA into ComfyUI the moment it's done.
                  </li>
                </ol>
              </div>
              <button
                onClick={() => onClose(prepared.personId)}
                className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                Done — I'll get a heads-up when training finishes
              </button>
            </>
          )}

          {/* ---------- Existing-LoRA path & edit mode share the form ---------- */}
          {(mode === 'existing' || mode === 'edit') && (
            <>
              {mode === 'edit' && existing?.status === 'training' && (
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 text-sm">
                  <p className="font-medium">🧬 Still training in FluxGym</p>
                  <p className="mt-1 text-xs text-text-muted">
                    WICKED checks for the finished LoRA every half minute and installs it
                    automatically. Dataset: <code>{existing.datasetSlug}</code>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => window.polyglot.fluxGymOpenUi()}
                      className="rounded-lg border border-edge px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                    >
                      Open FluxGym ↗
                    </button>
                    <button
                      onClick={() => window.polyglot.fluxGymOpenDataset(existing.datasetSlug)}
                      className="rounded-lg border border-edge px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                    >
                      Open dataset folder
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                {existing?.previewImage && (
                  <img
                    src={existing.previewImage}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-text-muted">Person name</label>
                  <input
                    autoFocus={mode === 'existing'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sarah — casual"
                    className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted">LoRA</label>
                <select
                  value={loraName}
                  onChange={(e) => setLoraName(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-edge bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
                >
                  <option value="">{mode === 'edit' ? 'None yet (training)' : 'Pick a LoRA…'}</option>
                  {loras.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  {loraName && !loras.includes(loraName) && (
                    <option value={loraName}>{loraName} (ComfyUI offline)</option>
                  )}
                </select>
                <label className="text-xs text-text-muted">Strength</label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={loraStrength}
                  onChange={(e) => setLoraStrength(Number(e.target.value) || 0)}
                  className="w-20 rounded-lg border border-edge bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Trigger word (the word the LoRA was trained on — check its download page if unsure)
                </label>
                <input
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  placeholder="e.g. sarah_casual — leave empty if the LoRA doesn't use one"
                  className="w-full rounded-lg border border-edge bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Appearance notes — always added to this person's photos
                </label>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={2}
                  placeholder="e.g. photo of a woman, red hair, elegant style"
                  className="w-full resize-none rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </>
          )}
        </div>

        {/* ---------- Footer ---------- */}
        <div className="flex items-center justify-between gap-2 border-t border-edge px-5 py-3">
          <div>
            {mode === 'edit' && (
              <button
                onClick={onDelete}
                className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            )}
            {mode === 'train' && step > 1 && !prepared && (
              <button
                onClick={() => setStep((s) => (s - 1) as TrainStep)}
                className="rounded-lg border border-edge px-4 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                ← Back
              </button>
            )}
            {(mode === 'train' || mode === 'existing') && step === 1 && !prepared && (
              <button
                onClick={() => setMode('choose')}
                className="rounded-lg border border-edge px-4 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                ← Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onClose()}
              className="rounded-lg border border-edge px-4 py-2 text-sm text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
            {mode === 'train' && step === 1 && (
              <button
                onClick={() => (name.trim() ? setStep(2) : toast('Give this person a name', 'error'))}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                Next: photos →
              </button>
            )}
            {mode === 'train' && step === 2 && (
              <button
                onClick={() =>
                  photos.length >= MIN_PHOTOS
                    ? setStep(3)
                    : toast(`Add at least ${MIN_PHOTOS} photos (10–30 is ideal)`, 'error')
                }
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                Next: train →
              </button>
            )}
            {mode === 'existing' && (
              <button
                onClick={createFromExisting}
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Create person
              </button>
            )}
            {mode === 'edit' && (
              <button
                onClick={saveEdit}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
