import { onBeforeUnmount, onMounted } from "vue";

/**
 * Global keyboard shortcuts.
 *
 * Bindings are ignored while the user is typing, so a search box never swallows a shortcut and a
 * shortcut never eats a character. Escape is the exception: closing whatever is open is exactly
 * what a user wants while focused in a field.
 */

export interface Shortcut {
  /** Lower-case `event.key`, e.g. `"f"`, `"escape"`, `"1"`. */
  key: string;
  /** Requires Ctrl on Windows and Linux, Cmd on macOS. */
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Fires even while a text field has focus. */
  allowInInput?: boolean;
  run: (event: KeyboardEvent) => void;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

const matches = (shortcut: Shortcut, event: KeyboardEvent): boolean => {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  // Cmd on macOS maps to the same intent as Ctrl elsewhere, so either satisfies `ctrl`.
  const control = event.ctrlKey || event.metaKey;
  if (Boolean(shortcut.ctrl) !== control) return false;
  if (Boolean(shortcut.shift) !== event.shiftKey) return false;
  if (Boolean(shortcut.alt) !== event.altKey) return false;
  return true;
};

/** Registers shortcuts for the lifetime of the calling component. */
export function useShortcuts(shortcuts: Shortcut[]) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    const typing = isTypingTarget(event.target);

    for (const shortcut of shortcuts) {
      if (typing && !shortcut.allowInInput) continue;
      if (!matches(shortcut, event)) continue;
      event.preventDefault();
      shortcut.run(event);
      return;
    }
  };

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
}
