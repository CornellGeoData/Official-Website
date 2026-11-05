import { useEffect, useRef, useState } from 'react';
import { RESIPLE, H2, SUBPAGE, LINKEDIN_ICON, CLOSE_ICON } from '../styles/theme';
import { TeamLake, lensAvif, lensSrc, lensSrcSet, teamAnchor, teamInk } from './TeamLake';
import { MEMBERS, SUBTEAM_COLORS, SUBTEAM_BADGES, SUBTEAM_BLURBS, SUBTEAM_COUNT, MEMBER_COUNT } from '../data/content';

const TEAMS = [...new Set(MEMBERS.map((m) => m.subteam))];

const teamLabel = (s: string): string => (s === 'Leadership' ? s : `${s} team`);

export function MembersPage() {
  const [selectedMember, setSelectedMember] = useState<(typeof MEMBERS)[number] | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const contactRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!selectedMember) return;
    contactRef.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selectedMember]);

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopyStatus('Email copied.');
    } catch {
      setCopyStatus('Could not copy. Use the email link to contact us.');
    }
  };

  return (
    <section style={{ ...SUBPAGE, padding: '112px 0 0' }}>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '0 clamp(24px,5vw,72px)' }}>
        <div className="members-head" style={{ display: 'flex', flexWrap: 'wrap', gap: '28px 48px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={H2}>Subteams</h2>
          </div>
          <div className="members-stats" style={{ display: 'flex', alignItems: 'center', gap: 48, textAlign: 'center' }}>
            <div>
              <div className="stat-num" style={{ fontFamily: "'Intan',sans-serif", fontWeight: 700, fontSize: 46, lineHeight: 1, color: '#4fae7d' }}>{SUBTEAM_COUNT}</div>
              <div className="stat-label" style={{ fontFamily: "'Intan',sans-serif", fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a9bcc6', marginTop: 10 }}>Subteams</div>
            </div>
            <div>
              <div className="stat-num" style={{ fontFamily: "'Intan',sans-serif", fontWeight: 700, fontSize: 46, lineHeight: 1, color: '#4fae7d' }}>{MEMBER_COUNT}</div>
              <div className="stat-label" style={{ fontFamily: "'Intan',sans-serif", fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a9bcc6', marginTop: 10 }}>Members</div>
            </div>
          </div>
        </div>
      </div>
      <TeamLake teams={TEAMS.filter((t) => t !== 'Leadership')} />
        {TEAMS.map((subteam) => (
          <div key={subteam} id={teamAnchor(subteam)} className={`team-band${subteam === 'Leadership' ? ' team-band-leadership' : ''}`}>
            <picture>
              <source type="image/avif" srcSet={lensAvif(subteam)} sizes="100vw" />
              <img className="team-banner" loading="lazy" decoding="async" src={lensSrc(subteam)} srcSet={lensSrcSet(subteam)} sizes="100vw" alt="" />
            </picture>
            <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 clamp(24px,5vw,72px)' }}>
            <div className="team-head">
              <h3 tabIndex={-1} style={{ color: teamInk(subteam) }}>{teamLabel(subteam)}</h3>
              {SUBTEAM_BLURBS[subteam] && <p>{SUBTEAM_BLURBS[subteam]}</p>}
            </div>
            <div className="members-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(190px,100%),1fr))', gap: '36px 28px', marginTop: 30 }}>
              {MEMBERS.filter((m) => m.subteam === subteam).map((m, i) => {
                const color = SUBTEAM_COLORS[m.badge ?? subteam] ?? '#7c909b';
                return (
                  <div key={i} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="member-tile"
                      onClick={(event) => { openerRef.current = event.currentTarget; setCopyStatus(''); setSelectedMember(m); }}
                      aria-label={`Contact info for ${m.name}`}
                      aria-haspopup="dialog"
                      style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', '--tile-color': color } as React.CSSProperties}
                    >
                      {m.photo ? (
                        <img loading="lazy" decoding="async" src={m.photo} srcSet={import.meta.env.PROD ? `${m.photo.replace('.webp', '-600.webp')} 600w, ${m.photo} 1400w` : undefined} sizes="(max-width: 720px) 50vw, 240px" alt={m.name} draggable={false} style={{ display: 'block', width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
                      ) : (
                        <div aria-hidden="true" style={{ display: 'grid', placeItems: 'center', aspectRatio: '1/1', background: '#1a2430', color: '#52636f' }}>
                          <svg width="48%" height="48%" viewBox="0 0 64 64" fill="currentColor">
                            <circle cx="32" cy="21" r="12" />
                            <path d="M10 57v-4a22 22 0 0 1 44 0v4Z" />
                          </svg>
                        </div>
                      )}
                    </button>
                    {/* the section already names the team, so only a second team earns a badge */}
                    {m.badge && m.badge !== subteam && SUBTEAM_BADGES[m.badge] && (
                      <img className="member-badge" decoding="async" src={SUBTEAM_BADGES[m.badge]} alt={`${m.badge} team badge`} draggable={false} style={{ position: 'absolute', top: 8, left: 8, width: 36, height: 36, pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' }} />
                    )}
                    <div style={{ fontFamily: RESIPLE, fontWeight: 700, fontSize: 16.5, marginTop: 12 }}>{m.name}</div>
                    {(m.role || m.lead) && (
                      <div style={{ fontFamily: RESIPLE, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: `color-mix(in srgb, ${color} 62%, #fff)`, marginTop: 4 }}>{m.role ?? 'Subteam Lead'}</div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        ))}
      <dialog
        ref={contactRef}
        className="member-contact-dialog"
        aria-labelledby="member-contact-name"
        onClose={() => { setSelectedMember(null); openerRef.current?.focus(); }}
      >
        {selectedMember && <>
          <div className="member-contact-heading">
            <h3 id="member-contact-name">{selectedMember.name}</h3>
            <button type="button" className="close-x" aria-label="Close" autoFocus onClick={() => contactRef.current?.close()}>{CLOSE_ICON}</button>
          </div>
          <p style={{ color: teamInk(selectedMember.subteam) }}>{selectedMember.role ?? (selectedMember.lead ? 'Subteam Lead' : selectedMember.badge && selectedMember.badge !== selectedMember.subteam ? `${selectedMember.subteam} & ${selectedMember.badge} teams` : teamLabel(selectedMember.subteam))}</p>
          <p>Major: {selectedMember.major || 'TBD'}</p>
          {selectedMember.graduationYear && <p>Graduation year: {selectedMember.graduationYear}</p>}
          <div className="member-contact-actions">
            {selectedMember.email ? <div className="member-contact-email">
              <a href={`mailto:${selectedMember.email}`}>{selectedMember.email}</a>
              <button type="button" aria-label={`Copy ${selectedMember.email}`} title="Copy email" onClick={() => copyEmail(selectedMember.email)} style={{ display: 'grid', placeItems: 'center', flex: '0 0 44px', width: 44, height: 44, padding: 10, border: 0, background: 'transparent' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {copyStatus === 'Email copied.' ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>}
                </svg>
              </button>
            </div> : <p>Contact coming soon</p>}
            {selectedMember.linkedin && <a href={selectedMember.linkedin} target="_blank" rel="noreferrer">
              {!selectedMember.linkedin.includes('scholar.google') && LINKEDIN_ICON}
              <span>{selectedMember.linkedin.includes('scholar.google') ? 'Google Scholar' : 'LinkedIn'}</span>
            </a>}
            {selectedMember.github && <a href={selectedMember.github} target="_blank" rel="noreferrer">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297C5.37.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.51 11.51 0 0 1 3.003-.404c1.02.005 2.045.138 3.003.404 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.922.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
              GitHub
            </a>}
            {selectedMember.website && <a className="member-contact-website" href={selectedMember.website} target="_blank" rel="noreferrer">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" /></svg>
              <span>{selectedMember.websiteLabel ?? selectedMember.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
            </a>}
          </div>
          <p role="status" className="member-copy-status" data-copied={copyStatus === 'Email copied.'}>{copyStatus}</p>
        </>}
      </dialog>
    </section>
  );
}
