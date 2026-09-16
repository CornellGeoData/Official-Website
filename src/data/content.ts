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
  linkedin?: string;
}

export interface Project {
  slug?: string; // links the project card to its post at #/posts/<slug>; omit for no link
  tag: string;
  tagColor: string;
  title: string;
  body: string;
  photo?: string; // path under /public; omitted shows a placeholder block
  photo2?: string; // second image, shown side by side on the full-width card
  photoPosition?: string; // object-position focal point within the crop frame
  photoAspect?: string; // card image aspect ratio; defaults to 16/10
  viewer?: { href: string; label: string }; // a live visualization to open from the card
}

export const PROJECTS: Project[] = [
  {
    slug: '3d-printed-weather-stations',
    tag: 'Tech x Air',
    tagColor: '#c92556',
    title: '3D Printed Weather Stations',
    body: "Weather stations based on UCAR's open-source 3DPAWS design use 3D-printed components. They measure temperature, pressure, humidity, wind, and precipitation for local meteorological monitoring.",
    photo: '/projects/sensors.webp',
  },
  {
    slug: 'cayuga-lake-buoy',
    tag: 'Water',
    tagColor: '#2e6fc9',
    title: 'Cayuga Lake Buoy',
    body: 'A research buoy is being refitted for deployment on Cayuga Lake. Meteorological and water sensors will collect concurrent observations of atmospheric and lake conditions.',
    photo: '/projects/sensors-lake.webp',
  },
  {
    slug: 'atmospheric-tethersonde',
    tag: 'Air',
    tagColor: '#6d9dcd',
    title: 'Atmospheric Tethersonde',
    body: 'A tethered instrument platform collects vertical profiles of atmospheric conditions. These measurements support studies of the boundary layer and lake-effect weather.',
    photo: '/projects/tethersonde.webp',
    photoAspect: '4/5',
    photoPosition: '57% 50%',
  },
  {
    slug: 'nisar-ground-truthing',
    tag: 'Rock',
    tagColor: '#c1703f',
    title: 'NISAR Ground-Truthing',
    body: 'Five soil moisture nodes at Game Farm provide ground measurements for comparison with NASA NISAR satellite observations. Current and archived records are available through the sensor views.',
    photo: '/projects/nisar.webp',
    photoAspect: '4/5',
    photoPosition: '50% 40%',
  },
  {
    slug: 'lidar-hexapod',
    tag: 'Tech x CUPI Partnership',
    tagColor: '#c92556',
    title: 'LiDAR Hexapod',
    body: 'A LiDAR-equipped hexapod is being developed with Cornell Physical Intelligence for ground surveys. Its scans are intended to complement UAV point clouds in 3D terrain mapping.',
    photo: '/projects/hexapod.webp',
    viewer: { href: '#/sensors/lidar', label: 'Open the LiDAR viewer' },
  },
  {
    tag: 'Coming soon',
    tagColor: '#c92556',
    title: 'Drone Photogrammetry',
    body: 'Planned drone surveys will use overlapping aerial images to reconstruct shoreline topography. Repeat surveys will quantify erosion and other surface changes in the Finger Lakes.',
    photo: '/projects/drone.webp',
  },
];

export const PARTNERS = [
  'Duffield College of Engineering',
  'Dept. of Earth & Atmospheric Sciences',
  'Cornell Project Team Program',
  'Shen Fund for Social Impact',
];

// Cornell project-team recruiting dates, fall 2026, from the Engineering
// project teams recruiting calendar. `end` (Ithaca local time) is when the
// event stops being "upcoming": the timeline greys past stops, and the
// recruiting banner and join pills key off each track's 'apps' stop, so
// updating these dates each August updates all three.
export interface RecruitingEvent {
  name: string;
  when: string; // display text; \n breaks a line
  end: string; // ISO with the Ithaca offset
  icon: 'fest' | 'coffee' | 'apps' | 'interview' | 'offer' | 'deadline' | 'onboard';
}

