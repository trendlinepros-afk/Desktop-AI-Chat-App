import { useCallback, useRef } from 'react';
import type { Chat, ContentPart, Message } from '../types';
import { useChatStore } from '../store/chatStore';
import { useSettingsStore } from '../store/settingsStore';
import { useBrainStore } from '../store/brainStore';
import { useUIStore } from '../store/uiStore';
import { useChat, generateImage, completeText } from './useChat';
import { useVaultSearch } from './useVaultSearch';
import { useLinkedContext } from './useLinkedContext';
import { isImageRequest } from '../lib/suggestModel';

// Cap how much raw chat history we send each turn — bounds cost and avoids
// context-window overflow on long chats. System/context messages are added
// on top of this and are not counted here.
const MAX_HISTORY_MESSAGES = 24;

function makeMessage(chatId: string, role: Message['role'], content: ContentPart[]): Message {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chatId,
    role,
    content,
    createdAt: Date.now(),
  };
}

function trimHistory(history: Message[]): Message[] {
  if (history.length <= MAX_HISTORY_MESSAGES) return history;
  return history.slice(history.length - MAX_HISTORY_MESSAGES);
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
  const brainEnabled = useChatStore((s) => s.brainEnabled);
  const setActiveContext = useBrainStore((s) => s.setActiveContext);
  const loadNotes = useBrainStore((s) => s.loadNotes);
  const toast = useUIStore((s) => s.toast);

  // Throttle React state updates while streaming.
  const bufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build the leading system/context messages: per-chat system prompt, then
  // Brain vault context, then linked-chat context.
  const buildContext = useCallback(
    async (chat: Chat, historyForSearch: Message[]): Promise<Message[]> => {
      const context: Message[] = [];

      if (chat.systemPrompt && chat.systemPrompt.trim()) {
        context.push(makeMessage(chat.id, 'system', [{ type: 'text', text: chat.systemPrompt }]));
      }

      if (brainEnabled[chat.id] ?? true) {
        try {
          const { systemText, injected } = await buildBrainContext(historyForSearch, settings);
          setActiveContext(chat.id, injected);
          if (systemText) {
            context.push(makeMessage(chat.id, 'system', [{ type: 'text', text: systemText }]));
          }
        } catch (err) {
          console.warn('Brain context failed:', err);
        }
      }

      try {
        const linkedText = await buildLinkedContext(chat.id, chats);
        if (linkedText) {
          context.push(makeMessage(chat.id, 'system', [{ type: 'text', text: linkedText }]));
        }
      } catch (err) {
        console.warn('Linked context failed:', err);
      }

      return context;
    },
    [brainEnabled, buildBrainContext, buildLinkedContext, chats, settings, setActiveContext]
  );

  // Stream an assistant reply for an already-assembled message array, persisting
  // it and (optionally) auto-titling the chat.
  const streamReply = useCallback(
    async (chat: Chat, assembled: Message[], autoTitleFrom?: string) => {
      const isActive = () => useChatStore.getState().activeChatId === chat.id;

      const assistantMsg: Message = {
        ...makeMessage(chat.id, 'assistant', [{ type: 'text', text: '' }]),
        provider: chat.provider,
        modelVersion: chat.modelVersion,
      };
      addMessage(assistantMsg);

      bufferRef.current = '';
      flushTimerRef.current = setInterval(() => {
        if (isActive()) updateLastAssistant([{ type: 'text', text: bufferRef.current }]);
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
      if (isActive()) updateLastAssistant(finalContent);
      await window.polyglot.saveMessage({
        chatId: chat.id,
        role: 'assistant',
        content: finalContent,
        provider: chat.provider,
        modelVersion: chat.modelVersion,
      });
      // Re-sync from the DB so the store holds real row ids/timestamps (needed
      // for delete / regenerate / branch to target the right rows).
      await useChatStore.getState().reloadMessages(chat.id);

      if (autoTitleFrom && (chat.title === 'New Chat' || !chat.title)) {
        try {
          const titlePrompt = `Generate a concise 3-6 word title (no quotes, no trailing punctuation) for a conversation that starts with this user message:\n\n"${autoTitleFrom.slice(
            0,
            400
          )}"`;
          const title = (await completeText(chat.provider, chat.modelVersion, settings, titlePrompt))
            .trim()
            .replace(/^["']|["']$/g, '')
            .slice(0, 60);
          if (title) await renameChat(chat.id, title);
        } catch {
          await renameChat(chat.id, autoTitleFrom.slice(0, 40));
        }
      }

      loadNotes();
    },
    [addMessage, updateLastAssistant, sendMessage, settings, toast, renameChat, loadNotes]
  );

  // Generate an image (Imagen :predict) and post it as an assistant message;
  // surface failures as an in-chat assistant message too.
  const runImageGen = useCallback(
    async (chat: Chat, promptText: string) => {
      try {
        const { url, model } = await generateImage(settings.geminiApiKey, chat.modelVersion, promptText);
        const content: ContentPart[] = [{ type: 'image_url', image_url: { url } }];
        addMessage({ ...makeMessage(chat.id, 'assistant', content), provider: 'gemini', modelVersion: model });
        await window.polyglot.saveMessage({ chatId: chat.id, role: 'assistant', content, provider: 'gemini', modelVersion: model });
      } catch (err) {
        const msg = (err as Error).message || 'Image generation failed';
        const content: ContentPart[] = [{ type: 'text', text: `⚠️ Image generation failed: ${msg}` }];
        addMessage({ ...makeMessage(chat.id, 'assistant', content), provider: 'gemini' });
        await window.polyglot.saveMessage({ chatId: chat.id, role: 'assistant', content, provider: 'gemini' });
        toast(msg, 'error');
      }
      await useChatStore.getState().reloadMessages(chat.id);
    },
    [settings.geminiApiKey, addMessage, toast]
  );

  const send = useCallback(
    async (chat: Chat, parts: ContentPart[]) => {
      const userText = parts.find((p) => p.type === 'text')?.text ?? '';
      const store = useChatStore.getState();

      const userMsg = makeMessage(chat.id, 'user', parts);
      addMessage(userMsg);
      await window.polyglot.saveMessage({ chatId: chat.id, role: 'user', content: parts });

      // Read image mode from live state (a stale snapshot was sending image
      // requests through the text endpoint and 404ing on Imagen).
      const imageMode =
        chat.provider === 'gemini' &&
        (chat.modelVersion.startsWith('imagen') || (store.imageGenMode[chat.id] ?? false));

      if (imageMode) {
        await runImageGen(chat, userText);
        return;
      }

      // If it reads like an image request, offer to generate it (in-chat Yes/No)
      // rather than replying with a text description.
      if (userText.trim() && isImageRequest(userText)) {
        store.setImageOffer(chat.id, userText);
        return;
      }

      const history = [...messages, userMsg];
      const context = await buildContext(chat, history);
      const assembled = [...context, ...trimHistory(history)];
      await streamReply(chat, assembled, userText.trim() ? userText : undefined);
    },
    [addMessage, messages, buildContext, streamReply, runImageGen]
  );

  // Re-run the model against the current history (which must end with a user
  // message). Used by regenerate / edit after trailing messages are removed.
  const regenerate = useCallback(
    async (chat: Chat) => {
      const history = useChatStore.getState().messages.filter((m) => m.role !== 'system');
      if (history.length === 0) return;
      const context = await buildContext(chat, history);
      const assembled = [...context, ...trimHistory(history)];
      await streamReply(chat, assembled);
    },
    [buildContext, streamReply]
  );

  // Accept an in-chat image offer → switch to Imagen and generate.
  const confirmImageOffer = useCallback(
    async (chat: Chat, prompt: string) => {
      const store = useChatStore.getState();
      store.setImageOffer(chat.id, null);
      const model = 'gemini-2.0-flash-preview-image-generation';
      await store.setChatModel(chat.id, 'gemini', model);
      store.setImageGen(chat.id, true);
      await runImageGen({ ...chat, provider: 'gemini', modelVersion: model }, prompt);
    },
    [runImageGen]
  );

  // Decline → reply with a normal text answer to the prompt instead.
  const declineImageOffer = useCallback(
    async (chat: Chat) => {
      useChatStore.getState().setImageOffer(chat.id, null);
      await regenerate(chat);
    },
    [regenerate]
  );

  return { send, regenerate, confirmImageOffer, declineImageOffer, stop, isStreaming };
}
