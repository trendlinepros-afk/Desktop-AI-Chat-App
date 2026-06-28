import { useEffect, useState } from 'react';
import type { UpdateCheckResult } from '../types';

export function UpdateChecker() {
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    window.polyglot.getAppVersion().then(setVersion);
  }, []);

  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      const res = await window.polyglot.checkForUpdates();
      setResult(res);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 border-t border-edge bg-app px-4 py-2 text-xs text-text-muted">
      <span>WICKED v{version || '…'}</span>
      <button
        onClick={check}
        disabled={checking}
        className="rounded-md border border-edge px-2.5 py-1 text-text-muted transition hover:text-text-primary disabled:opacity-50"
      >
        {checking ? 'Checking…' : '⟳ Check for updates'}
      </button>

      {result && !result.error && (
        result.hasUpdate ? (
          <span className="flex items-center gap-2">
            <span className="text-accent">⬆ v{result.latest} available</span>
            <button
              onClick={async () => {
                const msg = await window.polyglot.installUpdate();
                setResult((r) => (r ? { ...r } : r));
                alert(msg);
              }}
              className="rounded-md bg-accent/20 px-2.5 py-1 text-accent hover:bg-accent/30"
            >
              ⤓ Install
            </button>
            <button
              onClick={() => window.polyglot.openExternal(result.url)}
              className="rounded-md border border-edge px-2.5 py-1 text-text-muted hover:text-text-primary"
            >
              download
            </button>
          </span>
        ) : (
          <span className="text-idea">
            ✓ You’re on the latest version
            {result.latest ? ` (v${result.latest})` : ''}
          </span>
        )
      )}
      {result?.error && (
        <span className="text-text-muted/70" title={result.error}>
          Couldn’t reach GitHub
        </span>
      )}
    </div>
  );
}
