// max caps the width in px; alt describes what a chart or clip shows
export type PostMedia = { img: string; max?: number; alt?: string } | { video: string; poster: string; max?: number; alt: string };

export interface Post {
  slug: string; // project posts share their project's slug so its card header links here
  kind: 'project' | 'blog';
  date: string;
  tag: string;
  tagColor: string;
  title: string;
  dek: string; // the one-liner under the headline
  photo?: string; // path under /public; omitted shows a placeholder
  body: (string | PostMedia)[]; // a string per paragraph; media entries render framed between the text cards
  links: { label: string; href: string }[];
  credit?: string; // photo credit line, shown under the links
}

// newest first
// slug must match a PROJECTS slug to link project card -> post
export const POSTS: Post[] = [
  {
    slug: 'hexapod-locomotion-fall-2026',
    kind: 'blog',
    date: 'November 2026',
    tag: 'Tech x CUPI',
    tagColor: '#c92556',
    title: 'Teaching the Hexapod to Follow a Ghost',
    dek: 'In simulation, the hexapod now finishes a 20-second walk about half a millimeter from where it was told to go. The trick: a ghost.',
    photo: '/blog/hexapod-sim-walk.webp',
    body: [
      "The hexapod got a redesign this fall. Our partners at Cornell Physical Intelligence (CUPI) moved it to direct drive: three motors on each leg, each turning its joint directly, for 18 in all and about 7.5 kg. It isn't built yet, so for now it lives in simulation, where a neural network learns to walk by practicing on 128 copies of the robot at once on the DGX Spark we share with CUPI.",
      "Walking was only half the problem. We also need it to go where it's told, because a survey robot that wanders is just an expensive way to get lost. Early walkers finished a 20-second stroll about 15 cm off target.",
      "So CUPI gave it a ghost: an invisible copy of the robot that follows every command perfectly. The controller can see how far it is from the ghost and earns reward for staying close. After a few rounds of training, **it finishes those same walks about half a millimeter from the ghost**, at a gentle 5 cm/s, with its heading barely moving.",
      { img: '/blog/hexapod-ghost-gap.svg', max: 668, alt: 'Line chart on a log scale. The median distance from the ghost after a 20-second walk starts at 152 mm with no ghost, then falls to 43, 14, 0.39, and 0.57 mm over four more training runs.' },
      "It's stubborn, too. Here it gets pushed off a ledge, lands upside down, and just keeps walking.",
      { video: '/projects/hexapod-walk.mp4', poster: '/projects/hexapod-walk.webp', max: 460, alt: 'In simulation, the hexapod is pushed off a ledge, lands upside down, and keeps walking.' },
      "Half a millimeter is a simulator number, since the simulator always knows exactly where the robot is. A real robot steering by GPS won't be so lucky, and that's one of the fun problems ahead. A newer version, still in review, is already walking at up to 15 cm/s in eight directions in CUPI's CPU simulator. Next up: the full test suite, faster turns, rough ground, and then building the real thing.",
    ],
    links: [
      { label: 'Explore the hexapod in 3D', href: '#/sensors/hexapod' },
      { label: "CUPI's progress site", href: 'https://cornell-physical-intelligence.github.io/hexapod-cupi/' },
    ],
  },
  {
    slug: 'summer-spotlight-suchit-basineni',
    kind: 'blog',
    date: 'August 2026',
    tag: 'Summer Spotlight',
    tagColor: '#4fae7d',
    title: 'Summer Spotlight: Suchit Basineni',
    dek: 'Suchit Basineni spent the summer with NOAA\'s Hurricane Research Division at AOML, stress-testing HAFS rainfall forecasts against Hurricane Helene.',
    photo: '/blog/suchit-nhc.webp',
    body: [
      "Suchit Basineni is a Computer Science major on GeoData's Tech Team.",
      'Through the **Lapenta Internship Program**, I worked at the **AOML (Atlantic Oceanographic and Meteorological Laboratory)** in Key Biscayne, FL. This summer I was working with the **Hurricane Research Division**, which works on improving hurricane models, data collection, and aircraft reconnaissance missions.',
      { img: '/blog/suchit-presenting.webp' },
      'I worked on analyzing and comparing precipitation outputs from **HAFS (Hurricane Analysis and Forecasting System)** on hurricane Helene to observed data by using various statistical methods. Apart from the results, I created a framework that creates a suite of products (graphs) to be able to investigate other storms too. The goal of the project was to identify faults in the model rainfall forecasts and how to better forecast extreme rainfall events that are associated with landfalling hurricanes.',
    ],
    links: [
      { label: 'NOAA AOML', href: 'https://www.aoml.noaa.gov/' },
      { label: 'Suchit on LinkedIn', href: 'https://www.linkedin.com/in/suchit-basineni/' },
    ],
  },
  {
    slug: 'summer-spotlight-orion-hoch',
    kind: 'blog',
    date: 'August 2026',
    tag: 'Summer Spotlight',
    tagColor: '#4fae7d',
    title: 'Summer Spotlight: Orion Hoch',
    dek: 'Co-Team Lead Orion Hoch spent the summer building 3Dsem, a beginner-friendly devkit for semantic segmentation of 3D point clouds.',
    photo: '/blog/lidar-scan.webp',
    body: [
      'Orion Hoch is a Computer Science major and Co-Team Lead of GeoData.',
      "I spent my summer in Minnesota building **3Dsem**, a devkit that makes semantic segmentation of 3D point clouds approachable for people who have never touched the tooling around it. Point clouds are just data abstractions of the real world, with my preference being the LiDAR point cloud space. LiDAR has been used heavily in geospatial workflows for decades as a way to capture an environment at multiple phases and measure gross change. The pipelines most devs are used to are very analytical in nature, and with advances in computer vision research in the 3D space, it has become obvious the field is in a major period of change. Incorporating CV techniques into geospatial workflows was a critical focus of mine this summer, and to ease people in, I decided to make the process of semantic segmentation (separating objects from their environment and then labeling them within space) as easy as possible for newer users.",
      { img: '/blog/segmentation-examples.webp' },
      "Most research code assumes you're comfortable untangling dependency trees and running Docker images before you can label a single point. This, plus the need for newer and better GPU power for inference, has made adoption harder than it needs to be for the people already on the fence. And that's before the training side, which is expensive, time consuming, and often incredibly bespoke to the datasets you are training on, adding an extra layer of complexity.",
      "So my goal was to make inference require zero dependency management or extra downloads for the user, and to make training consistent and easy to share. The trick was modularizing everything. **3Dsem** packages training files and pretrained weights as conda packages, with pixi lockfiles pinned to each model architecture, so installs have no dependency solving or Docker. On top of that I offer an open source GUI that exposes every step of the pipeline, letting users create custom weights with their own data and share them, giving the open source community complete control to make weights for specific datasets or tasks. And for the vast majority of users, the TUI handles fast inference and pulling premade weights for quick results on large data inputs.",
      { img: '/blog/pixi-mascot.webp' },
      "It's live on PyPI as **3Dsem** and the early reviews from people I've shown it to have been encouraging. Using newer transformer models like Utonia proved quite successful, registering great cross-domain numbers **between 0.81 and 0.89 mIoU** on the most common USGS survey data. I'm still fairly new to this kind of work, so I honestly don't know how useful any of it will turn out to be, but I find it interesting nonetheless, and pointing it at our own hexapod scans this fall feels like the right way to find out.",
      { img: '/blog/usgs-lidar.webp' },
    ],
    links: [
      { label: 'Explore the Ithaca LiDAR scan', href: '#/sensors/lidar' },
      { label: '3Dsem on PyPI', href: 'https://pypi.org/project/3Dsem/' },
      { label: 'Orion on LinkedIn', href: 'https://www.linkedin.com/in/orion-hoch/' },
    ],
  },
  {
    slug: 'summer-spotlight-evelyn-keefe',
    kind: 'blog',
    date: 'August 2026',
    tag: 'Summer Spotlight',
    tagColor: '#4fae7d',
    title: 'Summer Spotlight: Evelyn Keefe',
    dek: 'Evelyn Keefe on a summer at NCAR in Boulder: the NSF SOARS program, wildfire smoke, and what regional fires do to global surface pollution.',
    photo: '/blog/soars-cohort.webp',
    body: [
      'Evelyn Keefe is an Atmospheric Science major and the Air Team Lead of GeoData.',
      'I spent the summer in Boulder, Colorado, working at the **National Center for Atmospheric Research**. I was part of a larger internship program known as the **NSF SOARS program**, which allowed me to work on one research project with the support of multiple mentors. The program is set up so that you have one primary research mentor who oversees the science aspect, one writing mentor who provides feedback on the writing component of your project, and additional mentors who are optional to best support you during the summer. I also had a computational mentor who helped me with analyzing model outputs, as well as troubleshooting the model when it failed to run. Since I was using a model I had never worked with before, it was helpful to have so much support.',
      { img: '/blog/ucar-hangar.webp' },
      'My project was focused on quantifying the impact of wildfire smoke on global levels of surface pollution. We were working to contribute to a project known as **HTAP3**, or the Hemispheric Transport of Air Pollution project, phase 3. This project had a large scope and the overall goal of improving fire representations in models, including chemistry models. **My project contributed to a sensitivity analysis, which aims to understand how fire inputs into atmospheric chemical models change pollutant levels in different scenarios.** We were examining how fires in different regions around the world change global pollutant levels of surface ozone and fine particulate matter (PM).',
      { img: '/blog/cam-precipitable-water.webp' },
      'Together, my mentor and I chose to investigate fire emissions from North America and Australia. We used the Community Earth System Model version 2.2 to run different fire emissions scenarios and show us how pollutant behavior changed based on where fires occurred. We adapted a global emissions inventory to three separate scenarios: each without fires in Australia, Canada, or lower North America. After receiving the data, I calculated the percent contribution of each region to global pollution levels over the simulated study period. We found that Australian fires contributed **0.599%** to global surface levels of ozone, and **0.141%** of surface PM. In Canada, fires accounted for **0.364%** of surface ozone and **0.221%** of surface PM, and in lower North America, fires contributed **0.086%** to surface ozone, and **0.064%** to PM. We compared it to a full fire simulation to do these calculations. In this sense, it was more of a case study for how regional fires over this study period inform pollutant levels. The overall contributions were so low because these are the average contributions over the whole study period. **Fire contributions to surface pollutants follow a seasonal cycle, and these five-year averages are a snapshot of these contributions.** The workflow we created can be replicated for other sensitivity studies, and more regions will be examined in the future.',
      { img: '/blog/evelyn-presenting.webp' },
      "Other than the research, **summer in Boulder had a lot of other perks!** The proximity to nature was incredible, and I was able to go hiking during the weekends. I also got to experience Rocky Mountain National Park, visit UCAR's airplane hangar with research aircraft, and explore the haunted Stanley Hotel that inspired The Shining! **It was a great experience overall, and reaffirmed my desire to do research in the earth sciences.**",
      { img: '/blog/boulder-hiking.webp' },
    ],
    links: [
      { label: 'NSF SOARS program', href: 'https://soars.ucar.edu/' },
      { label: 'NCAR', href: 'https://ncar.ucar.edu/' },
    ],
    credit: 'Photos courtesy of Evelyn Keefe and the NSF SOARS program.',
  },
  {
    slug: 'lidar-hexapod',
    kind: 'project',
    date: 'August 2026',
    tag: 'Tech x CUPI',
    tagColor: '#c92556',
    title: 'LiDAR Hexapod',
    dek: 'An official partnership with Cornell University Physical Intelligence to build a self-navigating data collection hexapod for the earth sciences, starting with LiDAR.',
    photo: '/projects/hexapod.webp',
    body: [
      "This year, we are excited to announce an official partnership with Cornell University Physical Intelligence (CUPI) to build a self-navigating data collection hexapod for the earth sciences, starting with LiDAR collection. CUPI is one of the most inventive robotics teams on Cornell's campus, specializing in the use of AI to improve robotic manipulation and perception. They have previously honed their skills through drone racing, but now with GeoData they are taking steps to apply those skills in the field.",
      { img: '/blog/cupi-sticker.webp', max: 420, alt: 'The CUPI sticker: a red crab on a beach under the name CUPI, in a round black border.' },
      "Currently, the majority of LiDAR data is collected from aerial flights, satellites, or UAV scans. Satellites are convenient and offer high coverage, but their coarseness has become a major problem for important tasks like identification. UAV data, on the other hand, is very dense, but it is an expensive initial investment and comes with problems of range, flight planning, and local terrain that take a lot of time and energy to mitigate. The hexapod slots in as a nice in-between: the density is there, and range and availability are fixed by the cheapness of the design and long automated run times.",
      "Dense forest makes the problem concrete. In high-density canopy, coverage from above doesn't always penetrate: the crowns swallow the pulses, and the forest floor comes back patchy or not at all. The future of LiDAR and geotagged data is in data merging, combining passes into improved datasets that no single platform could produce alone. The UAV can cover the tops, the hexapod can cover the bottoms, and the merged cloud gets the whole forest.",
      { img: '/blog/forest-lidar.webp' },
      "The longer game for us is a digital twin of the Finger Lakes: a full 3D copy of the gorges, shorelines, and forests that you can revisit and compare season over season.",
      'The build is still in progress, but we are excited for the results.',
      { img: '/projects/hexapod-leg.webp' },
    ],
    links: [
      { label: 'Explore the hexapod in 3D', href: '#/sensors/hexapod' },
      { label: 'Cornell Physical Intelligence', href: 'https://cornellphysicalintelligence.com/' },
    ],
  },
  {
    slug: 'new-hardware-in-the-ell',
    kind: 'blog',
    date: 'July 2026',
    tag: 'Team news',
    tagColor: '#4fae7d',
    title: 'New Hardware in the ELL',
    dek: "There's a DGX Spark in the ELL now. Here's what we're planning to do with it, and why we're starting to host our own everything.",
    photo: '/blog/dgx-spark.webp',
    body: [
      "This semester we bought an NVIDIA DGX Spark, and it now lives in the ELL, with safe remote access for every GeoData student. It's a deceptively small box: a Grace Blackwell chip, 128GB of unified memory, about a petaFLOP of compute. For a relatively small student team, this brings a whole new world of possibilities to the analysis we can run.",
      "The first thing it unlocks is 3D scene reconstruction. Turning drone passes and LiDAR scans into finished models eats GPU time, and until now that meant doing the cost-benefit analysis of managing rental compute and CPU loading. Now, for smaller datasets, it takes minutes, which matters a lot for the constant iteration needed when implementing new research.",
      { img: '/blog/scene-scan.webp' },
      "The second is forecasting. Tools like NVIDIA's Earth2Studio put real ML weather models within reach of a team like ours. The plan is to pull coarse global forecast data and downscale it into something that actually says what the lake is about to do, then feed our own station data back in to sharpen the local predictions.",
      { img: '/blog/earth2-downscaling.webp' },
      "The coolest part, though, is the ability to give students on the team the compute to do their own personal projects. Supporting the independent work our teammates do is extremely important for keeping ideas fresh and building critical skills!",
      "The Spark is also the newest tenant in a bigger experiment: hosting our own infrastructure. The ELL now has a small lab network of its own, with a router, a switch, and a Proxmox hypervisor that runs the team's services, and the Spark joins it as the GPU node. Sensor data will flow over a Tailscale mesh into a self-hosted PostGIS and TimescaleDB database. The plan from there is our own little Slurm scheduler handing out jobs across the lab, spinning up cloud machines only when a job actually needs them and tearing them down the moment it finishes.",
      { img: '/blog/proxmox-lab.webp' },
      "Part of that is practical and part of it is philosophical. Hardware the club owns keeps working for whoever runs this team after us, costs nothing while it sits, and teaches everyone who touches it how the stack underneath their code actually works. The long-term goal is a club that depends on big organizations for as little as possible.",
    ],
    links: [
      { label: 'TESSERA / GeoTessera', href: 'https://geotessera.org/' },
      { label: 'NVIDIA DGX Spark', href: 'https://www.nvidia.com/en-us/products/workstations/dgx-spark/' },
      { label: 'NVIDIA Earth-2', href: 'https://www.nvidia.com/en-us/high-performance-computing/earth-2/' },
    ],
  },
  {
    slug: 'cayuga-lake-buoy',
    kind: 'project',
    date: 'July 2026',
    tag: 'Water',
    tagColor: '#2e6fc9',
    title: 'Cayuga Lake Buoy',
    dek: "A decommissioned buoy from Todd Cowen's hydraulics lab, being refitted into a single floating weather and water-quality station for Cayuga Lake.",
    photo: '/projects/sensors-lake.webp',
    body: [
      "The platform is a decommissioned research buoy that Todd Cowen's hydraulics lab no longer needed, and it's sitting in our lab right now, half stripped and getting a second life.",
      "The current goal for the project is not only mastering the anchoring setup required to create a long-term aquatic fixture on Cayuga Lake, but also developing a deeper understanding of lake-effect conditions. Careful placement of the buoy on specific sections of the lake can tell us a lot about the potential location and movement of storms over the water, and the landing zone of snow and rain.",
      { img: '/blog/nws-snowfall.webp' },
      "Up top it gets a waterproof weather station, a commercial Gill MaxiMet GMX-550, mounted above wave height, capturing wind speed and direction, temperature, humidity, pressure, solar radiation, and GPS location.",
      "Below the waterline goes the water-quality suite: temperature, dissolved oxygen, turbidity, and conductivity/pH, all reporting through one logger. The point is one coherent instrument for the lake instead of a scatter of gadgets that each need their own babysitting.",
    ],
    links: [
      { label: 'Gill MaxiMet GMX-550', href: 'https://gillinstruments.com/' },
      { label: 'DeFrees Hydraulics Laboratory', href: 'https://www.duffield.cornell.edu/cee/educational-facilities/' },
    ],
  },
  {
    slug: '3d-printed-weather-stations',
    kind: 'project',
    date: 'March 2026',
    tag: 'Tech x Air',
    tagColor: '#c92556',
    title: '3D Printed Weather Stations',
    dek: "Open-source weather stations printed to UCAR's 3DPAWS design, for about a tenth the price of the commercial version.",
    photo: '/projects/sensors.webp',
    body: [
      '3DPAWS is an open-source, 3D-printable weather station project from UCAR that produces standardized meteorological readings at a fraction of commercial cost. Ours are built and heading into the field around Cayuga Lake this fall.',
    ],
    links: [
      { label: '3DPAWS guidelines (UCAR)', href: 'https://3dpaws.comet.ucar.edu/' },
    ],
  },
  {
    slug: 'nisar-ground-truthing',
    kind: 'project',
    date: 'August 2025',
    tag: 'Rock',
    tagColor: '#c1703f',
    title: 'NISAR Ground-Truthing',
    dek: "Five soil-moisture nodes at the Game Farm site check NASA's NISAR satellite against what's actually in the dirt.",
    photo: '/projects/nisar.webp',
    body: [
      "Five Zynect Soilmote nodes at the Game Farm log volumetric water content about every half hour over LoRa. NISAR estimates the same quantity from orbit with radar; the nodes are the ground reference it gets checked against.",
      'CENSE and NINJA are reporting. GRASP, CAMPS, and GLITZ have stopped, and their full archives are on the data page.',
    ],
    links: [
      { label: 'Soil moisture charts', href: '#/sensors/soil' },
      { label: 'NISAR mission (NASA)', href: 'https://nisar.jpl.nasa.gov/' },
    ],
  },
  {
    slug: 'atmospheric-tethersonde',
    kind: 'project',
    date: 'May 2024',
    tag: 'Air',
    tagColor: '#6d9dcd',
    title: 'Atmospheric Tethersonde',
    dek: 'An affordable, portable atmospheric profiler, built for boundary-layer and lake-effect weather.',
    photo: '/projects/tethersonde.webp',
    body: [
      'The tethersonde is an affordable, portable atmospheric profiler. We built it to get high-resolution observations of boundary-layer and lake-effect weather.',
    ],
    links: [
    ],
  },
];
