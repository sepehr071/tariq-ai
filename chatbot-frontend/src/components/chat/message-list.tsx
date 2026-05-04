"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Message } from "@/context/chat-context";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
}

const ESTIMATED_ROW_HEIGHT = 80;
const STICK_TO_BOTTOM_THRESHOLD = 100;

/**
 * Virtualized message list using @tanstack/react-virtual.
 *
 * Behavior parity with the previous flat `messages.map(...)` render:
 * - Auto-scrolls to bottom on new message / streaming token append, but only
 *   when the user is already at the bottom (within STICK_TO_BOTTOM_THRESHOLD).
 *   If the user scrolled up to read older messages, we don't yank them down.
 * - Renders the typing indicator as a virtual row when it should appear
 *   (assistant hasn't started streaming yet for the current turn).
 * - Variable row heights are measured by `measureElement` after mount.
 *
 * RTL note: the virtualizer scrolls vertically only — `dir` on ancestors
 * doesn't affect Y-axis behavior, so this works for both `fa` and `en`.
 */
export function MessageList({ messages, isTyping }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastMessageCountRef = useRef(messages.length);
  const lastMessageIdRef = useRef<string | null>(
    messages[messages.length - 1]?.id ?? null
  );

  // Mark any message present on first render as "no entrance animation" — we
  // only want the staggered fade-in for messages that arrive after mount.
  // Captured once and never updated; new messages added later will animate.
  const [initialIds] = useState<Set<string>>(
    () => new Set(messages.map((m) => m.id))
  );

  const showTyping =
    isTyping && messages[messages.length - 1]?.role !== "assistant";

  // Virtual rows = messages + (optional) trailing typing indicator.
  const rowCount = messages.length + (showTyping ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    getItemKey: (index) => {
      if (index < messages.length) return messages[index].id;
      return "__typing__";
    },
  });

  // Track whether the user is pinned to the bottom, so we know whether to
  // auto-scroll on new content.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - (el.scrollTop + el.clientHeight);
      stickToBottomRef.current =
        distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD;
    };

    // Establish initial state on mount.
    onScroll();

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Auto-scroll to bottom when a new message arrives, the last assistant
  // message updates (streaming token append), or the typing indicator toggles
  // — but only if the user was already at the bottom.
  const lastMessage = messages[messages.length - 1];
  const lastMessageContentLen = lastMessage?.content.length ?? 0;
  const lastMessageId = lastMessage?.id ?? null;

  useLayoutEffect(() => {
    if (rowCount === 0) return;

    const isNewMessage =
      messages.length !== lastMessageCountRef.current ||
      lastMessageId !== lastMessageIdRef.current;

    lastMessageCountRef.current = messages.length;
    lastMessageIdRef.current = lastMessageId;

    if (!stickToBottomRef.current && !isNewMessage) {
      // User has scrolled up and we're just streaming tokens into an existing
      // bubble — don't yank them back down.
      return;
    }

    // A brand-new message always pulls the viewport down; the user explicitly
    // sent it (or AI just started replying).
    if (isNewMessage) {
      stickToBottomRef.current = true;
    }

    virtualizer.scrollToIndex(rowCount - 1, { align: "end" });
  }, [
    rowCount,
    lastMessageContentLen,
    lastMessageId,
    showTyping,
    virtualizer,
    messages.length,
  ]);

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Memoize the virtual content so the outer wrapper doesn't allocate fresh
  // children when only scroll position changes.
  const rendered = useMemo(() => {
    return items.map((virtualRow) => {
      const isTypingRow = virtualRow.index >= messages.length;
      const message = isTypingRow ? null : messages[virtualRow.index];

      return (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={virtualizer.measureElement}
          className="absolute top-0 inset-x-0 px-4"
          style={{
            transform: `translateY(${virtualRow.start}px)`,
          }}
        >
          <div className="max-w-3xl mx-auto py-2">
            {isTypingRow ? (
              <TypingIndicator />
            ) : message ? (
              <MessageBubble
                message={message}
                disableAnimation={initialIds.has(message.id)}
              />
            ) : null}
          </div>
        </div>
      );
    });
    // virtualizer.measureElement is stable; items references change on scroll
    // and on size remeasure, which is exactly when we want to re-render.
  }, [items, messages, virtualizer, initialIds]);

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div
        className="relative w-full pb-24 pt-6"
        style={{ height: `${totalSize}px` }}
      >
        {rendered}
      </div>
    </div>
  );
}
