import { useBrainStore } from '../../store/brainStore';

export function VaultContextBadge({ chatId }: { chatId: string }) {
  const injected = useBrainStore((s) => s.activeContext[chatId] ?? []);
  const openPanel = useBrainStore((s) => s.setPanelOpen);

  if (injected.length === 0) return null;

  return (
    <button
      onClick={() => openPanel(true)}
      title={injected.map((n) => n.title).join(', ')}
      className="flex items-center gap-1 rounded-full bg-brain/15 px-2 py-0.5 text-xs text-brain hover:bg-brain/25"
    >
      🧠 {injected.length} {injected.length === 1 ? 'note' : 'notes'} injected
    </button>
  );
}
