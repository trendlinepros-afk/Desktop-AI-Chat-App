import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ChatWindow } from './components/Chat/ChatWindow';
import { UpdateChecker } from './components/UpdateChecker';
import { BrainPanel } from './components/Brain/BrainPanel';
import { SettingsModal } from './components/Settings/SettingsModal';
import { OnboardingModal } from './components/Onboarding/OnboardingModal';
import { Toaster } from './components/Toaster';
import { useSettingsStore } from './store/settingsStore';
import { useChatStore } from './store/chatStore';
import { useFolderStore } from './store/folderStore';
import { useBrainStore } from './store/brainStore';
import { useUIStore } from './store/uiStore';
import { useThemeStore } from './store/themeStore';
import { useOnboardingStore } from './store/onboardingStore';
import { useAutoMemory } from './hooks/useAutoMemory';

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadChats = useChatStore((s) => s.loadChats);
  const loadFolders = useFolderStore((s) => s.load);
  const loadNotes = useBrainStore((s) => s.loadNotes);
  const toggleBrainPanel = useBrainStore((s) => s.togglePanel);
  const panelOpen = useBrainStore((s) => s.panelOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const initTheme = useThemeStore((s) => s.init);
  const initOnboarding = useOnboardingStore((s) => s.init);

  // Scheduled auto-commit of chats to the memory vault.
  useAutoMemory();

  useEffect(() => {
    initTheme();
    initOnboarding();
    loadSettings();
    loadChats();
    loadFolders();
    loadNotes();
  }, [initTheme, initOnboarding, loadSettings, loadChats, loadFolders, loadNotes]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleBrainPanel();
      }
      if (e.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleBrainPanel, setSettingsOpen]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-text-primary">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatWindow />
        <UpdateChecker />
      </main>
      {panelOpen && <BrainPanel />}
      <SettingsModal />
      <OnboardingModal />
      <Toaster />
    </div>
  );
}
