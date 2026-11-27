// Servizio per il calcolo automatico di:
// 1. Geocoding tappe e indirizzi (Photon / OpenStreetMap Nominatim + Gazetteer Poli Logistici FOUR & Città Italiane)
// 2. Calcolo percorso stradale reale, Km totali, tempi di guida e % tratta autostradale (OSRM Public Routing API)
// 3. Profilo Orografico / Altimetrico (Open-Meteo Elevation API): quota min/max, dislivello positivo D+ (m),
//    classificazione terreno (Pianeggiante / Collinare / Appenninico-Montano), correzione consumi (BEV rigenerativo vs Bio-LNG)
//    e stima pedaggio autostradale per classe mezzo pesante (2, 3 o 5 assi).

export const KNOWN_LOGISTICS_HUBS = [
  // I 5 Poli Operativi FOUR
  { name: 'Bologna Interporto (Bentivoglio)', aliases: ['bologna interporto', 'interporto bologna', 'bentivoglio', 'polo bologna'], lat: 44.6186, lon: 11.4258, region: 'Emilia-Romagna' },
  { name: 'Bologna', aliases: ['bologna', 'bo', 'camst bologna', 'granarolo bologna'], lat: 44.4949, lon: 11.3426, region: 'Emilia-Romagna' },
  { name: 'Buccinasco (MI)', aliases: ['buccinasco', 'polo buccinasco', 'milano sud'], lat: 45.4219, lon: 9.1136, region: 'Lombardia' },
  { name: 'Landriano (PV)', aliases: ['landriano', 'polo landriano'], lat: 45.3134, lon: 9.2618, region: 'Lombardia' },
  { name: 'Caorso (PC)', aliases: ['caorso', 'polo caorso'], lat: 45.0485, lon: 9.8732, region: 'Emilia-Romagna' },
  { name: 'Arborio (VC)', aliases: ['arborio', 'polo arborio'], lat: 45.4958, lon: 8.3872, region: 'Piemonte' },

  // Principali Hub e Città Italiane
  { name: 'Milano', aliases: ['milano', 'mi'], lat: 45.4642, lon: 9.1900, region: 'Lombardia' },
  { name: 'Torino', aliases: ['torino', 'to', 'orbassano', 'rivoli'], lat: 45.0703, lon: 7.6869, region: 'Piemonte' },
  { name: 'Piacenza', aliases: ['piacenza', 'pc', 'castel san giovanni', 'le mose'], lat: 45.0526, lon: 9.6930, region: 'Emilia-Romagna' },
  { name: 'Parma', aliases: ['parma', 'pr', 'interporto parma', 'fontevivo'], lat: 44.8015, lon: 10.3279, region: 'Emilia-Romagna' },
  { name: 'Reggio Emilia', aliases: ['reggio emilia', 're'], lat: 44.6989, lon: 10.6297, region: 'Emilia-Romagna' },
  { name: 'Modena', aliases: ['modena', 'mo', 'campogalliano', 'carpi'], lat: 44.6471, lon: 10.9252, region: 'Emilia-Romagna' },
  { name: 'Ferrara', aliases: ['ferrara', 'fe'], lat: 44.8381, lon: 11.6198, region: 'Emilia-Romagna' },
  { name: 'Ravenna', aliases: ['ravenna', 'ra', 'porto ravenna'], lat: 44.4184, lon: 12.2035, region: 'Emilia-Romagna' },
  { name: 'Forlì', aliases: ['forli', 'forlì', 'cesena', 'fc'], lat: 44.2227, lon: 12.0407, region: 'Emilia-Romagna' },
  { name: 'Rimini', aliases: ['rimini', 'rn'], lat: 44.0678, lon: 12.5695, region: 'Emilia-Romagna' },
  { name: 'Verona', aliases: ['verona', 'vr', 'quadrante europa', 'interporto verona'], lat: 45.4384, lon: 10.9916, region: 'Veneto' },
  { name: 'Padova', aliases: ['padova', 'pd', 'interporto padova'], lat: 45.4064, lon: 11.8768, region: 'Veneto' },
  { name: 'Venezia / Mestre', aliases: ['venezia', 'mestre', 'marghera', 've'], lat: 45.4754, lon: 12.2368, region: 'Veneto' },
  { name: 'Vicenza', aliases: ['vicenza', 'vi'], lat: 45.5455, lon: 11.5354, region: 'Veneto' },
  { name: 'Treviso', aliases: ['treviso', 'tv'], lat: 45.6669, lon: 12.2430, region: 'Veneto' },
  { name: 'Brescia', aliases: ['brescia', 'bs'], lat: 45.5416, lon: 10.2118, region: 'Lombardia' },
  { name: 'Bergamo', aliases: ['bergamo', 'bg'], lat: 45.6983, lon: 9.6773, region: 'Lombardia' },
  { name: 'Novara', aliases: ['novara', 'no', 'interporto novara'], lat: 45.4469, lon: 8.6222, region: 'Piemonte' },
  { name: 'Vercelli', aliases: ['vercelli', 'vc'], lat: 45.3251, lon: 8.4234, region: 'Piemonte' },
  { name: 'Cossato (BI)', aliases: ['cossato', 'biella', 'bi'], lat: 45.5681, lon: 8.1705, region: 'Piemonte' },
  { name: 'Gravedona (CO)', aliases: ['gravedona', 'como', 'co'], lat: 46.1456, lon: 9.3005, region: 'Lombardia' },
  { name: 'Varese', aliases: ['varese', 'va', 'busto arsizio', 'gallarate', 'malpensa'], lat: 45.8206, lon: 8.8251, region: 'Lombardia' },
  { name: 'Pavia', aliases: ['pavia', 'pv'], lat: 45.1847, lon: 9.1582, region: 'Lombardia' },
  { name: 'Cremona', aliases: ['cremona', 'cr'], lat: 45.1332, lon: 10.0227, region: 'Lombardia' },
  { name: 'Mantova', aliases: ['mantova', 'mn'], lat: 45.1564, lon: 10.7914, region: 'Lombardia' },
  { name: 'Genova', aliases: ['genova', 'ge', 'porto genova'], lat: 44.4056, lon: 8.9463, region: 'Liguria' },
  { name: 'La Spezia', aliases: ['la spezia', 'spezia', 'sp'], lat: 44.1025, lon: 9.8241, region: 'Liguria' },
  { name: 'Alessandria', aliases: ['alessandria', 'al', 'tortona', 'rivalta scrivia'], lat: 44.9129, lon: 8.6153, region: 'Piemonte' },
  { name: 'Cuneo', aliases: ['cuneo', 'cn', 'alba', 'bra'], lat: 44.3845, lon: 7.5427, region: 'Piemonte' },
  { name: 'Firenze', aliases: ['firenze', 'fi', 'calenzano', 'campi bisenzio', 'prato'], lat: 43.7696, lon: 11.2558, region: 'Toscana' },
  { name: 'Pisa / Livorno', aliases: ['pisa', 'livorno', 'interporto vespucci', 'guasticce'], lat: 43.6226, lon: 10.3822, region: 'Toscana' },
  { name: 'Arezzo', aliases: ['arezzo', 'ar'], lat: 43.4633, lon: 11.8796, region: 'Toscana' },
  { name: 'Siena', aliases: ['siena', 'si'], lat: 43.3188, lon: 11.3308, region: 'Toscana' },
  { name: 'Perugia', aliases: ['perugia', 'pg', 'foligno', 'terni'], lat: 43.1107, lon: 12.3908, region: 'Umbria' },
  { name: 'Ancona', aliases: ['ancona', 'an', 'jesi', 'interporto marche'], lat: 43.6158, lon: 13.5189, region: 'Marche' },
  { name: 'Pesaro', aliases: ['pesaro', 'pu', 'fano'], lat: 43.9102, lon: 12.9133, region: 'Marche' },
  { name: 'Roma', aliases: ['roma', 'rm', 'fiano romano', 'pomezia', 'santa palomba'], lat: 41.9028, lon: 12.4964, region: 'Lazio' },
  { name: 'Fiano Romano (RM)', aliases: ['fiano romano', 'hub roma nord'], lat: 42.1674, lon: 12.5964, region: 'Lazio' },
  { name: 'Napoli', aliases: ['napoli', 'na', 'nola', 'interporto nola', 'marcianise'], lat: 40.8518, lon: 14.2681, region: 'Campania' },
  { name: 'Bari', aliases: ['bari', 'ba', 'interporto bari'], lat: 41.1171, lon: 16.8719, region: 'Puglia' },
  { name: 'Pescara', aliases: ['pescara', 'pe', 'chieti'], lat: 42.4618, lon: 14.2161, region: 'Abruzzo' },
  { name: 'Trento', aliases: ['trento', 'tn', 'interporto trento'], lat: 46.0748, lon: 11.1217, region: 'Trentino-Alto Adige' },
  { name: 'Bolzano', aliases: ['bolzano', 'bz', 'brennero'], lat: 46.4983, lon: 11.3548, region: 'Trentino-Alto Adige' },
  { name: 'Udine', aliases: ['udine', 'ud', 'cervignano', 'trieste', 'pordenone'], lat: 46.0711, lon: 13.2346, region: 'Friuli-Venezia Giulia' }
];

