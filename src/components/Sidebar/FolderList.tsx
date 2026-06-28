import { useFolderStore } from '../../store/folderStore';
import { FolderItem } from './FolderItem';

export function FolderList() {
  const folders = useFolderStore((s) => s.folders);

  if (folders.length === 0) return null;

  return (
    <div>
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Folders
      </div>
      <div className="space-y-0.5">
        {folders.map((folder) => (
          <FolderItem key={folder.id} folder={folder} />
        ))}
      </div>
    </div>
  );
}
