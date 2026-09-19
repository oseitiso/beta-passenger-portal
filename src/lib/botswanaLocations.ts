export interface BotswanaLocation {
  name: string;
  region: string;
  lat: number;
  lng: number;
}

export const BOTSWANA_LOCATIONS: BotswanaLocation[] = [
  // South East / Greater Gaborone
  { name: "Gaborone", region: "South East", lat: -24.6531, lng: 25.9113 },
  { name: "Mogoditshane", region: "Kweneng", lat: -24.6167, lng: 25.8833 },
  { name: "Ramotswa", region: "South East", lat: -24.8667, lng: 25.8167 },
  { name: "Tlokweng", region: "South East", lat: -24.6667, lng: 25.9667 },
  { name: "Mmopane", region: "Kweneng", lat: -24.5667, lng: 25.8833 },
  { name: "Lobatse", region: "South East", lat: -25.2167, lng: 25.6667 },

  // Kweneng
  { name: "Molepolole", region: "Kweneng", lat: -24.4, lng: 25.5333 },
  { name: "Moshupa", region: "Southern", lat: -24.7833, lng: 25.4167 },
  { name: "Thamaga", region: "Kweneng", lat: -24.6667, lng: 25.5333 },
  { name: "Lentsweletau", region: "Kweneng", lat: -24.25, lng: 25.85 },

  // Kgatleng
  { name: "Mochudi", region: "Kgatleng", lat: -24.4167, lng: 26.15 },
  { name: "Artesia", region: "Kgatleng", lat: -24.3333, lng: 26.05 },
  { name: "Mmathubudukwane", region: "Kgatleng", lat: -24.6167, lng: 26.4667 },

  // Southern
  { name: "Kanye", region: "Southern", lat: -24.9667, lng: 25.3333 },
  { name: "Jwaneng", region: "Southern", lat: -24.6, lng: 24.7167 },
  { name: "Goodhope", region: "Southern", lat: -25.4667, lng: 25.45 },
  { name: "Mmathethe", region: "Southern", lat: -25.3, lng: 25.2667 },

  // Central
  { name: "Serowe", region: "Central", lat: -22.3833, lng: 26.7 },
  { name: "Palapye", region: "Central", lat: -22.55, lng: 27.1333 },
  { name: "Mahalapye", region: "Central", lat: -23.1, lng: 26.8 },
  { name: "Selebi-Phikwe", region: "Central", lat: -21.9833, lng: 27.8333 },
  { name: "Bobonong", region: "Central", lat: -21.9667, lng: 28.4333 },
  { name: "Orapa", region: "Central", lat: -21.3, lng: 25.3667 },
  { name: "Letlhakane", region: "Central", lat: -21.4167, lng: 25.5833 },
  { name: "Moiyabana", region: "Central", lat: -22.5333, lng: 26.9333 },
  { name: "Tutume", region: "Central", lat: -20.5, lng: 27.05 },
  { name: "Tonota", region: "Central", lat: -21.45, lng: 27.4667 },

  // North East
  { name: "Francistown", region: "North East", lat: -21.1702, lng: 27.5089 },
  { name: "Masunga", region: "North East", lat: -20.6167, lng: 27.4333 },
  { name: "Tati Siding", region: "North East", lat: -21.25, lng: 27.45 },

  // North West
  { name: "Maun", region: "North West", lat: -19.9833, lng: 23.4167 },
  { name: "Shakawe", region: "North West", lat: -18.3667, lng: 21.85 },
  { name: "Gumare", region: "North West", lat: -19.3667, lng: 22.15 },
  { name: "Tsau", region: "North West", lat: -20.15, lng: 22.45 },

  // Chobe
  { name: "Kasane", region: "Chobe", lat: -17.8167, lng: 25.15 },
  { name: "Kazungula", region: "Chobe", lat: -17.8, lng: 25.2667 },

  // Ghanzi
  { name: "Ghanzi", region: "Ghanzi", lat: -21.7, lng: 21.65 },
  { name: "Charles Hill", region: "Ghanzi", lat: -22.2667, lng: 20.1 },

  // Kgalagadi
  { name: "Tsabong", region: "Kgalagadi", lat: -26.05, lng: 22.45 },
  { name: "Hukuntsi", region: "Kgalagadi", lat: -23.9833, lng: 21.75 },
  { name: "Kang", region: "Kgalagadi", lat: -23.6667, lng: 22.7833 },
];

export function searchLocations(query: string): BotswanaLocation[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return BOTSWANA_LOCATIONS;
  return BOTSWANA_LOCATIONS.filter(
    (l) =>
      l.name.toLowerCase().includes(clean) ||
      l.region.toLowerCase().includes(clean)
  );
}