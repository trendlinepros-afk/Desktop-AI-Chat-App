import { useChatStore } from '../../store/chatStore';
import { useSettingsStore } from '../../store/settingsStore';
import { defaultVersionFor } from '../ModelSelector/modelConfig';

export function NewChatButton() {
  const createChat = useChatStore((s) => s.createChat);
  const settings = useSettingsStore((s) => s.settings);

  const onClick = () => {
    const provider = settings.defaultProvider;
    const version = settings.defaultModelVersion || defaultVersionFor(provider);
    createChat(provider, version, null);
  };

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
    >
      <span className="text-base leading-none">+</span> New Chat
    </button>
  );
}
