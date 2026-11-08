import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AlumniPit } from './AlumniPit';
import { RESIPLE, MANTI, H2, BODY, SUBPAGE, PILL, PILL_PRIMARY, CLOSE_ICON } from '../../styles/theme';
import { SPONSOR_PACKET_PDF, TIERS, ALUMNI } from '../../data/content';

// Keep the WebP page previews in sync with public/sponsorship/packet.pdf.
const PACKET_PAGE_COUNT = 5;
// ponytail: ?v= dodges the 2025-26 previews Railway's edge cached under these names
// (old 30-day header). Bump it if the edge ever serves stale pages again.
const packetPageSrc = (n: number) => `/sponsorship/page-${String(n + 1).padStart(2, '0')}.webp?v=2026-27`;

function PacketViewer() {
  const [page, setPage] = useState(0);
  const [full, setFull] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (page < PACKET_PAGE_COUNT - 1) new Image().src = packetPageSrc(page + 1);
  }, [page]);
  useEffect(() => {
    if (!full) return;
    dialogRef.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [full]);
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); setPage((p) => Math.min(p + 1, PACKET_PAGE_COUNT - 1)); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); setPage((p) => Math.max(p - 1, 0)); }
  };
  const controls = (
    <div className="packet-controls">
      <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
      <span aria-live="polite">Page <strong>{page + 1}</strong> of {PACKET_PAGE_COUNT}</span>
      <button type="button" aria-label="Next page" disabled={page === PACKET_PAGE_COUNT - 1} onClick={() => setPage(page + 1)}>→</button>
    </div>
  );
  return (
    <div className="packet-viewer" onKeyDown={onKey} style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <button ref={openerRef} type="button" className="packet-open" aria-label={`Enlarge sponsorship packet, page ${page + 1} of ${PACKET_PAGE_COUNT}`} aria-haspopup="dialog" onClick={() => setFull(true)}>
        <img src={packetPageSrc(page)} alt="" />
        <svg className="packet-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
      </button>
      {controls}
      {/* any click closes it except on the page arrows, including on the page itself and the X */}
      <dialog ref={dialogRef} className="packet-dialog" aria-label="Sponsorship packet" onClose={() => { setFull(false); openerRef.current?.focus(); }} onClick={(event) => { if (!(event.target as Element).closest('.packet-controls')) dialogRef.current?.close(); }}>
        {full && <>
          <button type="button" className="close-x packet-close" aria-label="Close" autoFocus>{CLOSE_ICON}</button>
          <img src={packetPageSrc(page)} alt={`2026–2027 sponsorship packet, page ${page + 1} of ${PACKET_PAGE_COUNT}`} className="packet-full-page" />
          {controls}
        </>}
      </dialog>
    </div>
  );
}

function CopyEmailButton({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied cugeodata@cornell.edu' : copyFailed ? 'Copy unavailable. Email cugeodata@cornell.edu.' : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText('cugeodata@cornell.edu');
          setCopied(true);
          setCopyFailed(false);
          setTimeout(() => setCopied(false), 2000);
        } catch { setCopyFailed(true); }
      }}
      style={{ ...PILL_PRIMARY, padding: '13px 28px', fontSize: 17, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10 }}
    >
      {copyFailed ? 'Copy unavailable' : label}
      {/* only mounted while copied, so the pill widens to make room for it */}
      {copied && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: 'check-pop 180ms ease-out' }}>
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      )}
    </button>
  );
}

export function SponsorsPage() {
  return (
    <section style={SUBPAGE}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* no column gap: the packet's flex box runs from the text column's
            right edge to the container's, so centering inside it splits the
            space evenly; the row gap only matters once the packet wraps */}
        <div className="sponsor-hero" style={{ display: 'flex', rowGap: 'clamp(48px,4vw,64px)', flexWrap: 'wrap', alignItems: 'center', minHeight: 'calc(100vh - 150px)' }}>
          <div style={{ flex: '0 1 560px', minWidth: 0 }}>
            <h2 style={H2}>Sponsorships &amp; Donations</h2>
            <p style={{ ...BODY, maxWidth: 620, margin: '26px 0 0' }}>Your support helps students build instruments, buy sensors, and carry out fieldwork.</p>
            <p style={{ ...BODY, maxWidth: 620, margin: '16px 0 0' }}>We also welcome RAM, graphics cards, and CPUs for our computing projects.</p>
            <div className="sponsor-actions" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 34 }}>
              <CopyEmailButton label="Copy our email" />
              <a href={SPONSOR_PACKET_PDF} download="Cornell-GeoData-Sponsorship-2026-2027.pdf" style={{ ...PILL, padding: '13px 28px', fontSize: 17 }}>Download the 2026–2027 packet (PDF)</a>
            </div>
          </div>
          {/* PACKET BOARD */}
          <PacketViewer />
        </div>

        {/* TIERS */}
        <div style={{ marginTop: 110 }}>
          <h3 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(28px,3.4vw,40px)', letterSpacing: '-0.02em', margin: '16px 0 0' }}>Sponsorship tiers</h3>
          <div className="sponsor-tiers">
            {TIERS.map((tier) => (
              <div key={tier.name} style={{ background: '#141c26', padding: '26px 24px' }}>
                <div style={{ fontFamily: RESIPLE, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: tier.color }}>{tier.name}</div>
                <div style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 34, marginTop: 12 }}>{tier.amount}</div>
                <ul style={{ margin: '18px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tier.perks.map((perk) => (
                    <li key={perk} style={{ position: 'relative', paddingLeft: 18, fontSize: 14.5, lineHeight: 1.5, color: '#a9bcc6' }}>
                      <span style={{ position: 'absolute', left: 0, color: tier.color }}>▸</span>{perk}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ALUMNI */}
        <div style={{ marginTop: 130 }}>
          <h2 style={H2}>Where our alumni go</h2>
          <p style={{ ...BODY, maxWidth: 680, margin: '24px 0 0' }}>Places where GeoData alumni have worked or continued their studies.</p>
          <div className="team-photo-frame" style={{ padding: 14, border: '2px solid #086727', marginTop: 40 }}>
            <AlumniPit alumni={ALUMNI} />
          </div>
        </div>
      </div>
    </section>
  );
}
