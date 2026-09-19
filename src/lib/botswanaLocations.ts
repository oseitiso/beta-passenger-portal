// Comprehensive Botswana locations — cities, towns, and significant villages.
// Sorted alphabetically for dropdown display.
// `priority` = higher is shown first when no search filter is applied.
//   priority 3 = city / district capital (always show)
//   priority 2 = major town (>5000 pop)
//   priority 1 = significant village
//   priority 0 = minor village

export interface BotswanaLocation {
  name: string;
  region: string;
  lat: number;
  lng: number;
  priority: number;
}

export const BOTSWANA_LOCATIONS: BotswanaLocation[] = [
  // ═══════════════ SOUTH-EAST / GREATER GABORONE ═══════════════
  { name: "Gaborone", region: "South East", lat: -24.6531, lng: 25.9113, priority: 3 },
  { name: "Gaborone West", region: "South East", lat: -24.6550, lng: 25.8900, priority: 2 },
  { name: "Gabane", region: "Kweneng", lat: -24.6667, lng: 25.7833, priority: 2 },
  { name: "Mmopane", region: "Kweneng", lat: -24.5667, lng: 25.8833, priority: 2 },
  { name: "Mogoditshane", region: "Kweneng", lat: -24.6167, lng: 25.8833, priority: 2 },
  { name: "Tlokweng", region: "South East", lat: -24.6667, lng: 25.9667, priority: 2 },
  { name: "Ramotswa", region: "South East", lat: -24.8667, lng: 25.8167, priority: 2 },
  { name: "Otse", region: "South East", lat: -24.9333, lng: 25.8167, priority: 1 },
  { name: "Lobatse", region: "South East", lat: -25.2167, lng: 25.6667, priority: 2 },
  { name: "Kanye", region: "Southern", lat: -24.9667, lng: 25.3333, priority: 3 },
  { name: "Moshupa", region: "Southern", lat: -24.7833, lng: 25.4167, priority: 2 },
  { name: "Thamaga", region: "Kweneng", lat: -24.6667, lng: 25.5333, priority: 2 },

  // ═══════════════ KWENENG DISTRICT ═══════════════
  { name: "Molepolole", region: "Kweneng", lat: -24.4, lng: 25.5333, priority: 3 },
  { name: "Lentsweletau", region: "Kweneng", lat: -24.25, lng: 25.85, priority: 1 },
  { name: "Letlhakeng", region: "Kweneng", lat: -24.1, lng: 25.0167, priority: 1 },
  { name: "Kopong", region: "Kweneng", lat: -24.4833, lng: 25.8833, priority: 1 },
  { name: "Metsimotlhabe", region: "Kweneng", lat: -24.55, lng: 25.8167, priority: 1 },
  { name: "Dutlwe", region: "Kweneng", lat: -23.9, lng: 23.9833, priority: 0 },
  { name: "Khudumelapye", region: "Kweneng", lat: -23.8833, lng: 24.8667, priority: 0 },
  { name: "Motokwe", region: "Kweneng", lat: -23.75, lng: 24.3167, priority: 0 },
  { name: "Takatokwane", region: "Kweneng", lat: -23.6833, lng: 24.4167, priority: 0 },
  { name: "Sojwe", region: "Kweneng", lat: -23.9, lng: 25.1167, priority: 0 },
  { name: "Tshwaane", region: "Kweneng", lat: -24.8333, lng: 25.3167, priority: 0 },
  { name: "Botlhapatlou", region: "Kweneng", lat: -23.9333, lng: 25.4333, priority: 0 },

  // ═══════════════ KGATLENG DISTRICT ═══════════════
  { name: "Mochudi", region: "Kgatleng", lat: -24.4167, lng: 26.15, priority: 3 },
  { name: "Artesia", region: "Kgatleng", lat: -24.3333, lng: 26.05, priority: 1 },
  { name: "Mmathubudukwane", region: "Kgatleng", lat: -24.6167, lng: 26.4667, priority: 1 },
  { name: "Malolwane", region: "Kgatleng", lat: -24.6, lng: 26.35, priority: 1 },
  { name: "Bokaa", region: "Kgatleng", lat: -24.45, lng: 26.0333, priority: 1 },
  { name: "Oodi", region: "Kgatleng", lat: -24.5167, lng: 26.1, priority: 1 },
  { name: "Morwa", region: "Kgatleng", lat: -24.5833, lng: 26.1, priority: 1 },
  { name: "Pilane", region: "Kgatleng", lat: -24.4167, lng: 26.1667, priority: 0 },
  { name: "Sikwane", region: "Kgatleng", lat: -24.65, lng: 26.35, priority: 0 },
  { name: "Olifants Drift", region: "Kgatleng", lat: -24.05, lng: 26.7167, priority: 0 },

  // ═══════════════ SOUTHERN DISTRICT ═══════════════
  { name: "Jwaneng", region: "Southern", lat: -24.6, lng: 24.7167, priority: 2 },
  { name: "Goodhope", region: "Southern", lat: -25.4667, lng: 25.45, priority: 1 },
  { name: "Mmathethe", region: "Southern", lat: -25.3, lng: 25.2667, priority: 1 },
  { name: "Mabutsane", region: "Southern", lat: -24.4, lng: 23.5833, priority: 0 },
  { name: "Kokong", region: "Southern", lat: -24.5, lng: 23.8667, priority: 0 },
  { name: "Morwamosu", region: "Southern", lat: -24.1333, lng: 23.5, priority: 0 },
  { name: "Werda", region: "Southern", lat: -25.25, lng: 23.2833, priority: 0 },
  { name: "Ranaka", region: "Southern", lat: -24.9667, lng: 25.4667, priority: 0 },
  { name: "Lotlhakane", region: "Southern", lat: -25.5, lng: 25.5, priority: 0 },
  { name: "Metlojane", region: "Southern", lat: -25.2333, lng: 25.6167, priority: 0 },

  // ═══════════════ CENTRAL DISTRICT ═══════════════
  { name: "Serowe", region: "Central", lat: -22.3833, lng: 26.7, priority: 3 },
  { name: "Palapye", region: "Central", lat: -22.55, lng: 27.1333, priority: 3 },
  { name: "Mahalapye", region: "Central", lat: -23.1, lng: 26.8, priority: 3 },
  { name: "Selebi-Phikwe", region: "Central", lat: -21.9833, lng: 27.8333, priority: 3 },
  { name: "Bobonong", region: "Central", lat: -21.9667, lng: 28.4333, priority: 2 },
  { name: "Orapa", region: "Central", lat: -21.3, lng: 25.3667, priority: 2 },
  { name: "Letlhakane", region: "Central", lat: -21.4167, lng: 25.5833, priority: 2 },
  { name: "Moiyabana", region: "Central", lat: -22.5333, lng: 26.9333, priority: 1 },
  { name: "Tutume", region: "Central", lat: -20.5, lng: 27.05, priority: 2 },
  { name: "Tonota", region: "Central", lat: -21.45, lng: 27.4667, priority: 2 },
  { name: "Shoshong", region: "Central", lat: -23.0333, lng: 26.5167, priority: 1 },
  { name: "Mookane", region: "Central", lat: -23.7, lng: 26.65, priority: 1 },
  { name: "Mmadinare", region: "Central", lat: -21.8833, lng: 27.75, priority: 1 },
  { name: "Nata", region: "Central", lat: -20.2167, lng: 26.1833, priority: 2 },
  { name: "Gweta", region: "Central", lat: -20.1833, lng: 25.2333, priority: 1 },
  { name: "Rakops", region: "Central", lat: -21.0167, lng: 24.3667, priority: 1 },
  { name: "Lerala", region: "Central", lat: -22.7833, lng: 27.7667, priority: 1 },
  { name: "Tswapong", region: "Central", lat: -22.65, lng: 27.45, priority: 0 },
  { name: "Maunatlala", region: "Central", lat: -22.6333, lng: 27.6, priority: 1 },
  { name: "Tamasane", region: "Central", lat: -22.7167, lng: 27.4, priority: 0 },
  { name: "Mogapi", region: "Central", lat: -22.55, lng: 27.2167, priority: 0 },
  { name: "Mokgware", region: "Central", lat: -22.4667, lng: 27.1333, priority: 0 },
  { name: "Goo-Tau", region: "Central", lat: -23.5833, lng: 26.4667, priority: 0 },
  { name: "Paje", region: "Central", lat: -22.3833, lng: 26.8, priority: 0 },
  { name: "Tshimoyapula", region: "Central", lat: -22.35, lng: 26.9667, priority: 0 },
  { name: "Lecheng", region: "Central", lat: -22.5, lng: 27.2, priority: 0 },
  { name: "Malaka", region: "Central", lat: -22.4667, lng: 27.3333, priority: 0 },
  { name: "Dibete", region: "Central", lat: -23.65, lng: 26.5833, priority: 0 },
  { name: "Mmutlane", region: "Central", lat: -22.6167, lng: 27.05, priority: 0 },
  { name: "Toromoja", region: "Central", lat: -21.05, lng: 24.9333, priority: 0 },
  { name: "Kedia", region: "Central", lat: -21.05, lng: 25.1, priority: 0 },
  { name: "Mopipi", region: "Central", lat: -21.1833, lng: 24.8667, priority: 0 },
  { name: "Xhumo", region: "Central", lat: -21.6667, lng: 25.5833, priority: 0 },
  { name: "Mokoboxane", region: "Central", lat: -21.1667, lng: 24.8167, priority: 0 },
  { name: "Lepashe", region: "Central", lat: -21.0167, lng: 25.6167, priority: 0 },
  { name: "Zoroga", region: "Central", lat: -20.6667, lng: 25.9, priority: 0 },
  { name: "Sua", region: "Central", lat: -20.05, lng: 26.15, priority: 0 },
  { name: "Mogobane", region: "Central", lat: -22.95, lng: 26.7833, priority: 0 },
  { name: "Sefhare", region: "Central", lat: -23.05, lng: 27.05, priority: 0 },
  { name: "Chadibe", region: "Central", lat: -23.0167, lng: 27.2, priority: 0 },
  { name: "Mathangwane", region: "Central", lat: -21.15, lng: 27.35, priority: 0 },
  { name: "Borolong", region: "Central", lat: -21.05, lng: 27.3, priority: 0 },
  { name: "Natale", region: "Central", lat: -21.0167, lng: 27.2833, priority: 0 },
  { name: "Makaleng", region: "Central", lat: -20.9, lng: 27.3167, priority: 0 },
  { name: "Sebina", region: "Central", lat: -20.85, lng: 27.25, priority: 0 },
  { name: "Tati Siding", region: "North East", lat: -21.25, lng: 27.45, priority: 1 },
  { name: "Matshelagabedi", region: "North East", lat: -21.1667, lng: 27.5833, priority: 0 },

  // ═══════════════ NORTH EAST DISTRICT ═══════════════
  { name: "Francistown", region: "North East", lat: -21.1702, lng: 27.5089, priority: 3 },
  { name: "Masunga", region: "North East", lat: -20.6167, lng: 27.4333, priority: 2 },
  { name: "Jackalas No. 2", region: "North East", lat: -20.9167, lng: 27.5, priority: 0 },
  { name: "Maitengwe", region: "North East", lat: -20.85, lng: 27.4167, priority: 0 },
  { name: "Mabolwe", region: "North East", lat: -21.4167, lng: 28.1833, priority: 0 },
  { name: "Matsiloje", region: "North East", lat: -21.35, lng: 28.2333, priority: 0 },
  { name: "Sekakangwe", region: "North East", lat: -20.9667, lng: 27.4167, priority: 0 },
  { name: "Themashanga", region: "North East", lat: -20.8333, lng: 27.4, priority: 0 },
  { name: "Ramokgwebana", region: "North East", lat: -20.6833, lng: 27.65, priority: 0 },

  // ═══════════════ NORTH WEST DISTRICT ═══════════════
  { name: "Maun", region: "North West", lat: -19.9833, lng: 23.4167, priority: 3 },
  { name: "Shakawe", region: "North West", lat: -18.3667, lng: 21.85, priority: 2 },
  { name: "Gumare", region: "North West", lat: -19.3667, lng: 22.15, priority: 2 },
  { name: "Tsau", region: "North West", lat: -20.15, lng: 22.45, priority: 1 },
  { name: "Nokaneng", region: "North West", lat: -19.6667, lng: 22.2667, priority: 1 },
  { name: "Sepopa", region: "North West", lat: -18.75, lng: 22.1833, priority: 1 },
  { name: "Etsha 13", region: "North West", lat: -19.05, lng: 22.2, priority: 0 },
  { name: "Seronga", region: "North West", lat: -18.8167, lng: 22.4167, priority: 0 },
  { name: "Sankuyo", region: "North West", lat: -19.1833, lng: 23.4333, priority: 0 },
  { name: "Mababe", region: "North West", lat: -19.0333, lng: 23.9333, priority: 0 },
  { name: "Khwai", region: "North West", lat: -19.1833, lng: 23.7833, priority: 0 },

  // ═══════════════ CHOBE DISTRICT ═══════════════
  { name: "Kasane", region: "Chobe", lat: -17.8167, lng: 25.15, priority: 3 },
  { name: "Kazungula", region: "Chobe", lat: -17.8, lng: 25.2667, priority: 2 },
  { name: "Pandamatenga", region: "Chobe", lat: -18.5333, lng: 25.6333, priority: 1 },
  { name: "Parakarungu", region: "Chobe", lat: -18.4833, lng: 24.35, priority: 0 },
  { name: "Satau", region: "Chobe", lat: -18.2333, lng: 24.4, priority: 0 },
  { name: "Lesoma", region: "Chobe", lat: -17.8167, lng: 25.25, priority: 0 },
  { name: "Mabele", region: "Chobe", lat: -17.9, lng: 25.0833, priority: 0 },

  // ═══════════════ GHANZI DISTRICT ═══════════════
  { name: "Ghanzi", region: "Ghanzi", lat: -21.7, lng: 21.65, priority: 3 },
  { name: "Charles Hill", region: "Ghanzi", lat: -22.2667, lng: 20.1, priority: 1 },
  { name: "Dekar", region: "Ghanzi", lat: -21.5333, lng: 21.8333, priority: 0 },
  { name: "D'Kar", region: "Ghanzi", lat: -21.7833, lng: 21.5167, priority: 0 },
  { name: "New Xade", region: "Ghanzi", lat: -22.25, lng: 22.35, priority: 0 },
  { name: "Kuke", region: "Ghanzi", lat: -21.9833, lng: 22.2667, priority: 0 },
  { name: "Bere", region: "Ghanzi", lat: -21.8333, lng: 21.0333, priority: 0 },
  { name: "East Hanahai", region: "Ghanzi", lat: -21.95, lng: 21.7833, priority: 0 },
  { name: "West Hanahai", region: "Ghanzi", lat: -21.95, lng: 21.7, priority: 0 },
  { name: "Kacgae", region: "Ghanzi", lat: -22.2, lng: 21.1833, priority: 0 },
  { name: "Qabo", region: "Ghanzi", lat: -21.8333, lng: 21.4167, priority: 0 },

  // ═══════════════ KGALAGADI DISTRICT ═══════════════
  { name: "Tsabong", region: "Kgalagadi", lat: -26.05, lng: 22.45, priority: 3 },
  { name: "Hukuntsi", region: "Kgalagadi", lat: -23.9833, lng: 21.75, priority: 2 },
  { name: "Kang", region: "Kgalagadi", lat: -23.6667, lng: 22.7833, priority: 2 },
  { name: "Lehututu", region: "Kgalagadi", lat: -23.95, lng: 21.85, priority: 0 },
  { name: "Lokgwabe", region: "Kgalagadi", lat: -23.7333, lng: 21.6667, priority: 0 },
  { name: "Tshane", region: "Kgalagadi", lat: -24.0167, lng: 21.8833, priority: 0 },
  { name: "Inalegolo", region: "Kgalagadi", lat: -23.7333, lng: 22.1667, priority: 0 },
  { name: "Phuduhudu", region: "Kgalagadi", lat: -23.65, lng: 22.5, priority: 0 },
  { name: "Kolonkwaneng", region: "Kgalagadi", lat: -23.9833, lng: 22.3667, priority: 0 },
  { name: "Zutswa", region: "Kgalagadi", lat: -24.1667, lng: 21.65, priority: 0 },
  { name: "Khuis", region: "Kgalagadi", lat: -26.6667, lng: 21.7667, priority: 0 },
  { name: "Middlepits", region: "Kgalagadi", lat: -26.6167, lng: 22.8333, priority: 0 },
  { name: "Werda", region: "Kgalagadi", lat: -25.2667, lng: 23.2833, priority: 0 },
  { name: "Omaweneno", region: "Kgalagadi", lat: -25.7, lng: 22.4333, priority: 0 },
  { name: "Kisa", region: "Kgalagadi", lat: -25.35, lng: 22.6, priority: 0 },
  { name: "Maralaleng", region: "Kgalagadi", lat: -25.1167, lng: 22.7833, priority: 0 },
  { name: "Bogogobo", region: "Kgalagadi", lat: -26.1833, lng: 22.1333, priority: 0 },
  { name: "Bray", region: "Kgalagadi", lat: -25.45, lng: 23.7, priority: 0 },
  { name: "Keng", region: "Kgalagadi", lat: -25.4333, lng: 22.7833, priority: 0 },

  // ═══════════════ ADDITIONAL NAMED SETTLEMENTS ═══════════════
  { name: "Bokspits", region: "Kgalagadi", lat: -26.9, lng: 20.6833, priority: 0 },
  { name: "Struizendam", region: "Kgalagadi", lat: -26.6833, lng: 20.6, priority: 0 },
  { name: "Vaalhoek", region: "Kgalagadi", lat: -26.9, lng: 20.75, priority: 0 },
  { name: "Maleshe", region: "Kgalagadi", lat: -25.05, lng: 25.1667, priority: 0 },
  { name: "Marojane", region: "Kgalagadi", lat: -25.2167, lng: 25.4167, priority: 0 },
  { name: "Digawana", region: "Southern", lat: -25.1333, lng: 25.5, priority: 0 },
  { name: "Gasita", region: "Southern", lat: -25.0167, lng: 25.25, priority: 0 },
  { name: "Logaganeng", region: "Southern", lat: -25.0167, lng: 25.35, priority: 0 },
  { name: "Lorolwana", region: "Southern", lat: -25.3167, lng: 25.5333, priority: 0 },
  { name: "Mabule", region: "Southern", lat: -25.1667, lng: 25.5333, priority: 0 },
  { name: "Sese", region: "Southern", lat: -25.0167, lng: 25.1167, priority: 0 },
  { name: "Pitsane", region: "Southern", lat: -25.45, lng: 25.55, priority: 0 },
  { name: "Mokatako", region: "Southern", lat: -25.35, lng: 25.5, priority: 0 },
  { name: "Mogojogojo", region: "Southern", lat: -25.1, lng: 25.5, priority: 0 },
  { name: "Motlhabaneng", region: "Central", lat: -22.05, lng: 28.3833, priority: 0 },
  { name: "Gobojango", region: "Central", lat: -21.8333, lng: 28.7333, priority: 0 },
  { name: "Semolale", region: "Central", lat: -21.7333, lng: 28.7, priority: 0 },
  { name: "Tobane", region: "Central", lat: -21.9, lng: 28.3667, priority: 0 },
  { name: "Molalatau", region: "Central", lat: -22.0333, lng: 28.4, priority: 0 },
  { name: "Lentswelemoriti", region: "Central", lat: -22.05, lng: 28.55, priority: 0 },
  { name: "Mathathane", region: "Central", lat: -22.1667, lng: 28.7, priority: 0 },
  { name: "Damochujenaa", region: "Central", lat: -21.6333, lng: 28.5667, priority: 0 },
  { name: "Sefhophe", region: "Central", lat: -21.3833, lng: 28.3667, priority: 0 },
  { name: "Tsetsebjwe", region: "Central", lat: -21.55, lng: 28.4167, priority: 0 },
  { name: "Lephepe", region: "Central", lat: -22.2, lng: 27.3833, priority: 0 },
  { name: "Motloutse", region: "Central", lat: -22.1833, lng: 28.35, priority: 0 },
  { name: "Gojwane", region: "Central", lat: -21.6, lng: 27.3, priority: 0 },
  { name: "Mosu", region: "Central", lat: -21.05, lng: 25.5667, priority: 0 },
  { name: "Matsitama", region: "Central", lat: -20.4, lng: 26.8833, priority: 0 },
  { name: "Sepako", region: "Central", lat: -20.15, lng: 26.4833, priority: 0 },
  { name: "Manakanagore", region: "Central", lat: -20.1667, lng: 26.4, priority: 0 },
  { name: "Mmadikola", region: "Central", lat: -20.25, lng: 26.3, priority: 0 },
  { name: "Nxamasere", region: "North West", lat: -18.6167, lng: 21.7, priority: 0 },
  { name: "Xakao", region: "North West", lat: -18.5, lng: 21.7, priority: 0 },
  { name: "Ngarange", region: "North West", lat: -18.55, lng: 21.6, priority: 0 },
  { name: "Mogotlho", region: "North West", lat: -18.75, lng: 22.15, priority: 0 },
  { name: "Beetsha", region: "North West", lat: -18.85, lng: 22.25, priority: 0 },
  { name: "Gudigwa", region: "North West", lat: -18.95, lng: 22.4, priority: 0 },
  { name: "Kauxwhi", region: "North West", lat: -18.5833, lng: 21.9, priority: 0 },
  { name: "Tobere", region: "North West", lat: -19.25, lng: 22.8667, priority: 0 },
  { name: "Habu", region: "North West", lat: -19.45, lng: 22.15, priority: 0 },
  { name: "Nxauxau", region: "North West", lat: -19.7833, lng: 21.6, priority: 0 },
  { name: "Chobokwane", region: "North West", lat: -20.0833, lng: 21.75, priority: 0 },
  { name: "D'Kar Village", region: "Ghanzi", lat: -21.7833, lng: 21.5167, priority: 0 },
];

