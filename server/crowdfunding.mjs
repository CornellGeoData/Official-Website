// The Cornell Crowdfunding campaign's raised total and donor names. The site has
// no API and no CORS, so it is read here. URLs match CROWDFUNDING in src/data/content.ts.
const PAGE = 'https://crowdfunding.cornell.edu/project/50966';
const WALL = 'https://crowdfunding.cornell.edu/public_ajax/cfund/50966/donation_tiles';
const CACHE_MS = 10 * 60_000;
const number = (text) => Number(text.replaceAll(',', ''));

// Names come from a public form and appear on the site unreviewed. To correct or remove one, map the
// name as shown, lowercased, to what to show instead, or to null to leave that donor out.
const NAME_FIXES = new Map([
  // ['yr liu', 'Y.R. Liu'],
]);

export function parseCampaign(html) {
  const raised = html.match(/single-project-top-dollar">\s*\$([\d,]+)/)?.[1];
  if (!raised) throw new Error('campaign page changed');
  return { raised: number(raised) };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (html) => (html ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#x?[\da-f]+|\w+);/gi, (all, code) => (code[0] === '#'
    ? String.fromCodePoint(parseInt(code.slice(1).replace(/^x/i, ''), /^#x/i.test(code) ? 16 : 10))
    : ENTITIES[code] ?? all))
  .replace(/\s+/g, ' ')
  .trim();

// One tile per gift. The second row is free text: a last name, a dedication, or a message.
export function parseTiles(html) {
  return html.split('donor-tile').slice(1).map((tile) => {
    const row = (name) => text(tile.match(new RegExp(`class="${name}">([\\s\\S]*?)</h3>`))?.[1]);
    // "Undisclosed Amount" has no figure, and reads as 0
    return { name: row('top-row'), note: row('bottom-row'), amount: number(row('amount').match(/\$([\d,]+)/)?.[1] ?? '0') };
  });
}

const PARTICLE = /^(van|von|der|den|de|del|della|di|da|du|la|le|bin|ibn|and)$/i;
const WORD = /^\p{L}[\p{L}\p{M}'’-]+$/u;
// One-word messages, which would otherwise read as a last name.
const NOT_SURNAMES = new Set(`thanks thank thankyou congrats congratulations cheers bravo yay hooray hello hi hey love best
  good great awesome amazing wow nice enjoy proud support supporter sincerely regards go team family friend friends alum alumni
  alumnus alumna parent parents mom dad mother father grandma grandpa grandmother grandfather aunt uncle son daughter student
  students club engineering engineer engineers science sciences earth geology geodata cornell ithaca red class gift donation
  none yes anonymous ilr cals coe aap eas cas`.split(/\s+/));

const isName = (s) => s.length <= 40 && s.split(' ').length <= 6
  && /^\p{L}[\p{L}\p{M} .'’&-]*$/u.test(s) // no digits, @ or slashes: an email or a link is not a name
  && !/\.\p{L}{2}/u.test(s); // nor is a domain

const isSurname = (s) => {
  const words = s.split(' ');
  return words.every(WORD.test, WORD) && !NOT_SURNAMES.has(s.toLowerCase())
    && words.slice(0, -1).every((w) => PARTICLE.test(w));
};

// The rest of the donor's name, if the note holds it: "Wang", "Wang '98", "Kevin Wang", or a message signed
// "Kevin Wang". Anything else is left out, since thanking the wrong person is worse than a first name alone.
function surnameIn(name, rawNote) {
  if (/\b(honou?r|memory|tribute|dedicat)/i.test(rawNote)) return ''; // a dedication names someone else
  const note = rawNote.replace(/[\s,(]*(class of\s*)?['’‘]?\d{2,4}\)?[.!]*$/i, '');
  const known = name.toLowerCase().split(' ');
  if (note.toLowerCase().split(' ').every((w) => known.includes(w))) return '';
  if (isSurname(note)) return note;
  if (note.toLowerCase().startsWith(`${name.toLowerCase()} `)) {
    const rest = note.slice(name.length + 1);
    if (isSurname(rest)) return rest;
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const signed = note.match(new RegExp(`(?:^|[\\s,!.:-])${escaped}\\s+(\\p{Lu}[\\p{L}'’-]+)\\s*(?:$|[,.!])`, 'u'))?.[1];
  return signed && isSurname(signed) ? signed : '';
}

// Only fixes what was typed in one case throughout, so "DeShawn" and "McKay" stay as the donor wrote them.
function fixCase(name) {
  const words = name.split(' ');
  const shouting = name === name.toUpperCase() && name !== name.toLowerCase();
  return words.map((word, i) => {
    if (!shouting && word !== word.toLowerCase()) return word;
    const low = word.toLowerCase();
    if (i > 0 && PARTICLE.test(low)) return low;
    // "yr" is initials, "ty" and "ng" are names
    if (i === 0 && words.length > 1 && low !== 'ng' && /^([^aeiouy]{2,3}|y[^aeiouy]{1,2})$/.test(low)) return low.toUpperCase();
    return low.replace(/(^|[-'’.])(\p{L})/gu, (all, mark, letter) => mark + letter.toUpperCase()).replace(/^Mc(\p{L})/u, (all, letter) => `Mc${letter.toUpperCase()}`);
  }).join(' ');
}

// What the donor typed -> the name to thank them by, or null if there isn't one to show.
export function donorName(name, note = '') {
  if (!isName(name) || /\b(anonymous|anon)\b/i.test(name)) return null;
  return fixCase(`${name} ${surnameIn(name, note)}`.trim());
}

// Names only, largest total first: messages and amounts stop here and never reach the browser. Undisclosed gifts
// count as nothing, so those donors go last and their place can't hint at what they chose to keep private.
export function donorList(tiles) {
  const donors = new Map();
  for (const { name, note, amount = 0 } of tiles) {
    const parsed = donorName(name, note);
    const shown = parsed && NAME_FIXES.has(parsed.toLowerCase()) ? NAME_FIXES.get(parsed.toLowerCase()) : parsed;
    if (!shown) continue;
    const before = donors.get(shown.toLowerCase());
    donors.set(shown.toLowerCase(), { shown, total: (before?.total ?? 0) + amount });
  }
  return { names: [...donors.values()].sort((a, b) => b.total - a.total).map((donor) => donor.shown) };
}

async function readWall() {
  const tiles = [];
  for (let page = 1; page <= 50; page++) { // ponytail: stops at 1,250 gifts, far past what this campaign will see
    const r = await fetch(`${WALL}?page=${page}`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`wall ${r.status}`);
    const { html, num_tiles: total } = await r.json();
    const found = parseTiles(html);
    tiles.push(...found);
    if (!found.length || tiles.length >= total) break;
  }
  return donorList(tiles);
}

let cache = { t: 0, data: null };
export async function crowdfundingHandler(_req, res) {
  try {
    if (!cache.data || Date.now() - cache.t > CACHE_MS) {
      const r = await fetch(PAGE);
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const campaign = parseCampaign(await r.text());
      // the total shouldn't depend on the wall: if it fails, keep the last names, or go without
      const wall = await readWall().catch(() => (cache.data?.names ? { names: cache.data.names } : null));
      cache = { t: Date.now(), data: { ...campaign, ...wall } };
    }
    res.set('cache-control', 'public, max-age=60');
    res.json(cache.data);
  } catch (err) {
    if (cache.data) {
      res.json(cache.data); // stale beats nothing
      return;
    }
    res.status(502).json({ error: String(err) });
  }
}
