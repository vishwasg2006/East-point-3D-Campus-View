// =====================================================================
//  CAMPUS LAYOUT — traced from the Google Maps satellite screenshot.
//
//  All coordinates below are in SCREENSHOT PIXELS (north = up, east = right),
//  measured on the first (zoomed-in) screenshot. They are converted to metres
//  with S (metres per pixel) so you can tune things by eye:
//
//    rects: [x1, y1, x2, y2]   -> top-left and bottom-right corner of a footprint
//    roads: pts [[x, y], ...]  -> polyline, w = road width in pixels
//
//  Names marked "(guess)" are NOT confirmed — rename them freely.
//  Floors are estimates. Scale is approximate.
// =====================================================================

export const CAMPUS = {
  name: 'East Point Group of Institutions',
  title: 'East Point Campus Tour',
  tagline: 'Interactive virtual tour',
};

export const S = 0.5;                 // metres per screenshot pixel (approx.)
export const ORIGIN = { x: 400, y: 800 };
export const X = (px) => (px - ORIGIN.x) * S;   // pixel x -> metres east
export const Z = (py) => (py - ORIGIN.y) * S;   // pixel y -> metres south
export const FLOOR_H = 3.4;

// Area of the screenshot that makes up the 3D world
export const BOUNDS = { x1: -130, y1: 330, x2: 720, y2: 1350 };

export const GROUPS = [
  { id: 'eng', name: 'College of Engineering', short: 'Engineering' },
  { id: 'he',  name: 'Higher Education · Pharmacy · Nursing', short: 'Higher Ed · Pharmacy · Nursing' },
  { id: 'pu',  name: 'Pre-University', short: 'Pre-University' },
  { id: 'med', name: 'Medical', short: 'Medical College' },
  { id: 'fac', name: 'Campus Facilities' },
];

