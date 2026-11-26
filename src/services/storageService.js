// Service per la persistenza locale (LocalStorage) e sincronizzazione opzionale con Firebase
// Garantisce il funzionamento offline / standalone al 100% in locale

import { DEFAULT_FLEET, DEFAULT_TRAILERS, DEFAULT_PROJECTS, DEFAULT_SETTINGS } from '../data/initialData';
import { recalculateProjectCost, calculateSpecificInsuranceCost } from '../utils/cashFlowCalculations';
import {
  fetchLiveWeeklyFuelPrices,
  getFuelSyncMetadata,
  shouldAutoRefreshWeeklyFuelPrices
} from './fuelPriceService';

const STORAGE_KEYS = {
  FLEET: 'four_fleet_vehicles',
  TRAILERS: 'four_fleet_trailers',
  PROJECTS: 'four_projects',
  SETTINGS: 'four_settings',
  SIMULATIONS: 'four_simulations',
  ACTIVE_SCENARIO: 'four_active_scenario'
};

const FLEET_DATA_VERSION_KEY = 'fleetcost_data_version_2026';
const CURRENT_DATA_VERSION = 'v2026_four_protected_user_data_v7';

class StorageService {
  constructor() {
    this.initDefaults();
  }

  initDefaults(forceReset = false) {
    // NOTA 2.5: Protezione assoluta dei dati utente.
    // Solo un reset esplicito (forceReset === true) può sovrascrivere i dati esistenti in localStorage.
    if (forceReset) {
      localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(DEFAULT_FLEET));
      localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(DEFAULT_TRAILERS));
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(DEFAULT_PROJECTS));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify([]));
      localStorage.setItem(FLEET_DATA_VERSION_KEY, CURRENT_DATA_VERSION);
      return;
    }

    // Inizializzazione non distruttiva: popola una chiave ESCLUSIVAMENTE se è assente in localStorage.
    if (localStorage.getItem(STORAGE_KEYS.FLEET) === null) {
      localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(DEFAULT_FLEET));
    }
    if (localStorage.getItem(STORAGE_KEYS.TRAILERS) === null) {
      localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(DEFAULT_TRAILERS));
    }
    if (localStorage.getItem(STORAGE_KEYS.PROJECTS) === null) {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(DEFAULT_PROJECTS));
    }
    if (localStorage.getItem(STORAGE_KEYS.SETTINGS) === null) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    } else {
      // Migrazione non distruttiva delle impostazioni: mantiene quelle utente e aggiunge solo eventuali nuove chiavi
      this.mergeDefaultSettings();
    }
    if (localStorage.getItem(STORAGE_KEYS.SIMULATIONS) === null) {
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify([]));
    }

    localStorage.setItem(FLEET_DATA_VERSION_KEY, CURRENT_DATA_VERSION);
  }

  mergeDefaultSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);

      // Merge delle patenti esistenti aggiungendo eventuali nuove categorie (es. c_doppio)
      const existingLicenses = Array.isArray(parsed.licenseTypes) ? parsed.licenseTypes : [];
      const existingIds = new Set(existingLicenses.map(l => l.id));
      const mergedLicenses = [
        ...existingLicenses,
        ...(DEFAULT_SETTINGS.licenseTypes || []).filter(l => !existingIds.has(l.id))
      ];

      // Aggiorna i nomi/prezzi dei carburanti in modalità "Alla Pompa (Senza Recupero Accise)" se erano rimasti ai vecchi valori "Netto Accise"
      const existingFuels = Array.isArray(parsed.fuelTypes) ? parsed.fuelTypes : DEFAULT_SETTINGS.fuelTypes;
      const mergedFuels = existingFuels.map(f => {
        const defFuel = (DEFAULT_SETTINGS.fuelTypes || []).find(df => df.id === f.id);
        if (!defFuel) return f;
        // Se era rimasto il vecchio prezzo "Netto Accise" (1.42 gasolio, 1.52 hvo, 1.18 biolng) o dicitura "Netto Accise", migra al prezzo Alla Pompa
        const isLegacyNetPrice =
          (f.id === 'gasolio' && (Number(f.price) === 1.42 || (f.name || '').includes('Netto Accise'))) ||
          (f.id === 'hvo' && Number(f.price) === 1.52) ||
          (f.id === 'biolng' && Number(f.price) === 1.18);
        return {
          ...defFuel,
          ...f,
          name: defFuel.name,
          marketRange: defFuel.marketRange,
          notes: defFuel.notes,
          price: isLegacyNetPrice ? defFuel.price : f.price
        };
      });

      const merged = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        fuelTypes: mergedFuels,
        standardCosts: { ...DEFAULT_SETTINGS.standardCosts, ...(parsed.standardCosts || {}) },
        tireParameters: { ...DEFAULT_SETTINGS.tireParameters, ...(parsed.tireParameters || {}) },
        ownershipDefaults: { ...DEFAULT_SETTINGS.ownershipDefaults, ...(parsed.ownershipDefaults || {}) },
        financialDefaults: { ...DEFAULT_SETTINGS.financialDefaults, ...(parsed.financialDefaults || {}) },
        treasuryRules: {
          ...DEFAULT_SETTINGS.treasuryRules,
          ...(parsed.treasuryRules || {}),
          acciseRecovery: {
            enabled: false,
            ratePerLiterDiesel: 0,
            frequency: 'none',
            creditMonths: []
          }
        },
        refrigerationParams: {
          azoto: {
            ...(DEFAULT_SETTINGS.refrigerationParams?.azoto || {}),
            ...(parsed.refrigerationParams?.azoto || {})
          },
          gasolio: {
            ...(DEFAULT_SETTINGS.refrigerationParams?.gasolio || {}),
            ...(parsed.refrigerationParams?.gasolio || {})
          }
        },
        accessoryParams: {
          telematics: {
            ...(DEFAULT_SETTINGS.accessoryParams?.telematics || {}),
            ...(parsed.accessoryParams?.telematics || {})
          },
          washing: {
            ...(DEFAULT_SETTINGS.accessoryParams?.washing || {}),
            ...(parsed.accessoryParams?.washing || {})
          },
          extra: {
            ...(DEFAULT_SETTINGS.accessoryParams?.extra || {}),
            ...(parsed.accessoryParams?.extra || {})
          }
        },
        paymentTermsDefaults: {
          ...(DEFAULT_SETTINGS.paymentTermsDefaults || {}),
          ...(parsed.paymentTermsDefaults || {})
        },
        licenseTypes: mergedLicenses
      };

      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.error('Errore merge impostazioni:', e);
      return DEFAULT_SETTINGS;
    }
  }

  // --- FLEET (MEZZI MOTORI) ---
  getFleet() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FLEET);
      let fleet = data ? JSON.parse(data) : DEFAULT_FLEET;
      let fleetUpdated = false;
      fleet = fleet.map(v => {
        // Daily 72 (7.2t) è un autocarro con obbligo di Patente C (o C1)
        const isDaily72 = (v.name || '').includes('72') || (v.model || '').includes('72');
        if (isDaily72 && (v.category === 'furgone' || !v.categoryLabel?.includes('Patente C'))) {
          fleetUpdated = true;
          return {
            ...v,
            category: 'motrice',
            categoryLabel: 'Autocarro Elettrico 7.2t (Patente C)',
            licenseTypeId: 'c_diurno'
          };
        }
        return v;
      });
      if (fleetUpdated && data) {
        localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(fleet));
      }
      return fleet;
    } catch (e) {
      console.error('Errore lettura flotta:', e);
      return DEFAULT_FLEET;
    }
  }

  saveFleet(fleet) {
    localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(fleet));
    return fleet;
  }

  addVehicle(vehicle) {
    const fleet = this.getFleet();
    const newVehicle = {
      ...vehicle,
      id: vehicle.id || 'veh_' + Date.now(),
      createdAt: new Date().toISOString()
    };
    fleet.unshift(newVehicle);
    this.saveFleet(fleet);
    return newVehicle;
  }

  updateVehicle(id, vehicleData) {
    const fleet = this.getFleet();
    const index = fleet.findIndex(v => v.id === id);
    if (index !== -1) {
      fleet[index] = { ...fleet[index], ...vehicleData, updatedAt: new Date().toISOString() };
      this.saveFleet(fleet);
      // Auto-sincronizzazione reattiva: aggiorna all'istante le commesse associate
      this.syncProjectsForVehicle(fleet[index]);
      return fleet[index];
    }
    return null;
  }

  syncProjectsForVehicle(vehicle) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (!data) return;
      const projects = JSON.parse(data);
      const fleet = this.getFleet();
      const trailers = this.getTrailers();
      const settings = this.getSettings();

      let hasChanges = false;
      const updated = projects.map(p => {
        if (p.vehicleId === vehicle.id) {
          hasChanges = true;
          return recalculateProjectCost(p, fleet, trailers, settings);
        }
        return p;
      });

      if (hasChanges) {
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Errore sincronizzazione commesse con veicolo:', e);
    }
  }

  deleteVehicle(id) {
    const fleet = this.getFleet().filter(v => v.id !== id);
    this.saveFleet(fleet);
    return fleet;
  }

  // --- TRAILERS (SEMIRIMORCHI) ---
  getTrailers() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRAILERS);
      let trailers = data ? JSON.parse(data) : DEFAULT_TRAILERS;
      let updated = false;
      trailers = trailers.map(t => {
        if (t.insuranceYearly === undefined && t.insuranceIncluded === undefined) {
          updated = true;
          const defTrl = DEFAULT_TRAILERS.find(dt => dt.id === t.id);
          const defaultIns = defTrl?.insuranceYearly ?? (
            t.category === 'double_deck' ? 1560 :
            t.category === 'refrigerato_azoto' ? 1440 :
            t.category === 'refrigerato' ? 1380 : 960
          );
          return {
            ...t,
            insuranceIncluded: false,
            insuranceYearly: defaultIns
          };
        }
        return t;
      });
      if (updated && data) {
        localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(trailers));
      }
      return trailers;
    } catch (e) {
      console.error('Errore lettura rimorchi:', e);
      return DEFAULT_TRAILERS;
    }
  }

  saveTrailers(trailers) {
    localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(trailers));
    return trailers;
  }

  addTrailer(trailer) {
    const trailers = this.getTrailers();
    const newTrailer = {
      ...trailer,
      id: trailer.id || 'trailer_' + Date.now(),
      createdAt: new Date().toISOString()
    };
    trailers.unshift(newTrailer);
    this.saveTrailers(trailers);
    return newTrailer;
  }

  updateTrailer(id, trailerData) {
    const trailers = this.getTrailers();
    const index = trailers.findIndex(t => t.id === id);
    if (index !== -1) {
      trailers[index] = { ...trailers[index], ...trailerData, updatedAt: new Date().toISOString() };
      this.saveTrailers(trailers);
      // Auto-sincronizzazione reattiva: aggiorna all'istante le commesse associate
      this.syncProjectsForTrailer(trailers[index]);
      return trailers[index];
    }
    return null;
  }

  syncProjectsForTrailer(trailer) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (!data) return;
      const projects = JSON.parse(data);
      const fleet = this.getFleet();
      const trailers = this.getTrailers();
      const settings = this.getSettings();

      let hasChanges = false;
      const updated = projects.map(p => {
        if (p.trailerId === trailer.id) {
          hasChanges = true;
          return recalculateProjectCost(p, fleet, trailers, settings);
        }
        return p;
      });

      if (hasChanges) {
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Errore sincronizzazione commesse con rimorchio:', e);
    }
  }

  deleteTrailer(id) {
    const trailers = this.getTrailers().filter(t => t.id !== id);
    this.saveTrailers(trailers);
    return trailers;
  }

  // --- PROJECTS (COMMESSE & BUDGET) ---
  getProjects() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      const projects = data ? JSON.parse(data) : DEFAULT_PROJECTS;
      const fleet = this.getFleet();
      const trailers = this.getTrailers();
      const settings = this.getSettings();

      // Sincronizzazione automatica se i canoni di noleggio, l'assicurazione specifica o le variazioni per data sono cambiati
      let needsSave = false;
      const synchronized = projects.map(p => {
        const veh = fleet.find(v => v.id === p.vehicleId);
        const trl = trailers.find(t => t.id === p.trailerId);
        if (veh || trl) {
          const insCalc = calculateSpecificInsuranceCost(veh, trl, p.workingDaysMonth || 22, settings);
          const expectedVLease = veh && p.workingDaysMonth > 0
            ? +((Number(veh.monthlyLease || 0) + insCalc.vehicleInsuranceMonthly) / p.workingDaysMonth).toFixed(2)
            : p.vehicleLeaseDaily;
          const expectedTLease = trl && p.workingDaysMonth > 0
            ? +((Number(trl.monthlyLease || 0) + insCalc.trailerInsuranceMonthly) / p.workingDaysMonth).toFixed(2)
            : p.trailerLeaseDaily;
          const isDaily72 = veh && ((veh.name || '').includes('72') || (veh.model || '').includes('72'));
          const daily72NeedsDriverUpdate = isDaily72 && p.driverCostDaily === 140 && !p.driverManualOverride;

          const vehVarJson = JSON.stringify(veh?.leaseVariations || []);
          const projVehVarJson = JSON.stringify(p.vehicleLeaseVariations || []);
          const trlVarJson = JSON.stringify(trl?.leaseVariations || []);
          const projTrlVarJson = JSON.stringify(p.trailerLeaseVariations || []);
          const variationsOutOfSync = (veh && vehVarJson !== projVehVarJson) || (trl && trlVarJson !== projTrlVarJson);

          if ((p.managementType === 'D' && (expectedVLease !== p.vehicleLeaseDaily || expectedTLease !== p.trailerLeaseDaily || daily72NeedsDriverUpdate)) || variationsOutOfSync) {
            needsSave = true;
            return recalculateProjectCost(p, fleet, trailers, settings);
          }
        }
        return p;
      });

      if (needsSave) {
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(synchronized));
      }

      return synchronized;
    } catch (e) {
      console.error('Errore lettura commesse:', e);
      return DEFAULT_PROJECTS;
    }
  }

  saveProjects(projects) {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    return projects;
  }

  addProject(project) {
    const projects = this.getProjects();
    const newProject = {
      ...project,
      id: project.id || 'proj_' + Date.now(),
      code: project.code || 'PRJ-' + Math.floor(100 + Math.random() * 900),
      createdAt: new Date().toISOString()
    };
    projects.unshift(newProject);
    this.saveProjects(projects);

    // Se un veicolo è stato assegnato al progetto, aggiorna il suo stato
    if (newProject.vehicleId) {
      this.updateVehicle(newProject.vehicleId, {
        status: 'assigned',
        assignedProject: newProject.name
      });
    }
    if (newProject.trailerId) {
      this.updateTrailer(newProject.trailerId, {
        status: 'assigned',
        assignedProject: newProject.name
      });
    }

    return newProject;
  }

  updateProject(id, projectData) {
    const projects = this.getProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      projects[index] = { ...projects[index], ...projectData, updatedAt: new Date().toISOString() };
      this.saveProjects(projects);
      return projects[index];
    }
    return null;
  }

  deleteProject(id) {
    const project = this.getProjects().find(p => p.id === id);
    if (project) {
      // Libera i mezzi assegnati se non usati altrove
      if (project.vehicleId) {
        this.updateVehicle(project.vehicleId, { status: 'available', assignedProject: null });
      }
      if (project.trailerId) {
        this.updateTrailer(project.trailerId, { status: 'available', assignedProject: null });
      }
    }
    const projects = this.getProjects().filter(p => p.id !== id);
    this.saveProjects(projects);
    return projects;
  }

  // --- SETTINGS ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(data);
      if (
        !parsed.refrigerationParams ||
        !parsed.accessoryParams ||
        !parsed.paymentTermsDefaults ||
        parsed.tireParameters?.costPerTireTractorElectric === undefined ||
        parsed.treasuryRules?.acciseRecovery?.enabled === true
      ) {
        return this.mergeDefaultSettings();
      }
      return parsed;
    } catch (e) {
      console.error('Errore lettura impostazioni:', e);
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.syncAllProjectsWithSettings(settings);
    return settings;
  }

  /**
   * Aggiorna i prezzi medi settimanali dei carburanti "Alla Pompa" da fonti ufficiali (MASE / MIMIT / GME)
   * e ricalcola dinamicamente tutte le commesse.
   */
  async refreshWeeklyFuelPricesFromOfficialSources(options = { force: false }) {
    const currentSettings = this.getSettings();
    if (!options.force && !shouldAutoRefreshWeeklyFuelPrices(currentSettings)) {
      return {
        updated: false,
        settings: currentSettings,
        syncMeta: getFuelSyncMetadata()
      };
    }

    const syncMeta = await fetchLiveWeeklyFuelPrices();
    const updatedFuelTypes = (currentSettings.fuelTypes || []).map(f => {
      const liveItem = syncMeta?.pricesByFuelId?.[f.id];
      if (!liveItem) return f;
      return {
        ...f,
        price: liveItem.price,
        lastSource: liveItem.source,
        lastUpdatedWeek: liveItem.weekLabel,
        lastUpdatedIso: liveItem.updatedAt
      };
    });

    const nextSettings = {
      ...currentSettings,
      fuelTypes: updatedFuelTypes,
      standardCosts: {
        ...(currentSettings.standardCosts || {}),
        adbluePricePerLiter: syncMeta?.pricesByFuelId?.adblue?.price ?? currentSettings.standardCosts?.adbluePricePerLiter ?? 0.85
      },
      lastFuelSyncMeta: {
        lastSyncIso: syncMeta.lastSyncIso,
        weekLabel: syncMeta.weekLabel,
        sourceLabel: syncMeta.sourceLabel,
        fetchedFromRemote: syncMeta.fetchedFromRemote
      }
    };

    this.saveSettings(nextSettings);
    return {
      updated: true,
      settings: nextSettings,
      syncMeta
    };
  }

  syncAllProjectsWithSettings(settings) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (!data) return;
      const projects = JSON.parse(data);
      const fleet = this.getFleet();
      const trailers = this.getTrailers();
      const updated = projects.map(p => recalculateProjectCost(p, fleet, trailers, settings));
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
    } catch (e) {
      console.error('Errore sincronizzazione commesse con nuove impostazioni:', e);
    }
  }

  // --- SIMULATIONS (PREVENTIVI TRATTA) ---
  getSimulations() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SIMULATIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveSimulation(simulation) {
    const sims = this.getSimulations();
    const existingIdx = simulation.id ? sims.findIndex(s => s.id === simulation.id) : -1;
    if (existingIdx !== -1) {
      sims[existingIdx] = {
        ...sims[existingIdx],
        ...simulation,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(sims));
      return sims[existingIdx];
    }
    const newSim = {
      ...simulation,
      id: simulation.id || 'sim_' + Date.now(),
      code: simulation.code || 'PREV-' + Math.floor(100 + Math.random() * 900),
      status: simulation.status || 'pending', // 'pending' (In Valutazione) | 'accepted' (Accettata / Convertita)
      createdAt: new Date().toISOString()
    };
    sims.unshift(newSim);
    localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(sims));
    return newSim;
  }

  updateSimulation(id, patch) {
    const sims = this.getSimulations();
    const idx = sims.findIndex(s => s.id === id);
    if (idx !== -1) {
      sims[idx] = {
        ...sims[idx],
        ...patch,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(sims));
      return sims[idx];
    }
    return null;
  }

  deleteSimulation(id) {
    const sims = this.getSimulations().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(sims));
    return sims;
  }

  // --- RESET & BACKUP ---
  resetToDefaults() {
    this.initDefaults(true);
    return {
      fleet: this.getFleet(),
      trailers: this.getTrailers(),
      projects: this.getProjects(),
      settings: this.getSettings()
    };
  }

  exportBackupJson() {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      company: 'FOUR Trasporti Ecologici',
      fleet: this.getFleet(),
      trailers: this.getTrailers(),
      projects: this.getProjects(),
      settings: this.getSettings(),
      simulations: this.getSimulations()
    };
    return JSON.stringify(backup, null, 2);
  }

  importBackupJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.fleet) localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(data.fleet));
      if (data.trailers) localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(data.trailers));
      if (data.projects) localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(data.projects));
      if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
      if (data.simulations) localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(data.simulations));
      return { success: true };
    } catch (e) {
      console.error('Errore import backup:', e);
      return { success: false, error: e.message };
    }
  }
}

export const storageService = new StorageService();
export default storageService;
