import { useEffect, useState } from 'react';
import type { Provider, Settings } from '../../types';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { MODEL_CONFIG, PROVIDERS, defaultVersionFor } from '../ModelSelector/modelConfig';
import { McpServerSettings } from './McpServerSettings';
import { OllamaModelManager } from './OllamaModelManager';
import { listOllamaModels } from '../../lib/ollama';

export function SettingsModal() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const setRpOpen = useUIStore((s) => s.setRpOpen);
  const toast = useUIStore((s) => s.toast);
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const startOnboarding = useOnboardingStore((s) => s.start);

  const [draft, setDraft] = useState<Settings>(settings);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  const update = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));

  const onSave = async () => {
    await save(draft);
    toast('Settings saved', 'success');
    setOpen(false);
  };

  const pickVault = async () => {
    const path = await window.polyglot.openVaultFolderDialog();
    if (path) update({ vaultPath: path });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">⚙️ Settings</h2>
          <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {/* API Keys */}
          <Section title="API Keys">
            <KeyInput
              label="OpenAI"
              value={draft.openaiApiKey}
              onChange={(v) => update({ openaiApiKey: v })}
            />
            <KeyInput
              label="Gemini"
              value={draft.geminiApiKey}
              onChange={(v) => update({ geminiApiKey: v })}
            />
            <KeyInput
              label="DeepSeek"
              value={draft.deepseekApiKey}
              onChange={(v) => update({ deepseekApiKey: v })}
            />
          </Section>

          {/* Memory (Obsidian) */}
          <Section title="Memory (Obsidian vault)">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={draft.vaultPath || 'No memory — running without a vault'}
                className="flex-1 truncate rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-text-muted"
              />
              <button
                onClick={pickVault}
                className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90"
              >
                {draft.vaultPath ? 'Change…' : 'Choose vault folder'}
              </button>
              {draft.vaultPath && (
                <button
                  onClick={() => update({ vaultPath: '' })}
                  title="Turn memory off"
                  className="rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
                >
                  Disable
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Memory is stored as markdown notes inside an <strong>Obsidian vault</strong> (a{' '}
              <code>WickedBrain/</code> folder is created in it). Choose your Obsidian vault folder to
              enable memory, or leave it unset to use WICKED without any long-term memory. New to
              Obsidian? Install it from{' '}
              <button
                className="text-accent underline"
                onClick={() => window.polyglot.openExternal('https://obsidian.md')}
              >
                obsidian.md
              </button>
              , create a vault, then point WICKED at that folder.
            </p>
          </Section>

          {/* Defaults */}
          <Section title="Defaults">
            <div className="flex gap-2">
              <select
                value={draft.defaultProvider}
                onChange={(e) => {
                  const provider = e.target.value as Provider;
                  update({
                    defaultProvider: provider,
                    defaultModelVersion: defaultVersionFor(provider),
                  });
                }}
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {MODEL_CONFIG[p].label}
                  </option>
                ))}
              </select>
              <select
                value={draft.defaultModelVersion}
                onChange={(e) => update({ defaultModelVersion: e.target.value })}
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {MODEL_CONFIG[draft.defaultProvider].versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          {/* Brain */}
          <Section title="Brain">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.semanticIndexingEnabled}
                onChange={(e) => update({ semanticIndexingEnabled: e.target.checked })}
                className="accent-brain"
              />
              Enable semantic indexing (requires an OpenAI key for embeddings)
            </label>
            <p className="mt-1 text-xs text-text-muted">
              When off, the Brain uses keyword search only — useful if you have no OpenAI key.
            </p>
          </Section>

          {/* Scheduled memory */}
          <Section title="Scheduled memory">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.autoMemoryEnabled}
                onChange={(e) => update({ autoMemoryEnabled: e.target.checked })}
                className="accent-brain"
              />
              Automatically commit chats to memory on a schedule
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-text-muted">Run every</span>
              <select
                value={draft.autoMemoryIntervalMinutes}
                onChange={(e) => update({ autoMemoryIntervalMinutes: Number(e.target.value) })}
                disabled={!draft.autoMemoryEnabled}
                className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
              >
                {[15, 30, 60, 120, 240].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Saves every chat with new activity to your vault (updating existing notes in place),
              and re-saves previously-stored chats that gained new messages. Chats marked
              <strong> “Don't save to memory” </strong> in their header are skipped. Requires a vault
              and an API key for each chat's model.
            </p>
          </Section>

          {/* Ollama (local LLM) */}
          <Section title="Ollama (local LLM)">
            <div className="flex items-center gap-2">
              <input
                value={draft.ollamaBaseUrl}
                onChange={(e) => update({ ollamaBaseUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={async () => {
                  const models = await listOllamaModels(draft.ollamaBaseUrl);
                  if (models.length > 0)
                    toast(`Ollama reachable — ${models.length} model(s) installed`, 'success');
                  else toast('No Ollama server reachable at that URL', 'error');
                }}
                className="rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                Test
              </button>
              <button
                onClick={() => setManagerOpen(true)}
                className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90"
              >
                Manage models
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Run models locally with no API key or usage cost. Install{' '}
              <button
                className="text-accent underline"
                onClick={() => window.polyglot.openExternal('https://ollama.com')}
              >
                Ollama
              </button>
              , then pick <strong>Ollama (local)</strong> in the model bar — your installed models
              load automatically.
            </p>
          </Section>

          {/* MCP servers */}
          <Section title="MCP Servers (tool use)">
            <McpServerSettings />
          </Section>

          {/* Help */}
          <Section title="Help">
            <button
              onClick={() => {
                setOpen(false);
                startOnboarding();
              }}
              className="rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
            >
              ▶ Replay welcome tour
            </button>
          </Section>

          {/* Optimizations — opens the separate RP side of the app */}
          <Section title="Optimizations">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setOpen(false);
                  setRpOpen(true);
                }}
                className="shrink-0 rounded-lg border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
              >
                OPTO
              </button>
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            onClick={() => setOpen(false)}
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

      {managerOpen && (
        <OllamaModelManager baseUrl={draft.ollamaBaseUrl} onClose={() => setManagerOpen(false)} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KeyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-sm text-text-muted">{label}</span>
      <div className="flex flex-1 items-center rounded-lg border border-edge bg-surface focus-within:border-accent">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${label} API key`}
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
        />
        <button
          onClick={() => setShow((v) => !v)}
          className="px-3 text-text-muted hover:text-text-primary"
          title={show ? 'Hide' : 'Show'}
        >
          {show ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  );
}