/**
 * Calcola la distanza in linea d'aria (Haversine) in km tra due coordinate
 */
const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 7000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

/**
 * Risolve un indirizzo o nome località in coordinate geografiche { lat, lon, displayName }
 * Usa Photon (OpenStreetMap) + Nominatim fallback + dizionario locale immediato
 */
export const geocodeStopAddress = async (rawQuery) => {
  const q = (rawQuery || '').trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  // 1. Match diretto esatto nel dizionario poli/città (se non contiene "via ", "viale ", "piazza ", "strada ", numeri civici)
  const hasStreetAddress = /\b(via|viale|piazza|strada|corso|localit[aà]|sp\d+|ss\d+)\b/i.test(lower);
  if (!hasStreetAddress) {
    const exactHub = KNOWN_LOGISTICS_HUBS.find(
      h => h.name.toLowerCase() === lower || h.aliases.includes(lower)
    );
    if (exactHub) {
      return {
        lat: exactHub.lat,
        lon: exactHub.lon,
        displayName: exactHub.name,
        source: 'hub_gazetteer'
      };
    }
  }

  // 2. API pubblica Photon Komoot (OpenStreetMap) - veloce e CORS-friendly
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=3&lang=it&bbox=6.5,35.4,18.6,47.2`;
    const res = await fetchWithTimeout(photonUrl);
    if (res.ok) {
      const data = await res.json();
      if (data?.features?.length > 0) {
        const feat = data.features[0];
        const [lon, lat] = feat.geometry.coordinates;
        const props = feat.properties || {};
        const labelParts = [props.name, props.street, props.housenumber, props.city || props.town || props.locality, props.state].filter(Boolean);
        const displayName = Array.from(new Set(labelParts)).join(', ') || q;
        return {
          lat: Number(lat),
          lon: Number(lon),
          displayName,
          source: 'photon_osm'
        };
      }
    }
  } catch {
    // Passa al fallback Nominatim
  }

  // 3. Fallback API pubblica Nominatim OpenStreetMap
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=it,ch,fr,at,de,si&limit=2`;
    const res = await fetchWithTimeout(nomUrl, {
      headers: { 'Accept-Language': 'it' }
    });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        return {
          lat: Number(list[0].lat),
          lon: Number(list[0].lon),
          displayName: list[0].display_name.split(',').slice(0, 3).join(',').trim(),
          source: 'nominatim_osm'
        };
      }
    }
  } catch {
    // Passa al fallback locale
  }

  // 4. Fallback parziale nel dizionario locale (word boundaries per sigle corte <= 3 caratteri)
  const partialHub = KNOWN_LOGISTICS_HUBS.find(
    h =>
      lower.includes(h.name.toLowerCase()) ||
      h.aliases.some(a => {
        if (a.length <= 3) {
          const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
        }
        return lower.includes(a);
      })
  );
  if (partialHub) {
    return {
      lat: partialHub.lat,
      lon: partialHub.lon,
      displayName: partialHub.name,
      source: 'hub_fallback'
    };
  }

  throw new Error(`Indirizzo non trovato: "${q}". Prova a specificare la città o provincia (es. "Via Emilia, Modena" o "Bologna Interporto").`);
};

