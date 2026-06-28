export function ImageGenResult({ url }: { url: string }) {
  const download = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `polyglot-image-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="mb-2">
      <img
        src={url}
        alt="generated"
        className="max-h-96 rounded-lg border border-white/10"
      />
      <button
        onClick={download}
        className="mt-1.5 rounded-md border border-white/10 px-2 py-1 text-xs text-text-muted hover:text-text-primary"
      >
        ⤓ Download
      </button>
    </div>
  );
}
