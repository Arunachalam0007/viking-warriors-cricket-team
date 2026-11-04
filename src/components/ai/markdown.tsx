"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Chat answers: bold, lists, small tables, and links to our own pages (opened in place). */
export function ChatMarkdown({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const components: Components = {
    a: ({ href = "", children }) =>
      href.startsWith("/") ? (
        <Link href={href} onClick={onNavigate} className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
          {children}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
          {children}
        </a>
      ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto rounded-lg ring-1 ring-foreground/10">
        <table className="w-full text-left text-[13px]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/70 text-xs text-muted-foreground">{children}</thead>,
    th: ({ children }) => <th className="px-2.5 py-1.5 font-semibold whitespace-nowrap">{children}</th>,
    td: ({ children }) => <td className="border-t border-foreground/5 px-2.5 py-1.5 tabular whitespace-nowrap">{children}</td>,
    ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
    p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    h1: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
    h2: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
    h3: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
    code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{children}</code>,
  };
  return (
    <div className="text-[14px] leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
