import { useEffect, useLayoutEffect, useState } from 'react';
import { CROWDFUNDING } from '../data/content';

// "Ana Reyes, Sam Ortiz, and Pat Quinn", in the order the server sends: largest gift first
function thanks(names: string[] = []) {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} and ${names[names.length - 1]}`;
}

// Announces the campaign and thanks its donors, under the header on the front page. The whole strip links to
// the Support section, and it scrolls away with the page.
export function DonorBanner() {
  const [campaign, setCampaign] = useState<{ names?: string[] }>({});
  // the header's height changes with the layout, so the banner reads it instead of assuming it
  const [top, setTop] = useState<number>();
  useLayoutEffect(() => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const watch = new ResizeObserver(() => setTop(header.getBoundingClientRect().bottom || undefined));
    watch.observe(header);
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    // the banner reads the same way without names, so a failure just leaves them out
    fetch('/api/crowdfunding').then((r) => (r.ok ? r.json() : {})).then(setCampaign).catch(() => {});
  }, []);
  if (Date.now() >= Date.parse(CROWDFUNDING.end)) return null;
  const line = thanks(campaign.names);
  return (
    <a href="#support" className="donor-banner" style={{ top }}>
      <strong>Crowdfunding is live</strong>
      {line && (
        <span className="donor-thanks">
          <span className="donor-sr">Thank you to {line}</span>
          {/* two copies, so the loop has no seam; the speed stays the same however long the list gets */}
          <span className="donor-track" aria-hidden="true" style={{ animationDuration: `${Math.max(20, line.length * 0.27)}s` }}>
            <span>Thank you to {line}</span>
            <span>Thank you to {line}</span>
          </span>
        </span>
      )}
    </a>
  );
}