export const ENTRIES = [
  /* ------------------------- Engineering ------------------------- */
  {
    id: 'mech', group: 'eng', kind: 'block',
    name: 'Mech Block', short: 'Mech Block',
    rects: [[375, 722, 422, 792]], floors: 4, solar: true, color: 0xc9d6ee,
    desc: 'Mechanical block of East Point College of Engineering',
    labs: [], facilities: [],
  },
  {
    id: 'mainA', group: 'eng', kind: 'courtyard',
    name: 'Admin Block · A Block', short: 'Main Block A',
    rects: [[440, 728, 505, 790]], inner: [455, 738, 487, 768], floors: 4, color: 0xd5def0,
    desc: 'A Block of the Main Block of East Point College of Engineering, built around an open green courtyard and attached to B Block.',
    labs: [], facilities: ['Central courtyard'],
  },
  {
    id: 'mainB', group: 'eng', kind: 'block',
    name: 'Admin Block · B Block', short: 'Admin Block ',
    rects: [[510, 722, 565, 790]], floors: 4, color: 0xc2cfe8,
    desc: 'B Block of the Main Block of East Point College of Engineering, attached to A Block and opposite the temple.',
    labs: [], facilities: [],
  },
  {
    id: 'sheds', group: 'eng', kind: 'shed',
    name: 'Workshop Sheds ', short: 'Sheds',
    rects: [[515, 580, 570, 615], [575, 570, 645, 600], [535, 620, 625, 655]], height: 6, color: 0xd5d8dc,
    desc: 'Low-rise shed buildings north-east of the Engineering blocks.',
    labs: [], facilities: [],
  },

  /* ------------------ Higher Education / Pharmacy / Nursing ------------------ */
  {
    id: 'he', group: 'he', kind: 'block',
    name: 'Higher Education Block', short: 'Higher Ed',
    rects: [[118, 645, 245, 697]], floors: 3, solar: true, color: 0xf0d9c2,
    desc: 'East Point College of Higher Education',
    labs: [], facilities: [],
  },
  {
    id: 'pharm', group: 'he', kind: 'block',
    name: 'Pharmacy Block', short: 'Pharmacy',
    rects: [[250, 645, 360, 700]], floors: 3, solar: true, color: 0xcfe6cf,
    desc: 'East Point College of Pharmacy, next to the Higher Education block.',
    labs: [], facilities: [],
  },
  {
    id: 'nursing', group: 'he', kind: 'block',
    name: 'Nursing Block', short: 'Nursing',
    rects: [[145, 740, 250, 790]], floors: 3, color: 0xf0cfd8,
    desc: 'East Point College of Nursing',
    labs: [], facilities: [],
  },
  {
    id: 'north', group: 'he', kind: 'block',
    name: 'Boys Hostel', short: 'Boys',
    rects: [[320, 488, 385, 625]], floors: 3, color: 0xe8e0cc,
    desc: 'Long north–south block on the northern edge of the campus.',
    labs: [], facilities: [],
  },

  /* --------------------------- Pre-University --------------------------- */
  {
    id: 'pu', group: 'pu', kind: 'block',
    name: 'Pre-University College', short: 'PU Block',
    rects: [[322, 845, 382, 1015]], floors: 4, solar: true, color: 0xf2e6b8,
    desc: 'East Point Pre-University College',
    labs: [], facilities: [],
  },

  /* ------------------------------ Medical ------------------------------ */
  {
    id: 'med', group: 'med', kind: 'block',
    name: 'Medical College', short: 'Medical',
    rects: [[185, 1215, 312, 1332]], floors: 5, solar: true, color: 0xdceaf0,
    desc: 'East Point College of Medical College, the largest block, at the southern end of the campus.',
    labs: [], facilities: [],
  },

  /* ----------------------------- Facilities ----------------------------- */
  {
    id: 'gate', group: 'fac', kind: 'gate',
    name: 'Main Gate', short: 'Main Gate',
    rects: [[-112, 954, -72, 982]], height: 7, labelFar: true,
    desc: 'Main entrance of the campus, next to Hostel B.',
    labs: [], facilities: [],
  },
  {
    id: 'diversion', group: 'fac', kind: 'marker',
    name: 'Road Diversion', short: 'Road Diversion',
    rects: [[20, 955, 50, 981]], height: 1, color: 0x38bdf8,
    desc: 'First junction inside the gate, where the road from the main gate meets the main road and splits towards the campus. The tour ends here.',
    labs: [], facilities: [],
  },
  {
    id: 'hostelA', group: 'fac', kind: 'block',
    name: 'Hostel Block A ', short: 'Hostel A',
    rects: [[-104, 835, 10, 877]], floors: 4, color: 0xe3d3ea,
    desc: 'Residential block west of the main internal road.',
    labs: [], facilities: [],
  },
  {
    id: 'hostelB', group: 'fac', kind: 'block',
    name: 'Hostel Block B ', short: 'Hostel B',
    rects: [[-104, 896, 10, 938]], floors: 4, color: 0xe3d3ea,
    desc: 'Residential block west of the main internal road, next to the main gate.',
    labs: [], facilities: [],
  },
  {
    id: 'ground', group: 'fac', kind: 'ground',
    name: 'Sports Ground', short: 'Sports Ground',
    rects: [[50, 850, 305, 1080]], height: 1,
    desc: 'Large open ground in the middle of the campus, beside the Pre-University block.',
    labs: [], facilities: ['Open play area', 'Football court', 'Basketball court'],
  },
  {
    id: 'football', group: 'fac', kind: 'football',
    name: 'Football Court', short: 'Football Court',
    rects: [[55, 862, 90, 925]], height: 1, color: 0x2e8b3d, labelMax: 150,
    desc: 'Football court at the north-west corner of the sports ground.',
    labs: [], facilities: [],
  },
  {
    id: 'court', group: 'fac', kind: 'court',
    name: 'Basketball Court', short: 'Basketball',
    rects: [[50, 975, 88, 1045]], height: 1, labelMax: 150,
    desc: 'Hard court at the western edge of the sports ground.',
    labs: [], facilities: [],
  },
  {
    id: 'maska', group: 'fac', kind: 'cafe',
    name: 'Maska Cafe', short: 'Maska Cafe',
    rects: [[388, 855, 426, 885]], floors: 1, color: 0xf2b36b, labelMax: 150,
    desc: 'Student hangout cafe, opposite the Mech Block',
    labs: [], facilities: ['Cafe','Bakery'],
  },
  {
    id: 'temple', group: 'fac', kind: 'temple',
    name: 'Temple', short: 'Temple',
    rects: [[580, 855, 612, 885]], height: 11, color: 0xe9c9a0, labelMax: 150,
    desc: 'Small temple on the campus, opposite the Main Block.',
    labs: [], facilities: [],
  },
];

