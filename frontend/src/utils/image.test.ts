import { describe, it, expect, vi, beforeEach } from 'vitest';

const heicToMock = vi.fn();
vi.mock('heic-to', () => ({
  heicTo: (...args: unknown[]) => heicToMock(...args),
  isHeic: vi.fn(),
}));

import { prepareImageForCrop } from './image';

type MutableGlobal = typeof globalThis & {
  createImageBitmap: unknown;
  Image: unknown;
};

const g = globalThis as MutableGlobal;

describe('prepareImageForCrop', () => {
  beforeEach(() => {
    heicToMock.mockReset();

    g.createImageBitmap = vi.fn(async () => ({
      width: 1000,
      height: 800,
      close: vi.fn(),
    }));

    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
    ) as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(
      () => 'data:image/jpeg;base64,AAA',
    );

    // <img> fallback: fail fast so we never hang on a real network/decode.
    g.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    };
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  it('normalizes a regular JPEG to a JPEG data URL without converting', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
      type: 'image/jpeg',
    });

    const src = await prepareImageForCrop(file);

    expect(src).toBe('data:image/jpeg;base64,AAA');
    expect(heicToMock).not.toHaveBeenCalled();
  });

  it('converts HEIC files (iPhone) before decoding', async () => {
    heicToMock.mockResolvedValue(
      new Blob([new Uint8Array([9])], { type: 'image/jpeg' }),
    );
    const file = new File([new Uint8Array([1])], 'IMG_1234.HEIC', {
      type: '',
    });

    const src = await prepareImageForCrop(file);

    expect(heicToMock).toHaveBeenCalledTimes(1);
    expect(src).toBe('data:image/jpeg;base64,AAA');
  });

  it('throws a user-facing Spanish error when the image cannot be read', async () => {
    g.createImageBitmap = vi.fn(async () => {
      throw new Error('decode-failed');
    });
    heicToMock.mockRejectedValue(new Error('not heic'));
    const file = new File([new Uint8Array([1])], 'broken.jpg', {
      type: 'image/jpeg',
    });

    await expect(prepareImageForCrop(file)).rejects.toThrow(
      /No se pudo leer la imagen/,
    );
  });
});
