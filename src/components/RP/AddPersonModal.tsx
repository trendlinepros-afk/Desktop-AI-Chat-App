import { useEffect } from 'react';
import { useRPStore } from '../../store/rpStore';
import { Avatar } from './Avatar';

// Quick "add another person to the conversation" picker, opened from the chat
// header. Adding a character drops them into the active scene immediately and
// they enter with a line of their own.
export function AddPersonModal({
  onClose,
  onCreateNew,
}: {
  onClose: () => void;
  onCreateNew: () => void;
}) {
  const personas = useRPStore((s) => s.personas);
  const memberIds = useRPStore((s) => s.memberIds);
  const addPersonToScene = useRPStore((s) => s.addPersonToScene);

  // Anyone not already in the scene and not your "me" persona.
  const available = personas.filter((p) => !p.isMe && !memberIds.includes(p.id));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const add = async (id: string) => {
    await addPersonToScene(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-edge bg-topbar shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="font-semibold">Add another person</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {available.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-text-muted">
              Everyone's already here. Create a new persona to add someone new.
            </p>
          ) : (
            available.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p.id)}
                className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-hover"
              >
                <Avatar emoji={p.avatar} image={p.avatarImage || undefined} size={22} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-accent">Add →</span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-edge px-5 py-3">
          <button
            onClick={() => {
              onClose();
              onCreateNew();
            }}
            className="w-full rounded-lg border border-edge px-3 py-2 text-sm text-text-muted hover:text-text-primary"
          >
            ＋ Create a new persona
          </button>
        </div>
      </div>
    </div>
  );
}