/**
 * Interroga l'API pubblica Open-Meteo Elevation per calcolare il profilo altimetrico e il fattore orografico dei consumi
 */
export const analyzeRouteOrography = async (routeCoords = [], totalDistanceKm = 100, vehicle = null) => {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
    return {
      minElevationM: 45,
      maxElevationM: 90,
      elevationGainM: 60,
      elevationLossM: 60,
      metersGainPerKm: 0.6,
      terrainType: 'pianeggiante',
      terrainLabel: 'Pianeggiante (Pianura)',
      consumptionMultiplier: 1.0,
      consumptionDeltaPercent: 0,
      regenerativeRecoveryPercent: 0,
      elevations: [45, 65, 90, 55]
    };
  }

  // Campiona fino a 45 punti equidistanti lungo la geometria del percorso garantendo sempre partenza e arrivo
  const maxSamples = 44;
  const step = Math.max(1, Math.ceil(routeCoords.length / maxSamples));
  const finalSamples = [];
  for (let i = 0; i < routeCoords.length; i += step) {
    finalSamples.push(routeCoords[i]);
  }
  if (finalSamples[finalSamples.length - 1] !== routeCoords[routeCoords.length - 1]) {
    finalSamples.push(routeCoords[routeCoords.length - 1]);
  }

  let elevations = [];
  try {
    const lats = finalSamples.map(c => Number(c[1]).toFixed(4)).join(',');
    const lons = finalSamples.map(c => Number(c[0]).toFixed(4)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.elevation) && data.elevation.length > 0) {
        elevations = data.elevation.map(e => Math.max(0, Number(e) || 0));
      }
    }
  } catch {
    // Fallback stima altimetrica da latitudine/longitudine (Appennino Tosco-Emiliano / Alpi vs Pianura Padana)
  }

  if (elevations.length < 2) {
    elevations = finalSamples.map(([lon, lat]) => {
      // Stima geografica se offline: dorsale appenninica (lat 43.8..44.4) o alpina (lat > 45.8)
      if (lat >= 43.85 && lat <= 44.45 && lon >= 9.5 && lon <= 12.0) return 420;
      if (lat > 45.85) return 380;
      return 65;
    });
  }

  const minElevationM = Math.round(Math.min(...elevations));
  const maxElevationM = Math.round(Math.max(...elevations));

  let elevationGainM = 0;
  let elevationLossM = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    // Soglia anti-rumore DEM di 4 metri tra campioni
    if (diff > 4) elevationGainM += diff;
    else if (diff < -4) elevationLossM += Math.abs(diff);
  }
  elevationGainM = Math.round(elevationGainM);
  elevationLossM = Math.round(elevationLossM);

  const safeKm = Math.max(10, Number(totalDistanceKm) || 100);
  const metersGainPerKm = +(elevationGainM / safeKm).toFixed(2);
  const altitudeSpan = maxElevationM - minElevationM;

  // Classificazione Orografica
  let terrainType = 'pianeggiante';
  let terrainLabel = 'Pianeggiante (Pianura)';
  if (metersGainPerKm >= 7.5 || maxElevationM >= 480 || altitudeSpan >= 380) {
    terrainType = 'appenninico';
    terrainLabel = 'Appenninico / Montano';
  } else if (metersGainPerKm >= 2.8 || maxElevationM >= 240 || altitudeSpan >= 170) {
    terrainType = 'collinare';
    terrainLabel = 'Collinare / Misto Ondulato';
  }

  // Calcolo Fattore Orografico Consumi (BEV con frenata rigenerativa in discesa vs Bio-LNG / Termico)
  const isElectric = vehicle?.fuelTypeId === 'elettrico' || vehicle?.fuelType === 'elettrico';
  const isHeavyTractor = (vehicle?.category || 'trattore') === 'trattore';

  let consumptionDeltaPercent = 0;
  let regenerativeRecoveryPercent = 0;

  if (terrainType === 'pianeggiante') {
    // Lieve variazione per cavalcavia o pendenze minime; BEV recupera energia in frenata
    const grossFlat = metersGainPerKm > 1.5 ? 2 : 0;
    regenerativeRecoveryPercent = isElectric && elevationLossM > 50 ? 2 : 0;
    consumptionDeltaPercent = Math.max(-2, grossFlat - regenerativeRecoveryPercent);
  } else if (terrainType === 'collinare') {
    const grossPenalty = isHeavyTractor ? 13 : 9;
    regenerativeRecoveryPercent = isElectric ? 5 : 0; // I veicoli elettrici recuperano ~38% dell'energia potenziale in discesa
    consumptionDeltaPercent = Math.max(4, grossPenalty - regenerativeRecoveryPercent);
  } else {
    // Appenninico / Montano
    const grossPenalty = isHeavyTractor ? 26 : 19;
    regenerativeRecoveryPercent = isElectric ? 9 : 0;
    consumptionDeltaPercent = Math.max(11, grossPenalty - regenerativeRecoveryPercent);
  }

  const consumptionMultiplier = +(1 + consumptionDeltaPercent / 100).toFixed(3);

  return {
    minElevationM,
    maxElevationM,
    elevationGainM,
    elevationLossM,
    metersGainPerKm,
    terrainType,
    terrainLabel,
    consumptionMultiplier,
    consumptionDeltaPercent,
    regenerativeRecoveryPercent,
    elevations
  };
};

