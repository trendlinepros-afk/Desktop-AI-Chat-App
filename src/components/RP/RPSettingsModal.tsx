import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { GROK_MODELS, GROK_BASE_URL, listGrokModels } from '../../lib/rpChat';

// Settings for the Role-Play side only — deliberately separate from the main
// app's Settings dialog.
export function RPSettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const toast = useUIStore((s) => s.toast);

  const [grokApiKey, setGrokApiKey] = useState(settings.grokApiKey);
  const [grokModel, setGrokModel] = useState(settings.grokModel);
  const [rpMemoryEnabled, setRpMemoryEnabled] = useState(settings.rpMemoryEnabled);
  const [rpSummarizeEvery, setRpSummarizeEvery] = useState(settings.rpSummarizeEvery);
  const [rpVaultPath, setRpVaultPath] = useState(settings.rpVaultPath);
  const [rpAutoReplyLimit, setRpAutoReplyLimit] = useState(settings.rpAutoReplyLimit);
  const [showKey, setShowKey] = useState(false);
  const [comfyUrl, setComfyUrl] = useState(settings.comfyUrl);
  const [comfyCheckpoint, setComfyCheckpoint] = useState(settings.comfyCheckpoint);
  const [comfyModelFamily, setComfyModelFamily] = useState(settings.comfyModelFamily);
  const [comfyWorkflow, setComfyWorkflow] = useState(settings.comfyWorkflow);
  const [comfyLaunchPath, setComfyLaunchPath] = useState(settings.comfyLaunchPath);
  const [fluxGymPath, setFluxGymPath] = useState(settings.fluxGymPath);
  const [checkpoints, setCheckpoints] = useState<string[]>([]);

  useEffect(() => {
    window.polyglot
      .comfyListModels()
      .then((m) => setCheckpoints(m.checkpoints))
      .catch(() => setCheckpoints([]));
  }, []);
  const [models, setModels] = useState<string[]>(GROK_MODELS);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const refreshModels = async () => {
    const list = await listGrokModels(grokApiKey);
    setModels(list);
    toast(`Found ${list.length} Grok model(s)`, 'success');
  };

  const pickVault = async () => {
    const path = await window.polyglot.openVaultFolderDialog();
    if (path) setRpVaultPath(path);
  };

  const onSave = async () => {
    await save({
      grokApiKey,
      grokModel,
      rpMemoryEnabled,
      rpSummarizeEvery,
      rpVaultPath,
      rpAutoReplyLimit,
      comfyUrl,
      comfyCheckpoint,
      comfyModelFamily,
      comfyWorkflow,
      comfyLaunchPath,
      fluxGymPath,
    });
    toast('RP settings saved', 'success');
    onClose();
  };

  const modelOptions = Array.from(new Set([grokModel, ...models]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">⚙️ RP Settings</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Grok (xAI) API key</h3>
            <div className="flex items-center rounded-lg border border-edge bg-surface focus-within:border-accent">
              <input
                type={showKey ? 'text' : 'password'}
                value={grokApiKey}
                onChange={(e) => setGrokApiKey(e.target.value)}
                placeholder="xai-…"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="px-3 text-text-muted hover:text-text-primary"
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              The RP side uses the Grok API ({GROK_BASE_URL}) — separate from the models used by the
              main app. Get a key from{' '}
              <button
                className="text-accent underline"
                onClick={() => window.polyglot.openExternal('https://console.x.ai')}
              >
                console.x.ai
              </button>
              . Stored encrypted at rest.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Default model for new personas</h3>
            <div className="flex gap-2">
              <input
                list="rp-settings-models"
                value={grokModel}
                onChange={(e) => setGrokModel(e.target.value)}
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <datalist id="rp-settings-models">
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                onClick={refreshModels}
                className="rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                Refresh
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Group conversations</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">
                Let characters talk among themselves up to
              </span>
              <select
                value={rpAutoReplyLimit}
                onChange={(e) => setRpAutoReplyLimit(Number(e.target.value))}
                className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'reply' : 'replies'}
                  </option>
                ))}
              </select>
              <span className="text-sm text-text-muted">in a row</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              After you speak, the characters reply back and forth to build the story, then pause
              for you. They also stop early if one of them asks <strong>you</strong> a direct
              question. Lower this to use fewer API credits.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Memory vault (Obsidian)</h3>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={rpVaultPath || 'No RP vault chosen — using app storage'}
                className="flex-1 truncate rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-text-muted"
              />
              <button
                onClick={pickVault}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90"
              >
                {rpVaultPath ? 'Change…' : 'Choose vault folder'}
              </button>
              {rpVaultPath && (
                <button
                  onClick={() => setRpVaultPath('')}
                  title="Stop using the Obsidian vault for RP memory"
                  className="shrink-0 rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Pick a <strong>separate Obsidian vault</strong> (create a brand-new one in Obsidian
              first, then select its folder here). RP memory is written as markdown into a{' '}
              <code>WickedRP/</code> folder inside it, kept entirely apart from WICKED's main Brain
              vault. New to Obsidian? Get it at{' '}
              <button
                className="text-accent underline"
                onClick={() => window.polyglot.openExternal('https://obsidian.md')}
              >
                obsidian.md
              </button>
              .
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Memory</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rpMemoryEnabled}
                onChange={(e) => setRpMemoryEnabled(e.target.checked)}
                className="accent-brain"
              />
              Automatically summarize long conversations into each persona's memory
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-text-muted">Summarize every</span>
              <select
                value={rpSummarizeEvery}
                onChange={(e) => setRpSummarizeEvery(Number(e.target.value))}
                disabled={!rpMemoryEnabled}
                className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
              >
                {[10, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n} messages
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              RP memory is stored as markdown files in a folder kept{' '}
              <strong>completely separate</strong> from WICKED's Brain vault. Older turns get folded
              into memory so the persona keeps context without the prompt growing forever.
            </p>
            <button
              onClick={() => window.polyglot.rpOpenMemoryFolder()}
              className="mt-2 rounded-lg border border-edge px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
            >
              📂 Open RP memory folder
            </button>
          </div>

          {/* Local image generation (ComfyUI) */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">🎨 Local images (ComfyUI)</h3>
            <div className="flex items-center gap-2">
              <input
                value={comfyUrl}
                onChange={(e) => setComfyUrl(e.target.value)}
                placeholder="http://127.0.0.1:8188"
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <select
                value={comfyCheckpoint}
                onChange={(e) => setComfyCheckpoint(e.target.value)}
                className="max-w-[14rem] rounded-lg border border-edge bg-surface px-2 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">Checkpoint…</option>
                {checkpoints.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {comfyCheckpoint && !checkpoints.includes(comfyCheckpoint) && (
                  <option value={comfyCheckpoint}>{comfyCheckpoint} (offline)</option>
                )}
              </select>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-text-muted">Model type</label>
              <select
                value={comfyModelFamily}
                onChange={(e) =>
                  setComfyModelFamily(e.target.value as '' | 'flux' | 'sdxl')
                }
                className="rounded-lg border border-edge bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="">Auto-detect from filename</option>
                <option value="flux">Flux (LoRAs from FluxGym need this)</option>
                <option value="sdxl">SDXL / SD 1.5</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Flux and SDXL need very different sampler settings — the wrong type is the #1 cause
              of extra limbs and melted faces. Auto-detect looks for “flux” in the checkpoint's
              filename; if yours is a Flux model named something else, set this to{' '}
              <strong>Flux</strong> explicitly.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={comfyLaunchPath}
                onChange={(e) => setComfyLaunchPath(e.target.value)}
                placeholder={'Auto-start: ComfyUI folder, e.g. C:\\ComfyUI_windows_portable'}
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={async () => {
                  const p = await window.polyglot.comfyChooseFolder();
                  if (p) setComfyLaunchPath(p);
                }}
                className="rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                Browse…
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              With a folder set, WICKED starts ComfyUI silently in the background when it launches
              and stops it when you quit — you only press <strong>Load</strong> on the VRAM chip.
              Leave empty to keep starting ComfyUI yourself. Applies on next launch (or use ▶
              Start on the chip).
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-text-muted hover:text-text-primary">
                Advanced: custom workflow (API format, {'{{PROMPT}}'} / {'{{SEED}}'} placeholders)
              </summary>
              <textarea
                value={comfyWorkflow}
                onChange={(e) => setComfyWorkflow(e.target.value)}
                rows={5}
                placeholder="Paste a workflow exported from ComfyUI (Export → API). Leave empty to use the built-in Flux workflow."
                className="mt-1 w-full resize-y rounded-lg border border-edge bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
            </details>
            <p className="mt-1 text-xs text-text-muted">
              Needs ComfyUI running on this PC (see the setup guide). Generation is available in a
              conversation via the 🎨 button; each persona picks its <strong>person</strong> (a
              trained face) in the persona editor.
            </p>
          </div>

          {/* LoRA training (FluxGym) */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">🧬 LoRA training (FluxGym)</h3>
            <div className="flex items-center gap-2">
              <input
                value={fluxGymPath}
                onChange={(e) => setFluxGymPath(e.target.value)}
                placeholder={'FluxGym folder — empty = auto-detect Pinokio (pinokio\\api\\fluxgym.git)'}
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={async () => {
                  const p = await window.polyglot.fluxGymChooseFolder();
                  if (p) setFluxGymPath(p);
                }}
                className="rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                Browse…
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Used by <strong>＋ New person → Train a new face</strong> in the persona editor.
              WICKED finds Pinokio installs automatically; only set this if yours lives somewhere
              unusual.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
