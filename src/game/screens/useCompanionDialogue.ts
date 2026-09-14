import { createSignal } from 'solid-js';
import type { DialogueMessage } from '~/game/config';

/**
 * Dialogue state management hook
 * Manages current message index, open/close state, display mode
 *
 * Usage:
 * const dialogue = useCompanionDialogue();
 * dialogue.show(messages, 'full');
 * dialogue.advance();
 * dialogue.close();
 */
export function useCompanionDialogue() {
  const [isOpen, setIsOpen] = createSignal(false);
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [messages, setMessages] = createSignal<DialogueMessage[]>([]);
  const [mode, setMode] = createSignal<'full' | 'circular'>('full');

  return {
    // Accessors
    isOpen,
    currentIndex,
    messages,
    mode,

    /**
     * Show dialogue with messages
     * @param newMessages - Array of dialogue messages
     * @param displayMode - Display mode ('full' or 'circular')
     */
    show: (newMessages: DialogueMessage[], displayMode: 'full' | 'circular' = 'full') => {
      setMessages(newMessages);
      setCurrentIndex(0);
      setMode(displayMode);
      setIsOpen(true);
    },

    /**
     * Advance to next message
     */
    advance: () => {
      const current = currentIndex();
      const allMessages = messages();
      if (current < allMessages.length - 1) {
        setCurrentIndex(current + 1);
      }
    },

    /**
     * Close dialogue and reset state
     */
    close: () => {
      setIsOpen(false);
      setCurrentIndex(0);
    },

    /**
     * Check if current message is the last one
     */
    isLastMessage: () => {
      const current = currentIndex();
      const allMessages = messages();
      return current >= allMessages.length - 1;
    },
  };
}
