import { useState } from 'react';
import type { Chat } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { useFolderStore } from '../../store/folderStore';
import { useUIStore } from '../../store/uiStore';
import { providerColor } from '../ModelSelector/modelConfig';
import { exportChat } from '../../lib/exportChat';

export function ChatListItem({ chat }: { chat: Chat }) {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const selectChat = useChatStore((s) => s.selectChat);
  const renameChat = useChatStore((s) => s.renameChat);
  const moveChat = useChatStore((s) => s.moveChat);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const folders = useFolderStore((s) => s.folders);
  const toast = useUIStore((s) => s.toast);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(chat.title);

  const active = activeChatId === chat.id;

  const submitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== chat.title) renameChat(chat.id, trimmed);
    setRenaming(false);
  };

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={submitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitRename();
          if (e.key === 'Escape') setRenaming(false);
        }}
        className="w-full rounded-md border border-accent bg-surface px-2 py-1.5 text-sm outline-none"
      />
    );
  }

  return (
    <div className="group relative">
      <button
        onClick={() => selectChat(chat.id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
          active ? 'bg-accent/15 text-text-primary' : 'text-text-muted hover:bg-white/5'
        }`}
      >
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: providerColor(chat.provider) }}
        />
        <span className="truncate flex-1">{chat.title}</span>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="opacity-0 transition group-hover:opacity-100 px-1 text-text-muted hover:text-text-primary"
        >
          ⋯
        </span>
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-white/10 bg-topbar py-1 text-sm shadow-xl">
            <MenuItem
              label="Rename"
              onClick={() => {
                setDraft(chat.title);
                setRenaming(true);
                setMenuOpen(false);
              }}
            />
            <div className="px-3 py-1 text-xs text-text-muted">Move to folder</div>
            <MenuItem
              label="— Uncategorized"
              onClick={() => {
                moveChat(chat.id, null);
                setMenuOpen(false);
              }}
            />
            {folders.map((f) => (
              <MenuItem
                key={f.id}
                label={`📁 ${f.name}`}
                onClick={() => {
                  moveChat(chat.id, f.id);
                  setMenuOpen(false);
                }}
              />
            ))}
            <div className="my-1 border-t border-white/5" />
            <MenuItem
              label="Export as Markdown"
              onClick={async () => {
                setMenuOpen(false);
                const path = await exportChat(chat, 'markdown');
                if (path) toast(`Exported → ${path}`, 'success');
              }}
            />
            <MenuItem
              label="Export as PDF"
              onClick={async () => {
                setMenuOpen(false);
                const path = await exportChat(chat, 'pdf');
                if (path) toast(`Exported → ${path}`, 'success');
              }}
            />
            <div className="my-1 border-t border-white/5" />
            <MenuItem
              label="Delete"
              danger
              onClick={() => {
                deleteChat(chat.id);
                setMenuOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-white/5 ${
        danger ? 'text-red-400' : 'text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}
