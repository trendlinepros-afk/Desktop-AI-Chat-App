import { useMemo, useState } from 'react';
import type { Chat, ContentPart } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { suggestModel, isImageRequest } from '../../lib/suggestModel';
import { providerColor } from '../ModelSelector/modelConfig';
import { useSend } from '../../hooks/useSend';

const IMAGEN_MODEL = 'imagen-3.0-generate-002';

function partText(content: ContentPart[]): string {
  return content.filter((p) => p.type === 'text').map((p) => p.text ?? '').join('\n');
}

export function SuggestionBanner({ chat }: { chat: Chat }) {
  const messages = useChatStore((s) => s.messages);
  const setChatModel = useChatStore((s) => s.setChatModel);
  const setImageGen = useChatStore((s) => s.setImageGen);
  const imageGenOn = useChatStore((s) => s.imageGenMode[chat.id] ?? false);
  const { send } = useSend();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const firstUser = useMemo(() => messages.find((m) => m.role === 'user'), [messages]);
  const lastUser = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user'),
    [messages]
  );
  const suggestion = useMemo(
    () => (firstUser ? suggestModel(firstUser.content) : null),
    [firstUser]
  );
  const assistantCount = messages.filter((m) => m.role === 'assistant').length;

  // ---- Image-generation prompt (can appear any time, incl. mid-chat) ----
  const wantsImage = lastUser ? isImageRequest(partText(lastUser.content)) : false;
  if (wantsImage && !imageGenOn && dismissed !== lastUser!.id) {
    const generate = () => {
      const updated: Chat = { ...chat, provider: 'gemini', modelVersion: IMAGEN_MODEL };
      setChatModel(chat.id, 'gemini', IMAGEN_MODEL);
      setImageGen(chat.id, true);
      send(updated, [{ type: 'text', text: partText(lastUser!.content) }]);
      setDismissed(lastUser!.id);
    };
    return (
      <Banner
        color={providerColor('gemini')}
        reason="Looks like you want an actual image — generate it with Imagen?"
        actionLabel="🎨 Generate image"
        onAction={generate}
        onDismiss={() => setDismissed(lastUser!.id)}
      />
    );
  }

  // ---- First-message model suggestion (general) ----
  if (!firstUser || assistantCount > 1 || !suggestion) return null;
  if (suggestion.modelVersion.startsWith('imagen')) return null; // handled above
  if (suggestion.provider === chat.provider && suggestion.modelVersion === chat.modelVersion) {
    return null;
  }
  if (dismissed === chat.id) return null;

  return (
    <Banner
      color={providerColor(suggestion.provider)}
      reason={suggestion.reason}
      actionLabel={`Switch to ${suggestion.label}`}
      onAction={() => {
        setChatModel(chat.id, suggestion.provider, suggestion.modelVersion);
        setDismissed(chat.id);
      }}
      onDismiss={() => setDismissed(chat.id)}
    />
  );
}

function Banner({
  color,
  reason,
  actionLabel,
  onAction,
  onDismiss,
}: {
  color: string;
  reason: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mx-auto mt-3 flex w-full max-w-3xl items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 text-text-primary">{reason}</span>
      <button
        onClick={onAction}
        className="flex-shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90"
      >
        {actionLabel}
      </button>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-text-muted hover:text-text-primary"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
