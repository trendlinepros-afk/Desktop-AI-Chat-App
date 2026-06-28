import { useState } from 'react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useUIStore } from '../../store/uiStore';

interface Step {
  emoji: string;
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    emoji: '🔮',
    title: 'Welcome to WICKED',
    body: (
      <>
        <p>
          One window, every model, one memory. Chat with <strong>OpenAI</strong>,{' '}
          <strong>Gemini</strong>, <strong>DeepSeek</strong>, or a <strong>local model</strong> —
          and everything you learn can be saved to a knowledge vault the AI reads from next time.
        </p>
        <p className="mt-2 text-text-muted">This quick tour covers the basics. ~1 minute.</p>
      </>
    ),
  },
  {
    emoji: '🔑',
    title: 'Add a model',
    body: (
      <>
        <p>
          Open <strong>Settings ⚙️</strong> (top-left gear) and either:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Paste an <strong>API key</strong> for OpenAI, Gemini, or DeepSeek (keys are encrypted on
            your machine), or
          </li>
          <li>
            Run models <strong>free &amp; offline</strong> with <strong>Ollama</strong> — install it,
            then use <em>Manage models</em> to download one.
          </li>
        </ul>
        <p className="mt-2 text-text-muted">
          Pick the provider &amp; model in the top bar; it saves per chat.
        </p>
      </>
    ),
  },
  {
    emoji: '🧠',
    title: 'The Master Brain',
    body: (
      <>
        <p>
          In Settings, choose a <strong>vault folder</strong>. WICKED creates an
          Obsidian-compatible <code>WickedBrain/</code> of markdown notes there.
        </p>
        <p className="mt-2">
          With the amber <strong>🧠 Brain</strong> toggle ON, relevant notes are automatically fed
          to the model before each message. Click <strong>✓ End &amp; Review</strong> to summarize a
          chat and save it back to the vault — so every session builds on the last.
        </p>
      </>
    ),
  },
  {
    emoji: '🗺',
    title: 'Plan Mode',
    body: (
      <>
        <p>
          Click <strong>🗺 Plan</strong> to start a guided app-planning session. The model
          interviews you about your idea, then <strong>📦 Build Prompt</strong> compiles the whole
          plan into a copy-paste prompt you can hand to an AI coding agent — and saves it to your
          vault.
        </p>
      </>
    ),
  },
  {
    emoji: '🛠',
    title: 'Power features',
    body: (
      <>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>🎭 Persona</strong> — give a chat a custom system prompt or reusable template.
          </li>
          <li>
            <strong>MCP tools</strong> — connect a server (e.g. your Godot editor) so models can use
            real tools.
          </li>
          <li>
            Hover a message to <strong>regenerate, edit, branch, or delete</strong>.
          </li>
          <li>
            <strong>🔍 Search</strong> every chat, organize with folders, and restore deletes from
            the <strong>🗑 Recycle Bin</strong> (kept 30 days).
          </li>
          <li>
            Toggle <strong>light/dark</strong> any time (top-right), and watch the token/cost
            estimate in the header.
          </li>
        </ul>
      </>
    ),
  },
];

export function OnboardingModal() {
  const open = useOnboardingStore((s) => s.open);
  const finish = useOnboardingStore((s) => s.finish);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const [step, setStep] = useState(0);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  const close = () => {
    setStep(0);
    finish();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-start justify-between px-6 pt-6">
          <div className="text-5xl">{s.emoji}</div>
          <button onClick={close} className="text-text-muted hover:text-text-primary" title="Skip">
            Skip
          </button>
        </div>

        <div className="px-6 py-4">
          <h2 className="text-xl font-semibold">{s.title}</h2>
          <div className="mt-2 text-sm leading-relaxed text-text-primary">{s.body}</div>
        </div>

        <div className="flex items-center justify-between border-t border-edge px-6 py-3">
          {/* Step dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-edge'}`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((v) => v - 1)}
                className="rounded-lg border border-edge px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
              >
                Back
              </button>
            )}
            {/* Quick jump to Settings on the relevant steps */}
            {(step === 1 || step === 2) && (
              <button
                onClick={() => {
                  close();
                  setSettingsOpen(true);
                }}
                className="rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
              >
                Open Settings
              </button>
            )}
            {isLast ? (
              <button
                onClick={close}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                Get started
              </button>
            ) : (
              <button
                onClick={() => setStep((v) => v + 1)}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
