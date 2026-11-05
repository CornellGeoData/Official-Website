import { RESIPLE, MANTI, H2, SUBPAGE, fmtTag } from '../styles/theme';
import { POSTS } from '../data/posts';
import type { Post, PostMedia } from '../data/posts';
import { LoopVideo } from './LoopVideo';

// renders **text** in post paragraphs as bold
const emphasize = (text: string) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} style={{ color: '#e6ecf0' }}>{part}</strong> : part));

export function PostPage({ post }: { post: Post }) {
  // group consecutive paragraphs so each run gets one card while images sit outside on the page
  const postChunks: (string[] | PostMedia)[] = [];
  for (const para of post.body) {
    const last = postChunks[postChunks.length - 1];
    if (typeof para === 'string' && Array.isArray(last)) last.push(para);
    else postChunks.push(typeof para === 'string' ? [para] : para);
  }
  return (
    // tighter top padding than the stock subpage on phones: the header is only
    // ~60px there, so 150px read as dead space above the All posts link
    <section style={{ ...SUBPAGE, paddingTop: 'clamp(84px, 19vw, 150px)' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <a href="#/posts" style={{ fontFamily: RESIPLE, fontSize: 14.5 }}>← All posts</a>
        <div style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: post.tagColor, marginTop: 30 }}>{fmtTag(post.tag)}</div>
        <h2 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(34px,4.6vw,56px)', letterSpacing: '-0.02em', lineHeight: 1.05, margin: '16px 0 0' }}>{post.title}</h2>
        <div style={{ fontFamily: RESIPLE, fontSize: 12.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7c909b', marginTop: 18 }}>{post.date}</div>
        <div className="team-photo-frame" style={{ padding: 14, border: `2px solid ${post.tagColor}`, marginTop: 56 }}>
          {post.photo ? (
            <img decoding="async" src={post.photo} alt="" style={{ display: 'block', width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
          ) : (
            <div style={{ aspectRatio: '16/9', background: '#1a2430' }} />
          )}
        </div>
        {/* text runs get lifted cards for readability; images sit on the page between them */}
        {postChunks.map((chunk, i) => (
          Array.isArray(chunk) ? (
            <div key={i} style={{ background: '#17212c', padding: 'clamp(24px,5vw,56px)', maxWidth: 760, margin: `${i === 0 ? 56 : 48}px auto 0` }}>
              {chunk.map((para, j) => (
                <p key={j} style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 17.5, lineHeight: 1.85, color: '#c4d1d9', margin: j === 0 ? 0 : '36px 0 0' }}>{emphasize(para)}</p>
              ))}
            </div>
          ) : (
            <div key={i} className="team-photo-frame" style={{ padding: 14, border: `2px solid ${post.tagColor}`, maxWidth: chunk.max ?? 640, margin: `${i === 0 ? 56 : 48}px auto 0` }}>
              {'video' in chunk ? (
                <LoopVideo src={chunk.video} poster={chunk.poster} label={chunk.alt} style={{ height: 'auto' }} />
              ) : (
                <img loading="lazy" decoding="async" src={chunk.img} alt={chunk.alt ?? ''} style={{ display: 'block', width: '100%', height: 'auto' }} />
              )}
            </div>
          )
        ))}
        {(post.links.length > 0 || post.credit) && (
          <div style={{ background: '#17212c', padding: 'clamp(24px,5vw,56px)', maxWidth: 760, margin: '48px auto 0' }}>
            {post.links.length > 0 && (
              <>
                <div style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4fae7d' }}>Links</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
                  {post.links.map((link) => (
                    <a key={link.label} href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ fontSize: 16.5, alignSelf: 'flex-start', color: '#4fae7d' }}>{link.label} ↗</a>
                  ))}
                </div>
              </>
            )}
            {post.credit && (
              <div style={{ marginTop: post.links.length > 0 ? 28 : 0, fontFamily: RESIPLE, fontSize: 12.5, letterSpacing: '0.06em', color: '#7c909b' }}>{post.credit}</div>
            )}
          </div>
        )}
      </div>
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
