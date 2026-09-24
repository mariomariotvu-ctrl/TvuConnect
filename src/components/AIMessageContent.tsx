import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import '../styles/ai-markdown.css';

interface AIMessageContentProps {
  content: string;
}

export function normalizeAIMessageMarkdown(content: string) {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part;

      return part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression: string) => (
          `\n$$\n${expression.trim()}\n$$\n`
        ))
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression: string) => `$${expression.trim()}$`)
        .replace(/\$\$[ \t]*([^\n]+?)[ \t]*\$\$/g, (_, expression: string) => (
          `\n$$\n${expression.trim()}\n$$\n`
        ));
    })
    .join('');
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="ai-markdown-heading ai-markdown-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="ai-markdown-heading ai-markdown-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="ai-markdown-heading ai-markdown-h3">{children}</h3>,
  a: ({ href, children }) => {
    const opensNewTab = href?.startsWith('http://') || href?.startsWith('https://');
    return (
      <a
        href={href}
        target={opensNewTab ? '_blank' : undefined}
        rel={opensNewTab ? 'noreferrer' : undefined}
      >
        {children}
      </a>
    );
  },
};

export function AIMessageContent({ content }: AIMessageContentProps) {
  const normalizedContent = normalizeAIMessageMarkdown(content);

  return (
    <div className="ai-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
        skipHtml
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
