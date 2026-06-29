// Shows a persona's profile pic if it has one, otherwise its emoji.
export function Avatar({
  emoji,
  image,
  size = 22,
  className = '',
}: {
  emoji: string;
  image?: string;
  size?: number;
  className?: string;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        style={{ width: size, height: size }}
        className={`inline-block shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      style={{ fontSize: Math.round(size * 0.9), lineHeight: 1 }}
      className={`inline-block shrink-0 leading-none ${className}`}
    >
      {emoji}
    </span>
  );
}
