import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Chat, Message as MessageType } from '../../types';
import { versionLabel, providerColor } from '../ModelSelector/modelConfig';
import { ImageGenResult } from './ImageGenResult';

export function Message({ message, chat }: { message: MessageType; chat: Chat }) {
  const isUser = message.role === 'user';
  const text = message.content
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
  const images = message.content.filter((p) => p.type === 'image_url' && p.image_url?.url);
  const files = message.content.filter((p) => p.type === 'file');

  return (
    <div className={`mb-5 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
          {isUser ? (
            <span>You</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: providerColor(chat.provider) }}
              />
              {versionLabel(chat.provider, chat.modelVersion)}
            </span>
          )}
        </div>

        <div
          className={`rounded-xl px-4 py-3 ${
            isUser ? 'bg-user' : 'bg-surface'
          }`}
        >
          {images.map((p, i) => (
            <ImageGenResult key={i} url={p.image_url!.url} />
          ))}
          {files.map((p, i) => (
            <div
              key={i}
              className="mb-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm"
            >
              📎 {p.name}
            </div>
          ))}
          {text && (
            isUser ? (
              <div className="whitespace-pre-wrap break-words text-text-primary">{text}</div>
            ) : (
              <AssistantMarkdown text={text} />
            )
          )}
          {!text && !images.length && !files.length && (
            <span className="text-text-muted">▍</span>
          )}
        </div>

        {!isUser && text && <CopyButton text={text} />}
      </div>
    </div>
  );
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown-body text-text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isBlock = className?.includes('language-');
            if (isBlock && match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: 0, borderRadius: 8, fontSize: 13 }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="mt-1 text-xs text-text-muted hover:text-text-primary"
    >
      {copied ? '✓ Copied' : '⧉ Copy'}
    </button>
  );
}