/* ------------------------------- Roads ------------------------------- */
export const ROADS = [
  // public road along the east edge (Kithaganur – Bidarahalli road)
  { kind: 'main', w: 22, pts: [[668, 330], [680, 420], [690, 520], [688, 610], [676, 700], [656, 770], [649, 830], [668, 880], [720, 945]] },

  // internal roads
  { kind: 'road', w: 12, pts: [[35, 712], [630, 712]] },
  { kind: 'road', w: 12, pts: [[35, 845], [626, 845]] },
  { kind: 'road', w: 12, pts: [[628, 664], [628, 845]] },
  { kind: 'road', w: 10, pts: [[512, 692], [538, 664], [656, 664], [676, 684]] },
  { kind: 'road', w: 11, pts: [[358, 640], [358, 845]] },
  { kind: 'road', w: 10, pts: [[358, 640], [385, 636], [385, 712]] },
  { kind: 'road', w: 10, pts: [[435, 712], [435, 840]] },
  { kind: 'road', w: 12, pts: [[35, 712], [35, 1100]] },
  { kind: 'road', w: 9,  pts: [[318, 845], [318, 1020]] },
  { kind: 'road', w: 10, pts: [[35, 1088], [150, 1086], [275, 1076]] },
  { kind: 'road', w: 9,  pts: [[150, 1086], [158, 1150], [215, 1195]] },
  { kind: 'road', w: 9,  pts: [[275, 1076], [292, 1130], [255, 1185]] },
  { kind: 'road', w: 11, pts: [[35, 968], [-130, 968]] },
];

/* --------------- Terrain painting (colour patches on the ground) --------------- */
export const ZONES = [
  { type: 'field',  color: '#86b657', rect: [-130, 330, 300, 470] },
  { type: 'field',  color: '#6f9c4b', rect: [-130, 480, 215, 610] },
  { type: 'dirt',   color: '#c9ae84', rect: [350, 330, 640, 480] },
  { type: 'dirt',   color: '#c2a87e', rect: [388, 560, 515, 700] },
  { type: 'forest', color: '#3f6b3a', rect: [395, 860, 900, 1520] },
  { type: 'field',  color: '#a9905f', rect: [420, 1055, 512, 1175] },
  { type: 'field',  color: '#7b6647', rect: [-130, 1110, 140, 1350] },
];

/* --------------------- Tree areas (per100 = trees per 100 m²) --------------------- */
export const TREE_ZONES = [
  { rect: [395, 860, 840, 1480], per100: 2.4, forest: true },
  { rect: [310, 1090, 395, 1350], per100: 2.0, forest: true },
  { rect: [-130, 1110, 150, 1350], per100: 0.5 },
  { rect: [40, 795, 360, 842], per100: 1.4 },
  { rect: [505, 797, 625, 842], per100: 1.4 },
  { rect: [40, 718, 140, 790], per100: 1.0 },
  { rect: [430, 470, 520, 570], per100: 2.2, forest: true },
  { rect: [-130, 700, 30, 830], per100: 1.8, forest: true },
  { rect: [-130, 940, 30, 1100], per100: 1.8, forest: true },
];
