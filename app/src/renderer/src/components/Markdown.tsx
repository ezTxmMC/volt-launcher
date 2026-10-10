import ReactMarkdown from 'react-markdown'

/** Renders untrusted Markdown. Raw HTML is not interpreted (react-markdown default). */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
