import { useEffect, useState } from 'react';
import type { ComfyStatus } from '../../types';
import { useUIStore } from '../../store/uiStore';

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

// Status chip + load/unload controls for the user's local ComfyUI instance,
// shown in the RP studio top bar. Polls while the studio is open.
export function ComfyBar() {
  const toast = useUIStore((s) => s.toast);
  const [status, setStatus] = useState<ComfyStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'load' | 'unload'>('');

  useEffect(() => {
    let alive = true;
    const poll = () =>
      window.polyglot.comfyGetStatus().then((s) => {
        if (alive) setStatus(s);
      });
    poll();
    // 4s keeps the "Starting…" → ready transition snappy; the call is local.
    const t = setInterval(poll, 4_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!status) return null;

  if (!status.reachable) {
    // WICKED launched it and it's still booting (~10-30s).
    if (status.processRunning) {
      return (
        <span
          title="ComfyUI is starting in the background…"
          className="animate-pulse rounded-lg border border-edge px-2 py-1 text-xs text-text-muted"
        >
          🎨 Starting…
        </span>
      );
    }
    // Managed but not running (crashed or stopped) — offer a restart.
    if (status.managed) {
      return (
        <div
          title={status.lastLog || 'ComfyUI is not running'}
          className="flex items-center gap-1 rounded-lg border border-edge px-2 py-1 text-xs"
        >
          <span className="text-text-muted">🎨 Images: stopped</span>
          <button
            onClick={() => {
              void window.polyglot.comfyLaunch();
              toast('Starting ComfyUI…', 'info');
            }}
            className="rounded px-1.5 py-0.5 text-accent hover:bg-accent/10"
          >
            ▶ Start
          </button>
        </div>
      );
    }
    return (
      <span
        title="Start ComfyUI to enable local image generation — or set a launch path in RP Settings → Local images so WICKED starts it for you"
        className="rounded-lg border border-edge px-2 py-1 text-xs text-text-muted/70"
      >
        🎨 Images: off
      </span>
    );
  }

  const used = status.vramTotal - status.vramFree;

  const load = async () => {
    setBusy('load');
    try {
      await window.polyglot.comfyLoadModel();
      toast('Image model loaded into VRAM', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const unload = async () => {
    setBusy('unload');
    try {
      await window.polyglot.comfyFreeVram();
      toast('VRAM freed', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-edge px-2 py-1 text-xs">
      <span title={status.deviceName} className="text-text-muted">
        🎨 VRAM {gb(used)}/{gb(status.vramTotal)} GB
      </span>
      <button
        onClick={load}
        disabled={!!busy}
        title="Warm the image model into VRAM so the first generation is fast"
        className="rounded px-1.5 py-0.5 text-accent hover:bg-accent/10 disabled:opacity-50"
      >
        {busy === 'load' ? '…' : 'Load'}
      </button>
      <button
        onClick={unload}
        disabled={!!busy}
        title="Unload models and free VRAM (e.g. before running a local LLM)"
        className="rounded px-1.5 py-0.5 text-text-muted hover:bg-hover hover:text-text-primary disabled:opacity-50"
      >
        {busy === 'unload' ? '…' : 'Unload'}
      </button>
    </div>
  );
}
