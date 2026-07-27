import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useConfirm } from './useConfirm';

// Real timers with a tiny window: happy-dom's task manager doesn't play well
// with vi.useFakeTimers() inside Testing Library's act().
const TIMEOUT_MS = 20;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useConfirm', () => {
  it('no ejecuta la acción en la primera pulsación', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirm());

    act(() => result.current.press(action));

    expect(action).not.toHaveBeenCalled();
    expect(result.current.isArmed()).toBe(true);
  });

  it('ejecuta la acción en la segunda pulsación y se desarma', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirm());

    act(() => result.current.press(action));
    act(() => result.current.press(action));

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.isArmed()).toBe(false);
  });

  it('se desarma solo al pasar el timeout', async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirm({ timeoutMs: TIMEOUT_MS }));

    act(() => result.current.press(action));
    await act(() => wait(TIMEOUT_MS * 3));

    expect(result.current.isArmed()).toBe(false);

    // La siguiente pulsación vuelve a armar en lugar de ejecutar.
    act(() => result.current.press(action));
    expect(action).not.toHaveBeenCalled();
  });

  it('solo arma la fila pulsada cuando se usan claves', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirm());

    act(() => result.current.press(action, 'row-1'));

    expect(result.current.isArmed('row-1')).toBe(true);
    expect(result.current.isArmed('row-2')).toBe(false);

    // Pulsar otra fila desarma la anterior en lugar de ejecutarla.
    act(() => result.current.press(action, 'row-2'));

    expect(action).not.toHaveBeenCalled();
    expect(result.current.isArmed('row-1')).toBe(false);
    expect(result.current.isArmed('row-2')).toBe(true);
  });

  it('reset desarma sin ejecutar la acción', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useConfirm());

    act(() => result.current.press(action));
    act(() => result.current.reset());

    expect(action).not.toHaveBeenCalled();
    expect(result.current.isArmed()).toBe(false);
  });

  it('cancela el timer al desmontar para no actualizar estado de un componente muerto', async () => {
    const action = vi.fn();
    const { result, unmount } = renderHook(() => useConfirm({ timeoutMs: TIMEOUT_MS }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => result.current.press(action));
    unmount();
    await wait(TIMEOUT_MS * 3);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
