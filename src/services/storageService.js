// Service per la persistenza locale (LocalStorage) e sincronizzazione opzionale con Firebase
// Garantisce il funzionamento offline / standalone al 100% in locale

import { DEFAULT_FLEET, DEFAULT_TRAILERS, DEFAULT_PROJECTS, DEFAULT_SETTINGS } from '../data/initialData';
import { recalculateProjectCost } from '../utils/cashFlowCalculations';

const STORAGE_KEYS = {
  FLEET: 'four_fleet_vehicles',
  TRAILERS: 'four_fleet_trailers',
  PROJECTS: 'four_projects',
  SETTINGS: 'four_settings',
  SIMULATIONS: 'four_simulations',
  ACTIVE_SCENARIO: 'four_active_scenario'
};

class StorageService {
  constructor() {
    this.initDefaults();
  }

  initDefaults(forceReset = false) {
    if (forceReset || !localStorage.getItem(STORAGE_KEYS.FLEET)) {
      localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(DEFAULT_FLEET));
    }
    if (forceReset || !localStorage.getItem(STORAGE_KEYS.TRAILERS)) {
      localStorage.setItem(STORAGE_KEYS.TRAILERS, JSON.stringify(DEFAULT_TRAILERS));
    }
    if (forceReset || !localStorage.getItem(STORAGE_KEYS.PROJECTS)) {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(DEFAULT_PROJECTS));
    }
    if (forceReset || !localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    }
    if (forceReset || !localStorage.getItem(STORAGE_KEYS.SIMULATIONS)) {
      localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify([]));
    }
  }

  // --- FLEET (MEZZI MOTORI) ---
  getFleet() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FLEET);
      return data ? JSON.parse(data) : DEFAULT_FLEET;
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
      return data ? JSON.parse(data) : DEFAULT_TRAILERS;
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

      // Sincronizzazione automatica se i canoni di noleggio sono variati
      let needsSave = false;
      const synchronized = projects.map(p => {
        const veh = fleet.find(v => v.id === p.vehicleId);
        const trl = trailers.find(t => t.id === p.trailerId);
        if (veh || trl) {
          const expectedVLease = veh && p.workingDaysMonth > 0 ? +(veh.monthlyLease / p.workingDaysMonth).toFixed(2) : p.vehicleLeaseDaily;
          const expectedTLease = trl && p.workingDaysMonth > 0 ? +(trl.monthlyLease / p.workingDaysMonth).toFixed(2) : p.trailerLeaseDaily;
          if (p.managementType === 'D' && (expectedVLease !== p.vehicleLeaseDaily || expectedTLease !== p.trailerLeaseDaily)) {
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
      return data ? JSON.parse(data) : DEFAULT_SETTINGS;
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
    const newSim = {
      ...simulation,
      id: simulation.id || 'sim_' + Date.now(),
      createdAt: new Date().toISOString()
    };
    sims.unshift(newSim);
    localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(sims));
    return newSim;
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
