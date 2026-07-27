import { useCallback, useEffect, useRef, useState } from 'react';

type ConfirmKey = string | number;

/** Key used when a hook instance guards a single action, so callers can omit it. */
const SINGLE_TARGET = '__single__';

interface UseConfirmResult {
  /** True while `key` is armed, i.e. the next press will run the action. */
  isArmed: (key?: ConfirmKey) => boolean;
  /**
   * Arms `key` on the first press and runs `action` on the second one, as long
   * as it happens within the timeout. Pass `key` when one hook instance guards
   * several rows so that arming one row disarms the others.
   */
  press: (action: () => void, key?: ConfirmKey) => void;
  /** Disarms without running the action (e.g. after the row disappears). */
  reset: () => void;
}

/**
 * Two-press confirmation for destructive buttons: the first press turns the
 * button into a "¿Seguro?" state that auto-expires, avoiding a blocking
 * `confirm()` dialog.
 */
export function useConfirm({ timeoutMs = 3000 }: { timeoutMs?: number } = {}): UseConfirmResult {
  const [armedKey, setArmedKey] = useState<ConfirmKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Without this, a row unmounted while armed leaves a timer that fires setState
  // on a dead component.
  useEffect(() => clearTimer, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setArmedKey(null);
  }, [clearTimer]);

  const press = useCallback(
    (action: () => void, key: ConfirmKey = SINGLE_TARGET) => {
      if (armedKey === key) {
        reset();
        action();
        return;
      }
      clearTimer();
      setArmedKey(key);
      timer.current = setTimeout(() => setArmedKey(null), timeoutMs);
    },
    [armedKey, clearTimer, reset, timeoutMs],
  );

  const isArmed = useCallback(
    (key: ConfirmKey = SINGLE_TARGET) => armedKey === key,
    [armedKey],
  );

  return { isArmed, press, reset };
}
