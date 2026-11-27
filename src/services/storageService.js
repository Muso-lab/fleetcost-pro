// Service centralizzato con Sincronizzazione Cloud in Tempo Reale (Firebase Firestore) + Cache Locale Istantanea (LocalStorage)
// Garantisce allineamento immediato multi-PC / multi-sessione e continuità anche in caso di micro-disconnessioni

import { collection, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { db, ensureFirebaseSession } from '../config/firebase';
import { DEFAULT_FLEET, DEFAULT_TRAILERS, DEFAULT_PROJECTS, DEFAULT_SETTINGS } from '../data/initialData';
import {
  calculateSingleProjectMetrics,
  calculateDriverDailyCost,
  calculateSpecificInsuranceCost,
  calculateTireCostPerKm,
  calculateRefrigerationDailyCost,
  isRefrigeratedTrailer
} from '../utils/cashFlowCalculations';
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
  SECURITY: 'four_security_auth_config',
  ACTIVE_SCENARIO: 'four_active_scenario'
};

const CLOUD_COLLECTION = 'four_workspace';
const CLEAN_SEED_VERSION = 'clean_2026_11_26_v1';
const FLEET_DATA_VERSION_KEY = 'fleetcost_data_version_2026';
const CURRENT_DATA_VERSION = 'v2026_cloud_clean_seed_v8';

const sanitizeForCloud = (val) => JSON.parse(JSON.stringify(val));

class StorageService {
  constructor() {
    this.clientId = 'client_' + Math.random().toString(36).slice(2, 10);
    this.listeners = new Set();
    this.cloudUnsubscribe = null;
    this.cloudStarting = false;
    this.lastLocalPushAt = {};
    this.pushQueues = {};
    this.cloudStatus = {
      state: 'connecting', // 'connecting' | 'synced' | 'syncing' | 'offline' | 'error'
      lastSyncedAt: null,
      errorMessage: null
    };
    this.initDefaults();
  }

