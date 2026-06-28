import { useChatStore } from '../../store/chatStore';
import { ChatListItem } from './ChatListItem';

export function UncategorizedList() {
  const chats = useChatStore((s) => s.chats);
  const uncategorized = chats.filter((c) => !c.folderId);

  return (
    <div className="mb-3">
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Uncategorized
      </div>
      {uncategorized.length === 0 ? (
        <div className="px-2 py-1 text-xs text-text-muted/60">No chats yet</div>
      ) : (
        <div className="space-y-0.5">
          {uncategorized.map((chat) => (
            <ChatListItem key={chat.id} chat={chat} />
          ))}
        </div>
      )}
    </div>
  );
}
