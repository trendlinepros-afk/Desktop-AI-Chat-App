import { useEffect, useState } from 'react';
import { useRPStore } from '../../store/rpStore';

// A plain-text "director" steer: describe where the story should go (a mood
// change, a plot turn, a correction) and the characters continue, following it.
export function GuideModal({ onClose }: { onClose: () => void }) {
  const guideScene = useRPStore((s) => s.guideScene);
  const [text, setText] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = () => {
    if (!text.trim()) return;
    void guideScene(text.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">🎬 Guide the story</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
            }}
            placeholder="Describe the direction in plain text — e.g. 'The mood turns tense — Beth realizes Adam lied and gets angry' or 'Move the scene outside into a storm.'"
            rows={4}
            className="w-full resize-y rounded-lg border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-text-muted">
            This is an out-of-character instruction the characters will follow. It's saved in the
            conversation as a director note. (Ctrl/⌘+Enter to send)
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Apply direction
          </button>
        </div>
      </div>
    </div>
  );
}