  // --- SOTTOSCRIZIONE REATTIVA PER LE PAGINE E LA NAVBAR ---
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyListeners(event) {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (e) {
        console.error('Errore listener storageService:', e);
      }
    });
  }

  setCloudStatus(patch) {
    this.cloudStatus = {
      ...this.cloudStatus,
      ...patch
    };
    this.notifyListeners({
      type: 'status',
      cloudStatus: this.cloudStatus
    });
  }

  getCloudStatus() {
    return this.cloudStatus;
  }

  // --- INIZIALIZZAZIONE PULITA DATASET UFFICIALE ---
  initDefaults(forceReset = false) {
    const storedVersion = localStorage.getItem(FLEET_DATA_VERSION_KEY);
    // Allinea qualsiasi browser/PC che aveva vecchi dati sporchi/demo in cache al nuovo dataset pulito + Cloud
    if (forceReset || storedVersion !== CURRENT_DATA_VERSION) {
      localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(DEFAULT_FLEET));
      localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(DEFAULT_TRAILERS));
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(DEFAULT_PROJECTS));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify([]));
      localStorage.setItem(FLEET_DATA_VERSION_KEY, CURRENT_DATA_VERSION);
      return;
    }

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
      this.mergeDefaultSettings();
    }
    if (localStorage.getItem(STORAGE_KEYS.SIMULATIONS) === null) {
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify([]));
    }
  }

  // --- MOTORE DI SINCRONIZZAZIONE CLOUD IN TEMPO REALE (FIRESTORE) ---
  async startCloudSync() {
    if (!db) {
      this.setCloudStatus({ state: 'offline', errorMessage: 'Database Cloud non configurato' });
      return;
    }
    if (this.cloudUnsubscribe || this.cloudStarting) {
      return;
    }

    this.cloudStarting = true;
    this.setCloudStatus({ state: 'connecting', errorMessage: null });

    try {
      const fbUser = await ensureFirebaseSession();
      if (!fbUser) {
        this.cloudStarting = false;
        this.setCloudStatus({ state: 'offline', errorMessage: 'Sessione Cloud offline' });
        return;
      }

      // 1. Controlla lo stato iniziale su Cloud Firestore: se vuoto o non ancora allineato al seed pulito, inizializzalo
      const colRef = collection(db, CLOUD_COLLECTION);
      const initialSnap = await getDocs(colRef);
      const existingDocs = {};
      initialSnap.forEach((d) => {
        existingDocs[d.id] = d.data();
      });

      const isCloudEmpty =
        initialSnap.empty ||
        !existingDocs.projects ||
        !Array.isArray(existingDocs.projects.items);

      if (isCloudEmpty) {
        await this.pushFullStateToCloud({
          fleet: DEFAULT_FLEET,
          trailers: DEFAULT_TRAILERS,
          projects: DEFAULT_PROJECTS,
          settings: DEFAULT_SETTINGS,
          simulations: []
        });
      } else {
        this.applyCloudDocsToLocal(existingDocs, 'initial_cloud_load');
      }

      // 2. Attiva listener realtime `onSnapshot` per propagare all'istante ogni modifica tra tutti i PC connessi
      this.cloudUnsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          if (snapshot.metadata?.hasPendingWrites) {
            return;
          }
          const changedDocs = {};
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
              const docId = change.doc.id;
              const docData = change.doc.data();
              if (!docData) return;
              if (docData.clientId && docData.clientId === this.clientId) return;
              if (docData.updatedAt && this.lastLocalPushAt[docId] && docData.updatedAt < this.lastLocalPushAt[docId]) {
                return;
              }
              changedDocs[docId] = docData;
            }
          });

          if (Object.keys(changedDocs).length > 0) {
            this.applyCloudDocsToLocal(changedDocs, 'realtime_snapshot');
          }

          this.setCloudStatus({
            state: 'synced',
            lastSyncedAt: new Date().toISOString(),
            errorMessage: null
          });
        },
        (err) => {
          console.error('Errore listener realtime Firestore:', err);
          this.setCloudStatus({
            state: 'error',
            errorMessage: err?.message || 'Errore connessione Cloud'
          });
        }
      );

      this.setCloudStatus({
        state: 'synced',
        lastSyncedAt: new Date().toISOString(),
        errorMessage: null
      });
    } catch (err) {
      console.error('Errore avvio Cloud Sync:', err);
      this.setCloudStatus({
        state: 'offline',
        errorMessage: err?.message || 'Modalità offline'
      });
    } finally {
      this.cloudStarting = false;
    }
  }

  stopCloudSync() {
    if (this.cloudUnsubscribe) {
      this.cloudUnsubscribe();
      this.cloudUnsubscribe = null;
    }
  }

  applyCloudDocsToLocal(docsMap, reason = 'cloud') {
    let anyDataChanged = false;
    const changedScopes = [];

    const applySlice = (docId, storageKey, fieldName) => {
      const docData = docsMap[docId];
      if (!docData || docData[fieldName] === undefined) return;
      const incomingJson = JSON.stringify(docData[fieldName]);
      const currentJson = localStorage.getItem(storageKey);
      if (incomingJson !== currentJson) {
        localStorage.setItem(storageKey, incomingJson);
        anyDataChanged = true;
        changedScopes.push(docId);
      }
    };

    applySlice('fleet', STORAGE_KEYS.FLEET, 'items');
    applySlice('trailers', STORAGE_KEYS.TRAILERS, 'items');
    applySlice('projects', STORAGE_KEYS.PROJECTS, 'items');
    applySlice('settings', STORAGE_KEYS.SETTINGS, 'data');
    applySlice('simulations', STORAGE_KEYS.SIMULATIONS, 'items');
    applySlice('security', STORAGE_KEYS.SECURITY, 'data');

    if (anyDataChanged) {
      this.notifyListeners({
        type: 'data',
        source: 'cloud',
        reason,
        scopes: changedScopes
      });
    }
  }

  async fetchSecurityConfigFromCloud() {
    if (!db) return null;
    try {
      const fbUser = await ensureFirebaseSession();
      if (!fbUser) return null;
      const snap = await getDoc(doc(db, CLOUD_COLLECTION, 'security'));
      if (snap.exists()) {
        const docData = snap.data();
        if (docData?.data) {
          localStorage.setItem(STORAGE_KEYS.SECURITY, JSON.stringify(docData.data));
          return docData.data;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async pushSliceToCloud(docId, value, isMap = false) {
    if (!db) return { ok: false, error: 'Database Cloud non configurato' };
    const prevQueue = this.pushQueues[docId] || Promise.resolve();
    const task = prevQueue.then(async () => {
      try {
        this.setCloudStatus({ state: 'syncing', errorMessage: null });
        const fbUser = await ensureFirebaseSession();
        if (!fbUser) {
          this.setCloudStatus({ state: 'offline', errorMessage: 'Sessione Cloud non attiva' });
          return { ok: false, error: 'Sessione Cloud non attiva' };
        }

        const nowIso = new Date().toISOString();
        this.lastLocalPushAt[docId] = nowIso;
        const payload = {
          [isMap ? 'data' : 'items']: sanitizeForCloud(value),
          updatedAt: nowIso,
          clientId: this.clientId,
          seedVersion: CLEAN_SEED_VERSION,
          version: '1.0'
        };

        await setDoc(doc(db, CLOUD_COLLECTION, docId), payload);
        this.setCloudStatus({
          state: 'synced',
          lastSyncedAt: payload.updatedAt,
          errorMessage: null
        });
        return { ok: true };
      } catch (err) {
        console.error(`Errore salvataggio Cloud (${docId}):`, err);
        const msg = err?.message || `Errore salvataggio ${docId}`;
        this.setCloudStatus({
          state: 'error',
          errorMessage: msg
        });
        return { ok: false, error: msg };
      }
    });
    this.pushQueues[docId] = task.catch(() => ({ ok: false }));
    return task;
  }

  async pushFullStateToCloud({ fleet, trailers, projects, settings, simulations }) {
    const results = await Promise.all([
      this.pushSliceToCloud('fleet', fleet, false),
      this.pushSliceToCloud('trailers', trailers, false),
      this.pushSliceToCloud('projects', projects, false),
      this.pushSliceToCloud('settings', settings, true),
      this.pushSliceToCloud('simulations', simulations || [], false)
    ]);
    return {
      ok: results.every(r => r?.ok),
      error: results.find(r => !r?.ok)?.error || null
    };
  }

  async forceSyncFromCloud() {
    if (!db) return false;
    try {
      this.setCloudStatus({ state: 'syncing', errorMessage: null });
      const fbUser = await ensureFirebaseSession();
      if (!fbUser) return false;
      const snap = await getDocs(collection(db, CLOUD_COLLECTION));
      const docsMap = {};
      snap.forEach((d) => {
        docsMap[d.id] = d.data();
      });
      if (Object.keys(docsMap).length > 0) {
        this.applyCloudDocsToLocal(docsMap, 'manual_refresh');
      }
      this.setCloudStatus({
        state: 'synced',
        lastSyncedAt: new Date().toISOString(),
        errorMessage: null
      });
      return true;
    } catch (e) {
      console.error('Errore forceSyncFromCloud:', e);
      this.setCloudStatus({ state: 'error', errorMessage: e?.message });
      return false;
    }
  }

  saveSecurityConfig(securityConfig) {
    localStorage.setItem(STORAGE_KEYS.SECURITY, JSON.stringify(securityConfig));
    this.notifyListeners({ type: 'data', source: 'local', scopes: ['security'] });
    this.pushSliceToCloud('security', securityConfig, true);
  }

  mergeDefaultSettings(optionalParsed = null) {
    try {
      let parsed = optionalParsed;
      if (!parsed) {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (!raw) return DEFAULT_SETTINGS;
        parsed = JSON.parse(raw);
      }

      const existingLicenses = Array.isArray(parsed.licenseTypes) ? parsed.licenseTypes : [];
      const existingIds = new Set(existingLicenses.map(l => l.id));
      const mergedLicenses = [
        ...existingLicenses,
        ...(DEFAULT_SETTINGS.licenseTypes || []).filter(l => !existingIds.has(l.id))
      ];

      const existingFuels = Array.isArray(parsed.fuelTypes) ? parsed.fuelTypes : DEFAULT_SETTINGS.fuelTypes;
      const mergedFuels = existingFuels.map(f => {
        const defFuel = (DEFAULT_SETTINGS.fuelTypes || []).find(df => df.id === f.id);
        if (!defFuel) return f;
        const isLegacyNetPrice =
          (f.id === 'gasolio' && (Number(f.price) === 1.42 || (f.name || '').includes('Netto Accise'))) ||
          (f.id === 'hvo' && Number(f.price) === 1.52);
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
          },
          elettrico: {
            ...(DEFAULT_SETTINGS.refrigerationParams?.elettrico || {}),
            ...(parsed.refrigerationParams?.elettrico || {})
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
    this.notifyListeners({ type: 'data', source: 'local', scopes: ['fleet'] });
    this.pushSliceToCloud('fleet', fleet, false);
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

  updateVehicle(id, vehicleData, options = { syncProjects: true }) {
    const fleet = this.getFleet();
    const index = fleet.findIndex(v => v.id === id);
    if (index !== -1) {
      const prevVeh = fleet[index];
      fleet[index] = { ...prevVeh, ...vehicleData, updatedAt: new Date().toISOString() };
      this.saveFleet(fleet);

      // Sincronizza le commesse associate quando variano parametri economici, operativi o di scadenza del mezzo
      const economicChanged =
        prevVeh.monthlyLease !== fleet[index].monthlyLease ||
        prevVeh.insuranceIncluded !== fleet[index].insuranceIncluded ||
        prevVeh.insuranceYearly !== fleet[index].insuranceYearly ||
        prevVeh.licenseTypeId !== fleet[index].licenseTypeId ||
        prevVeh.avgConsumption !== fleet[index].avgConsumption ||
        prevVeh.yieldKmPerUnit !== fleet[index].yieldKmPerUnit ||
        prevVeh.fuelTypeId !== fleet[index].fuelTypeId ||
        prevVeh.costPerTire !== fleet[index].costPerTire ||
        prevVeh.tireCount !== fleet[index].tireCount ||
        prevVeh.tireLifeKm !== fleet[index].tireLifeKm ||
        prevVeh.category !== fleet[index].category ||
        prevVeh.ownershipType !== fleet[index].ownershipType ||
        prevVeh.leasePaymentTiming !== fleet[index].leasePaymentTiming ||
        JSON.stringify(prevVeh.leaseVariations || []) !== JSON.stringify(fleet[index].leaseVariations || []);

      if (options.syncProjects !== false && economicChanged) {
        this.syncProjectsForVehicle(fleet[index]);
      }
      return fleet[index];
    }
    return null;
  }

  /**
   * Aggiorna in modo non distruttivo i parametri ereditati dal mezzo (canone, assicurazione, consumi, gomme, autista)
   * sulle commesse associate, preservando override manuali espliciti.
   */
  syncProjectsForVehicle(vehicle) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (!data) return;
      const projects = JSON.parse(data);
      const trailers = this.getTrailers();
      const settings = this.getSettings();
      const fuelTypes = settings.fuelTypes || [];
      const tireParameters = settings.tireParameters || {};
      const defaultFuelFallbacks = { gasolio: 1.75, hvo: 1.72, biolng: 1.32, elettrico: 0.36 };

      let hasChanges = false;
      const updated = projects.map(p => {
        if (p.vehicleId === vehicle.id) {
          hasChanges = true;
          const trl = trailers.find(t => t.id === p.trailerId);
          const workingDays = Number(p.workingDaysMonth) || 22;
          const km = Number(p.kmDaily) || 0;
          const insCalc = calculateSpecificInsuranceCost(vehicle, trl, workingDays, settings);

          const nextVLeaseDaily = p.managementType === 'T'
            ? (Number(p.vehicleLeaseDaily) || 0)
            : (workingDays > 0 ? +((Number(vehicle.monthlyLease || 0) + insCalc.vehicleInsuranceMonthly) / workingDays).toFixed(2) : p.vehicleLeaseDaily);

          const inferredShift = p.driverShiftType || (
            vehicle.licenseTypeId === 'ce_doppio' || vehicle.licenseTypeId === 'c_doppio' ? '2_turni' :
            (vehicle.licenseTypeId || '').includes('notturno') ? '1_notturno' : '1_diurno'
          );
          const nextDriverDaily = (!p.driverManualOverride && p.managementType !== 'T')
            ? calculateDriverDailyCost(vehicle, inferredShift, settings)
            : p.driverCostDaily;

          let nextFuelDaily = p.fuelCostDaily;
          if (p.managementType !== 'T') {
            if (p.energyPayer === 'client') {
              nextFuelDaily = 0;
            } else if (km > 0) {
              const fuelObj = fuelTypes.find(f => f.id === vehicle.fuelTypeId);
              const fPrice = fuelObj ? Number(fuelObj.price) : (defaultFuelFallbacks[vehicle.fuelTypeId] ?? 1.75);
              const oroFactor = Number(p.orographicMultiplier) > 0 ? Number(p.orographicMultiplier) : 1.0;
              if (vehicle.fuelTypeId === 'elettrico') {
                const cons = Number(vehicle.avgConsumption) || 1.18;
                nextFuelDaily = +(km * cons * fPrice * oroFactor).toFixed(2);
              } else if (vehicle.fuelTypeId === 'biolng') {
                if (Number(vehicle.yieldKmPerUnit) > 0) {
                  nextFuelDaily = +((km / Number(vehicle.yieldKmPerUnit)) * fPrice * oroFactor).toFixed(2);
                } else {
                  const cons = Number(vehicle.avgConsumption) || 29.5;
                  nextFuelDaily = +((cons / 100) * km * fPrice * oroFactor).toFixed(2);
                }
              } else {
                const cons = Number(vehicle.avgConsumption) || 30.0;
                nextFuelDaily = +((cons / 100) * km * fPrice * oroFactor).toFixed(2);
              }
            }
          }

          let nextTiresDaily = p.tiresDaily;
          if (p.managementType !== 'T' && km > 0) {
            const tireCalc = calculateTireCostPerKm(vehicle, trl, tireParameters);
            nextTiresDaily = +(km * tireCalc.totalRate).toFixed(2);
          }

          const patched = {
            ...p,
            driverShiftType: inferredShift,
            vehicleLeaseDaily: nextVLeaseDaily,
            driverCostDaily: nextDriverDaily,
            fuelCostDaily: nextFuelDaily,
            tiresDaily: nextTiresDaily,
            leasePaymentTiming: vehicle.leasePaymentTiming || p.leasePaymentTiming,
            vehicleInsuranceMonthly: insCalc.vehicleInsuranceMonthly,
            vehicleInsuranceDaily: insCalc.vehicleInsuranceDaily,
            vehicleLeaseVariations: p.managementType === 'T'
              ? []
              : (Array.isArray(vehicle.leaseVariations) ? vehicle.leaseVariations : [])
          };
          const m = calculateSingleProjectMetrics(patched);
          return {
            ...patched,
            totalCostDaily: m.totalCostDaily,
            revenueDaily: m.revenueDaily,
            molDaily: m.molDaily,
            monthlyCost: m.monthlyCost,
            monthlyRevenue: m.monthlyRevenue,
            monthlyMol: m.monthlyMol,
            molPercent: +m.molPercent.toFixed(2),
            cashAdvanceRequired: m.estimatedWorkingCapitalGap,
            hasPriceVariations: m.hasPriceVariations,
            variationSummary: m.variationSummary || null
          };
        }
        return p;
      });

      if (hasChanges) {
        this.saveProjects(updated);
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
      return data ? JSON.parse(data) : DEFAULT_TRAILERS;
    } catch (e) {
      console.error('Errore lettura rimorchi:', e);
      return DEFAULT_TRAILERS;
    }
  }

  saveTrailers(trailers) {
    localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(trailers));
    this.notifyListeners({ type: 'data', source: 'local', scopes: ['trailers'] });
    this.pushSliceToCloud('trailers', trailers, false);
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

  updateTrailer(id, trailerData, options = { syncProjects: true }) {
    const trailers = this.getTrailers();
    const index = trailers.findIndex(t => t.id === id);
    if (index !== -1) {
      const prevTrl = trailers[index];
      trailers[index] = { ...prevTrl, ...trailerData, updatedAt: new Date().toISOString() };
      this.saveTrailers(trailers);

      const economicChanged =
        prevTrl.monthlyLease !== trailers[index].monthlyLease ||
        prevTrl.insuranceIncluded !== trailers[index].insuranceIncluded ||
        prevTrl.insuranceYearly !== trailers[index].insuranceYearly ||
        prevTrl.fridgeTech !== trailers[index].fridgeTech ||
        prevTrl.fridgeHourlyConsumption !== trailers[index].fridgeHourlyConsumption ||
        prevTrl.costPerTire !== trailers[index].costPerTire ||
        prevTrl.tireCount !== trailers[index].tireCount ||
        prevTrl.tireLifeKm !== trailers[index].tireLifeKm ||
        prevTrl.category !== trailers[index].category ||
        prevTrl.ownershipType !== trailers[index].ownershipType ||
        prevTrl.leasePaymentTiming !== trailers[index].leasePaymentTiming ||
        JSON.stringify(prevTrl.leaseVariations || []) !== JSON.stringify(trailers[index].leaseVariations || []);

      if (options.syncProjects !== false && economicChanged) {
        this.syncProjectsForTrailer(trailers[index]);
      }
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
      const settings = this.getSettings();
      const tireParameters = settings.tireParameters || {};

      let hasChanges = false;
      const updated = projects.map(p => {
        if (p.trailerId === trailer.id) {
          hasChanges = true;
          const veh = fleet.find(v => v.id === p.vehicleId);
          const workingDays = Number(p.workingDaysMonth) || 22;
          const km = Number(p.kmDaily) || 0;
          const insCalc = calculateSpecificInsuranceCost(veh, trailer, workingDays, settings);
          const nextTLeaseDaily = workingDays > 0
            ? +((Number(trailer.monthlyLease || 0) + insCalc.trailerInsuranceMonthly) / workingDays).toFixed(2)
            : p.trailerLeaseDaily;

          let nextTiresDaily = p.tiresDaily;
          if (p.managementType !== 'T' && km > 0) {
            const tireCalc = calculateTireCostPerKm(veh, trailer, tireParameters);
            nextTiresDaily = +(km * tireCalc.totalRate).toFixed(2);
          }

          const trailerHasFridge = trailer.fridgeTech !== 'nessuno' && isRefrigeratedTrailer(trailer);
          const refCalc = calculateRefrigerationDailyCost({
            ...p,
            refrigerationEnabled: p.refrigerationEnabled !== undefined ? p.refrigerationEnabled : trailerHasFridge,
            refrigerationTech: trailerHasFridge ? (trailer.fridgeTech || p.refrigerationTech) : p.refrigerationTech,
            refrigerationHourlyConsumption: trailerHasFridge && Number(trailer.fridgeHourlyConsumption) > 0
              ? Number(trailer.fridgeHourlyConsumption)
              : p.refrigerationHourlyConsumption
          }, trailer, settings);

          const patched = {
            ...p,
            tiresDaily: nextTiresDaily,
            trailerLeaseDaily: nextTLeaseDaily,
            trailerLeasePaymentTiming: trailer.leasePaymentTiming || p.trailerLeasePaymentTiming,
            trailerInsuranceMonthly: insCalc.trailerInsuranceMonthly,
            trailerInsuranceDaily: insCalc.trailerInsuranceDaily,
            trailerLeaseVariations: Array.isArray(trailer.leaseVariations) ? trailer.leaseVariations : [],
            ...(trailerHasFridge ? {
              refrigerationEnabled: refCalc.enabled,
              refrigerationTech: refCalc.tech,
              refrigerationUnitCost: refCalc.unitCost,
              refrigerationHourlyConsumption: refCalc.hourlyConsumption,
              refrigerationCostDaily: refCalc.dailyCost
            } : {})
          };
          const m = calculateSingleProjectMetrics(patched);
          return {
            ...patched,
            totalCostDaily: m.totalCostDaily,
            revenueDaily: m.revenueDaily,
            molDaily: m.molDaily,
            monthlyCost: m.monthlyCost,
            monthlyRevenue: m.monthlyRevenue,
            monthlyMol: m.monthlyMol,
            molPercent: +m.molPercent.toFixed(2),
            cashAdvanceRequired: m.estimatedWorkingCapitalGap,
            hasPriceVariations: m.hasPriceVariations,
            variationSummary: m.variationSummary || null
          };
        }
        return p;
      });

      if (hasChanges) {
        this.saveProjects(updated);
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

      // Propaga eventuali variazioni canone per data registrate sui mezzi senza alterare i costi operativi manuali delle commesse
      let needsSave = false;
      const synchronized = projects.map(p => {
        const veh = fleet.find(v => v.id === p.vehicleId);
        const trl = trailers.find(t => t.id === p.trailerId);
        const expectedVehVars = p.managementType === 'T' ? [] : (veh?.leaseVariations || []);
        const vehVarJson = JSON.stringify(expectedVehVars);
        const projVehVarJson = JSON.stringify(p.vehicleLeaseVariations || []);
        const trlVarJson = JSON.stringify(trl?.leaseVariations || []);
        const projTrlVarJson = JSON.stringify(p.trailerLeaseVariations || []);

        if (((veh || p.managementType === 'T') && vehVarJson !== projVehVarJson) || (trl && trlVarJson !== projTrlVarJson)) {
          needsSave = true;
          const patched = {
            ...p,
            vehicleLeaseVariations: expectedVehVars,
            trailerLeaseVariations: trl?.leaseVariations || []
          };
          const m = calculateSingleProjectMetrics(patched);
          return {
            ...patched,
            totalCostDaily: m.totalCostDaily,
            revenueDaily: m.revenueDaily,
            molDaily: m.molDaily,
            monthlyCost: m.monthlyCost,
            monthlyRevenue: m.monthlyRevenue,
            monthlyMol: m.monthlyMol,
            molPercent: +m.molPercent.toFixed(2),
            cashAdvanceRequired: m.estimatedWorkingCapitalGap,
            hasPriceVariations: m.hasPriceVariations,
            variationSummary: m.variationSummary || null
          };
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
    this.notifyListeners({ type: 'data', source: 'local', scopes: ['projects'] });
    this.pushSliceToCloud('projects', projects, false);
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

    if (newProject.vehicleId) {
      this.updateVehicle(
        newProject.vehicleId,
        { status: 'assigned', assignedProject: newProject.name },
        { syncProjects: false }
      );
    }
    if (newProject.trailerId) {
      this.updateTrailer(
        newProject.trailerId,
        { status: 'assigned', assignedProject: newProject.name },
        { syncProjects: false }
      );
    }

    return newProject;
  }

  updateProject(id, projectData) {
    const projects = this.getProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      const prevProj = projects[index];
      const nextProj = { ...prevProj, ...projectData, updatedAt: new Date().toISOString() };
      projects[index] = nextProj;
      this.saveProjects(projects);

      // Riallinea stato flotta se è cambiato veicolo o semirimorchio
      if (prevProj.vehicleId && prevProj.vehicleId !== nextProj.vehicleId) {
        const otherUsingOld = projects.find(p => p.id !== id && p.vehicleId === prevProj.vehicleId);
        this.updateVehicle(
          prevProj.vehicleId,
          otherUsingOld ? { status: 'assigned', assignedProject: otherUsingOld.name } : { status: 'available', assignedProject: null },
          { syncProjects: false }
        );
      }
      if (nextProj.vehicleId && nextProj.vehicleId !== prevProj.vehicleId) {
        this.updateVehicle(nextProj.vehicleId, { status: 'assigned', assignedProject: nextProj.name }, { syncProjects: false });
      }
      if (prevProj.trailerId && prevProj.trailerId !== nextProj.trailerId) {
        const otherUsingOldT = projects.find(p => p.id !== id && p.trailerId === prevProj.trailerId);
        this.updateTrailer(
          prevProj.trailerId,
          otherUsingOldT ? { status: 'assigned', assignedProject: otherUsingOldT.name } : { status: 'available', assignedProject: null },
          { syncProjects: false }
        );
      }
      if (nextProj.trailerId && nextProj.trailerId !== prevProj.trailerId) {
        this.updateTrailer(nextProj.trailerId, { status: 'assigned', assignedProject: nextProj.name }, { syncProjects: false });
      }

      return nextProj;
    }
    return null;
  }

  deleteProject(id) {
    const allProjects = this.getProjects();
    const project = allProjects.find(p => p.id === id);
    const remaining = allProjects.filter(p => p.id !== id);
    this.saveProjects(remaining);

    if (project) {
      if (project.vehicleId && !remaining.some(p => p.vehicleId === project.vehicleId)) {
        this.updateVehicle(project.vehicleId, { status: 'available', assignedProject: null }, { syncProjects: false });
      }
      if (project.trailerId && !remaining.some(p => p.trailerId === project.trailerId)) {
        this.updateTrailer(project.trailerId, { status: 'available', assignedProject: null }, { syncProjects: false });
      }
    }
    return remaining;
  }

  // --- SETTINGS ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(data);
      if (
        !parsed.refrigerationParams ||
        !parsed.refrigerationParams.elettrico ||
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
    this.notifyListeners({ type: 'data', source: 'local', scopes: ['settings'] });
    this.pushSliceToCloud('settings', settings, true);
    return settings;
  }

  /**
   * Aggiorna i prezzi medi settimanali dei carburanti "Alla Pompa" da fonti ufficiali (MASE / MIMIT / GME)
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

    // Se l'auto-refresh in background non ottiene un feed remoto reale, non sovrascrive i prezzi personalizzati dell'utente
    if (!options.force && !syncMeta.fetchedFromRemote) {
      const metaOnlySettings = {
        ...currentSettings,
        lastFuelSyncMeta: {
          lastSyncIso: syncMeta.lastSyncIso,
          weekLabel: syncMeta.weekLabel,
          sourceLabel: syncMeta.sourceLabel,
          fetchedFromRemote: false
        }
      };
      this.saveSettings(metaOnlySettings);
      return {
        updated: false,
        settings: metaOnlySettings,
        syncMeta
      };
    }

    // Su auto-refresh live aggiorna solo i carburanti con feed remoto (gasolio/hvo) preservando prezzi personalizzati Bio-LNG/BEV/Azoto;
    // su refresh manuale esplicito aggiorna tutti i listini di riferimento.
    const liveFuelIds = new Set(['gasolio', 'hvo']);
    const updatedFuelTypes = (currentSettings.fuelTypes || []).map(f => {
      if (!options.force && !liveFuelIds.has(f.id)) return f;
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
        adbluePricePerLiter: options.force
          ? (syncMeta?.pricesByFuelId?.adblue?.price ?? currentSettings.standardCosts?.adbluePricePerLiter ?? 0.85)
          : (currentSettings.standardCosts?.adbluePricePerLiter ?? 0.85)
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

  // --- SIMULATIONS (ARCHIVIO PREVENTIVI TRATTA) ---
  getSimulations() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SIMULATIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveSimulationsList(sims) {
    localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(sims));
    this.notifyListeners({ type: 'data', source: 'local', scopes: ['simulations'] });
    this.pushSliceToCloud('simulations', sims, false);
    return sims;
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
      this.saveSimulationsList(sims);
      return sims[existingIdx];
    }
    const newSim = {
      ...simulation,
      id: simulation.id || 'sim_' + Date.now(),
      code: simulation.code || 'PREV-' + Math.floor(100 + Math.random() * 900),
      status: simulation.status || 'pending',
      createdAt: new Date().toISOString()
    };
    sims.unshift(newSim);
    this.saveSimulationsList(sims);
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
      this.saveSimulationsList(sims);
      return sims[idx];
    }
    return null;
  }

  deleteSimulation(id) {
    const sims = this.getSimulations().filter(s => s.id !== id);
    this.saveSimulationsList(sims);
    return sims;
  }

  // --- RESET & BACKUP (CON PROPAGAZIONE CLOUD IMMEDIATA) ---
  resetToDefaults() {
    this.initDefaults(true);
    const cleanState = {
      fleet: this.getFleet(),
      trailers: this.getTrailers(),
      projects: this.getProjects(),
      settings: this.getSettings(),
      simulations: []
    };
    this.notifyListeners({ type: 'data', source: 'local', scopes: ['fleet', 'trailers', 'projects', 'settings', 'simulations'] });
    this.pushFullStateToCloud(cleanState);
    return cleanState;
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

  parseBackupPreview(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Il file non contiene un oggetto JSON valido.' };
      }
      const hasKnownSection =
        Array.isArray(data.fleet) ||
        Array.isArray(data.trailers) ||
        Array.isArray(data.projects) ||
        (data.settings && typeof data.settings === 'object');
      if (!hasKnownSection) {
        return { valid: false, error: 'Il file JSON non corrisponde a un backup FOUR riconosciuto.' };
      }
      return {
        valid: true,
        exportedAt: data.exportedAt || null,
        company: data.company || 'FOUR Trasporti Sostenibili',
        counts: {
          fleet: Array.isArray(data.fleet) ? data.fleet.length : 0,
          trailers: Array.isArray(data.trailers) ? data.trailers.length : 0,
          projects: Array.isArray(data.projects) ? data.projects.length : 0,
          simulations: Array.isArray(data.simulations) ? data.simulations.length : 0
        }
      };
    } catch (e) {
      return { valid: false, error: e?.message || 'Errore nella lettura del file JSON.' };
    }
  }

  async importBackupJson(jsonString) {
    try {
      const preview = this.parseBackupPreview(jsonString);
      if (!preview.valid) {
        return { success: false, error: preview.error };
      }

      const data = JSON.parse(jsonString);
      const nextFleet = Array.isArray(data.fleet) ? data.fleet : this.getFleet();
      const nextTrailers = Array.isArray(data.trailers) ? data.trailers : this.getTrailers();
      const nextProjects = Array.isArray(data.projects) ? data.projects : this.getProjects();
      const nextSettings = (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings))
        ? this.mergeDefaultSettings(data.settings)
        : this.getSettings();
      const nextSims = Array.isArray(data.simulations) ? data.simulations : this.getSimulations();

      localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(nextFleet));
      localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(nextTrailers));
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(nextProjects));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(nextSettings));
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(nextSims));

      this.notifyListeners({ type: 'data', source: 'local', scopes: ['fleet', 'trailers', 'projects', 'settings', 'simulations'] });
      const cloudRes = await this.pushFullStateToCloud({
        fleet: nextFleet,
        trailers: nextTrailers,
        projects: nextProjects,
        settings: nextSettings,
        simulations: nextSims
      });
      return {
        success: true,
        cloudSynced: Boolean(cloudRes?.ok),
        cloudError: cloudRes?.error || null,
        counts: {
          fleet: nextFleet.length,
          trailers: nextTrailers.length,
          projects: nextProjects.length,
          simulations: nextSims.length
        }
      };
    } catch (e) {
      console.error('Errore import backup:', e);
      return { success: false, error: e?.message || 'Errore nel formato del file di backup' };
    }
  }
}

export const storageService = new StorageService();
export default storageService;
