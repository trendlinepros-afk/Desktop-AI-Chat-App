import { useRef, useState } from 'react';
import type { Chat, ContentPart } from '../../types';
import { useSend } from '../../hooks/useSend';
import { AttachmentPreview } from './AttachmentPreview';

export function InputArea({ chat }: { chat: Chat }) {
  const { send, stop, isStreaming } = useSend();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ContentPart[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 8 * 24) + 'px';
  };

  const onPaste = (e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            { type: 'image_url', image_url: { url: reader.result as string }, name: 'pasted-image' },
          ]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const onAttach = async () => {
    const file = await window.polyglot.openFileDialog();
    if (!file) return;
    if (file.mime.startsWith('image/')) {
      setAttachments((prev) => [
        ...prev,
        {
          type: 'image_url',
          image_url: { url: `data:${file.mime};base64,${file.data}` },
          name: file.name,
        },
      ]);
    } else {
      setAttachments((prev) => [
        ...prev,
        { type: 'file', name: file.name, mime: file.mime, data: file.data },
      ]);
    }
  };

  const doSend = () => {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    const parts: ContentPart[] = [];
    if (trimmed) parts.push({ type: 'text', text: trimmed });
    parts.push(...attachments);
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    send(chat, parts);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div className="border-t border-edge bg-chat px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <AttachmentPreview
          attachments={attachments}
          onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
        />
        <div className="flex items-end gap-2 rounded-xl border border-edge bg-surface px-2 py-1.5 focus-within:border-accent/60">
          <button
            onClick={onAttach}
            title="Attach a file"
            className="px-2 py-2 text-text-muted hover:text-text-primary"
          >
            📎
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoResize();
            }}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message… (Ctrl+Enter to send, paste images directly)"
            className="max-h-48 flex-1 resize-none bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          {isStreaming ? (
            <button
              onClick={stop}
              className="rounded-lg bg-red-500/80 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              ◼ Stop
            </button>
          ) : (
            <button
              onClick={doSend}
              disabled={!text.trim() && attachments.length === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
