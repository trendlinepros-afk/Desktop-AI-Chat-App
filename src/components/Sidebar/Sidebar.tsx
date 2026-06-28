import { UncategorizedList } from './UncategorizedList';
import { FolderList } from './FolderList';
import { NewChatButton } from './NewChatButton';
import { NewFolderButton } from './NewFolderButton';
import { useBrainStore } from '../../store/brainStore';
import { useUIStore } from '../../store/uiStore';

export function Sidebar() {
  const toggleBrain = useBrainStore((s) => s.togglePanel);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  return (
    <aside className="flex h-full w-72 flex-shrink-0 flex-col border-r border-edge bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3.5">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span>🔮</span>
          <span>WICKED</span>
        </h1>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="rounded p-1.5 text-text-muted hover:bg-hover hover:text-text-primary"
        >
          ⚙️
        </button>
      </div>

      <div className="px-3">
        <NewChatButton />
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
        <UncategorizedList />
        <FolderList />
      </div>

      <div className="border-t border-edge px-3 py-2.5">
        <NewFolderButton />
        <button
          onClick={toggleBrain}
          className="mt-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-brain hover:bg-brain/10"
        >
          <span className="flex items-center gap-2">🧠 Brain Panel</span>
          <span>→</span>
        </button>
      </div>
    </aside>
  );
}
