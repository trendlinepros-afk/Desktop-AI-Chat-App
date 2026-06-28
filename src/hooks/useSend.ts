import { useCallback, useRef } from 'react';
import type { Chat, ContentPart, Message } from '../types';
import { useChatStore } from '../store/chatStore';
import { useSettingsStore } from '../store/settingsStore';
import { useBrainStore } from '../store/brainStore';
import { useUIStore } from '../store/uiStore';
import { useChat, generateImage } from './useChat';
import { useVaultSearch } from './useVaultSearch';
import { useLinkedContext } from './useLinkedContext';
import { completeText } from './useChat';

function makeMessage(
  chatId: string,
  role: Message['role'],
  content: ContentPart[]
): Message {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chatId,
    role,
    content,
    createdAt: Date.now(),
  };
}

export function useSend() {
  const { sendMessage, stop, isStreaming } = useChat();
  const { buildBrainContext } = useVaultSearch();
  const { buildLinkedContext } = useLinkedContext();

  const settings = useSettingsStore((s) => s.settings);
  const chats = useChatStore((s) => s.chats);
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateLastAssistant = useChatStore((s) => s.updateLastAssistant);
  const renameChat = useChatStore((s) => s.renameChat);
  const imageGenMode = useChatStore((s) => s.imageGenMode);
  const brainEnabled = useChatStore((s) => s.brainEnabled);
  const setActiveContext = useBrainStore((s) => s.setActiveContext);
  const loadNotes = useBrainStore((s) => s.loadNotes);
  const toast = useUIStore((s) => s.toast);

  // Throttle React state updates while streaming.
  const bufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const send = useCallback(
    async (chat: Chat, parts: ContentPart[]) => {
      const userText = parts.find((p) => p.type === 'text')?.text ?? '';

      // 1. Persist + show user message.
      const userMsg = makeMessage(chat.id, 'user', parts);
      addMessage(userMsg);
      await window.polyglot.saveMessage({ chatId: chat.id, role: 'user', content: parts });

      // ----- Image generation branch -----
      if (imageGenMode[chat.id] && chat.provider === 'gemini') {
        try {
          const dataUrl = await generateImage(
            settings.geminiApiKey,
            chat.modelVersion,
            userText
          );
          const content: ContentPart[] = [{ type: 'image_url', image_url: { url: dataUrl } }];
          addMessage(makeMessage(chat.id, 'assistant', content));
          await window.polyglot.saveMessage({ chatId: chat.id, role: 'assistant', content });
        } catch (err) {
          toast(`Image generation failed: ${(err as Error).message}`, 'error');
        }
        return;
      }

      // 2. Assemble context messages (brain → linked → history → new user).
      const contextMessages: Message[] = [];

      if (brainEnabled[chat.id] ?? true) {
        try {
          const { systemText, injected } = await buildBrainContext(
            [...messages, userMsg],
            settings
          );
          setActiveContext(chat.id, injected);
          if (systemText) {
            contextMessages.push(makeMessage(chat.id, 'system', [{ type: 'text', text: systemText }]));
          }
        } catch (err) {
          console.warn('Brain context failed:', err);
        }
      }

      try {
        const linkedText = await buildLinkedContext(chat.id, chats);
        if (linkedText) {
          contextMessages.push(makeMessage(chat.id, 'system', [{ type: 'text', text: linkedText }]));
        }
      } catch (err) {
        console.warn('Linked context failed:', err);
      }

      const assembled = [...contextMessages, ...messages, userMsg];

      // 3. Placeholder assistant message, then stream into it (throttled).
      const assistantMsg = makeMessage(chat.id, 'assistant', [{ type: 'text', text: '' }]);
      addMessage(assistantMsg);

      bufferRef.current = '';
      flushTimerRef.current = setInterval(() => {
        updateLastAssistant([{ type: 'text', text: bufferRef.current }]);
      }, 50);

      let finalText = '';
      try {
        finalText = await sendMessage({
          provider: chat.provider,
          modelVersion: chat.modelVersion,
          settings,
          messages: assembled,
          onToken: (full) => {
            bufferRef.current = full;
          },
        });
      } catch (err) {
        finalText = bufferRef.current || `⚠️ ${(err as Error).message}`;
        toast((err as Error).message, 'error');
      } finally {
        if (flushTimerRef.current) clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      const finalContent: ContentPart[] = [{ type: 'text', text: finalText }];
      updateLastAssistant(finalContent);
      await window.polyglot.saveMessage({
        chatId: chat.id,
        role: 'assistant',
        content: finalContent,
      });

      // 4. Auto-title from the first exchange.
      if ((chat.title === 'New Chat' || !chat.title) && userText.trim()) {
        try {
          const titlePrompt = `Generate a concise 3-6 word title (no quotes, no punctuation at the end) for a conversation that starts with this user message:\n\n"${userText.slice(
            0,
            400
          )}"`;
          const title = (
            await completeText(chat.provider, chat.modelVersion, settings, titlePrompt)
          )
            .trim()
            .replace(/^["']|["']$/g, '')
            .slice(0, 60);
          if (title) await renameChat(chat.id, title);
        } catch {
          await renameChat(chat.id, userText.slice(0, 40));
        }
      }

      // Refresh brain notes in case anything changed.
      loadNotes();
    },
    [
      addMessage,
      updateLastAssistant,
      sendMessage,
      buildBrainContext,
      buildLinkedContext,
      messages,
      chats,
      settings,
      imageGenMode,
      brainEnabled,
      setActiveContext,
      renameChat,
      toast,
      loadNotes,
    ]
  );

  return { send, stop, isStreaming };
}
