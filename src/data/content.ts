// blog + project posts live in posts.ts; privacy/terms prose lives in legal.ts.
import membersData from './members.json';

export interface Member {
  name: string;
  subteam: string; // which grid section the card appears in
  lead?: boolean; // team leads sit first in their subteam's grid
  role?: string; // org-wide role label (Leadership section), e.g. "Faculty Advisor"
  badge?: string; // subteam whose corner badge to show; defaults to subteam
  photo: string; // path under /public, e.g. '/members/jane-doe.webp' - empty string shows a placeholder
  email: string;
  major: string;
  graduationYear?: number;
  linkedin?: string;
  github?: string;
  website?: string;
  websiteLabel?: string;
}

export interface Project {
  slug?: string; // links the project card to its post at #/posts/<slug>; omit for no link
  tag: string;
  tagColor: string;
  title: string;
  body: string;
  photo?: string; // path under /public; omitted shows a placeholder block
  video?: { src: string; label: string }; // muted loop shown in place of the photo, which becomes its poster
  photoPosition?: string; // object-position focal point within the crop frame
  photoAspect?: string; // card image aspect ratio; defaults to 16/10
}

export const PROJECTS: Project[] = [
  {
    slug: '3d-printed-weather-stations',
    tag: 'Tech x Air',
    tagColor: '#c92556',
    title: '3D Printed Weather Stations',
    body: 'Open-source 3DPAWS weather stations, printed in-house.',
    photo: '/projects/sensors.webp',
  },
  {
    slug: 'cayuga-lake-buoy',
    tag: 'Water',
    tagColor: '#2e6fc9',
    title: 'Cayuga Lake Buoy',
    body: 'A refitted research buoy measuring the lake and the air above it.',
    photo: '/projects/sensors-lake.webp',
  },
  {
    slug: 'atmospheric-tethersonde',
    tag: 'Air',
    tagColor: '#6d9dcd',
    title: 'Atmospheric Tethersonde',
    body: 'Vertical profiles of the boundary layer and lake-effect weather.',
    photo: '/projects/tethersonde.webp',
    photoAspect: '4/5',
    photoPosition: '57% 50%',
  },
  {
    slug: 'nisar-ground-truthing',
    tag: 'Rock',
    tagColor: '#c1703f',
    title: 'NISAR Ground-Truthing',
    body: "Soil moisture nodes checking NASA's NISAR satellite from the ground.",
    photo: '/projects/nisar.webp',
    photoAspect: '4/5',
    photoPosition: '50% 40%',
  },
  {
    slug: 'lidar-hexapod',
    tag: 'Tech x CUPI Partnership',
    tagColor: '#c92556',
    title: 'LiDAR Hexapod',
    body: 'A walking LiDAR robot for ground surveys, built with Cornell Physical Intelligence.',
    photo: '/projects/hexapod-walk.webp',
    video: { src: '/projects/hexapod-walk.mp4', label: "In simulation, the hexapod is pushed off a ledge, lands upside down, and keeps walking." },
    photoAspect: '3/2',
    photoPosition: '50% 60%',
  },
  {
    tag: 'Coming soon',
    tagColor: '#c92556',
    title: 'Drone Photogrammetry',
    body: 'Drone surveys to track shoreline erosion in the Finger Lakes.',
    photo: '/projects/drone.webp',
    photoAspect: '3/2',
  },
];

export const PARTNERS = [
  'Duffield College of Engineering',
  'Dept. of Earth & Atmospheric Sciences',
  'Cornell Project Team Program',
  'Shen Fund for Social Impact',
];

// The fall campaign on Cornell Crowdfunding. The raised total is
// read live through /api/crowdfunding (server/crowdfunding.mjs); `end` is when the
// home page's Support section stops asking for gifts and points at sponsorship.
// `ticks` are the donation bar's markers, from the campaign's giving levels; lvid
// opens that level on its donate page.
export const CROWDFUNDING = {
  url: 'https://crowdfunding.cornell.edu/project/50966',
  goal: 5000,
  end: '2026-12-05T00:00:00-05:00',
  ticks: [
    { amount: 20, lvid: 142209, icon: 'chip', does: 'buys a circuit sensor' },
    { amount: 50, lvid: 142210, icon: 'wrench', does: 'covers a hardware store trip' },
    { amount: 100, lvid: 142211, icon: 'signal', does: 'keeps our sensor data flowing' },
    { amount: 250, lvid: 142212, icon: 'probe', does: 'buys a soil moisture sensor' },
    { amount: 500, lvid: 142214, icon: 'drop', does: 'pays for EPA-certified water testing' },
    { amount: 1000, lvid: 142215, icon: 'computer', does: 'buys computer parts' },
    { amount: 2500, lvid: 142218, icon: 'station', does: 'deploys another weather station' },
    { amount: 3500, lvid: 142219, icon: 'buoy', does: 'deploys a weather station buoy in Ithaca' },
  ],
};

