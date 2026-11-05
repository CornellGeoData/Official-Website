import { RESIPLE, H2, SUBPAGE } from '../../styles/theme';
import { VISUALIZATIONS } from '../../data/visualizations';

export function VisualizationList() {
  return (
    <section style={{ ...SUBPAGE, minHeight: 0 }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <h2 style={{ ...H2, maxWidth: '14ch' }}>Visualizations</h2>

        <ul style={{ display: 'grid', gap: 16, listStyle: 'none', margin: '36px 0 0', padding: 0 }}>
          {VISUALIZATIONS.map((s) => (
            <li key={s.id}>
              <a href={s.hash} className="visualization-project highlight-row" style={{ fontFamily: RESIPLE }}>
                <img src={s.thumb.replace('.webp', '-480.webp')} srcSet={`${s.thumb.replace('.webp', '-480.webp')} 480w, ${s.thumb} 960w`} sizes="(max-width: 600px) 100vw, 240px" width={480} height={300} alt="" decoding="sync" draggable={false}
                  // already fetched (a return visit, or the list taking over from its stand-in): no fade
                  ref={(el) => { if (el?.complete && el.naturalWidth) el.style.opacity = '1'; }}
                  onLoad={(e) => { e.currentTarget.style.opacity = '1'; }}
                  className="visualization-thumb" style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '16/10', objectFit: 'cover' }} />
                <div>
                  <h3 style={{ fontFamily: RESIPLE, fontWeight: 700, fontSize: 'clamp(20px,2vw,24px)', margin: 0 }}>{s.label}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: '#a9bcc6', maxWidth: '64ch', margin: '9px 0 0' }}>{s.blurb}</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
        <style>{`
          .visualization-thumb { opacity: 0; transition: opacity 200ms ease; }
          .visualization-project {
            display: grid;
            grid-template-columns: 240px minmax(0, 1fr);
            align-items: center;
            gap: 32px;
          }
          @media (max-width: 600px) {
            .visualization-project {
              grid-template-columns: minmax(0, 1fr);
              gap: 18px 12px;
              padding: 12px 8px;
            }
            .visualization-project img {
              grid-column: 1 / -1;
              aspect-ratio: 16 / 9 !important;
            }
          }
        `}</style>
      </div>
    </section>
  );
}
