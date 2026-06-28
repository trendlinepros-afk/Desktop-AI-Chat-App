import { useState } from 'react';
import type { Folder } from '../../types';
import { useFolderStore } from '../../store/folderStore';
import { useChatStore } from '../../store/chatStore';
import { ChatListItem } from './ChatListItem';

export function FolderItem({ folder }: { folder: Folder }) {
  const expanded = useFolderStore((s) => s.expanded[folder.id] ?? false);
  const toggle = useFolderStore((s) => s.toggleExpanded);
  const renameFolder = useFolderStore((s) => s.renameFolder);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);
  const chats = useChatStore((s) => s.chats);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  const folderChats = chats.filter((c) => c.folderId === folder.id);

  const submitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== folder.name) renameFolder(folder.id, trimmed);
    setRenaming(false);
  };

  return (
    <div>
      <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-white/5">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="w-full rounded border border-accent bg-surface px-1.5 py-0.5 text-sm outline-none"
          />
        ) : (
          <>
            <button
              onClick={() => toggle(folder.id)}
              className="flex flex-1 items-center gap-1.5 text-left text-sm text-text-primary"
            >
              <span className="text-text-muted">{expanded ? '▾' : '▸'}</span>
              <span>📁</span>
              <span className="truncate">{folder.name}</span>
              <span className="text-xs text-text-muted">{folderChats.length || ''}</span>
            </button>
            <span
              role="button"
              title="Rename"
              onClick={() => {
                setDraft(folder.name);
                setRenaming(true);
              }}
              className="opacity-0 transition group-hover:opacity-100 px-1 text-text-muted hover:text-text-primary"
            >
              ✎
            </span>
            <span
              role="button"
              title="Delete folder (chats move to Uncategorized)"
              onClick={() => deleteFolder(folder.id)}
              className="opacity-0 transition group-hover:opacity-100 px-1 text-text-muted hover:text-red-400"
            >
              🗑
            </span>
          </>
        )}
      </div>

      {expanded && (
        <div className="ml-4 space-y-0.5 border-l border-white/5 pl-2">
          {folderChats.length === 0 ? (
            <div className="px-2 py-1 text-xs text-text-muted/60">Empty</div>
          ) : (
            folderChats.map((chat) => <ChatListItem key={chat.id} chat={chat} />)
          )}
        </div>
      )}
    </div>
  );
}