// ── Helpers ──────────────────────────────────────────────────────────────

/** Haversine distance in kilometres between two lat/lng pairs */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest Botswana location to a given lat/lng.
 * Returns the location plus the distance in km.
 */
export function findNearestTown(
  lat: number,
  lng: number
): { location: BotswanaLocation; distanceKm: number } | null {
  if (!BOTSWANA_LOCATIONS.length) return null;

  let best = BOTSWANA_LOCATIONS[0];
  let bestDist = haversineKm(lat, lng, best.lat, best.lng);

  for (let i = 1; i < BOTSWANA_LOCATIONS.length; i++) {
    const loc = BOTSWANA_LOCATIONS[i];
    const d = haversineKm(lat, lng, loc.lat, loc.lng);
    if (d < bestDist) {
      best = loc;
      bestDist = d;
    }
  }

  return { location: best, distanceKm: bestDist };
}

/**
 * Filter locations by a text query.
 * Match on name OR region, case-insensitive.
 * Orders results by priority (desc), then name (asc).
 * Caps at `limit` results (default 20).
 */
export function searchLocations(
  query: string,
  limit = 20
): BotswanaLocation[] {
  const clean = query.trim().toLowerCase();

  const filtered = clean
    ? BOTSWANA_LOCATIONS.filter(
        (l) =>
          l.name.toLowerCase().includes(clean) ||
          l.region.toLowerCase().includes(clean)
      )
    : [...BOTSWANA_LOCATIONS];

  filtered.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.name.localeCompare(b.name);
  });

  return filtered.slice(0, limit);
}