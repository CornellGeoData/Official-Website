import type React from 'react';

// Manti Sans lacks a period glyph; use Resiple for body text and numbers.
export const RESIPLE = "'Resiple',sans-serif";
export const MANTI = "'Manti Sans',sans-serif";

// shared text styles for the big section headings and their body copy
export const H2: React.CSSProperties = { fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(36px,4.8vw,60px)', letterSpacing: '-0.02em', lineHeight: 1.02, margin: 0 };
export const BODY: React.CSSProperties = { fontSize: 17, lineHeight: 1.65, color: '#a9bcc6' };
// support and sponsor call-to-action pills; PILL is the muted filled variant, PILL_PRIMARY the brand-green one
export const PILL: React.CSSProperties = { display: 'inline-block', padding: '15px 32px', borderRadius: 999, border: 0, background: '#1a2430', color: '#e6ecf0', fontWeight: 700, fontSize: 18.5, fontFamily: RESIPLE };
export const PILL_PRIMARY: React.CSSProperties = { ...PILL, background: '#086727', color: '#eaf2ee' };
// the outer section every sub-page (posts, sponsors, sensors, members, legal) sits in
export const SUBPAGE: React.CSSProperties = { position: 'relative', zIndex: 2, background: '#0e141c', padding: '150px clamp(24px,5vw,72px) 110px', minHeight: '100vh' };

export const LINKEDIN_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>;
export const CLOSE_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>;

// "Tech x Air" -> smaller x between team names
export const fmtTag = (tag: string) => tag.split(/( x )/).map((p, i) => (p === ' x ' ? <span key={i} style={{ fontSize: '0.72em' }}> x </span> : p));
