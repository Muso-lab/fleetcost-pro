import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import storageService from '../services/storageService';
import {
  formatEUR,
  formatPercent,
  calculateSingleProjectMetrics,
  LEASE_PAYMENT_TIMINGS,
  normalizeLeaseTiming,
  recalculateProjectCost,
  getContractValidity,
  isRefrigeratedTrailer,
  calculateDriverDailyCost,
  calculateAccessoriesDailyCost
} from '../utils/cashFlowCalculations';
import {
  Briefcase,
  Plus,
  Edit2,
  Trash2,
  Copy,
  AlertTriangle,
  TrendingUp,
  Clock,
  Truck,
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  X,
  Save,
  DollarSign,
  Calendar,
  AlertCircle,
  RotateCw,
  Zap,
  Snowflake,
  Droplets,
  Wifi,
  ChevronDown,
  ChevronUp,
  Sliders,
  Calculator,
  Sparkles,
  ArrowUpRight,
  Check,
  Eye
} from 'lucide-react';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [managementFilter, setManagementFilter] = useState('all');
  const [marginFilter, setMarginFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showNextYearModal, setShowNextYearModal] = useState(false);
  const [showPerItemTerms, setShowPerItemTerms] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  // Form State per Nuovo/Modifica Progetto
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    client: '',
    route: '',
    startDate: '2026-01-01',
    operatingMonths: 36, // Default 36 mesi standard contratti FOUR
    workingDaysMonth: 22,
    kmDaily: 250,
    managementType: 'D', // D = Diretta, T = Terzi
    vehicleId: '',
    trailerId: '',
    driverShiftType: '1_diurno', // 1_diurno | 1_notturno | 2_turni
    driverManualOverride: false,
    driverCostDaily: 220,
    energyPayer: 'four', // four | client
    fuelCostDaily: 40,
    tollsDaily: 35,
    tiresDaily: 12,
    refrigerationEnabled: false,
    refrigerationTech: 'gasolio',
    refrigerationUnitCost: 1.80,
    refrigerationHourlyConsumption: 3.0,
    refrigerationHoursDaily: 8,
    refrigerationCostDaily: 0,
    telematicsEnabled: true,
    telematicsAuto: true,
    telematicsMonthly: 27,
    telematicsCostDaily: 1.23,
    washingEnabled: true,
    washingUnitCost: 80,
    washingCountPerMonth: 2,
    washingCostDaily: 7.27,
    extraCostDescription: '',
    extraCostAmount: 0,
    extraCostFrequency: 'monthly',
    extraCostDaily: 0,
    otherCostsDaily: 0,
    partnerMarginDaily: 0,
    porterageDaily: 0,
    vehicleLeaseDaily: 200,
    trailerLeaseDaily: 35,
    revenueDaily: 750,
    targetMarginPercent: 21,
    contractStatus: 'active', // 'active' (Status Quo) | 'potential' (Trattativa / Simulazione)
    isPipelineFuture: false,
    paymentTermsClient: 60, // DSO: incasso clienti gg
    paymentTermsSuppliers: 30, // DPO: fornitori / terzisti gg
    paymentTermsLease: 30,
    leasePaymentTiming: 'M1_D10',
    trailerLeasePaymentTiming: 'M1_D30',
    paymentTermsDriver: 16,
    paymentTermsFuel: 30,
    paymentTermsTolls: 15,
    paymentTermsTires: 30,
    paymentTermsRefrigeration: 30,
    paymentTermsTelematics: 30,
    paymentTermsWashing: 30,
    paymentTermsExtra: 30,
    acciseRecoveryEligible: true,
    depositAmount: 0,
    notes: ''
  });

  useEffect(() => {
    loadData();
    const newFromVehicle = searchParams.get('newFromVehicle');
    if (newFromVehicle) {
      handleOpenCreateWithVehicle(newFromVehicle);
    }
  }, [searchParams]);

  const loadData = () => {
    const p = storageService.getProjects();
    const f = storageService.getFleet();
    const t = storageService.getTrailers();
    const s = storageService.getSettings();
    setProjects(p);
    setFleet(f);
    setTrailers(t);
    setSettings(s);
  };

  const handleOpenCreateWithVehicle = (vehicleId) => {
    const f = storageService.getFleet();
    const v = f.find(item => item.id === vehicleId);
    handleOpenModal(null, v);
  };

  // Funzione unificata di ricalcolo automatico e reattivo
  const applyAutoRecalculation = (partialData, options = {}) => {
    const baseData = options.baseData || formData;
    const merged = {
      ...baseData,
      ...partialData,
      ...(options.forceRecalculateDriver ? { driverManualOverride: false } : {})
    };
    const curSettings = settings || storageService.getSettings();
    const recalculated = recalculateProjectCost(merged, fleet, trailers, curSettings);
    return {
      ...merged,
      driverCostDaily: recalculated.driverCostDaily,
      fuelCostDaily: recalculated.fuelCostDaily,
      tollsDaily: recalculated.tollsDaily,
      tiresDaily: recalculated.tiresDaily,
      vehicleLeaseDaily: recalculated.vehicleLeaseDaily,
      trailerLeaseDaily: recalculated.trailerLeaseDaily,
      refrigerationEnabled: recalculated.refrigerationEnabled,
      refrigerationTech: recalculated.refrigerationTech,
      refrigerationUnitCost: recalculated.refrigerationUnitCost,
      refrigerationHourlyConsumption: recalculated.refrigerationHourlyConsumption,
      refrigerationHoursDaily: recalculated.refrigerationHoursDaily,
      refrigerationCostDaily: recalculated.refrigerationCostDaily,
      telematicsEnabled: recalculated.telematicsEnabled,
      telematicsMonthly: recalculated.telematicsMonthly,
      telematicsCostDaily: recalculated.telematicsCostDaily,
      washingEnabled: recalculated.washingEnabled,
      washingUnitCost: recalculated.washingUnitCost,
      washingCountPerMonth: recalculated.washingCountPerMonth,
      washingCostDaily: recalculated.washingCostDaily,
      extraCostDaily: recalculated.extraCostDaily,
      partnerMarginDaily: recalculated.partnerMarginDaily,
      porterageDaily: recalculated.porterageDaily,
      otherCostsDaily: recalculated.otherCostsDaily
    };
  };

  const handleOpenModal = (project = null, preselectedVehicle = null, defaultContractStatus = 'active') => {
    const curSettings = settings || storageService.getSettings();
    if (project) {
      setEditingProject(project);
      const projVeh = fleet.find(v => v.id === project.vehicleId);
      const projTrl = trailers.find(t => t.id === project.trailerId);
      const refDef = curSettings?.refrigerationParams || {};
      const defaultTech = projTrl?.category === 'refrigerato_azoto' ? 'azoto' : 'gasolio';
      const tech = project.refrigerationTech || defaultTech;
      const techParams = refDef[tech] || (tech === 'azoto' ? { unitCost: 0.13, hourlyConsumption: 30 } : { unitCost: 1.80, hourlyConsumption: 3.0 });
      const telDef = curSettings?.accessoryParams?.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12 };
      const washDef = curSettings?.accessoryParams?.washing || { costPerWash: 80, washesPerMonth: 2 };

      setFormData({
        code: project.code || '',
        name: project.name || '',
        client: project.client || '',
        route: project.route || '',
        startDate: project.startDate || '2026-01-01',
        operatingMonths: project.operatingMonths || 36,
        workingDaysMonth: project.workingDaysMonth || 22,
        kmDaily: project.kmDaily || 250,
        managementType: project.managementType || 'D',
        vehicleId: project.vehicleId || '',
        trailerId: project.trailerId || '',
        driverShiftType: project.driverShiftType || (
          (projVeh?.licenseTypeId || '').includes('doppio') ? '2_turni' :
          (projVeh?.licenseTypeId || '').includes('notturno') ? '1_notturno' : '1_diurno'
        ),
        driverManualOverride: Boolean(project.driverManualOverride),
        driverCostDaily: project.driverCostDaily || 0,
        energyPayer: project.energyPayer || 'four',
        fuelCostDaily: project.energyPayer === 'client' ? 0 : (project.fuelCostDaily || 0),
        tollsDaily: project.tollsDaily || 0,
        tiresDaily: project.tiresDaily || 0,
        refrigerationEnabled: project.refrigerationEnabled !== undefined
          ? Boolean(project.refrigerationEnabled)
          : (Number(project.refrigerationCostDaily) > 0),
        refrigerationTech: tech,
        refrigerationUnitCost: project.refrigerationUnitCost ?? techParams.unitCost,
        refrigerationHourlyConsumption: project.refrigerationHourlyConsumption ?? techParams.hourlyConsumption,
        refrigerationHoursDaily: project.refrigerationHoursDaily ?? 8,
        refrigerationCostDaily: project.refrigerationCostDaily || 0,
        telematicsEnabled: project.telematicsEnabled !== undefined
          ? Boolean(project.telematicsEnabled)
          : (Number(project.telematicsCostDaily) > 0),
        telematicsAuto: project.telematicsAuto !== undefined ? Boolean(project.telematicsAuto) : true,
        telematicsMonthly: project.telematicsMonthly ?? (
          (project.managementType !== 'T' && projVeh ? (projVeh.category === 'trattore' ? telDef.tractorMonthly : telDef.rigidMonthly) : 0) +
          (projTrl ? telDef.trailerMonthly : 0)
        ),
        telematicsCostDaily: project.telematicsCostDaily || 0,
        washingEnabled: project.washingEnabled !== undefined
          ? Boolean(project.washingEnabled)
          : (Number(project.washingCostDaily) > 0),
        washingUnitCost: project.washingUnitCost ?? washDef.costPerWash,
        washingCountPerMonth: project.washingCountPerMonth ?? washDef.washesPerMonth,
        washingCostDaily: project.washingCostDaily || 0,
        extraCostDescription: project.extraCostDescription || '',
        extraCostAmount: project.extraCostAmount || 0,
        extraCostFrequency: project.extraCostFrequency || 'monthly',
        extraCostDaily: project.extraCostDaily || 0,
        otherCostsDaily: project.otherCostsDaily || 0,
        partnerMarginDaily: project.partnerMarginDaily || 0,
        porterageDaily: project.porterageDaily || 0,
        vehicleLeaseDaily: project.vehicleLeaseDaily || 0,
        trailerLeaseDaily: project.trailerLeaseDaily || 0,
        revenueDaily: project.revenueDaily || 0,
        targetMarginPercent: project.targetMarginPercent !== undefined ? project.targetMarginPercent : (project.molPercent || 21),
        contractStatus: project.contractStatus || (isFutureProject(project) ? 'potential' : 'active'),
        isPipelineFuture: project.contractStatus === 'potential' || Boolean(project.isPipelineFuture),
        paymentTermsClient: project.paymentTermsClient ?? 60,
        paymentTermsSuppliers: project.paymentTermsSuppliers ?? 30,
        paymentTermsLease: project.paymentTermsLease ?? 30,
        leasePaymentTiming: project.leasePaymentTiming || normalizeLeaseTiming(project),
        trailerLeasePaymentTiming: project.trailerLeasePaymentTiming || (projTrl ? normalizeLeaseTiming(projTrl) : (project.leasePaymentTiming || normalizeLeaseTiming(project))),
        paymentTermsDriver: project.paymentTermsDriver ?? 16,
        paymentTermsFuel: project.paymentTermsFuel ?? 30,
        paymentTermsTolls: project.paymentTermsTolls ?? 15,
        paymentTermsTires: project.paymentTermsTires ?? 30,
        paymentTermsRefrigeration: project.paymentTermsRefrigeration ?? 30,
        paymentTermsTelematics: project.paymentTermsTelematics ?? 30,
        paymentTermsWashing: project.paymentTermsWashing ?? 30,
        paymentTermsExtra: project.paymentTermsExtra ?? 30,
        acciseRecoveryEligible: project.acciseRecoveryEligible !== false,
        depositAmount: project.depositAmount || 0,
        notes: project.notes || ''
      });
    } else {
      setEditingProject(null);
      const defaultVeh = preselectedVehicle || fleet[0];
      const workingDays = 22;
      const defaultShift = (defaultVeh?.licenseTypeId || '').includes('doppio') ? '2_turni'
        : (defaultVeh?.licenseTypeId || '').includes('notturno') ? '1_notturno' : '1_diurno';
      const telDef = curSettings?.accessoryParams?.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12 };
      const washDef = curSettings?.accessoryParams?.washing || { costPerWash: 80, washesPerMonth: 2 };
      const payDef = curSettings?.paymentTermsDefaults || {};
      const gasolioRef = curSettings?.refrigerationParams?.gasolio || { unitCost: 1.80, hourlyConsumption: 3.0 };

      const isPot = defaultContractStatus === 'potential';
      const initialProject = {
        code: (isPot ? 'SIM-' : 'PRJ-') + Math.floor(100 + Math.random() * 900),
        name: isPot
          ? (defaultVeh ? `Trattativa con ${defaultVeh.name}` : 'Trattativa Commerciale')
          : (defaultVeh ? `Servizio con ${defaultVeh.name}` : ''),
        client: isPot ? 'Nuova Trattativa' : '',
        route: '',
        startDate: '2026-01-01',
        operatingMonths: 36,
        workingDaysMonth: workingDays,
        kmDaily: 250,
        managementType: defaultVeh?.ownershipType === 'terzi' ? 'T' : 'D',
        vehicleId: defaultVeh ? defaultVeh.id : '',
        trailerId: '',
        driverShiftType: defaultShift,
        driverManualOverride: false,
        driverCostDaily: calculateDriverDailyCost(defaultVeh, defaultShift, curSettings),
        energyPayer: 'four',
        fuelCostDaily: 35,
        tollsDaily: 30,
        tiresDaily: 12,
        refrigerationEnabled: false,
        refrigerationTech: 'gasolio',
        refrigerationUnitCost: gasolioRef.unitCost,
        refrigerationHourlyConsumption: gasolioRef.hourlyConsumption,
        refrigerationHoursDaily: 8,
        refrigerationCostDaily: 0,
        telematicsEnabled: true,
        telematicsAuto: true,
        telematicsMonthly: defaultVeh?.category === 'trattore' ? telDef.tractorMonthly : telDef.rigidMonthly,
        telematicsCostDaily: 0,
        washingEnabled: defaultVeh?.ownershipType !== 'terzi',
        washingUnitCost: washDef.costPerWash,
        washingCountPerMonth: washDef.washesPerMonth,
        washingCostDaily: 0,
        extraCostDescription: '',
        extraCostAmount: 0,
        extraCostFrequency: 'monthly',
        extraCostDaily: 0,
        otherCostsDaily: 0,
        partnerMarginDaily: defaultVeh?.ownershipType === 'terzi' ? 600 : 0,
        porterageDaily: 0,
        vehicleLeaseDaily: defaultVeh && defaultVeh.monthlyLease ? +(defaultVeh.monthlyLease / workingDays).toFixed(2) : 208,
        trailerLeaseDaily: 0,
        revenueDaily: 750,
        targetMarginPercent: 21,
        contractStatus: isPot ? 'potential' : 'active',
        isPipelineFuture: isPot,
        paymentTermsClient: 60,
        paymentTermsSuppliers: payDef.suppliersPaymentTermsDays ?? 30,
        paymentTermsLease: defaultVeh?.leasePaymentTerms ?? 0,
        leasePaymentTiming: defaultVeh?.leasePaymentTiming || 'M1_D10',
        trailerLeasePaymentTiming: defaultVeh?.leasePaymentTiming || 'M1_D30',
        paymentTermsDriver: payDef.driverPaymentDayNextMonth ?? 16,
        paymentTermsFuel: payDef.fuelPaymentTermsDays ?? 30,
        paymentTermsTolls: 15,
        paymentTermsTires: payDef.tiresPaymentTermsDays ?? 30,
        paymentTermsRefrigeration: payDef.refrigerationPaymentTermsDays ?? 30,
        paymentTermsTelematics: payDef.telematicsPaymentTermsDays ?? 30,
        paymentTermsWashing: payDef.washingPaymentTermsDays ?? 30,
        paymentTermsExtra: payDef.extraPaymentTermsDays ?? 30,
        acciseRecoveryEligible: true,
        depositAmount: 0,
        notes: isPot ? 'Trattativa commerciale / simulazione di fattibilità' : ''
      };
      const recalculated = recalculateProjectCost(initialProject, fleet, trailers, curSettings);
      setFormData({
        ...initialProject,
        ...recalculated
      });
    }
    setShowPerItemTerms(false);
    setShowModal(true);
  };

  const handleVehicleChangeInModal = (vId) => {
    const selectedVeh = fleet.find(v => v.id === vId);
    const newTiming = selectedVeh ? (selectedVeh.leasePaymentTiming || normalizeLeaseTiming(selectedVeh)) : formData.leasePaymentTiming;
    const newTerms = selectedVeh && selectedVeh.leasePaymentTerms !== undefined ? selectedVeh.leasePaymentTerms : formData.paymentTermsLease;
    const isTerzi = selectedVeh?.ownershipType === 'terzi';
    const newMgmt = isTerzi ? 'T' : formData.managementType;
    const updated = applyAutoRecalculation({
      vehicleId: vId,
      managementType: newMgmt,
      leasePaymentTiming: newTiming,
      paymentTermsLease: newTerms,
      telematicsAuto: true
    }, { forceRecalculateDriver: true });
    setFormData(updated);
  };

  const handleTrailerChangeInModal = (tId) => {
    const selectedTrl = trailers.find(t => t.id === tId);
    const curSettings = settings || storageService.getSettings();
    const refParams = curSettings?.refrigerationParams || {};
    const isFrigo = isRefrigeratedTrailer(selectedTrl);
    const tech = (selectedTrl?.category === 'refrigerato_azoto' || (selectedTrl?.tractionType || '').toLowerCase().includes('azoto'))
      ? 'azoto'
      : 'gasolio';
    const techDef = refParams[tech] || (tech === 'azoto' ? { unitCost: 0.13, hourlyConsumption: 30 } : { unitCost: 1.80, hourlyConsumption: 3.0 });

    const partial = {
      trailerId: tId,
      telematicsAuto: true,
      trailerLeasePaymentTiming: selectedTrl ? normalizeLeaseTiming(selectedTrl) : formData.leasePaymentTiming,
      refrigerationEnabled: isFrigo,
      refrigerationTech: tech,
      refrigerationUnitCost: techDef.unitCost,
      refrigerationHourlyConsumption: techDef.hourlyConsumption,
      refrigerationHoursDaily: isFrigo ? (formData.refrigerationHoursDaily || 8) : 0
    };
    const updated = applyAutoRecalculation(partial);
    setFormData(updated);
  };

  const handleDriverShiftChange = (shiftType) => {
    const updated = applyAutoRecalculation({ driverShiftType: shiftType }, { forceRecalculateDriver: true });
    setFormData(updated);
  };

  const handleEnergyPayerChange = (payer) => {
    const updated = applyAutoRecalculation({ energyPayer: payer });
    setFormData(updated);
  };

  const handleRefrigerationTechChange = (tech) => {
    const curSettings = settings || storageService.getSettings();
    const refParams = curSettings?.refrigerationParams || {};
    const techDef = refParams[tech] || (tech === 'azoto' ? { unitCost: 0.13, hourlyConsumption: 30 } : { unitCost: 1.80, hourlyConsumption: 3.0 });
    const updated = applyAutoRecalculation({
      refrigerationEnabled: true,
      refrigerationTech: tech,
      refrigerationUnitCost: techDef.unitCost,
      refrigerationHourlyConsumption: techDef.hourlyConsumption,
      refrigerationHoursDaily: formData.refrigerationHoursDaily || 8
    });
    setFormData(updated);
  };

  const handleRefrigerationFieldChange = (partial) => {
    const updated = applyAutoRecalculation(partial);
    setFormData(updated);
  };

  const handleAccessoriesFieldChange = (partial) => {
    const updated = applyAutoRecalculation(partial);
    setFormData(updated);
  };

  const handleKmChange = (km) => {
    const updated = applyAutoRecalculation({ kmDaily: km });
    setFormData(updated);
  };

  const handleWorkingDaysChange = (days) => {
    const updated = applyAutoRecalculation({ workingDaysMonth: days });
    setFormData(updated);
  };

  const handleManagementTypeChange = (type) => {
    const updated = applyAutoRecalculation({
      managementType: type,
      telematicsAuto: true,
      washingEnabled: type === 'D' ? formData.washingEnabled : false
    }, { forceRecalculateDriver: type === 'D' });
    setFormData(updated);
  };

  // Assistente di Calcolo Automatico dei costi della commessa da parametri fisici
  const handleAutoCalculateCosts = () => {
    const updated = applyAutoRecalculation({ telematicsAuto: true }, { forceRecalculateDriver: true });
    setFormData(updated);
  };

  const handleSaveProject = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.client) return;

    // Ricalcola totali di competenza
    const metrics = calculateSingleProjectMetrics(formData);

    const isPot = formData.contractStatus === 'potential' || Boolean(formData.isPipelineFuture);

    const projectDataToSave = {
      ...formData,
      contractStatus: isPot ? 'potential' : 'active',
      isPipelineFuture: isPot,
      totalCostDaily: metrics.totalCostDaily,
      molDaily: metrics.molDaily,
      monthlyCost: metrics.monthlyCost,
      monthlyRevenue: metrics.monthlyRevenue,
      monthlyMol: metrics.monthlyMol,
      molPercent: metrics.molPercent,
      cashAdvanceRequired: metrics.estimatedWorkingCapitalGap
    };

    if (editingProject && editingProject.id) {
      storageService.updateProject(editingProject.id, projectDataToSave);
    } else {
      storageService.addProject(projectDataToSave);
    }

    setShowModal(false);
    loadData();
  };

  const handleDeleteProject = (id) => {
    if (confirm('Sei sicuro di voler eliminare questa commessa dal budget?')) {
      storageService.deleteProject(id);
      loadData();
    }
  };

  const handleDuplicateProject = (project) => {
    const duplicated = {
      ...project,
      id: undefined,
      code: 'PRJ-' + Math.floor(100 + Math.random() * 900),
      name: `${project.name} (Copia)`,
      createdAt: undefined
    };
    storageService.addProject(duplicated);
    loadData();
  };

  // Proroga rapida singolo contratto (+12 mesi o allineamento al 2026)
  const handleExtendContract = (projectId, monthsToAdd = 12) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      let newStart = p.startDate || '2026-01-01';
      let newMonths = Number(p.operatingMonths) || 12;
      if (newStart.startsWith('2025')) {
        newStart = '2026-01-01';
        newMonths = 12;
      } else {
        newMonths += monthsToAdd;
      }
      return {
        ...p,
        startDate: newStart,
        operatingMonths: newMonths
      };
    });
    storageService.saveProjects(updated);
    setProjects(updated);
  };

  // Allineamento / rinnovo massivo di tutti i contratti all'esercizio 2026
  const handleRenewAllTo2026 = () => {
    const updated = projects.map(p => {
      const v = getContractValidity(p);
      if (v.isExpired || v.endYear < 2026 || p.startDate?.startsWith('2025')) {
        return {
          ...p,
          startDate: '2026-01-01',
          operatingMonths: 12
        };
      }
      return p;
    });
    storageService.saveProjects(updated);
    setProjects(updated);
  };

  // Estensione formale di tutti i contratti a tutto il 2027 (+12 mesi dando per buoni i dati 2026)
  const handleExtendAllTo2027 = () => {
    const updated = projects.map(p => {
      const currentMonths = Number(p.operatingMonths) || 12;
      return {
        ...p,
        operatingMonths: Math.max(24, currentMonths + 12)
      };
    });
    storageService.saveProjects(updated);
    setProjects(updated);
    setShowNextYearModal(false);
  };

  // Integra Telematica e Lavaggi standard sulle commesse esistenti senza alterare ricavi, km, autista o energia
  const handleApplyStandardAccessoriesToAll = () => {
    if (!confirm('Attivare Telematica (14/13/12 €/m) e Lavaggi (80€ x 2/m sulle gestioni dirette) su tutte le commesse attive?\nRicavi, chilometri, autisti ed energia già configurati resteranno invariati.')) {
      return;
    }
    const curSettings = settings || storageService.getSettings();
    const updated = projects.map(p => {
      const veh = fleet.find(v => v.id === p.vehicleId);
      const trl = trailers.find(t => t.id === p.trailerId);
      const isDirect = (p.managementType || 'D') === 'D';
      const draft = {
        ...p,
        telematicsEnabled: true,
        telematicsAuto: true,
        washingEnabled: isDirect ? true : Boolean(p.washingEnabled)
      };
      const accCalc = calculateAccessoriesDailyCost(draft, veh, trl, curSettings);
      const enriched = {
        ...draft,
        telematicsMonthly: accCalc.telematicsMonthly,
        telematicsCostDaily: accCalc.telematicsDaily,
        washingUnitCost: accCalc.washUnitCost,
        washingCountPerMonth: accCalc.washesPerMonth,
        washingCostDaily: accCalc.washingDaily
      };
      const metrics = calculateSingleProjectMetrics(enriched);
      return {
        ...enriched,
        totalCostDaily: metrics.totalCostDaily,
        molDaily: metrics.molDaily,
        monthlyCost: metrics.monthlyCost,
        monthlyRevenue: metrics.monthlyRevenue,
        monthlyMol: metrics.monthlyMol,
        molPercent: +metrics.molPercent.toFixed(2),
        cashAdvanceRequired: metrics.estimatedWorkingCapitalGap
      };
    });
    storageService.saveProjects(updated);
    setProjects(updated);
  };

  // Statistiche scadenze contrattuali
  const contractStats = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    projects.forEach(p => {
      const v = getContractValidity(p);
      if (v.isExpired) expired++;
      else {
        // Una commessa in scadenza è comunque attiva a budget fino a termine contratto
        active++;
        if (v.isExpiringSoon) expiring++;
      }
    });
    return { active, expiring, expired };
  }, [projects]);

  // NOTA 5: Scenari Previsionali e What-If ('consolidated' | 'active2026' | 'futureOnly' | 'whatIf')
  const [selectedScenario, setSelectedScenario] = useState('consolidated');
  const [whatIfIncludedIds, setWhatIfIncludedIds] = useState(() => new Set());
  const [savedScenarios, setSavedScenarios] = useState(() => {
    try {
      const saved = localStorage.getItem('four_whatif_scenarios');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [scenarioNameInput, setScenarioNameInput] = useState('');
  const [showScenarioSaveBox, setShowScenarioSaveBox] = useState(false);

  // Helper per distinguere commesse operative (Status Quo) da trattative / simulazioni / contratti potenziali
  const isFutureProject = (p) => {
    if (!p) return false;
    if (p.contractStatus) return p.contractStatus === 'potential' || p.contractStatus === 'simulation' || p.contractStatus === 'negotiation';
    if (p.isPipelineFuture !== undefined) return Boolean(p.isPipelineFuture);
    const start = p.startDate ? new Date(p.startDate) : new Date();
    const today = new Date();
    return start > today || (p.notes && (p.notes.toLowerCase().includes('preventivo') || p.notes.toLowerCase().includes('trattativa') || p.notes.toLowerCase().includes('simulazione'))) || (p.code && (p.code.startsWith('PRJ-FUT') || p.code.startsWith('SIM-')));
  };

  const handleToggleFutureStatus = (projectId) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      const current = isFutureProject(p);
      return {
        ...p,
        contractStatus: current ? 'active' : 'potential',
        isPipelineFuture: !current
      };
    });
    storageService.saveProjects(updated);
    setProjects(updated);
  };

  const handlePromoteToActive = (projectId) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        contractStatus: 'active',
        isPipelineFuture: false,
        code: p.code && p.code.startsWith('SIM-') ? p.code.replace('SIM-', 'PRJ-') : p.code
      };
    });
    storageService.saveProjects(updated);
    setProjects(updated);
  };

  const handleToggleWhatIf = (projectId) => {
    setWhatIfIncludedIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // Auto-inclusione di default delle trattative/simulazioni nel What-If per visione simultanea immediata
  useEffect(() => {
    const potIds = projects.filter(isFutureProject).map(p => p.id);
    if (potIds.length > 0) {
      setWhatIfIncludedIds(prev => {
        if (prev.size === 0) return new Set(potIds);
        return prev;
      });
    }
  }, [projects]);

  const handleSelectScenario = (scen) => {
    setSelectedScenario(scen);
    if (scen === 'whatIf' && whatIfIncludedIds.size === 0) {
      setWhatIfIncludedIds(new Set(projects.map(p => p.id)));
    }
  };

  const handleSaveCurrentScenario = () => {
    if (!scenarioNameInput.trim()) return;
    const newScen = {
      id: 'scen_' + Date.now(),
      name: scenarioNameInput.trim(),
      includedIds: Array.from(whatIfIncludedIds),
      createdAt: new Date().toISOString()
    };
    const updated = [...savedScenarios, newScen];
    setSavedScenarios(updated);
    localStorage.setItem('four_whatif_scenarios', JSON.stringify(updated));
    setScenarioNameInput('');
    setShowScenarioSaveBox(false);
  };

  const handleLoadSavedScenario = (scenId) => {
    const found = savedScenarios.find(s => s.id === scenId);
    if (found) {
      setWhatIfIncludedIds(new Set(found.includedIds));
      setSelectedScenario('whatIf');
    }
  };

  const handleDeleteSavedScenario = (scenId) => {
    const updated = savedScenarios.filter(s => s.id !== scenId);
    setSavedScenarios(updated);
    localStorage.setItem('four_whatif_scenarios', JSON.stringify(updated));
  };

  // 1. STATUS QUO: Commesse operative a regime (attive e non scadute)
  const statusQuoProjects = useMemo(() => {
    return projects.filter(p => !isFutureProject(p) && getContractValidity(p).isActive);
  }, [projects]);

  // 2. CONTRATTI POTENZIALI: Trattative & Simulazioni
  const allPotentialProjects = useMemo(() => {
    return projects.filter(p => isFutureProject(p));
  }, [projects]);

  // Potenziali incluse nella simulazione What-If attiva
  const simulatedPotentialProjects = useMemo(() => {
    return allPotentialProjects.filter(p => whatIfIncludedIds.has(p.id));
  }, [allPotentialProjects, whatIfIncludedIds]);

  // 3. SCENARIO GLOBALE A REGIME (Status Quo + Potenziali Simulate)
  const combinedProjects = useMemo(() => {
    return [...statusQuoProjects, ...simulatedPotentialProjects];
  }, [statusQuoProjects, simulatedPotentialProjects]);

  const calcPortfolioTotals = (projList) => {
    const count = projList.length;
    const revenueMonthly = projList.reduce((sum, p) => sum + (Number(p.monthlyRevenue) || 0), 0);
    const costMonthly = projList.reduce((sum, p) => sum + (Number(p.monthlyCost) || 0), 0);
    const molMonthly = revenueMonthly - costMonthly;
    const molPercent = revenueMonthly > 0 ? (molMonthly / revenueMonthly) * 100 : 0;
    const workingCapital = projList.reduce((sum, p) => {
      const m = calculateSingleProjectMetrics(p);
      return sum + (m.estimatedWorkingCapitalGap || 0);
    }, 0);
    const creditLine = workingCapital > 0 ? Math.ceil((workingCapital * 1.15) / 5000) * 5000 : 15000;
    return { count, revenueMonthly, costMonthly, molMonthly, molPercent, workingCapital, creditLine };
  };

  // Progetti appartenenti allo scenario attivo della vista tabellare
  const effectiveScenarioProjects = useMemo(() => {
    if (selectedScenario === 'whatIf') {
      return projects.filter(p => whatIfIncludedIds.has(p.id));
    }
    if (selectedScenario === 'active2026') {
      return statusQuoProjects;
    }
    if (selectedScenario === 'futureOnly') {
      return allPotentialProjects;
    }
    return combinedProjects; // consolidated
  }, [projects, selectedScenario, whatIfIncludedIds, statusQuoProjects, allPotentialProjects, combinedProjects]);

  const scenarioTotals = useMemo(() => calcPortfolioTotals(effectiveScenarioProjects), [effectiveScenarioProjects]);
  const statusQuoTotals = useMemo(() => calcPortfolioTotals(statusQuoProjects), [statusQuoProjects]);
  const potentialTotals = useMemo(() => calcPortfolioTotals(simulatedPotentialProjects), [simulatedPotentialProjects]);
  const combinedTotals = useMemo(() => calcPortfolioTotals(combinedProjects), [combinedProjects]);

  // Calcolo differenziali delta
  const deltaRevenueMonthly = potentialTotals.revenueMonthly;
  const deltaCostMonthly = potentialTotals.costMonthly;
  const deltaMolMonthly = potentialTotals.molMonthly;
  const deltaWorkingCapital = potentialTotals.workingCapital;

  const deltaRevenue = deltaRevenueMonthly;
  const deltaMol = deltaMolMonthly;
  const deltaWc = deltaWorkingCapital;

  // Statistiche di Portfolio calcolate sullo scenario
  const totalProjectsCount = scenarioTotals.count;
  const totalMonthlyBudgetRevenue = scenarioTotals.revenueMonthly;
  const totalMonthlyBudgetCost = scenarioTotals.costMonthly;
  const totalMonthlyBudgetMol = scenarioTotals.molMonthly;
  const averageMolPercent = scenarioTotals.molPercent;
  const totalWorkingCapitalRequired = scenarioTotals.workingCapital;

  // Lista clienti unici per filtro
  const uniqueClients = Array.from(new Set(projects.map(p => p.client).filter(Boolean)));

  // Filtro progetti
  const filteredProjects = projects.filter(p => {
    // 1. Filtro Scenario Previsionale (Attive 2026 / Nuove Future / Consolidato / What-If)
    if (selectedScenario === 'active2026') {
      const validity = getContractValidity(p);
      if (isFutureProject(p) || validity.isExpired) return false;
    } else if (selectedScenario === 'futureOnly') {
      if (!isFutureProject(p)) return false;
    }

    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.client && p.client.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.route && p.route.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesClient = clientFilter === 'all' || p.client === clientFilter;
    const matchesManagement = managementFilter === 'all' || p.managementType === managementFilter;

    let matchesMargin = true;
    if (marginFilter === 'positive') matchesMargin = (p.molPercent || 0) >= 15;
    if (marginFilter === 'low') matchesMargin = (p.molPercent || 0) > 0 && (p.molPercent || 0) < 15;
    if (marginFilter === 'negative') matchesMargin = (p.molPercent || 0) <= 0;

    let matchesContract = true;
    const validity = getContractValidity(p);
    if (contractFilter === 'active2026') matchesContract = validity.isActive && validity.endYear >= 2026;
    if (contractFilter === 'expiring') matchesContract = validity.isExpiringSoon;
    if (contractFilter === 'expired') matchesContract = validity.isExpired;

    return matchesSearch && matchesClient && matchesManagement && matchesMargin && matchesContract;
  });

  // Calcoli live per la modal
  const liveModalMetrics = calculateSingleProjectMetrics(formData);
  const liveValidity = getContractValidity(formData);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Commesse & Budget con identità FOUR */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-[#164e87]/10 text-[#164e87] rounded-2xl border border-[#164e87]/20 flex-shrink-0">
              <Briefcase className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Commesse &amp; Budget Progetti</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#164e87]/10 text-[#164e87] border border-[#164e87]/20">
                  Esercizio 2026
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Controllo economico delle linee operative: ricavi, costi diretti, M.O.L., termini di incasso e fabbisogno cassa
              </p>
            </div>
          </div>

          {/* Action Buttons riorganizzati */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenModal(null, null, 'active')}
              className="inline-flex items-center space-x-2 bg-[#164e87] hover:bg-[#0e3a6c] text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-blue-950/20 transition"
              title="Aggiungi una nuova commessa operativa a budget (Status Quo)"
            >
              <Plus className="w-4 h-4" />
              <span>Nuova Commessa Attiva</span>
            </button>

            <button
              onClick={() => handleOpenModal(null, null, 'potential')}
              className="inline-flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2.5 rounded-xl font-black text-xs shadow-md transition"
              title="Inserisci una trattativa commerciale o simulazione per testarne l'impatto sul progetto globale"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>+ Nuova Trattativa / Simulazione</span>
            </button>

            <button
              onClick={() => navigate('/simulation')}
              className="inline-flex items-center space-x-2 bg-white hover:bg-slate-50 text-[#164e87] px-3.5 py-2.5 rounded-xl font-bold text-xs transition border border-[#164e87]/40 shadow-sm"
              title="Apri il Simulatore Preventivi per calcolare costi tratta, M.O.L., markup ed esportare il PDF"
            >
              <Calculator className="w-4 h-4 text-cyan-600" />
              <span>Simulatore Preventivi</span>
            </button>

            <div className="h-6 w-px bg-slate-200 hidden sm:block mx-1"></div>

            <button
              onClick={() => setShowNextYearModal(true)}
              className="inline-flex items-center space-x-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-2.5 rounded-xl font-bold text-xs border border-emerald-200 transition"
              title="Pianifica e attiva il budget per l'anno successivo 2027 dando per buoni i dati 2026"
            >
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Budget 2027 (+12m)</span>
            </button>

            <button
              onClick={handleRenewAllTo2026}
              className="inline-flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-2.5 rounded-xl font-bold text-xs border border-slate-200 transition"
              title="Allinea o estende tutti i contratti al budget 2026 (+12 mesi se scaduti)"
            >
              <RotateCw className="w-4 h-4 text-slate-500" />
              <span>Allinea a 2026</span>
            </button>

            <button
              onClick={handleApplyStandardAccessoriesToAll}
              className="inline-flex items-center space-x-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 px-3 py-2.5 rounded-xl font-bold text-xs border border-indigo-200 transition"
              title="Attiva Telematica (14/13/12 €/m) e Lavaggi (160 €/m) sulle commesse attive"
            >
              <Wifi className="w-4 h-4 text-indigo-600" />
              <span>Telematica &amp; Lavaggi</span>
            </button>
          </div>
        </div>

        {/* Banner Notifica Contratti Scaduti / Pre-2026 */}
        {contractStats.expired > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-950">
                  Attenzione: {contractStats.expired} contratti risultano scaduti o limitati all'esercizio 2025
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  I contratti scaduti non generano ricavi nel Budget 2026. Puoi rinnovarli o allinearli tutti in blocco con un clic per visualizzare il budget a regime completo.
                </p>
              </div>
            </div>
            <button
              onClick={handleRenewAllTo2026}
              className="inline-flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition whitespace-nowrap self-start sm:self-center"
            >
              <RotateCw className="w-4 h-4" />
              <span>Rinnova tutti per il 2026 (+12 Mesi)</span>
            </button>
          </div>
        )}

        {/* CRUSCOTTO ESECUTIVO PERMANENTE: STATUS QUO (CONTRATTI ATTIVI) vs CONTRATTI POTENZIALI & SCENARIO GLOBALE */}
        <div className="bg-[#0b2440] text-white rounded-3xl p-6 shadow-xl border border-[#164e87]/70 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-700/60 pb-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-[#164e87] text-cyan-300 rounded-xl border border-cyan-400/30">
                  <Layers className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-black text-white tracking-tight">
                  Visione Strategica di Portafoglio
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                  Status Quo vs Contratti Potenziali
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Confronto permanente tra la redditività delle commesse operative consolidate e l'impatto economico-finanziario delle nuove trattative e simulazioni.
              </p>
            </div>

            {/* Azioni rapide What-If e Salvataggio Scenario */}
            <div className="flex flex-wrap items-center gap-2">
              {allPotentialProjects.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setWhatIfIncludedIds(new Set(allPotentialProjects.map(p => p.id)))}
                    className="px-3 py-1.5 bg-[#164e87] hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition border border-cyan-400/40"
                    title="Includi tutte le trattative nella simulazione"
                  >
                    Simula Tutte ({allPotentialProjects.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWhatIfIncludedIds(new Set())}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition border border-slate-700"
                    title="Escludi le trattative per vedere solo lo Status Quo base"
                  >
                    Escludi Trattative (Solo Base)
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowScenarioSaveBox(!showScenarioSaveBox)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-lg transition shadow-sm"
              >
                Salva Scenario
              </button>
            </div>
          </div>

          {/* Form Salvataggio / Caricamento Scenari Personalizzati se aperto */}
          {showScenarioSaveBox && (
            <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                placeholder="Nome scenario (es. 'Ipotesi Espansione Lindt + Conad')..."
                value={scenarioNameInput}
                onChange={(e) => setScenarioNameInput(e.target.value)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-xs flex-1 min-w-[240px]"
              />
              <button
                type="button"
                onClick={handleSaveCurrentScenario}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs"
              >
                Salva Simulazione
              </button>
              {savedScenarios.length > 0 && (
                <div className="flex items-center gap-1.5 pl-3 border-l border-slate-700 flex-wrap">
                  <span className="text-slate-400 text-[11px]">Scenari Salvati:</span>
                  {savedScenarios.map(sc => (
                    <span key={sc.id} className="inline-flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-[11px]">
                      <button type="button" onClick={() => handleLoadSavedScenario(sc.id)} className="font-bold text-cyan-300 hover:underline">
                        {sc.name}
                      </button>
                      <button type="button" onClick={() => handleDeleteSavedScenario(sc.id)} className="text-rose-400 hover:text-rose-300 font-bold ml-1">
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Le 3 Colonne a Confronto Diretto: Status Quo, Contratti Potenziali, Scenario Globale */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* 1. STATUS QUO (Contratti Attivi Operativi) */}
            <div className="bg-slate-900/90 rounded-2xl p-5 border border-emerald-500/40 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 bg-emerald-500/20 text-emerald-300 px-3 py-1 text-[11px] font-black rounded-bl-xl border-l border-b border-emerald-500/40">
                STATUS QUO
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                  <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                    Contratti Attivi Operativi
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-white">{statusQuoTotals.count}</span>
                  <span className="text-xs text-slate-400 font-semibold">commesse operative 2026</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Fatturato Mensile:</span>
                  <span className="font-black text-white">{formatEUR(statusQuoTotals.revenueMonthly)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Fatturato Annuo:</span>
                  <span className="font-semibold text-slate-300">{formatEUR(statusQuoTotals.revenueMonthly * 12)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Costi Operativi:</span>
                  <span className="font-medium text-slate-300">{formatEUR(statusQuoTotals.costMonthly)}/m</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                  <span className="text-emerald-400 font-bold">M.O.L. / EBITDA:</span>
                  <div className="text-right">
                    <span className="font-black text-emerald-400 block text-sm">{formatEUR(statusQuoTotals.molMonthly)}</span>
                    <span className="text-[10px] text-emerald-300 font-bold">Margine: {formatPercent(statusQuoTotals.molPercent)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                  <span className="text-slate-400">Capitale Circolante Cassa:</span>
                  <span className="font-black text-amber-300">{formatEUR(statusQuoTotals.workingCapital)}</span>
                </div>
              </div>
            </div>

            {/* 2. CONTRATTI POTENZIALI (Trattative & Simulazioni) */}
            <div className="bg-slate-900/90 rounded-2xl p-5 border border-amber-500/40 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 bg-amber-500/20 text-amber-300 px-3 py-1 text-[11px] font-black rounded-bl-xl border-l border-b border-amber-500/40">
                PIPELINE WHAT-IF
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider">
                    Trattative &amp; Simulazioni
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-white">+{simulatedPotentialProjects.length}</span>
                  <span className="text-xs text-slate-400 font-semibold">simulate ({allPotentialProjects.length} a pipeline)</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Delta Ricavi / Mese:</span>
                  <span className={`font-black ${deltaRevenueMonthly >= 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
                    +{formatEUR(deltaRevenueMonthly)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Delta Ricavi Annuo:</span>
                  <span className="font-semibold text-slate-300">+{formatEUR(deltaRevenueMonthly * 12)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Delta Costi Operativi:</span>
                  <span className="font-medium text-slate-300">+{formatEUR(deltaCostMonthly)}/m</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                  <span className="text-amber-400 font-bold">Delta M.O.L. Atteso:</span>
                  <div className="text-right">
                    <span className="font-black text-amber-400 block text-sm">+{formatEUR(deltaMolMonthly)}</span>
                    <span className="text-[10px] text-amber-300 font-bold">Margine: {formatPercent(potentialTotals.molPercent)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                  <span className="text-slate-400">Fabbisogno Addizionale:</span>
                  <span className="font-black text-amber-300">+{formatEUR(deltaWorkingCapital)}</span>
                </div>
              </div>
            </div>

            {/* 3. PROIEZIONE COMPLESSIVA (Status Quo + Potenziali) */}
            <div className="bg-gradient-to-br from-[#164e87] via-[#0f3b75] to-[#0b2440] rounded-2xl p-5 border border-cyan-400/60 relative overflow-hidden flex flex-col justify-between shadow-xl shadow-cyan-950/40">
              <div className="absolute top-0 right-0 bg-cyan-400/20 text-cyan-200 px-3 py-1 text-[11px] font-black rounded-bl-xl border-l border-b border-cyan-400/50">
                SCENARIO A REGIME
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-300" />
                  <h3 className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                    Proiezione Globale a Regime
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-white">{combinedTotals.count}</span>
                  <span className="text-xs text-cyan-200 font-semibold">commesse totali previste</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-cyan-800/60 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-cyan-100">Fatturato Complessivo:</span>
                  <span className="font-black text-white text-sm">{formatEUR(combinedTotals.revenueMonthly)}/m</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cyan-100">Fatturato Annuo Stimato:</span>
                  <span className="font-bold text-cyan-200">{formatEUR(combinedTotals.revenueMonthly * 12)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cyan-100">Costi Totali Complessivi:</span>
                  <span className="font-medium text-slate-200">{formatEUR(combinedTotals.costMonthly)}/m</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-cyan-800/80">
                  <span className="text-white font-bold">M.O.L. Totale Aziendale:</span>
                  <div className="text-right">
                    <span className="font-black text-emerald-300 block text-sm">{formatEUR(combinedTotals.molMonthly)}</span>
                    <span className="text-[10px] text-emerald-200 font-bold">Margine: {formatPercent(combinedTotals.molPercent)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-cyan-800/80">
                  <span className="text-cyan-100">Fabbisogno Cassa di Picco:</span>
                  <div className="text-right">
                    <span className="font-black text-amber-300 block text-sm">{formatEUR(combinedTotals.workingCapital)}</span>
                    <span className="text-[10px] text-cyan-200">Fido cons.: {formatEUR(combinedTotals.creditLine)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Selettore Vista Tabella */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-700/60 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-bold">Visualizza in Tabella:</span>
              <div className="inline-flex rounded-xl bg-slate-900/90 p-1 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setSelectedScenario('consolidated')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                    selectedScenario === 'consolidated' || selectedScenario === 'whatIf'
                      ? 'bg-[#164e87] text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  🌐 Tutto il Portfolio ({projects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedScenario('active2026')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                    selectedScenario === 'active2026'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  🏢 Solo Status Quo ({statusQuoProjects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedScenario('futureOnly')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                    selectedScenario === 'futureOnly'
                      ? 'bg-amber-600 text-slate-950 font-black shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  ⚡ Solo Trattative &amp; Potenziali ({allPotentialProjects.length})
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic">
              💡 Spunta o deseleziona la casella "Simula" accanto alle commesse in trattativa per aggiornare in tempo reale la proiezione globale.
            </p>
          </div>
        </div>

        {/* Filter Controls con design moderno */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cerca per codice, linea, cliente o tratta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#164e87] focus:border-[#164e87] outline-none transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-[#164e87] outline-none cursor-pointer"
              >
                <option value="all">Tutti i Clienti ({uniqueClients.length})</option>
                {uniqueClients.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={managementFilter}
                onChange={(e) => setManagementFilter(e.target.value)}
                className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-[#164e87] outline-none cursor-pointer"
              >
                <option value="all">Tutte le Gestioni (D / T)</option>
                <option value="D">Gestione Diretta (D)</option>
                <option value="T">Gestione Terzi (T)</option>
              </select>

              <select
                value={marginFilter}
                onChange={(e) => setMarginFilter(e.target.value)}
                className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-[#164e87] outline-none cursor-pointer"
              >
                <option value="all">Tutti i Margini</option>
                <option value="positive">🟢 Margine Sano (≥ 15%)</option>
                <option value="low">🟡 Margine Basso (&lt; 15%)</option>
                <option value="negative">🔴 Margine Negativo (In Perdita)</option>
              </select>

              <select
                value={contractFilter}
                onChange={(e) => setContractFilter(e.target.value)}
                className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-[#164e87] outline-none cursor-pointer"
              >
                <option value="all">Tutti i Contratti ({projects.length})</option>
                <option value="active2026">🟢 Attivi nel 2026 ({contractStats.active})</option>
                <option value="expiring">🟡 In Scadenza (≤ 60gg) ({contractStats.expiring})</option>
                <option value="expired">🔴 Scaduti (&lt; 2026) ({contractStats.expired})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Helper di Usabilità per l'utente */}
        <div className="flex items-center justify-between px-1 text-xs text-slate-500">
          <div className="flex items-center space-x-1.5 font-medium">
            <span className="text-blue-600 font-bold">💡 Gestione rapida:</span>
            <span>Clicca su qualsiasi riga o sul pulsante <strong>Modifica</strong> per cambiare il mezzo o i parametri. Per le trattative, clicca <strong>Converti in Attiva</strong> per trasformarle al volo in contratti reali.</span>
          </div>
          <span className="font-bold text-slate-600 hidden sm:inline">
            {filteredProjects.length} commesse visualizzate
          </span>
        </div>

        {/* Projects List / Table Ottimizzata al 100% senza tagli orizzontali */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="w-full">
            <table className="w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-[#f0f4f9] text-[#164e87] font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-[28%]">Commessa, Cliente &amp; Stato</th>
                  <th className="py-3 px-3 w-[26%]">Mezzo Assegnato &amp; Risorse</th>
                  <th className="py-3 px-3 w-[20%] text-right">Conto Economico / Mese</th>
                  <th className="py-3 px-3 w-[14%] text-right">Cassa &amp; Termini</th>
                  <th className="py-3 px-4 w-[12%] text-center">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map((project) => {
                  const metrics = calculateSingleProjectMetrics(project);
                  const validity = getContractValidity(project);
                  const isNegative = metrics.monthlyMol < 0;
                  const isLowMargin = !isNegative && metrics.molPercent < 15;
                  const assignedVeh = fleet.find(v => v.id === project.vehicleId);
                  const assignedTrailer = trailers.find(t => t.id === project.trailerId);
                  const isPot = isFutureProject(project);

                  return (
                    <tr
                      key={project.id}
                      onClick={() => handleOpenModal(project)}
                      className={`cursor-pointer transition group ${
                        isPot
                          ? 'bg-amber-50/20 hover:bg-amber-100/40 border-l-4 border-l-amber-500'
                          : isNegative
                            ? 'bg-rose-50/40 hover:bg-rose-100/40'
                            : isLowMargin
                              ? 'bg-amber-50/30 hover:bg-amber-100/30'
                              : 'hover:bg-blue-50/40'
                      }`}
                    >
                      {/* Colonna 1: Commessa, Cliente & Stato */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {/* Riga Superiore: Checkbox + Codice + Badge Stato + Tasto Attiva */}
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1 mb-1" onClick={(e) => e.stopPropagation()}>
                          {isPot && (
                            <input
                              type="checkbox"
                              checked={whatIfIncludedIds.has(project.id)}
                              onChange={() => handleToggleWhatIf(project.id)}
                              className="w-4 h-4 text-amber-600 rounded cursor-pointer accent-amber-600 focus:ring-amber-500"
                              title="Includi / Escludi dalla simulazione What-If"
                            />
                          )}

                          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                            isPot
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {project.code || (isPot ? 'SIM' : 'PRJ')}
                          </span>

                          {isPot ? (
                            <div className="inline-flex items-center space-x-1.5 flex-wrap gap-y-1">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-600" />
                                <span>Trattativa / Potenziale</span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePromoteToActive(project.id);
                                }}
                                className="inline-flex items-center space-x-1 text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
                                title="Converti questa trattativa in un contratto vero e operativo a budget"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Converti in Attiva</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFutureStatus(project.id);
                              }}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 flex items-center gap-1 cursor-pointer transition"
                              title="Commessa operativa a budget. Clicca per retrocederla a simulazione."
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Attivo 2026</span>
                            </button>
                          )}

                          {isNegative && (
                            <span title="Attenzione: Commessa in perdita!" className="text-rose-600">
                              <AlertTriangle className="w-4 h-4 inline" />
                            </span>
                          )}
                        </div>

                        {/* Riga Centrale: Nome Commessa */}
                        <div className="text-sm font-black text-slate-900 group-hover:text-[#164e87] transition">
                          {project.name}
                        </div>

                        {/* Riga Inferiore: Cliente e Tratta */}
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <strong className="text-[#164e87]">{project.client}</strong>
                          {project.route && (
                            <>
                              <span>•</span>
                              <span className="text-slate-500">{project.route}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Colonna 2: Mezzo Assegnato & Risorse */}
                      <td className="py-3.5 px-3">
                        {/* Veicolo e Targa */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-black ${
                              project.managementType === 'D'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-blue-100 text-blue-800 border border-blue-300'
                            }`}
                          >
                            {project.managementType === 'D' ? 'Dir.' : 'Terzi'}
                          </span>

                          <span className="text-slate-900 font-bold text-xs" title={assignedVeh?.name}>
                            {assignedVeh ? assignedVeh.name : 'Mezzo non assegnato'}
                          </span>

                          {assignedVeh?.plate ? (
                            <span className="font-mono text-[11px] font-bold bg-white text-slate-800 px-1.5 py-0.5 rounded border border-slate-300 shadow-2xs tracking-wider inline-flex items-center gap-0.5">
                              <span className="text-[8px] text-blue-700 font-black">IT</span> {assignedVeh.plate}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                              Targa da assegnare
                            </span>
                          )}
                        </div>

                        {/* Semirimorchio se presente */}
                        {assignedTrailer && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                            <span className="font-medium text-slate-700">{assignedTrailer.name}</span>
                            {assignedTrailer.plate && (
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded border border-slate-200">
                                {assignedTrailer.plate}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Tag Operativi + Tasto Cambia Mezzo */}
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 flex-wrap">
                          <span className="font-semibold">{project.workingDaysMonth || 22} gg/m</span>
                          <span>•</span>
                          <span className="font-semibold">{project.kmDaily || 200} km/gg</span>
                          {project.energyPayer === 'client' && (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px] px-1.5 py-0.5 rounded">
                              ⚡ Energia Cliente
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenModal(project);
                            }}
                            className="text-[#164e87] hover:underline font-bold text-[11px] inline-flex items-center gap-0.5 ml-1"
                            title="Cambia il mezzo assegnato a questa commessa"
                          >
                            <RotateCw className="w-3 h-3 text-[#164e87]" />
                            <span>Cambia Mezzo</span>
                          </button>
                        </div>
                      </td>

                      {/* Colonna 3: Conto Economico Mensile */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-baseline justify-end space-x-2 text-xs">
                          <span className="text-slate-500">Ricavi:</span>
                          <span className="font-black text-slate-900 text-sm">{formatEUR(metrics.monthlyRevenue)}</span>
                        </div>
                        <div className="flex items-baseline justify-end space-x-2 text-[11px] text-slate-500 mt-0.5">
                          <span>Costi:</span>
                          <span className="font-semibold text-slate-700">{formatEUR(metrics.monthlyCost)}</span>
                        </div>
                        <div className="flex items-baseline justify-end space-x-2 mt-1.5 pt-1 border-t border-slate-100">
                          <span className="text-xs font-bold text-slate-600">M.O.L.:</span>
                          <span className={`text-sm font-black ${isNegative ? 'text-rose-600' : isLowMargin ? 'text-amber-600' : 'text-emerald-700'}`}>
                            {formatEUR(metrics.monthlyMol)}
                          </span>
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
                            isNegative
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : isLowMargin
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}>
                            {formatPercent(metrics.molPercent)}
                          </span>
                        </div>
                      </td>

                      {/* Colonna 4: Cassa & Termini */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="text-xs font-black text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 inline-block">
                          {formatEUR(metrics.estimatedWorkingCapitalGap)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-1">
                          Inc: <strong>{project.paymentTermsClient ?? 60}gg</strong> • Pag: <strong>{metrics.weightedDpoDays}gg</strong>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {validity.formattedEnd ? `Fino a ${validity.formattedEnd}` : 'Durata 12m'}
                        </div>
                      </td>

                      {/* Colonna 5: Azioni Rapide */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenModal(project)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#164e87] hover:bg-[#0b2440] text-white rounded-lg text-xs font-bold transition shadow-xs"
                            title="Modifica parametri, mezzo, costi e marginalità"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Modifica</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicateProject(project)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                            title="Duplica Commessa"
                          >
                            <Copy className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteProject(project.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
                            title="Elimina"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Modifica/Crea Commessa */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  {formData.contractStatus === 'potential' ? (
                    <Sparkles className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Briefcase className="w-5 h-5 text-[#164e87]" />
                  )}
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingProject
                      ? (formData.contractStatus === 'potential' ? 'Modifica Trattativa / Simulazione Potenziale' : 'Modifica Commessa di Budget')
                      : (formData.contractStatus === 'potential' ? 'Nuova Trattativa / Simulazione di Progetto' : 'Crea Nuova Commessa & Budget')}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProject} className="space-y-4 mt-4 text-xs">
                {/* Selettore Natura della Commessa: Attivo (Status Quo) vs Trattativa/Simulazione */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block font-extrabold text-slate-700 uppercase tracking-wider text-[11px] mb-2">
                    Natura della Commessa *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        contractStatus: 'active',
                        isPipelineFuture: false,
                        code: prev.code && prev.code.startsWith('SIM-') ? prev.code.replace('SIM-', 'PRJ-') : prev.code
                      }))}
                      className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 ${
                        formData.contractStatus !== 'potential'
                          ? 'bg-emerald-50 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                          : 'bg-white border-slate-200 hover:bg-slate-100/60'
                      }`}
                    >
                      <CheckCircle2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${formData.contractStatus !== 'potential' ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div>
                        <div className="font-extrabold text-xs text-slate-900">Contratto Attivo (Status Quo)</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Commessa operativa a budget con flotta assegnata</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        contractStatus: 'potential',
                        isPipelineFuture: true,
                        code: prev.code && prev.code.startsWith('PRJ-') ? prev.code.replace('PRJ-', 'SIM-') : prev.code
                      }))}
                      className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 ${
                        formData.contractStatus === 'potential'
                          ? 'bg-amber-50 border-amber-500 shadow-sm ring-2 ring-amber-500/20'
                          : 'bg-white border-slate-200 hover:bg-slate-100/60'
                      }`}
                    >
                      <Sparkles className={`w-5 h-5 mt-0.5 flex-shrink-0 ${formData.contractStatus === 'potential' ? 'text-amber-600' : 'text-slate-400'}`} />
                      <div>
                        <div className="font-extrabold text-xs text-slate-900">Trattativa / Simulazione (Potenziale)</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Ipotesi commerciale per testare cosa accade al progetto nella sua interezza</div>
                      </div>
                    </button>
                  </div>
                </div>
                {/* Dati Generali */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Nome / Descrizione Linea *</label>
                    <input
                      type="text"
                      required
                      placeholder="Es. Bilico Elettrico 33 plt x Decathlon BO"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Es. Decathlon Italia"
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tratta / Punti di Carico & Scarico</label>
                  <input
                    type="text"
                    placeholder="Es. Interporto BO - Negozi Decathlon Centro-Nord"
                    value={formData.route}
                    onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Selezione Mezzo dalla Flotta & Tipologia Gestione */}
                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200/60 space-y-3">
                  <span className="text-[11px] font-extrabold text-emerald-900 uppercase tracking-wider flex items-center">
                    <Truck className="w-4 h-4 mr-1.5 text-emerald-700" />
                    Assegna Mezzo, Allestimento, Autista & Energia
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Mezzo Motore</label>
                      <select
                        value={formData.vehicleId}
                        onChange={(e) => handleVehicleChangeInModal(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="">-- Seleziona dalla Flotta --</option>
                        {fleet.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} {v.plate ? `[${v.plate}]` : ''} ({formatEUR(v.monthlyLease)}/m)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Semirimorchio / Allestimento</label>
                      <select
                        value={formData.trailerId}
                        onChange={(e) => handleTrailerChangeInModal(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="">-- Nessun Semirimorchio --</option>
                        {trailers.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.plate ? `[${t.plate}]` : ''} ({formatEUR(t.monthlyLease)}/m)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Gestione</label>
                      <select
                        value={formData.managementType}
                        onChange={(e) => handleManagementTypeChange(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white font-bold"
                      >
                        <option value="D">Diretta FOUR (D)</option>
                        <option value="T">Fornitore / Terzi (T)</option>
                      </select>
                    </div>
                  </div>

                  {formData.managementType !== 'T' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-emerald-200/70">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Configurazione Turno Autista (Ricalcolo auto per categoria mezzo)
                        </label>
                        <select
                          value={formData.driverShiftType || '1_diurno'}
                          onChange={(e) => handleDriverShiftChange(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white font-semibold"
                        >
                          <option value="1_diurno">1 Autista - Turno Diurno (CE 220€ / C 180€ / B 140€)</option>
                          <option value="1_notturno">1 Autista - Turno Notturno (CE 260€ / C 220€ / B 170€)</option>
                          <option value="2_turni">Doppio Autista H24 - Diurno + Notturno (CE 480€ / C 400€)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Fornitura Energia / Carburante
                        </label>
                        <select
                          value={formData.energyPayer || 'four'}
                          onChange={(e) => handleEnergyPayerChange(e.target.value)}
                          className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold ${
                            formData.energyPayer === 'client'
                              ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                              : 'border-slate-300 bg-white text-slate-800'
                          }`}
                        >
                          <option value="four">A carico di FOUR (calcolo dinamico km x consumo)</option>
                          <option value="client">A carico del Cliente / Ricarica in Hub (0,00 € per FOUR)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Parametri Operativi & Calendario */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Data Inizio (Start up)</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Mesi Operativi</span>
                      <span className="text-[10px] text-blue-700 font-bold">Standard FOUR: 36m</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={formData.operatingMonths}
                      onChange={(e) => setFormData({ ...formData, operatingMonths: parseInt(e.target.value) || 36 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {[12, 24, 36, 48, 60].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFormData({ ...formData, operatingMonths: m })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                            formData.operatingMonths === m
                              ? 'bg-[#164e87] text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {m}m{m === 36 ? ' (FOUR)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Giorni Lavorativi / Mese</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.workingDaysMonth}
                      onChange={(e) => handleWorkingDaysChange(parseInt(e.target.value) || 22)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Km / Giorno</label>
                    <input
                      type="number"
                      value={formData.kmDaily}
                      onChange={(e) => handleKmChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-emerald-400 bg-emerald-50/40 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>

                  {/* Calcolo Dinamico Scadenza Contratto */}
                  <div className="col-span-2 md:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-inner">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Validità & Scadenza Contratto</span>
                        <div className="text-xs font-bold text-slate-800">
                          Dal <span className="text-slate-900 font-extrabold">{liveValidity.formattedStart}</span> al <span className="text-emerald-700 font-extrabold">{liveValidity.formattedEnd}</span> ({liveValidity.months} mesi di operatività)
                        </div>
                      </div>
                    </div>
                    <div>
                      {liveValidity.isExpired ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          <Clock className="w-3.5 h-3.5 text-rose-600" />
                          Scaduto ({liveValidity.formattedEnd})
                        </span>
                      ) : liveValidity.isExpiringSoon ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          In scadenza ({liveValidity.diffDays} gg)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Attivo fino a {liveValidity.formattedEnd}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dettaglio Costi Giornalieri */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
                        Dettaglio Costi Giornalieri (€ / Giorno)
                      </span>
                      <span className="text-[10px] text-emerald-700 font-medium">
                        ⚡ Ricalcolo dinamico attivo: autista per categoria mezzo, energia cliente/FOUR, frigo e accessori
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoCalculateCosts}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold transition border border-emerald-300 self-start sm:self-auto"
                      title="Forza ricalcolo di tutti i parametri di costo da anagrafica mezzo e km"
                    >
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Ricalcola da Parametri Fisici</span>
                    </button>
                  </div>

                  {formData.managementType === 'T' ? (
                    /* Modalità Fornitore / Terzista ("T") */
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs space-y-1">
                        <div className="font-bold text-blue-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-blue-700" />
                          <span>Struttura Economica Commessa Fornitore Terzo (Gestione T)</span>
                        </div>
                        <p className="text-[11px] text-blue-800">
                          I costi diretti di autista, trattore, carburante, pedaggi e gomme sono a carico del vettore terzo. FOUR sostiene compenso fornitore, semirimorchio FOUR, eventuale refrigerazione/telematica e facchinaggio.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                          <label className="block font-bold text-slate-800 mb-0.5">
                            Corrispettivo Vettore / Fornitore Terzo (€/gg) *
                          </label>
                          <input
                            type="number"
                            step="5"
                            value={formData.partnerMarginDaily}
                            onChange={(e) => setFormData({ ...formData, partnerMarginDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-2 border border-blue-400 bg-white rounded-lg font-black text-blue-900 text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Es. 620"
                          />
                          <p className="text-[10px] text-slate-500 mt-0.5">Compensi al vettore terzo incaricato</p>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-800 mb-0.5">
                            Quota Semirimorchio FOUR (€/gg)
                          </label>
                          <input
                            type="number"
                            step="1"
                            value={formData.trailerLeaseDaily}
                            onChange={(e) => setFormData({ ...formData, trailerLeaseDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-bold text-slate-800"
                          />
                          <p className="text-[10px] text-slate-500 mt-0.5">Semirimorchio messo a disposizione da FOUR</p>
                        </div>

                        <div>
                          <label className="block font-bold text-purple-900 mb-0.5">
                            Facchinaggio (€/gg)
                          </label>
                          <input
                            type="number"
                            step="5"
                            value={formData.porterageDaily || 0}
                            onChange={(e) => setFormData({ ...formData, porterageDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-2 border border-purple-300 bg-purple-50/50 rounded-lg font-bold text-purple-900"
                            placeholder="0"
                          />
                          <p className="text-[10px] text-slate-500 mt-0.5">Costo facchini per carico/scarico</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                        <div>
                          <label className="block text-slate-500 mb-0.5">Altre Spese FOUR (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.otherCostsDaily || 0}
                            onChange={(e) => setFormData({ ...formData, otherCostsDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-700"
                          />
                        </div>
                        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-emerald-900 mb-0.5">Ricavo Giornaliero Riconosciuto da Cliente (€/gg) *</label>
                            <input
                              type="number"
                              step="10"
                              value={formData.revenueDaily}
                              onChange={(e) => {
                                const rev = parseFloat(e.target.value) || 0;
                                const cost = liveModalMetrics.totalCostDaily;
                                const margin = rev > cost ? +(((rev - cost) / rev) * 100).toFixed(1) : 0;
                                setFormData({ ...formData, revenueDaily: rev, targetMarginPercent: margin });
                              }}
                              className="w-full px-3 py-1.5 border border-emerald-500 rounded-lg font-black text-emerald-800 bg-emerald-50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-800 mb-0.5 flex items-center justify-between">
                              <span>Margine Target M.O.L. (%)</span>
                              <span className="text-[10px] text-emerald-700 font-bold">sul Ricavo</span>
                            </label>
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                min="1"
                                max="60"
                                step="0.5"
                                value={formData.targetMarginPercent !== undefined ? formData.targetMarginPercent : +liveModalMetrics.molPercent.toFixed(1)}
                                onChange={(e) => {
                                  const margin = parseFloat(e.target.value) || 0;
                                  const cost = liveModalMetrics.totalCostDaily;
                                  const rev = margin < 100 ? +(cost / (1 - (margin / 100))).toFixed(2) : cost * 1.2;
                                  setFormData({ ...formData, targetMarginPercent: margin, revenueDaily: rev });
                                }}
                                className="w-full px-2 py-1.5 border border-emerald-400 rounded-lg font-black text-emerald-800 bg-white text-xs"
                              />
                              <span className="text-emerald-800 font-bold text-xs">%</span>
                            </div>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {[15, 18, 21, 25].map(pct => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => {
                                    const cost = liveModalMetrics.totalCostDaily;
                                    const rev = +(cost / (1 - (pct / 100))).toFixed(2);
                                    setFormData({ ...formData, targetMarginPercent: pct, revenueDaily: rev });
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                >
                                  {pct}%{pct === 21 ? ' (Std)' : ''}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Modalità Gestione Diretta FOUR ("D") */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5 flex items-center justify-between">
                            <span>Autista (€/gg)</span>
                            {formData.driverManualOverride && (
                              <span className="text-[9px] px-1 bg-amber-100 text-amber-800 rounded">Manuale</span>
                            )}
                          </label>
                          <input
                            type="number"
                            step="5"
                            value={formData.driverCostDaily}
                            onChange={(e) => setFormData({ ...formData, driverCostDaily: parseFloat(e.target.value) || 0, driverManualOverride: true })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5 flex items-center justify-between">
                            <span>Energia / Bio-LNG</span>
                            {formData.energyPayer === 'client' && (
                              <span className="text-[9px] px-1 bg-emerald-100 text-emerald-800 rounded font-bold">Cliente 0€</span>
                            )}
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            disabled={formData.energyPayer === 'client'}
                            value={formData.energyPayer === 'client' ? 0 : formData.fuelCostDaily}
                            onChange={(e) => setFormData({ ...formData, fuelCostDaily: parseFloat(e.target.value) || 0 })}
                            className={`w-full px-2.5 py-1.5 border rounded-lg font-semibold ${
                              formData.energyPayer === 'client'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-not-allowed'
                                : 'border-slate-300 bg-white'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Autostrada / Pedaggi</label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.tollsDaily}
                            onChange={(e) => setFormData({ ...formData, tollsDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Pneumatici (€/gg)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.tiresDaily}
                            onChange={(e) => setFormData({ ...formData, tiresDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Noleggio Mezzo (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.vehicleLeaseDaily}
                            onChange={(e) => setFormData({ ...formData, vehicleLeaseDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Noleggio Rimorchio (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.trailerLeaseDaily}
                            onChange={(e) => setFormData({ ...formData, trailerLeaseDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-purple-900 font-bold mb-0.5">Facchinaggio (€/gg)</label>
                          <input
                            type="number"
                            step="5"
                            value={formData.porterageDaily || 0}
                            onChange={(e) => setFormData({ ...formData, porterageDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-purple-300 bg-purple-50/50 rounded-lg font-bold text-purple-900"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-0.5">Partner / Varie (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.partnerMarginDaily}
                            onChange={(e) => setFormData({ ...formData, partnerMarginDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* NOTA 3.1: REFRIGERAZIONE SEMIRIMORCHIO FRIGO */}
                  <div className="p-3 bg-cyan-50/70 rounded-xl border border-cyan-200 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center space-x-2 cursor-pointer font-bold text-cyan-950">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.refrigerationEnabled)}
                          onChange={(e) => handleRefrigerationFieldChange({ refrigerationEnabled: e.target.checked })}
                          className="rounded text-cyan-600 focus:ring-cyan-500"
                        />
                        <Snowflake className="w-4 h-4 text-cyan-700" />
                        <span>Costi Refrigerazione Gruppo Frigorifero</span>
                      </label>
                      <span className="text-[11px] font-black text-cyan-900">
                        {formData.refrigerationEnabled
                          ? `Incidenza: ${formatEUR(formData.refrigerationCostDaily || 0)}/gg (${formatEUR((Number(formData.refrigerationUnitCost) || 0) * (Number(formData.refrigerationHourlyConsumption) || 0))}/h)`
                          : 'Disattivato'}
                      </span>
                    </div>

                    {formData.refrigerationEnabled && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                        <div>
                          <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">Tecnologia Frigo</label>
                          <select
                            value={formData.refrigerationTech || 'gasolio'}
                            onChange={(e) => handleRefrigerationTechChange(e.target.value)}
                            className="w-full px-2 py-1.5 border border-cyan-300 rounded-lg bg-white font-bold text-[11px]"
                          >
                            <option value="azoto">Azoto Liquido (0,13 €/kg • 30 kg/h = 3,90 €/h)</option>
                            <option value="gasolio">Gasolio Frigo (1,80 €/L • 3 L/h = 5,40 €/h)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">
                            Costo Unitario (€/{formData.refrigerationTech === 'azoto' ? 'kg' : 'L'})
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.refrigerationUnitCost ?? 1.80}
                            onChange={(e) => handleRefrigerationFieldChange({ refrigerationUnitCost: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 border border-cyan-300 rounded-lg bg-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">
                            Consumo Orario ({formData.refrigerationTech === 'azoto' ? 'kg/h' : 'L/h'})
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.refrigerationHourlyConsumption ?? 3}
                            onChange={(e) => handleRefrigerationFieldChange({ refrigerationHourlyConsumption: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 border border-cyan-300 rounded-lg bg-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">Ore Frigo / Viaggio (h)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={formData.refrigerationHoursDaily ?? 8}
                            onChange={(e) => handleRefrigerationFieldChange({ refrigerationHoursDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 border border-cyan-400 rounded-lg bg-white font-black text-cyan-950"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NOTA 3.2: COSTI ACCESSORI (TELEMATICA, LAVAGGIO, COSTI EXTRA) */}
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-indigo-950 uppercase tracking-wider flex items-center">
                        <Wifi className="w-4 h-4 mr-1.5 text-indigo-700" />
                        Costi Accessori (Telematica, Lavaggio, Extra)
                      </span>
                      <span className="text-[11px] font-bold text-indigo-900">
                        Tot. Accessori: {formatEUR((Number(formData.telematicsCostDaily) || 0) + (Number(formData.washingCostDaily) || 0) + (Number(formData.extraCostDaily) || 0))}/gg
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {/* A. Telematica */}
                      <div className="p-2.5 bg-white rounded-lg border border-indigo-200/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(formData.telematicsEnabled)}
                              onChange={(e) => handleAccessoriesFieldChange({ telematicsEnabled: e.target.checked })}
                              className="rounded text-indigo-600"
                            />
                            <span>A. Telematica (€/m)</span>
                          </label>
                          <span className="font-bold text-indigo-700">{formatEUR(formData.telematicsCostDaily || 0)}/gg</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            step="1"
                            disabled={!formData.telematicsEnabled}
                            value={formData.telematicsMonthly ?? 0}
                            onChange={(e) => handleAccessoriesFieldChange({ telematicsAuto: false, telematicsMonthly: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-bold text-xs"
                          />
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">€/mese</span>
                        </div>
                        <p className="text-[9px] text-slate-500">Auto: Trattore 14€ • Trailer 13€ • Motrice 12€</p>
                      </div>

                      {/* B. Lavaggio */}
                      <div className="p-2.5 bg-white rounded-lg border border-indigo-200/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={Boolean(formData.washingEnabled)}
                              onChange={(e) => handleAccessoriesFieldChange({ washingEnabled: e.target.checked })}
                              className="rounded text-indigo-600"
                            />
                            <Droplets className="w-3.5 h-3.5 text-blue-600" />
                            <span>B. Lavaggio</span>
                          </label>
                          <span className="font-bold text-indigo-700">{formatEUR(formData.washingCostDaily || 0)}/gg</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <input
                              type="number"
                              step="5"
                              disabled={!formData.washingEnabled}
                              value={formData.washingUnitCost ?? 80}
                              onChange={(e) => handleAccessoriesFieldChange({ washingUnitCost: parseFloat(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-slate-300 rounded font-bold text-xs"
                              title="Costo singolo lavaggio (€)"
                            />
                            <span className="text-[9px] text-slate-400">€/lavaggio</span>
                          </div>
                          <div>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              disabled={!formData.washingEnabled}
                              value={formData.washingCountPerMonth ?? 2}
                              onChange={(e) => handleAccessoriesFieldChange({ washingCountPerMonth: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-slate-300 rounded font-bold text-xs"
                              title="Lavaggi al mese"
                            />
                            <span className="text-[9px] text-slate-400">lav./mese</span>
                          </div>
                        </div>
                      </div>

                      {/* C. Costi Extra */}
                      <div className="p-2.5 bg-white rounded-lg border border-indigo-200/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">C. Costi Extra</span>
                          <span className="font-bold text-indigo-700">{formatEUR(formData.extraCostDaily || 0)}/gg</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Descrizione (es. ZTL, Sosta...)"
                          value={formData.extraCostDescription || ''}
                          onChange={(e) => setFormData({ ...formData, extraCostDescription: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-[11px]"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="number"
                            step="5"
                            min="0"
                            placeholder="€"
                            value={formData.extraCostAmount ?? 0}
                            onChange={(e) => handleAccessoriesFieldChange({ extraCostAmount: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 border border-slate-300 rounded font-bold text-xs"
                          />
                          <select
                            value={formData.extraCostFrequency || 'monthly'}
                            onChange={(e) => handleAccessoriesFieldChange({ extraCostFrequency: e.target.value })}
                            className="w-full px-1.5 py-1 border border-slate-300 rounded bg-white text-[10px] font-semibold"
                          >
                            <option value="daily">Al gg/viaggio</option>
                            <option value="monthly">Mensile</option>
                            <option value="one_time">Una tantum</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {formData.managementType !== 'T' && (
                    <div className="pt-2 border-t border-slate-200 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-900 mb-0.5">Ricavo Giornaliero (€/gg) *</label>
                          <input
                            type="number"
                            step="10"
                            value={formData.revenueDaily}
                            onChange={(e) => {
                              const rev = parseFloat(e.target.value) || 0;
                              const cost = liveModalMetrics.totalCostDaily;
                              const margin = rev > cost ? +(((rev - cost) / rev) * 100).toFixed(1) : 0;
                              setFormData({ ...formData, revenueDaily: rev, targetMarginPercent: margin });
                            }}
                            className="w-full px-3 py-2 border border-emerald-500 rounded-lg font-black text-emerald-800 bg-emerald-50 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-900 mb-0.5 flex items-center justify-between">
                            <span>Margine Target M.O.L. (%)</span>
                            <span className="text-[10px] text-emerald-700 font-bold">sul Ricavo</span>
                          </label>
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              min="1"
                              max="60"
                              step="0.5"
                              value={formData.targetMarginPercent !== undefined ? formData.targetMarginPercent : +liveModalMetrics.molPercent.toFixed(1)}
                              onChange={(e) => {
                                const margin = parseFloat(e.target.value) || 0;
                                const cost = liveModalMetrics.totalCostDaily;
                                const rev = margin < 100 ? +(cost / (1 - (margin / 100))).toFixed(2) : cost * 1.2;
                                setFormData({ ...formData, targetMarginPercent: margin, revenueDaily: rev });
                              }}
                              className="w-full px-3 py-2 border border-emerald-400 rounded-lg font-black text-emerald-800 bg-white text-sm"
                            />
                            <span className="text-emerald-800 font-bold text-sm">%</span>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {[15, 18, 21, 25].map(pct => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => {
                                  const cost = liveModalMetrics.totalCostDaily;
                                  const rev = +(cost / (1 - (pct / 100))).toFixed(2);
                                  setFormData({ ...formData, targetMarginPercent: pct, revenueDaily: rev });
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              >
                                {pct}%{pct === 21 ? ' (Std)' : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Costo totale calcolato: <strong className="text-slate-800">{formatEUR(liveModalMetrics.totalCostDaily)}/gg</strong> • Ricarico sui costi corrispondente: <strong className="text-slate-800">+{liveModalMetrics.totalCostDaily > 0 ? (((liveModalMetrics.revenueDaily - liveModalMetrics.totalCostDaily) / liveModalMetrics.totalCostDaily) * 100).toFixed(1) : 0}%</strong>
                      </p>
                    </div>
                  )}
                </div>

                {/* SEZIONE SPECIALE: TERMINI DI PAGAMENTO (DSO & DPO PONDERATO PER COMPONENTE) */}
                <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider flex items-center">
                      <Clock className="w-4 h-4 mr-1.5 text-amber-700" />
                      Termini di Pagamento & Fabbisogno Finanziario Reale
                    </span>
                    <span className="text-[10px] text-amber-900 font-bold bg-amber-200/60 px-2 py-0.5 rounded-full">
                      Gap Ponderato: {liveModalMetrics.gapDays} gg • DPO Medio: {liveModalMetrics.weightedDpoDays} gg
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Incasso Cliente (DSO) *
                      </label>
                      <select
                        value={formData.paymentTermsClient}
                        onChange={(e) => setFormData({ ...formData, paymentTermsClient: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold"
                      >
                        <option value="30">30 giorni d.f.f.m.</option>
                        <option value="60">60 giorni d.f.f.m. (Standard)</option>
                        <option value="90">90 giorni d.f.f.m.</option>
                        <option value="120">120 giorni d.f.f.m.</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Scadenza Nolo Mezzo Motore
                      </label>
                      <select
                        value={formData.leasePaymentTiming || normalizeLeaseTiming(formData)}
                        onChange={(e) => {
                          const timingKey = e.target.value;
                          const terms = timingKey === 'M1_D10' ? 0 : timingKey === 'M1_D30' ? 30 : 60;
                          setFormData({ ...formData, leasePaymentTiming: timingKey, paymentTermsLease: terms });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold text-xs"
                      >
                        <option value="M1_D10">Giorno 10 M1 (Anticipato / +20gg anticipo)</option>
                        <option value="M1_D30">Giorno 30 M1 (Fine Mese)</option>
                        <option value="M2_D20">Giorno 20 M2 (Mese Succ. / +20 gg dffm)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Scadenza Nolo Semirimorchio
                      </label>
                      <select
                        value={formData.trailerLeasePaymentTiming || formData.leasePaymentTiming || normalizeLeaseTiming(formData)}
                        onChange={(e) => setFormData({ ...formData, trailerLeasePaymentTiming: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold text-xs"
                      >
                        <option value="M1_D10">Giorno 10 M1 (Anticipato / +20gg anticipo)</option>
                        <option value="M1_D30">Giorno 30 M1 (Fine Mese)</option>
                        <option value="M2_D20">Giorno 20 M2 (Mese Succ. / +20 gg dffm)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Personale (Giorno Mese T1)
                      </label>
                      <select
                        value={formData.paymentTermsDriver ?? 16}
                        onChange={(e) => setFormData({ ...formData, paymentTermsDriver: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold"
                      >
                        <option value="10">Giorno 10 M+1</option>
                        <option value="16">Giorno 16 M+1 (Standard FOUR)</option>
                        <option value="30">30 gg d.f.f.m.</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Energia / Bio-LNG (gg)
                      </label>
                      <select
                        value={formData.paymentTermsFuel ?? 30}
                        onChange={(e) => setFormData({ ...formData, paymentTermsFuel: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold"
                      >
                        <option value="0">Immediato / Fine mese (0 gg)</option>
                        <option value="15">15 giorni</option>
                        <option value="30">30 giorni (Standard)</option>
                        <option value="60">60 giorni d.f.f.m.</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Terzisti / Fornitori
                      </label>
                      <select
                        value={formData.paymentTermsSuppliers ?? 30}
                        onChange={(e) => setFormData({ ...formData, paymentTermsSuppliers: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold"
                      >
                        <option value="15">15 giorni</option>
                        <option value="30">30 giorni d.f.f.m.</option>
                        <option value="60">60 giorni d.f.f.m.</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Recupero Accise (€ 0,214/L)
                      </label>
                      <select
                        value={formData.acciseRecoveryEligible !== false ? 'yes' : 'no'}
                        onChange={(e) => setFormData({ ...formData, acciseRecoveryEligible: e.target.value === 'yes' })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold text-xs"
                      >
                        <option value="yes">Attivo (Mezzi &gt; 7.5t)</option>
                        <option value="no">Escluso</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Caparra / Cauzione Iniziale (€)
                      </label>
                      <input
                        type="number"
                        value={formData.depositAmount}
                        onChange={(e) => setFormData({ ...formData, depositAmount: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-bold"
                      />
                    </div>
                  </div>

                  {/* Toggle termini di pagamento per singola voce */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowPerItemTerms(!showPerItemTerms)}
                      className="inline-flex items-center space-x-1.5 text-[11px] font-bold text-amber-900 hover:text-amber-950"
                    >
                      {showPerItemTerms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>Personalizza Termini di Pagamento per Singola Voce (Default 30 gg)</span>
                    </button>

                    {showPerItemTerms && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mt-2 p-3 bg-white/80 rounded-xl border border-amber-200">
                        {[
                          { key: 'paymentTermsRefrigeration', label: 'Refrigerazione Frigo', def: 30 },
                          { key: 'paymentTermsTelematics', label: 'Telematica', def: 30 },
                          { key: 'paymentTermsWashing', label: 'Lavaggio Mezzi', def: 30 },
                          { key: 'paymentTermsExtra', label: 'Costi Extra', def: 30 },
                          { key: 'paymentTermsTolls', label: 'Pedaggi / Telepass', def: 15 },
                          { key: 'paymentTermsTires', label: 'Pneumatici', def: 30 }
                        ].map(item => (
                          <div key={item.key}>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{item.label}</label>
                            <select
                              value={formData[item.key] ?? item.def}
                              onChange={(e) => setFormData({ ...formData, [item.key]: parseInt(e.target.value) })}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-[11px] font-semibold"
                            >
                              <option value="0">0 gg (Fine mese)</option>
                              <option value="15">15 gg (Quindicinale)</option>
                              <option value="30">30 gg d.f.f.m.</option>
                              <option value="60">60 gg d.f.f.m.</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dettaglio Fabbisogno Ponderato */}
                  <div className="p-3 bg-white/90 rounded-lg border border-amber-200 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-amber-900 font-bold">
                        Fabbisogno Cassa Circolante Ponderato (Esborsi reali vs Incasso):
                      </span>
                      <span className="font-extrabold text-amber-800 text-sm">
                        {formatEUR(liveModalMetrics.estimatedWorkingCapitalGap)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1.5 border-t border-amber-100 text-[10px] text-slate-600">
                      <div>
                        <span className="block text-slate-400">Noleggi ({liveModalMetrics.workingCapitalBreakdown?.leaseGapDays} gg)</span>
                        <strong className="text-slate-800">{formatEUR(liveModalMetrics.workingCapitalBreakdown?.leases || 0)}</strong>
                      </div>
                      <div>
                        <span className="block text-slate-400">Personale ({liveModalMetrics.workingCapitalBreakdown?.driverGapDays} gg)</span>
                        <strong className="text-slate-800">{formatEUR(liveModalMetrics.workingCapitalBreakdown?.personnel || 0)}</strong>
                      </div>
                      <div>
                        <span className="block text-slate-400">Energia & Frigo</span>
                        <strong className="text-slate-800">{formatEUR(liveModalMetrics.workingCapitalBreakdown?.fuelAndFridge || 0)}</strong>
                      </div>
                      <div>
                        <span className="block text-slate-400">Accessori / Terzi / Cap.</span>
                        <strong className="text-slate-800">
                          {formatEUR(
                            (liveModalMetrics.workingCapitalBreakdown?.accessoriesAndTolls || 0) +
                            (liveModalMetrics.workingCapitalBreakdown?.suppliers || 0) +
                            (liveModalMetrics.workingCapitalBreakdown?.deposit || 0)
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Box Sintesi Economica Live */}
                <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Ricavo Mensile</span>
                    <div className="text-base font-extrabold">{formatEUR(liveModalMetrics.monthlyRevenue)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Costi Mensili</span>
                    <div className="text-base font-extrabold text-slate-300">{formatEUR(liveModalMetrics.monthlyCost)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">M.O.L. Mensile</span>
                    <div className={`text-base font-extrabold ${liveModalMetrics.monthlyMol >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatEUR(liveModalMetrics.monthlyMol)} ({formatPercent(liveModalMetrics.molPercent)})
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Fatturato Intera Commessa</span>
                    <div className="text-base font-extrabold text-emerald-300">{formatEUR(liveModalMetrics.totalProjectRevenue)}</div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Note e Accordi Commerciali</label>
                  <textarea
                    rows="2"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Note su clausole carburante, orari di scarico, penali..."
                  ></textarea>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition flex items-center space-x-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salva Commessa</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Modal Pianificazione Budget Anno Successivo 2027 */}
        {showNextYearModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-teal-100 text-teal-800 rounded-xl">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      Pianificazione Budget Anno Successivo (2027)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Continuità economica dando per confermati i dati e contratti del 2026
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNextYearModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  Il sistema implementa la <strong>continuità aziendale a regime</strong> per il 2027:
                  tutte le 19 linee attive nel 2026 vengono considerate operative con le medesime tariffe,
                  percorrenze chilometriche e canoni di noleggio, senza il buco di cassa iniziale da startup.
                </p>

                {/* KPI Anteprima 2027 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ricavi Stimati 2027</span>
                    <div className="text-sm font-black text-slate-900 mt-0.5">
                      {formatEUR(totalMonthlyBudgetRevenue * 12)}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Costi Operativi 2027</span>
                    <div className="text-sm font-bold text-slate-700 mt-0.5">
                      {formatEUR(totalMonthlyBudgetCost * 12)}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">M.O.L. Annuo (EBITDA)</span>
                    <div className="text-sm font-black text-emerald-600 mt-0.5">
                      {formatEUR(totalMonthlyBudgetMol * 12)}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1 text-emerald-950">
                  <p className="font-bold">Come viene applicato il Budget 2027:</p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-900">
                    <li>
                      <strong>Proiezione nei Report (Attiva)</strong>: selezionando <em>"Anno Budget 2027"</em> nel Cash Flow e nella Dashboard visualizzi l'intero piano finanziario del nuovo anno senza dover modificare i contratti.
                    </li>
                    <li>
                      <strong>Proroga Formale Contratti (+12m)</strong>: puoi estendere formalmente la scadenza contrattuale di tutte le commesse al <strong>31 Dicembre 2027</strong>.
                    </li>
                  </ul>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNextYearModal(false)}
                    className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    Chiudi
                  </button>
                  <button
                    type="button"
                    onClick={handleExtendAllTo2027}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition flex items-center justify-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Estendi Contratti al 31/12/2027 (+12m)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsPage;