/**
 * Stima la tariffa chilometrica autostradale (€/km) in base alla classe del mezzo (Assi) e all'orografia (Pianura vs Montagna)
 */
export const estimateHighwayTollRate = (vehicle = null, trailer = null, terrainType = 'pianeggiante') => {
  const cat = (vehicle?.category || 'trattore').toLowerCase();
  const isDaily72 = (vehicle?.name || '').includes('72') || (vehicle?.model || '').includes('72');
  const hasTrailer = Boolean(trailer) || cat === 'trattore';

  // Tariffe medie concessionarie autostradali italiane 2025/2026 per classe d'assi:
  // - Classe 5 (Bilico 5 assi): ~0.21 €/km pianura, ~0.24 €/km collinare, ~0.28 €/km tronchi montani/appenninici
  // - Classe B / 3 assi (Motrice pesante / Daily 72): ~0.14 €/km pianura, ~0.16 €/km collinare, ~0.19 €/km montano
  // - Classe A (Furgone 2 assi <3.5t): ~0.10 €/km pianura, ~0.12 €/km montano
  let baseRate = 0.21;
  let vehicleTollClass = 'Classe 5 (Autoarticolato 5 Assi)';

  if (hasTrailer) {
    baseRate = 0.21;
    vehicleTollClass = 'Classe 5 (Autoarticolato 4-5 Assi)';
  } else if (cat === 'motrice' || isDaily72) {
    baseRate = 0.14;
    vehicleTollClass = 'Classe B / 3 Assi (Autocarro / Motrice)';
  } else {
    baseRate = 0.10;
    vehicleTollClass = 'Classe A (Furgone 2 Assi)';
  }

  let terrainMultiplier = 1.0;
  if (terrainType === 'collinare') terrainMultiplier = 1.14;
  else if (terrainType === 'appenninico') terrainMultiplier = 1.32;

  const suggestedRate = +(baseRate * terrainMultiplier).toFixed(3);
  return {
    suggestedRate,
    vehicleTollClass
  };
};

