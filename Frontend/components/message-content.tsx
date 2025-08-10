import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MessageContentProps {
  content: string;
  isUser: boolean;
}

export default function MessageContent({ content, isUser }: MessageContentProps) {
  if (isUser) {
    // User messages don't need markdown processing
    return <div className="whitespace-pre-wrap text-white">{content}</div>;
  }

  // Preprocess content to fix common markdown issues
  const preprocessContent = (text: string): string => {
    return text
      // Fix headings with ### followed by numbers (like ### 1., ### 2.)
      .replace(/#{3,}\s*(\d+)\.\s*/g, '\n### $1. ')
      // Fix patterns like "### 1. Make it a Daily Habit"
      .replace(/#{3,}\s*(\d+)\.\s+([^\n]+)/g, '\n### $1. $2\n')
      // Fix asterisks that should be bullet points
      .replace(/^\*\s*([A-Z][^*\n]+):/gm, '* **$1**:')
      // Fix patterns like "*Goal:" to "* **Goal**:"
      .replace(/^\*([A-Za-z]+):/gm, '* **$1**:')
      // Fix patterns like "* *Basic:" to "* **Basic**:"
      .replace(/^\*\s*\*([^*]+):/gm, '* **$1**:')
      // Fix bullet points that start with * and contain **bold**
      .replace(/^\*\s*\*\*([^*]+)\*\*\s*([^\n]*)/gm, '* **$1** $2')
      // Fix patterns like "* **Speaking**:"
      .replace(/^\*\s*\*\*([^*]+)\*\*:\s*/gm, '* **$1**: ')
      // Fix patterns like "* **Speaking** (explanation)"
      .replace(/^\*\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)/gm, '* **$1** ($2)')
      // Fix standalone asterisks at beginning of lines
      .replace(/^\*([^*\s][^*\n]*)/gm, '* $1')
      // Fix Topic labels like "*Topic 1: Arrays & Strings"
      .replace(/^\*Topic\s+(\d+):\s*([^\n]+)/gm, '\n**Topic $1: $2**\n')
      // Fix Level labels like "*Level 1: The Foundation"
      .replace(/^\*Level\s+(\d+):\s*([^\n]+)/gm, '\n**Level $1: $2**\n')
      // Fix Platforms to use labels
      .replace(/^\*Platforms to use:/gm, '\n**Platforms to use:**\n')
      // Ensure proper line breaks before headings
      .replace(/([^\n])(\n*#{1,6}\s+)/g, '$1\n\n$2')
      // Ensure proper line breaks before bullet points
      .replace(/([^\n])(\n*\*\s+)/g, '$1\n$2')
      // Fix multiple spaces
      .replace(/[ ]{2,}/g, ' ')
      // Clean up extra newlines
      .replace(/\n{3,}/g, '\n\n');
  };

  const processedContent = preprocessContent(content);

  return (
    <div className="prose prose-sm max-w-none text-gray-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Customize heading styles
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mb-3 text-gray-900 border-b border-gray-200 pb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-md font-semibold mb-2 text-gray-900">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mb-2 text-gray-900 mt-4">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-medium mb-2 text-gray-800">{children}</h4>
          ),
          // Customize paragraph styles
          p: ({ children }) => (
            <p className="mb-3 text-gray-800 leading-relaxed">{children}</p>
          ),
          // Customize list styles
          ul: ({ children }) => (
            <ul className="mb-3 text-gray-800 space-y-2 ml-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 text-gray-800 space-y-2 ml-4">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-gray-800 leading-relaxed relative">
              <span className="absolute -left-4 text-blue-600">•</span>
              {children}
            </li>
          ),
          // Customize code styles
          code: ({ children, className, ...props }: any) => {
            const isInline = !className?.includes('language-');
            if (isInline) {
              return (
                <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto mb-3 border">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          pre: ({ children }) => (
            <div className="mb-3">
              {children}
            </div>
          ),
          // Customize blockquote styles
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-300 pl-4 py-2 mb-3 bg-blue-50 text-gray-700 italic rounded-r">
              {children}
            </blockquote>
          ),
          // Customize strong/bold text
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900">{children}</strong>
          ),
          // Customize emphasis/italic text
          em: ({ children }) => (
            <em className="italic text-gray-700">{children}</em>
          ),
          // Customize links
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-blue-600 hover:text-blue-800 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          // Customize tables
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="min-w-full border border-gray-300 rounded-lg">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-900">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 px-3 py-2 text-gray-800">
              {children}
            </td>
          ),
          // Customize horizontal ruleTILL 
          hr: () => (
            <hr className="my-4 border-gray-300" />
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
