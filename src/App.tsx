import { lazy, Suspense, useEffect, useState } from 'react';
import { RESIPLE, MANTI, H2, SUBPAGE } from './styles/theme';
import { PARTNERS, openApplications, shortDate } from './data/content';
import { LEGAL_PAGES } from './data/legal';
import { POSTS } from './data/posts';
import { HomePage } from './pages/home/HomePage';
import { PostPage, PostsPage } from './pages/PostsPage';
import { SponsorsPage } from './pages/sponsors/SponsorsPage';
import { MembersPage } from './pages/MembersPage';

// the data section carries the charts, the map, and the soil archive: a third
// of the bundle, for a page most readers never open. It loads on demand.
const VisualizationsPage = lazy(() => import('./pages/visualizations/VisualizationsPage').then((m) => ({ default: m.VisualizationsPage })));

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  const [menuOpen, setMenuOpen] = useState(false);
  // recruiting banner shows only while the hero/globe is in view
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * 0.7);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // lives here, not in PostsPage: App never unmounts, so the chosen filter
  // survives a round trip through a post detail page
  const [postFilter, setPostFilter] = useState<'all' | 'project' | 'blog'>('all');

  const onPostsPage = route === '#/posts';
  const onSponsorsPage = route === '#/sponsors';
  // '#/sensors/...' deep-links a stage inside the page (map, air, forecast...)
  const onSensorsPage = route.startsWith('#/sensors');
  const onMembersPage = route === '#/members';
  const legalPage = LEGAL_PAGES[route];
  const activePost = POSTS.find((p) => route === `#/posts/${p.slug}`);
  const onSubPage = onPostsPage || !!activePost || onSponsorsPage || onSensorsPage || onMembersPage || !!legalPage;
  // the header link for wherever the reader is; the home anchors all count
  // as Projects, and nothing lights on the legal pages
  const NAV = [
    { href: '#projects', label: 'Projects', active: !onSubPage },
    { href: '#/members', label: 'Subteams', active: onMembersPage },
    { href: '#/sponsors', label: 'Sponsors', active: onSponsorsPage },
    { href: '#/posts', label: 'Blog', active: onPostsPage || !!activePost },
    { href: '#/sensors', label: 'Data', active: onSensorsPage },
  ];

  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash);
      setMenuOpen(false);
    };
    const closeMenu = () => setMenuOpen(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('geodata:hide-header', closeMenu);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('geodata:hide-header', closeMenu);
    };
  }, []);

  useEffect(() => {
    if (onSubPage) {
      window.scrollTo(0, 0);
      return;
    }
    // returning from a sub-page, the anchor target doesn't exist until
    // after this render - scroll to it manually
    const el = document.getElementById(route.slice(1));
    if (el) el.scrollIntoView();
  }, [route, onSubPage]);

  // the banner advertises whichever application deadline is next, and steps
  // aside past the hero, on the sensors stage, and inside a post - a reader
  // mid-article doesn't need the pitch
  const open = openApplications()[0];
  const bannerHidden = pastHero || onSensorsPage || activePost;
  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'clip', background: '#0e141c' }}>
      <div className="site-header-shell" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
      {open && (
        <a href={open.track.form} target="_blank" rel="noopener noreferrer" style={{ display: 'block', overflow: 'hidden', textAlign: 'center', maxHeight: bannerHidden ? 0 : 44, padding: bannerHidden ? '0 16px' : '8px 16px', transition: 'max-height 0.3s, padding 0.3s', background: '#086727', color: '#eaf2ee', fontWeight: 700, fontSize: 14, fontFamily: RESIPLE }}>{open.track.track} Recruiting is Open until {shortDate(open.due.end)}! →</a>
      )}
      <header className="site-header" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 42px', background: 'rgba(14,20,28,0.85)', fontFamily: RESIPLE }}>
        <a href="#top" className="logo-link" style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#e6ecf0', flexShrink: 0 }}>
          <img src="/logo.webp" alt="" style={{ width: 78, height: 78, flexShrink: 0 }} />
          <span className="logo-text" style={{ fontFamily: "'Intan',sans-serif", fontWeight: 700, fontSize: 33, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>GeoData</span>
        </a>
        <nav className="site-nav" style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 17.5, flexShrink: 0 }}>
          <div className="site-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            {NAV.map(({ href, label, active }) => (
              <a key={href} href={href} aria-current={active ? 'page' : undefined} style={{ color: active ? '#4fae7d' : '#e6ecf0' }}>{label}</a>
            ))}
          </div>
          <a href="#join" className="nav-join-btn" style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 999, background: '#086727', color: '#eaf2ee', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, fontFamily: RESIPLE }}>Join the team</a>
          <button
            type="button"
            className="nav-burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            style={{ display: 'none', flexShrink: 0, padding: 8, border: 'none', background: 'transparent', color: '#e6ecf0', cursor: 'pointer' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
            </svg>
          </button>
        </nav>
        {menuOpen && (
          // hashchange closes the menu on navigation; this onClick covers taps
          // on the link matching the current hash, which fire no hashchange
          <nav className="nav-menu" onClick={() => setMenuOpen(false)} style={{ position: 'absolute', top: '100%', left: 0, right: 0, display: 'none', flexDirection: 'column', background: 'rgba(14,20,28,0.97)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '6px 24px 18px', fontFamily: RESIPLE }}>
            {/* no "Join the team" here - the pill button sits right beside the burger */}
          {NAV.map(({ href, label, active }, i) => (
            <a key={href} href={href} aria-current={active ? 'page' : undefined} style={{ color: active ? '#4fae7d' : '#e6ecf0', fontSize: 17, fontWeight: 700, padding: '13px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined }}>{label}</a>
          ))}
          </nav>
        )}
      </header>
      </div>

      <span id="top" />

      {activePost ? (
      <PostPage post={activePost} />
      ) : onPostsPage ? (
      <PostsPage filter={postFilter} onFilter={setPostFilter} />
      ) : onSensorsPage ? (
      <Suspense fallback={null}><VisualizationsPage /></Suspense>
      ) : onSponsorsPage ? (
      <SponsorsPage />
      ) : onMembersPage ? (
      <MembersPage />
      ) : legalPage ? (
      <section style={SUBPAGE}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4fae7d' }}>CU GeoData</div>
          <h2 style={{ ...H2, marginTop: 18 }}>{legalPage.title}</h2>
          <div style={{ fontFamily: RESIPLE, fontSize: 13, color: '#7c909b', marginTop: 14 }}>Last updated: {legalPage.updated}</div>
          {legalPage.sections.map((s) => (
            <div key={s.h} style={{ marginTop: 44 }}>
              <h3 style={{ fontFamily: MANTI, fontWeight: 600, fontSize: 22, letterSpacing: '-0.01em', margin: 0 }}>{s.h}</h3>
              {s.body.map((para, i) => (
                <p key={i} style={{ fontSize: 15.5, lineHeight: 1.65, color: '#a9bcc6', margin: '12px 0 0', maxWidth: 680 }}>{para}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
      ) : (
      <HomePage />
      )}

      {/* FOOTER - supported by + contact */}
      <footer id="partners" style={{ position: 'relative', zIndex: 2, background: '#0e141c', padding: '84px clamp(24px,5vw,72px) 36px' }}>
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px 72px', justifyContent: 'space-between' }}>
            <div style={{ flex: '1 1 220px' }}>
              <span style={{ fontFamily: MANTI, fontWeight: 600, fontSize: 20 }}>CU GeoData</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, fontSize: 14, color: '#5f7078' }}>
                <span>Cornell University</span>
                <span>Ithaca, NY</span>
              </div>
              <img src="/cornell-engineering.svg" alt="Cornell Duffield College of Engineering" style={{ display: 'block', height: 22, width: 'auto', maxWidth: '100%', marginTop: 20 }} />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <div style={{ fontFamily: RESIPLE, fontSize: 12, lineHeight: '22px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7c909b' }}>Supported by</div>
              <div className="partners-grid" style={{ display: 'grid', gridTemplateRows: 'repeat(2, auto)', gridAutoFlow: 'column', gridAutoColumns: 'max-content', gap: '8px 40px', marginTop: 14, fontSize: 14, color: '#a9bcc6' }}>
                {PARTNERS.map((partner) => (
                  <span key={partner}>{partner}</span>
                ))}
              </div>
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                <span style={{ fontFamily: RESIPLE, fontSize: 12, lineHeight: '22px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7c909b' }}>Contact</span>
                <div style={{ display: 'flex', gap: 16 }}>
                  <a href="https://www.instagram.com/cugeodata/" target="_blank" rel="noopener noreferrer" aria-label="CU GeoData on Instagram" style={{ color: '#a9bcc6', display: 'inline-flex' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.757 6.162 6.162 6.162 3.405 0 6.162-2.757 6.162-6.162 0-3.402-2.757-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.645-1.44-1.44 0-.794.646-1.439 1.44-1.439.793 0 1.44.645 1.44 1.439z"/></svg>
                  </a>
                  <a href="https://www.linkedin.com/company/cu-geodata/" target="_blank" rel="noopener noreferrer" aria-label="CU GeoData on LinkedIn" style={{ color: '#a9bcc6', display: 'inline-flex' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>
                  </a>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, fontSize: 14 }}>
                <a href="mailto:cugeodata@cornell.edu">cugeodata@cornell.edu</a>
                <span style={{ color: '#a9bcc6' }}>Upson Hall Ithaca, NY 14853</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 30, display: 'flex', flexWrap: 'wrap', gap: '6px 20px', alignItems: 'center', fontSize: 10.5, color: '#5f7078' }}>
            <span>© {new Date().getFullYear()} CU GeoData. All rights reserved.</span>
            <a href="#/privacy" style={{ color: '#7c909b' }}>Privacy Policy</a>
            <a href="#/terms" style={{ color: '#7c909b' }}>Terms of Use</a>
            <a href="https://accessibility.cornell.edu" style={{ color: '#7c909b' }}>Web Accessibility Assistance</a>
            <a href="https://officeofcivilrights.cornell.edu/what-we-do/equal-opportunity-affirmative-action/" style={{ color: '#7c909b' }}>Equal Education and Employment Opportunity</a>
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: '#4d5b63', maxWidth: 720 }}>
            CU GeoData is a registered student organization of Cornell University. This website is maintained by its student members and does not represent the official views of Cornell University.
          </div>
        </div>
      </footer>

    </div>
  );
}