export const SUBTEAM_COLORS: Record<string, string> = {
  Leadership: '#4fae7d',
  Air: '#6d9dcd',
  Water: '#2e6fc9',
  Rock: '#c1703f',
  Data: '#8b3fbf',
  Tech: '#c92556',
  Business: '#dcbe32',
};

// one-line snippets under each subteam heading on the members page
export const SUBTEAM_BLURBS: Record<string, string> = {
  Air: 'Atmospheric modeling, surveying, and forecasting.',
  Water: 'Lake monitoring, waterway protection, and water-quality assessment.',
  Rock: 'Remote sensing, soil biology, and geology.',
  Data: 'Machine learning, data management, and data analytics.',
  Tech: 'Hardware production, electronic management, and CAD design.',
  Business: 'Sponsorships, partnerships, and events.',
};

// corner badges in public/badges/ - one per subteam
export const SUBTEAM_BADGES: Record<string, string> = {
  Air: '/badges/air.webp',
  Water: '/badges/water.webp',
  Rock: '/badges/rock.webp',
  Data: '/badges/data.webp',
  Tech: '/badges/tech.webp',
  Business: '/badges/business.webp',
};

export const SPONSOR_PACKET_PDF = '/sponsorship/packet.pdf';

// Mohs hardness ladder (quartz 7 < topaz 8 < ruby/corundum 9 < diamond 10)
export const TIERS = [
  { name: 'Quartz', color: '#6d9dcd', amount: '$500+', perks: ['Team resume book', 'Decal on a soil-moisture node at the Game Farm site', 'Thank-you in the alumni newsletter'] },
  { name: 'Topaz', color: '#c1703f', amount: '$1,500+', perks: ['Everything in Quartz', 'Decal on a Cayuga Lake sensor station, photographed on deployment day', 'Logo on our website', 'Social media feature from the field'] },
  { name: 'Ruby', color: '#c92556', amount: '$3,000+', perks: ['Everything in Topaz', 'Decal on the tethersonde, flown to 500 feet', 'Logo on team apparel', 'Job postings featured in the alumni newsletter', 'Info session or recruiting event with the team'] },
  { name: 'Diamond', color: '#8b3fbf', amount: '$5,000+', perks: ['Everything in Ruby', 'Decal on the LiDAR hexapod robot and the survey drone', 'A sensor site around the lake named after you', 'First invite to demo day'] },
];

export const ALUMNI: { place: string; logo?: string }[] = [
  { place: 'UIUC', logo: '/alumni/uiuc.webp' },
  { place: 'Chevron', logo: '/alumni/chevron.webp' },
  { place: 'Amazon', logo: '/alumni/amazon.webp' },
  { place: 'NOAA', logo: '/alumni/noaa.webp' },
  { place: 'NCAR', logo: '/alumni/ncar.webp' },
  { place: 'KPMG', logo: '/alumni/kpmg.webp' },
  { place: 'Ernst & Young', logo: '/alumni/ey.webp' },
  { place: 'NASA', logo: '/alumni/nasa.webp' },
  { place: 'Capital One', logo: '/alumni/capital-one.webp' },
  { place: 'MIT Lincoln Laboratory', logo: '/alumni/mit-ll.webp' },
  { place: 'WashU', logo: '/alumni/washu.webp' },
  { place: 'United Airlines', logo: '/alumni/united.webp' },
  { place: 'Coinbase', logo: '/alumni/coinbase.webp' },
  { place: 'UC Berkeley', logo: '/alumni/berkeley.webp' },
  { place: 'Northwestern', logo: '/alumni/northwestern.png' },
  { place: 'Liberty Mutual', logo: '/alumni/liberty-mutual.webp' },
  { place: 'SpaceX', logo: '/alumni/spacex.webp' },
  { place: 'Yale', logo: '/alumni/yale.webp' },
];

// Edit the roster in src/data/members.json and photos in public/members/.
// Profiles awaiting photos are saved separately in members.pending.json.
export const MEMBERS: Member[] = membersData;

export const SUBTEAM_COUNT = new Set(MEMBERS.map((m) => m.subteam)).size - 1; // Leadership isn't a subteam
// unique by email (name as fallback) so people on two subteams aren't
// double-counted; the faculty advisor isn't a student member
export const MEMBER_COUNT = new Set(MEMBERS.filter((m) => m.role !== 'Faculty Advisor').map((m) => m.email || m.name)).size;