export interface RecruitingTrack {
  track: string;
  form: string; // where the join pill and banner send applicants
  formLabel: string; // the join pill's text before the deadline
  events: RecruitingEvent[];
}

export const RECRUITING_TRACKS: RecruitingTrack[] = [
  {
    track: 'Upperclassmen',
    form: 'https://docs.google.com/forms/d/e/1FAIpQLSfI87dxinWPeDd9aevwKjwfP0NtWR8uJDhHeD9qjdQPXV9oiA/viewform?usp=dialog',
    formLabel: 'Upperclassmen Recruiting',
    events: [
      { name: 'Project Teams Fest', when: 'Sept 1, 4-6 p.m.\nDuffield Atrium', end: '2026-09-01T18:00:00-04:00', icon: 'fest' },
      { name: 'Coffee Chats', when: 'Aug 27 – Sept 4', end: '2026-09-04T23:59:59-04:00', icon: 'coffee' },
      { name: 'Applications Due', when: 'Sept 3, 11:59 p.m.', end: '2026-09-03T23:59:00-04:00', icon: 'apps' },
      { name: 'Interviews', when: 'Sept 4 – 15', end: '2026-09-15T23:59:59-04:00', icon: 'interview' },
      { name: 'First Offer Date', when: 'Sept 16', end: '2026-09-16T23:59:59-04:00', icon: 'offer' },
      { name: 'Add Deadline', when: 'Sept 25, 5 p.m.', end: '2026-09-25T17:00:00-04:00', icon: 'deadline' },
    ],
  },
  {
    track: 'Freshmen + New Transfers',
    form: 'https://docs.google.com/forms/d/e/1FAIpQLSfngx7aJDokCcOTyB0bC0d3i3ksI0pDtv2WCbpz_J5lZ4x-Zw/viewform?usp=dialog',
    formLabel: 'Freshman Application',
    events: [
      { name: 'Info Session', when: 'Sept 16, 5–6 p.m.\nSnee 1150', end: '2026-09-16T18:00:00-04:00', icon: 'interview' },
      { name: 'Coffee Chats', when: 'Aug 27 – Oct 14', end: '2026-10-14T23:59:59-04:00', icon: 'coffee' },
      { name: 'Applications Due', when: 'Oct 15, 11:59 p.m.', end: '2026-10-15T23:59:00-04:00', icon: 'apps' },
      { name: 'Interviews', when: 'Oct 16 – Nov 1', end: '2026-11-01T23:59:59-05:00', icon: 'interview' },
      { name: 'First Offer Date', when: 'Nov 2', end: '2026-11-02T23:59:59-05:00', icon: 'offer' },
      { name: 'Onboarding Begins', when: 'Nov 4', end: '2026-11-04T23:59:59-05:00', icon: 'onboard' },
    ],
  },
];

export const COFFEE_CHAT_SHEET = 'https://docs.google.com/spreadsheets/d/1ZYLfV6FjYPi1sL58lr9eAjuKM37q2tXTtEAOSyoPfpU/edit?usp=sharing';

// tracks whose application deadline is still ahead, with that deadline
export const openApplications = (now = Date.now()) =>
  RECRUITING_TRACKS.flatMap((t) => {
    const apps = t.events.find((e) => e.icon === 'apps');
    return apps && now <= Date.parse(apps.end) ? [{ track: t, due: apps }] : [];
  });

// '2026-09-03T23:59:00-04:00' -> '9/3', read off the string so every viewer
// sees the Ithaca date regardless of their own timezone
export const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

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
export const MEMBERS: Member[] = membersData;

export const SUBTEAM_COUNT = new Set(MEMBERS.map((m) => m.subteam)).size - 1; // Leadership isn't a subteam
// unique by email (name as fallback) so people on two subteams aren't
// double-counted; the faculty advisor isn't a student member
export const MEMBER_COUNT = new Set(MEMBERS.filter((m) => m.role !== 'Faculty Advisor').map((m) => m.email || m.name)).size;
