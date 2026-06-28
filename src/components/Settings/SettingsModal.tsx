import { useEffect, useState } from 'react';
import type { Provider, Settings } from '../../types';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { MODEL_CONFIG, PROVIDERS, defaultVersionFor } from '../ModelSelector/modelConfig';
import { McpServerSettings } from './McpServerSettings';

export function SettingsModal() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const toast = useUIStore((s) => s.toast);
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);

  const [draft, setDraft] = useState<Settings>(settings);

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
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
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

          {/* Vault */}
          <Section title="Master Brain Vault">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={draft.vaultPath || 'No vault folder selected'}
                className="flex-1 truncate rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-muted"
              />
              <button
                onClick={pickVault}
                className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90"
              >
                Change…
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              A <code>PolyglotBrain/</code> folder of Obsidian-compatible markdown notes is created here.
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
                className="flex-1 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
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
                className="flex-1 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
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

          {/* MCP servers */}
          <Section title="MCP Servers (tool use)">
            <McpServerSettings />
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-muted hover:text-text-primary"
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
      <div className="flex flex-1 items-center rounded-lg border border-white/10 bg-surface focus-within:border-accent">
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
