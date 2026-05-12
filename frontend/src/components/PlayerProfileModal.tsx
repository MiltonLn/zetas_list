import { useState, useMemo } from 'react';
import { Avatar, resolvePhotoUrl } from './Avatar';
import { POSITION_LABELS, GENDER_LABELS } from '../types';
import type { Position, Gender } from '../types';

export interface ProfileUser {
  name: string;
  username: string;
  phone: string;
  position?: Position;
  gender?: Gender;
  heightCm?: number;
  birthDate?: string;
  photoUrl?: string;
  bio?: string;
}

interface ListInfo {
  position: number;
  isWaitingList: boolean;
  fromWaitList: boolean;
}

interface Props {
  user: ProfileUser;
  listInfo?: ListInfo;
  onClose: () => void;
}

export function PlayerProfileModal({ user: u, listInfo, onClose }: Props) {
  const [fullPhoto, setFullPhoto] = useState<string | null>(null);

  const age = useMemo(
    () =>
      u.birthDate
        ? Math.floor((Date.now() - new Date(u.birthDate).getTime()) / 31557600000)
        : null,
    [u.birthDate],
  );
  const genderLabel = u.gender ? GENDER_LABELS[u.gender] : null;

  const infoItems: { label: string; value: string }[] = [];
  if (u.position) infoItems.push({ label: 'Posición', value: POSITION_LABELS[u.position] || u.position });
  if (u.heightCm) infoItems.push({ label: 'Estatura', value: `${u.heightCm} cm` });
  if (age !== null) infoItems.push({ label: 'Edad', value: `${age} años` });
  if (genderLabel) infoItems.push({ label: 'Género', value: genderLabel });
  infoItems.push({ label: 'Teléfono', value: u.phone });
  if (listInfo) {
    infoItems.push({
      label: 'En la lista',
      value: `#${listInfo.position} ${listInfo.isWaitingList ? '(Espera)' : '(Principal)'}`,
    });
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300, padding: 16,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#1a1d38', borderRadius: 16, width: '100%', maxWidth: 340,
            maxHeight: '85vh', overflow: 'auto', padding: 24,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div
              onClick={() => u.photoUrl && setFullPhoto(resolvePhotoUrl(u.photoUrl))}
              style={{ cursor: u.photoUrl ? 'pointer' : 'default' }}
            >
              <Avatar name={u.name} photoUrl={u.photoUrl} size={88} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#e8eaf6', fontSize: 18, fontWeight: 700, margin: 0 }}>{u.name}</p>
              <p style={{ color: '#7c8db5', fontSize: 13, margin: '4px 0 0' }}>@{u.username}</p>
            </div>
            {u.bio && (
              <p style={{
                color: '#a0aec0', fontSize: 13, margin: '4px 0 0',
                fontStyle: 'italic', textAlign: 'center', lineHeight: 1.5,
                maxWidth: 280,
              }}>
                &ldquo;{u.bio}&rdquo;
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {infoItems.map((item) => (
              <div key={item.label} style={{ background: '#141627', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ color: '#7c8db5', fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {item.label}
                </p>
                <p style={{ color: '#e8eaf6', fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>
                  {item.value}
                </p>
              </div>
            ))}
            {listInfo?.fromWaitList && (
              <div style={{ background: '#141627', borderRadius: 10, padding: '10px 14px', gridColumn: '1 / -1' }}>
                <p style={{ color: '#e3a008', fontSize: 13, margin: 0 }}>↑ Promovido desde lista de espera</p>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13,
              background: '#141627', border: '1px solid #2a2f5a',
              color: '#7c8db5', cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>

      {fullPhoto && (
        <div
          onClick={() => setFullPhoto(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 500, cursor: 'pointer', padding: 24,
          }}
        >
          <img
            src={fullPhoto}
            alt="Foto"
            style={{
              maxWidth: '100%', maxHeight: '85vh', borderRadius: 12,
              objectFit: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}
    </>
  );
}
