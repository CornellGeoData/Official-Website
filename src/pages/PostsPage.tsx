import { RESIPLE, MANTI, H2, SUBPAGE, fmtTag } from '../styles/theme';
import { POSTS } from '../data/posts';
import type { Post } from '../data/posts';
import { LoopVideo } from './LoopVideo';

// renders **text** in post paragraphs as bold
const emphasize = (text: string) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} style={{ color: '#e6ecf0' }}>{part}</strong> : part));

export function PostPage({ post }: { post: Post }) {
  return (
    <section style={{ ...SUBPAGE, paddingTop: 'clamp(84px, 19vw, 150px)' }}>
      <article className="post-article">
        <header className="post-reading">
          <a href="#/posts" style={{ fontFamily: RESIPLE, fontSize: 14.5 }}>← All posts</a>
          <div style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: post.tagColor, marginTop: 30 }}>{fmtTag(post.tag)}</div>
          <h1 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(34px,4.6vw,56px)', letterSpacing: '-0.02em', lineHeight: 1.05, margin: '16px 0 0' }}>{post.title}</h1>
          <p className="post-dek">{post.dek}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontFamily: RESIPLE, fontSize: 14, color: '#a9bcc6', marginTop: 20 }}>
            {post.author && <span>By {post.author}</span>}
            <span>{post.date}</span>
          </div>
        </header>
        {post.photo && (
          <figure className="post-hero">
            <img decoding="async" src={post.photo} alt={post.photoCaption ?? ''} />
            {post.photoCaption && <figcaption className="post-caption">{post.photoCaption}</figcaption>}
          </figure>
        )}
        <div className="post-reading post-body" style={post.photo ? undefined : { marginTop: 40 }}>
          {post.body.map((part, i) => typeof part === 'string' ? (
            <p key={i}>{emphasize(part)}</p>
          ) : (
            <figure key={i} className="post-figure" style={{ maxWidth: part.max ?? 640 }}>
              {'video' in part ? (
                <LoopVideo src={part.video} poster={part.poster} label={part.alt} style={{ height: 'auto' }} />
              ) : (
                <img loading="lazy" decoding="async" src={part.img} alt={part.alt ?? ''} />
              )}
              {part.caption && <figcaption className="post-caption">{part.caption}</figcaption>}
            </figure>
          ))}
        </div>
        {(post.links.length > 0 || post.credit) && (
          <footer className="post-reading post-resources">
            {post.links.length > 0 && (
              <>
                <h2 style={{ fontFamily: RESIPLE, fontSize: 14, color: '#4fae7d', margin: 0 }}>Further reading</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
                  {post.links.map((link) => (
                    <a key={link.label} href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ fontSize: 16.5, alignSelf: 'flex-start', color: '#4fae7d' }}>{link.label} ↗</a>
                  ))}
                </div>
              </>
            )}
            {post.credit && <p className="post-caption" style={{ marginTop: post.links.length > 0 ? 28 : 0 }}>{post.credit}</p>}
          </footer>
        )}
      </article>
    </section>
  );
}

export function PostsPage({ filter, onFilter }: { filter: 'all' | 'project' | 'blog'; onFilter: (f: 'all' | 'project' | 'blog') => void }) {
  return (
    <section className="posts-page" style={SUBPAGE}>
      <div style={{ maxWidth: 940, margin: '0 auto' }}>
        <h2 style={H2}>Posts</h2>
        <div style={{ display: 'flex', gap: 26, marginTop: 36 }}>
          {([['all', 'All'], ['project', 'Projects'], ['blog', 'Blogs']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilter(value)}
              style={{ appearance: 'none', background: 'transparent', border: 'none', cursor: 'pointer', padding: '9px 0 10px', fontFamily: RESIPLE, fontSize: 17, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: filter === value ? '#e6ecf0' : '#7c909b', borderBottom: `2px solid ${filter === value ? '#4fae7d' : 'transparent'}` }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 48 }}>
          {POSTS.filter((post) => filter === 'all' || post.kind === filter).map((post, i) => (
            <article key={post.slug} style={{ margin: `${i === 0 ? 0 : 48}px -12px 0` }}>
              <a href={`#/posts/${post.slug}`} className="highlight-row post-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) clamp(130px,30vw,300px)', gap: 'clamp(18px,3.5vw,44px)', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: RESIPLE, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7c909b' }}>
                    {post.date} <span style={{ color: post.tagColor }}>{fmtTag(post.tag)}</span>
                  </div>
                  <h3 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(24px,3.2vw,34px)', letterSpacing: '-0.015em', lineHeight: 1.12, margin: '14px 0 0' }}>{post.title}</h3>
                  <p style={{ fontSize: 16, lineHeight: 1.6, color: '#a9bcc6', margin: '14px 0 0' }}>{post.dek}</p>
                </div>
                <div>
                  {post.photo ? (
                    <img loading="lazy" decoding="async" src={post.photo} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ aspectRatio: '4/3', background: '#1a2430' }} />
                  )}
                </div>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
