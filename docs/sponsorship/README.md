# Sponsorship packet, 2026-2027

`packet.html` is the layout and copy. `build.mjs` fills in the site's data, prints
it with Chrome, checks the PDF, and writes `public/sponsorship/packet.pdf` and the
page previews the Sponsors page shows.

```sh
node docs/sponsorship/build.mjs           # updates the website's files
node docs/sponsorship/build.mjs --draft   # writes to output/packet-draft instead
```

Needs Google Chrome and Poppler (`brew install poppler`). Run `npm run build`
afterward to refresh `dist/`.

## What comes from where

- Sponsorship levels, perks and the crowdfunding campaign: `src/data/content.ts`,
  the same data as the site, so edit them there.
- Student count and contact person: `src/data/members.json`.
- Pyramid colors and sizes: top of `build.mjs`.
- Photos, badges and QR codes: `assets/`, cut from the original design boards. The
  team photo is `public/team.jpg`, which is sharper than the board's copy.
- Back-page map: `assets/lake.jpg`, made from `public/art/terrain.webp` by
  `make_lake.py`, which also fades the contours behind the text. Rerun it if page 5's
  text moves.
- Fonts: Intan (`public/fonts`) and Lusitana (`fonts/`, under the OFL license). Both
  are identified from the original boards and embedded in the PDF.

## Rebuild after December 5, 2026

The crowdfunding block on the last page prints its end date. The PDF can't update
itself, so rebuild once the campaign closes and the block drops out.

## Tax wording

Keep this to what Cornell states, and check these pages before changing it:

1. Crowdfunding gifts are tax-deductible donations to Cornell University, with a
   receipt after processing: https://crowdfunding.cornell.edu/faq
2. Legal name and federal tax ID: https://giving.cornell.edu/how-to-give/
3. Hardware gifts need Alumni Affairs & Development to authorize acceptance, and the
   donor files IRS Form 8283: https://finance.cornell.edu/accounting/topics/revenueclass/gifts

The same page defines a gift as "nonreciprocal", so the packet does not call the
sponsorship levels tax-deductible, since they come with benefits. Confirm with AA&D
before adding that. The campaign goal and gift amounts stay out of the PDF because
they can change.

## Layout rules

- Positions are in page points (612 by 792). The white frame is 9pt, content starts
  34pt in, and the lowest content on each page ends at 758pt.
- Keep line heights at multiples of .75pt. Chrome snaps lines to whole CSS pixels,
  so other values make the spacing uneven.
- Use straight apostrophes: Lusitana has no curly one, and Chrome would substitute Times.
- The build fails on the wrong page count, an unembedded or fallback font, an em dash,
  middle dot or bullet, or text outside the content area. If the page count changes, also
  update `PAGES` in `build.mjs` and `PACKET_PAGE_COUNT` in
  `src/pages/sponsors/SponsorsPage.tsx`.