/**
 * Calcola l'intero itinerario multi-tappa (da 2 a 8 tappe) con:
 * - Geocoding di ciascuna tappa
 * - Calcolo Km stradali reali, durata e % autostrada tramite OSRM
 * - Analisi orografica (dislivello D+, tipo terreno, correzione consumi) tramite Open-Meteo Elevation
 * - Stima pedaggi autostradali e consumi ottimizzati
 */
export const calculateRouteFromStops = async (rawStops = [], options = {}) => {
  const {
    isRoundTrip = false,
    tripsPerDay = 1,
    vehicle = null,
    trailer = null
  } = options;

  const validStops = rawStops.filter(s => s && (s.address || '').trim().length > 0);
  if (validStops.length < 2) {
    throw new Error('Inserisci almeno 2 tappe (es. Punto di Partenza e Punto di Arrivo/Scarico).');
  }

  // 1. Geocoding di tutte le tappe
  const geocodedStops = [];
  for (let i = 0; i < validStops.length; i++) {
    const resolved = await geocodeStopAddress(validStops[i].address);
    geocodedStops.push({
      ...validStops[i],
      ...resolved,
      order: i + 1
    });
  }

  // Se Andata & Ritorno (A/R), chiude l'anello tornando alla Tappa 1
  const itineraryPoints = isRoundTrip
    ? [...geocodedStops, { ...geocodedStops[0], isReturnLeg: true, order: geocodedStops.length + 1 }]
    : geocodedStops;

  // 2. Routing stradale tramite OSRM Public API
  const coordsParam = itineraryPoints.map(p => `${p.lon},${p.lat}`).join(';');
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson&steps=true`;

  let singleTripKm = 0;
  let singleTripDurationMin = 0;
  let highwayPercent = 65;
  let routeCoords = itineraryPoints.map(p => [p.lon, p.lat]);
  let legSummaries = [];
  let detectedMotorways = new Set();

  try {
    const res = await fetchWithTimeout(osrmUrl, {}, 9000);
    if (res.ok) {
      const data = await res.json();
      if (data?.routes?.length > 0) {
        const route = data.routes[0];
        singleTripKm = Math.round((route.distance / 1000) * 10) / 10;
        singleTripDurationMin = Math.round(route.duration / 60);
        if (route.geometry?.coordinates?.length > 0) {
          routeCoords = route.geometry.coordinates;
        }

        // Analisi steps per rilevare esattamente i km percorsi su Autostrada / Tangenziale veloce
        let totalMeters = 0;
        let highwayMeters = 0;

        (route.legs || []).forEach((leg, legIdx) => {
          const legKm = Math.round((leg.distance / 1000) * 10) / 10;
          const legMin = Math.round(leg.duration / 60);
          const fromStop = itineraryPoints[legIdx];
          const toStop = itineraryPoints[legIdx + 1];

          legSummaries.push({
            legIndex: legIdx + 1,
            from: fromStop?.displayName || fromStop?.address,
            to: toStop?.displayName || toStop?.address,
            clientTag: toStop?.clientTag || fromStop?.clientTag || '',
            isReturnLeg: Boolean(toStop?.isReturnLeg),
            km: legKm,
            durationMin: legMin
          });

          (leg.steps || []).forEach(step => {
            const dist = Number(step.distance) || 0;
            const dur = Number(step.duration) || 1;
            const speedKmh = (dist / dur) * 3.6;
            const ref = String(step.ref || '');
            const name = String(step.name || '');

            totalMeters += dist;

            // Riconosce autostrade a pedaggio italiane (escludendo raccordi gratuiti RA*, tangenziali gratuite, A2/A19/A29 gratuite)
            const aMatches = ref.match(/\bA\d+\b/gi) || [];
            const tollMotorways = aMatches.filter(code => !['A2', 'A19', 'A29'].includes(code.toUpperCase()));
            const isFreeBypassOrRaccordo = /\bRA\d+\b/i.test(ref) || /\btangenziale\b/i.test(name);
            const isTollAutostradaRef = tollMotorways.length > 0;
            const isTollAutostradaName = /\b(autostrad|autosole|brennero|serravalle|adriatica|cisa|pedemontana|brebemi|teem)\b/i.test(name);

            if (tollMotorways.length > 0) {
              tollMotorways.forEach(m => detectedMotorways.add(m.toUpperCase()));
            }

            if (!isFreeBypassOrRaccordo && (isTollAutostradaRef || isTollAutostradaName || (dist > 2500 && speedKmh >= 88))) {
              highwayMeters += dist;
            }
          });
        });

        if (totalMeters > 0) {
          highwayPercent = Math.min(95, Math.max(0, Math.round((highwayMeters / totalMeters) * 100)));
        }
      }
    }
  } catch {
    // Fallback Haversine con coefficiente di tortuosità stradale 1.26x
  }

  if (singleTripKm <= 0) {
    let airSum = 0;
    legSummaries = [];
    for (let i = 0; i < itineraryPoints.length - 1; i++) {
      const p1 = itineraryPoints[i];
      const p2 = itineraryPoints[i + 1];
      const legKm = Math.round(haversineDistanceKm(p1.lat, p1.lon, p2.lat, p2.lon) * 1.26 * 10) / 10;
      airSum += legKm;
      legSummaries.push({
        legIndex: i + 1,
        from: p1.displayName || p1.address,
        to: p2.displayName || p2.address,
        clientTag: p2.clientTag || p1.clientTag || '',
        km: legKm,
        durationMin: Math.round((legKm / 65) * 60)
      });
    }
    singleTripKm = Math.round(airSum * 10) / 10;
    singleTripDurationMin = Math.round((singleTripKm / 65) * 60);
    highwayPercent = singleTripKm > 60 ? 70 : 40;
  }

  // 3. Analisi Orografica (Altimetria e Correzione Consumi)
  const orography = await analyzeRouteOrography(routeCoords, singleTripKm, vehicle);

  // 4. Stima Tariffa Autostradale & Pedaggi
  const tollEstimation = estimateHighwayTollRate(vehicle, trailer, orography.terrainType);

  const safeTrips = Math.max(1, Number(tripsPerDay) || 1);
  const totalDailyKm = Math.round(singleTripKm * safeTrips);
  const highwayDailyKm = Math.round((totalDailyKm * highwayPercent) / 100);
  const estimatedTollsDaily = +(highwayDailyKm * tollEstimation.suggestedRate).toFixed(2);

  // Nome sintetico della tratta generato dalle tappe
  const shortStopNames = geocodedStops.map(s => (s.displayName || s.address || '').split(',')[0].trim());
  const generatedRouteName = `${shortStopNames.join(' → ')}${isRoundTrip ? ' (A/R)' : ''}`;

  return {
    geocodedStops,
    legSummaries,
    isRoundTrip,
    tripsPerDay: safeTrips,
    singleTripKm,
    totalDailyKm,
    singleTripDurationMin,
    totalDailyDurationMin: singleTripDurationMin * safeTrips,
    highwayPercent,
    highwayDailyKm,
    detectedMotorways: Array.from(detectedMotorways),
    orography,
    tollEstimation,
    estimatedTollsDaily,
    generatedRouteName
  };
};
