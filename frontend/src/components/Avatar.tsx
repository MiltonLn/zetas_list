const API_URL = import.meta.env.VITE_API_URL || '/api';

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

const COLORS = [
  '#3b5bdb', '#e03131', '#2f9e44', '#e8590c',
  '#9c36b5', '#0c8599', '#d6336c', '#5c7cfa',
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function resolvePhotoUrl(url: string): string {
  if (url.startsWith('http')) return url;
  const base = API_URL.replace(/\/api\/?$/, '');
  return `${base}${url}`;
}

export function Avatar({ name, photoUrl, size = 32 }: { name: string; photoUrl?: string | null; size?: number }) {
  const fontSize = Math.round(size * 0.38);

  if (photoUrl) {
    return (
      <img
        src={resolvePhotoUrl(photoUrl)}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: hashColor(name),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize,
        fontWeight: 700,
        color: '#fff',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {getInitials(name)}
    </div>
  );
}
