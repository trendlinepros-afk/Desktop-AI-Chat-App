import { useRPStore } from '../../store/rpStore';

export function RPSidebar({
  onNewScene,
  onNewPersona,
  onEditPersona,
}: {
  onNewScene: () => void;
  onNewPersona: () => void;
  onEditPersona: (id: string) => void;
}) {
  const scenes = useRPStore((s) => s.scenes);
  const personas = useRPStore((s) => s.personas);
  const activeSceneId = useRPStore((s) => s.activeSceneId);
  const selectScene = useRPStore((s) => s.selectScene);

  return (
    <aside className="flex w-64 flex-col border-r border-edge bg-sidebar">
      {/* Conversations */}
      <div className="flex items-center justify-between px-3 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Conversations
        </h3>
        <button
          onClick={onNewScene}
          title="New conversation"
          className="rounded-md px-2 text-text-muted hover:text-text-primary"
        >
          ＋
        </button>
      </div>
      <div className="max-h-[45%] overflow-y-auto px-2 pb-2 pt-1">
        {scenes.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-text-muted">No conversations yet.</p>
        )}
        {scenes.map((s) => (
          <button
            key={s.id}
            onClick={() => selectScene(s.id)}
            className={`mb-1 flex w-full items-center gap-2 truncate rounded-lg px-2 py-2 text-left text-sm hover:bg-hover ${
              activeSceneId === s.id ? 'bg-hover' : ''
            }`}
          >
            <span>💬</span>
            <span className="flex-1 truncate">{s.name}</span>
          </button>
        ))}
      </div>

      <div className="mx-3 border-t border-edge" />

      {/* Personas */}
      <div className="flex items-center justify-between px-3 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Personas</h3>
        <button
          onClick={onNewPersona}
          title="New persona"
          className="rounded-md px-2 text-text-muted hover:text-text-primary"
        >
          ＋
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {personas.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-text-muted">
            No personas yet. Create one — including one marked “me”.
          </p>
        )}
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => onEditPersona(p.id)}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-hover"
          >
            <span className="text-lg leading-none">{p.avatar}</span>
            <span className="flex-1 truncate">{p.name}</span>
            {p.isMe && (
              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                ME
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
}
