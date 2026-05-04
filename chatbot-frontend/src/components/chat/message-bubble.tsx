"use client";

import { memo, useState } from "react";
import { Copy, Check, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { Message } from "@/context/chat-context";

interface MessageBubbleProps {
  message: Message;
  /**
   * When true, suppress the entrance animation. Used for messages that already
   * exist on mount (e.g. history replay) so we don't replay fades during scroll
   * virtualization remounts.
   */
  disableAnimation?: boolean;
}

function MessageBubbleImpl({ message, disableAnimation = false }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={disableAnimation ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`group flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <span className="text-xs font-medium text-muted-foreground px-1">Tariq AI</span>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-ee-md"
              : "bg-card border border-border rounded-es-md"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  ul: ({ children }) => (
                    <ul className="mb-2 ms-4 list-disc space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-2 ms-4 list-decimal space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => <li>{children}</li>,
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div className="my-2 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                  tr: ({ children }) => (
                    <tr className="border-b border-border last:border-0">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-start font-medium">{children}</th>
                  ),
                  td: ({ children }) => <td className="px-3 py-2">{children}</td>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Copy button */}
        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Memoized so virtualizer remounts and `UPDATE_LAST_MESSAGE` token-append
 * dispatches only re-render the bubble whose `message` reference actually
 * changed. The reducer creates a new object for the streaming bubble each
 * token, while all prior bubbles keep stable references.
 */
export const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.disableAnimation === next.disableAnimation
  );
});
