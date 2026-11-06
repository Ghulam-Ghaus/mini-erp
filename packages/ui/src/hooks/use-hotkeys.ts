import { useEffect } from 'react';

export interface HotkeyBinding {
  /** Key code such as 'b', 'n', 's', 'p', 'k', or 'Escape'. Case-insensitive. */
  readonly key: string;
  /** Require Ctrl (or Cmd on macOS). Default false. */
  readonly ctrlOrMeta?: boolean;
  /** Whether to fire even when focus is inside an input/textarea/select. */
  readonly allowInInput?: boolean;
  readonly handler: (event: KeyboardEvent) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function matchesHotkey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  binding: Pick<HotkeyBinding, 'key' | 'ctrlOrMeta'>,
): boolean {
  if (event.altKey) return false;
  const hasMod = Boolean(event.ctrlKey || event.metaKey);
  if (Boolean(binding.ctrlOrMeta) !== hasMod) return false;
  return event.key.toLowerCase() === binding.key.toLowerCase();
}

/**
 * Registers global keyboard shortcuts (`Ctrl+B`, `Ctrl+N`, `Ctrl+S`, `Ctrl+P`, `Ctrl+K`, `Esc`).
 */
export function useHotkeys(bindings: readonly HotkeyBinding[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const inInput = isEditableTarget(event.target);
      for (const binding of bindings) {
        if (!matchesHotkey(event, binding)) continue;
        // Ctrl+S, Ctrl+B, Ctrl+K, Ctrl+P, and Escape work even while focused inside form fields
        const allowedInInput =
          binding.allowInInput ??
          (Boolean(binding.ctrlOrMeta) || binding.key.toLowerCase() === 'escape');
        if (inInput && !allowedInInput) continue;
        event.preventDefault();
        binding.handler(event);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings, enabled]);
}
