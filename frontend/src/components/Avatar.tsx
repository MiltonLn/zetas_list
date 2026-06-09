import { BASE_URL } from '../services/api';

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

// eslint-disable-next-line react-refresh/only-export-components
export function resolvePhotoUrl(url: string): string {
  // Already an absolute URL (e.g. future CDN/GCS migration).
  if (url.startsWith('http')) return url;
  // Relative paths (/uploads/...) need the backend origin prepended.
  // In Docker dev, VITE_API_URL=http://localhost:3000/api so base becomes
  // http://localhost:3000 and the browser hits the backend directly (port
  // is mapped). In prod, VITE_API_URL points to the same domain that serves
  // the SPA, so the absolute URL is also correct.
  const base = BASE_URL.replace(/\/api\/?$/, '');
  return base ? `${base}${url}` : url;
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
