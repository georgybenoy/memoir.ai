'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils/cn';

export interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Renders Markdown safely without allowing raw HTML or script execution.
 * Source of truth: AGENTS.md Security Rules ("Never use dangerouslySetInnerHTML. No raw HTML in markdown rendering.")
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className }) => {
  return (
    <div
      className={cn(
        'prose prose-invert max-w-none text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)]',
        'break-words select-text',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mt-4 mb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mt-3 mb-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mt-2 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2 pl-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2 pl-2">{children}</ol>,
          li: ({ children }) => <li className="text-[var(--text-secondary)]">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
          em: ({ children }) => <em className="italic text-[var(--text-primary)]">{children}</em>,
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--accent-cyan)] font-mono text-xs border border-[var(--border-color)]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="p-3 my-2 rounded-lg bg-[var(--surface)] border border-[var(--border-color)] overflow-x-auto text-xs font-mono text-[var(--text-primary)]">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--primary)] pl-3 my-2 text-[var(--text-muted)] italic">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => {
            const isSafe = href && /^https?:\/\//i.test(href);
            return (
              <a
                href={isSafe ? href : '#'}
                target={isSafe ? '_blank' : undefined}
                rel={isSafe ? 'noopener noreferrer' : undefined}
                className="text-[var(--accent-cyan)] underline hover:opacity-80 transition-opacity"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
