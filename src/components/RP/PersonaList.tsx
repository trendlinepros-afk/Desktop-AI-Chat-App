import { useRPStore } from '../../store/rpStore';

export function PersonaList({
  onNew,
  onEdit,
}: {
  onNew: () => void;
  onEdit: (id: string) => void;
}) {
  const personas = useRPStore((s) => s.personas);
  const activeId = useRPStore((s) => s.activePersonaId);
  const selectPersona = useRPStore((s) => s.selectPersona);

  return (
    <aside className="flex w-64 flex-col border-r border-edge bg-sidebar">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          + New persona
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {personas.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-muted">
            No personas yet. Create one to start a role-play.
          </p>
        )}
        {personas.map((p) => (
          <div
            key={p.id}
            className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-hover ${
              activeId === p.id ? 'bg-hover' : ''
            }`}
            onClick={() => selectPersona(p.id)}
          >
            <span className="text-lg leading-none">{p.avatar}</span>
            <span className="flex-1 truncate">{p.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(p.id);
              }}
              title="Edit persona"
              className="opacity-0 transition group-hover:opacity-100 text-text-muted hover:text-text-primary"
            >
              ✏️
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
