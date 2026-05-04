"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Bot, User } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 rounded-full bg-muted-foreground/60"
          style={{
            animation: "bounce-dot 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes bounce-dot {
          0%,
          80%,
          100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-6px);
          }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground border border-border/50"
        )}
      >
        {message.isTyping ? <TypingIndicator /> : message.content}
      </div>
    </div>
  );
}

export function ChatDemo() {
  const t = useTranslations("landing.demo");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showTyping, setShowTyping] = useState(false);
  const phaseRef = useRef(0);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const addTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const typeMessage = useCallback(
    (text: string, role: "user" | "assistant", onComplete: () => void) => {
      if (role === "user") {
        // User messages appear instantly
        setMessages((prev) => [...prev, { role, content: text }]);
        addTimeout(onComplete, 600);
        return;
      }

      // AI messages type out character by character
      let charIndex = 0;
      setMessages((prev) => [...prev, { role, content: "" }]);

      const typeChar = () => {
        charIndex++;
        const partial = text.slice(0, charIndex);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role, content: partial };
          return updated;
        });

        if (charIndex < text.length) {
          // Vary speed for natural feel
          const delay = text[charIndex] === " " ? 30 : 20;
          addTimeout(typeChar, delay);
        } else {
          addTimeout(onComplete, 800);
        }
      };

      addTimeout(typeChar, 40);
    },
    [addTimeout]
  );

  const runSequence = useCallback(() => {
    clearTimeouts();
    setMessages([]);
    setShowTyping(false);
    phaseRef.current++;
    const currentPhase = phaseRef.current;

    const isCancelled = () => phaseRef.current !== currentPhase;

    // Phase 1: User message 1
    addTimeout(() => {
      if (isCancelled()) return;
      typeMessage(t("userMessage1"), "user", () => {
        if (isCancelled()) return;

        // Phase 2: Show typing indicator, then AI response 1
        setShowTyping(true);
        addTimeout(() => {
          if (isCancelled()) return;
          setShowTyping(false);
          typeMessage(t("aiMessage1"), "assistant", () => {
            if (isCancelled()) return;

            // Phase 3: User message 2
            addTimeout(() => {
              if (isCancelled()) return;
              typeMessage(t("userMessage2"), "user", () => {
                if (isCancelled()) return;

                // Phase 4: Show typing indicator, then AI response 2
                setShowTyping(true);
                addTimeout(() => {
                  if (isCancelled()) return;
                  setShowTyping(false);
                  typeMessage(t("aiMessage2"), "assistant", () => {
                    if (isCancelled()) return;

                    // Wait, then loop
                    addTimeout(() => {
                      if (isCancelled()) return;
                      runSequence();
                    }, 4000);
                  });
                }, 1200);
              });
            }, 1000);
          });
        }, 1400);
      });
    }, 800);
  }, [t, typeMessage, addTimeout, clearTimeouts]);

  useEffect(() => {
    runSequence();
    return clearTimeouts;
  }, [runSequence, clearTimeouts]);

  return (
    <GlassCard className="w-full max-w-md overflow-hidden p-0">
      {/* Header bar */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Tariq AI</div>
          <div className="text-xs text-muted-foreground">Online</div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex min-h-[280px] flex-col gap-3 p-4">
        {messages.map((msg, i) => (
          <MessageBubble key={`${i}-${msg.content.length}`} message={msg} />
        ))}
        {showTyping && (
          <MessageBubble message={{ role: "assistant", content: "", isTyping: true }} />
        )}
      </div>

      {/* Fake input bar */}
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center rounded-full bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          Type a message...
        </div>
      </div>
    </GlassCard>
  );
}
