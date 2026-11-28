import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import storageService from '../services/storageService';
import {
  formatEUR,
  formatPercent,
  calculateSingleProjectMetrics,
  calculateAnnualBudgetAndCashFlow,
  isProjectActiveInMonth,
  getProjectStartYear,
  isPotentialProject,
  LEASE_PAYMENT_TIMINGS,
  normalizeLeaseTiming,
  recalculateProjectCost,
  getContractValidity,
  isRefrigeratedTrailer,
  calculateDriverDailyCost,
  calculateAccessoriesDailyCost,
  OPERATING_UNITS,
  getProjectOperatingUnit,
  COST_ALLOCATION_MODES,
  computeMultiClientAllocation,
  rebalanceManualCostShares,
  COST_VARIATION_TARGETS,
  formatVariationDate
} from '../utils/cashFlowCalculations';
import {
  calculateRouteFromStops,
  KNOWN_LOGISTICS_HUBS
} from '../services/routeCalculationService';
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
  Eye,
  GripVertical,
  ArrowUp,
  ArrowDown,
  MapPin,
  Users,
  Wallet,
  Navigation,
  Mountain,
  FolderOpen
} from 'lucide-react';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toolsMenuRef = useRef(null);
  const hasInitializedWhatIfRef = useRef(false);
  const prevHasActiveFiltersRef = useRef(false);
  const [projects, setProjects] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [managementFilter, setManagementFilter] = useState('all');
  const [marginFilter, setMarginFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [operatingUnitFilter, setOperatingUnitFilter] = useState('all');
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('four_projects_sort_by') || 'custom');
  const [draggedProjectId, setDraggedProjectId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('general'); // 'general' | 'costs' | 'variations' | 'terms'
  const [modalFormError, setModalFormError] = useState('');
  const [showNextYearModal, setShowNextYearModal] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [budgetHorizon, setBudgetHorizon] = useState('2026'); // '2026' | '2027' | 'regime'
  const [simulationsCount, setSimulationsCount] = useState(0);
  const [showPerItemTerms, setShowPerItemTerms] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [newVariationDraft, setNewVariationDraft] = useState({
    targetField: 'vehicleLeaseMonthly',
    effectiveDate: '2026-07-01',
    previousValue: '',
    newValue: '',
    note: ''
  });

  // Form State per Nuovo/Modifica Progetto (supporta Singola Commessa e Multi-Commessa da 1 a 4 Clienti)
  const defaultBillingEntities = [
    { id: 'c1', clientName: 'Cliente 1', route: '', driverMetric: 125, costSharePercent: 50, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 375, paymentTermsClient: 60 },
    { id: 'c2', clientName: 'Cliente 2', route: '', driverMetric: 125, costSharePercent: 50, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 375, paymentTermsClient: 60 }
  ];

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    client: '',
    route: '',
    operatingUnit: 'auto',
    isMultiClient: false,
    costAllocationMode: 'equal',
    billingEntities: defaultBillingEntities,
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
    costVariations: [],
    vehicleLeaseVariations: [],
    trailerLeaseVariations: [],
    notes: ''
  });

  const handleCloseModal = () => {
    setShowModal(false);
    setModalFormError('');
    setModalRouteError('');
    if (
      searchParams.get('edit') ||
      searchParams.get('new') ||
      searchParams.get('newFromVehicle') ||
      searchParams.get('newFromTrailer')
    ) {
      setSearchParams({}, { replace: true });
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showToolsMenu && toolsMenuRef.current && !toolsMenuRef.current.contains(e.target)) {
        setShowToolsMenu(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showToolsMenu) setShowToolsMenu(false);
        if (showModal) handleCloseModal();
        if (showNextYearModal) setShowNextYearModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showToolsMenu, showModal, showNextYearModal, searchParams]);

  useEffect(() => {
    loadData();
    const newFromVehicle = searchParams.get('newFromVehicle');
    const newFromTrailer = searchParams.get('newFromTrailer');
    const openNew = searchParams.get('new');
    const editId = searchParams.get('edit');
    if (newFromVehicle) {
      handleOpenCreateWithVehicle(newFromVehicle);
    } else if (newFromTrailer) {
      const trl = storageService.getTrailers().find(item => item.id === newFromTrailer);
      handleOpenModal(null, null, 'active', trl || null);
    } else if (openNew === 'true') {
      handleOpenModal(null);
    } else if (editId) {
      const targetProject = storageService.getProjects().find(pr => pr.id === editId);
      if (targetProject) {
        handleOpenModal(targetProject);
      }
    }
    const unsubscribe = storageService.subscribe((event) => {
      if (event.type === 'data') {
        loadData();
      }
    });
    return () => unsubscribe();
  }, [searchParams]);

  const loadData = () => {
    const p = storageService.getProjects();
    const f = storageService.getFleet();
    const t = storageService.getTrailers();
    const s = storageService.getSettings();
    const sims = storageService.getSimulations();
    setProjects(p);
    setFleet(f);
    setTrailers(t);
    setSettings(s);
    setSimulationsCount(Array.isArray(sims) ? sims.length : 0);
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
      otherCostsDaily: recalculated.otherCostsDaily,
      vehicleLeaseVariations: recalculated.vehicleLeaseVariations || merged.vehicleLeaseVariations || [],
      trailerLeaseVariations: recalculated.trailerLeaseVariations || merged.trailerLeaseVariations || []
    };
  };

  const handleOpenModal = (project = null, preselectedVehicle = null, defaultContractStatus = 'active', preselectedTrailer = null) => {
    const curSettings = settings || storageService.getSettings();
    const curFleet = fleet.length > 0 ? fleet : storageService.getFleet();
    const curTrailers = trailers.length > 0 ? trailers : storageService.getTrailers();
    setModalTab('general');
    setModalFormError('');
    setModalRouteError('');
    setNewVariationDraft({
      targetField: 'vehicleLeaseMonthly',
      effectiveDate: '2026-07-01',
      previousValue: '',
      newValue: '',
      note: ''
    });
    if (project) {
      setEditingProject(project);
      const projVeh = curFleet.find(v => v.id === project.vehicleId);
      const projTrl = curTrailers.find(t => t.id === project.trailerId);
      const refDef = curSettings?.refrigerationParams || {};
      const defaultTech = projTrl?.category === 'refrigerato_azoto'
        ? 'azoto'
        : projTrl?.category === 'refrigerato_elettrico' || projTrl?.fuelTypeId === 'elettrico'
          ? 'elettrico'
          : 'gasolio';
      const tech = project.refrigerationTech || defaultTech;
      const fallbackRefMap = {
        azoto: { unitCost: 0.13, hourlyConsumption: 30 },
        gasolio: { unitCost: 1.80, hourlyConsumption: 3.0 },
        elettrico: { unitCost: 0.35, hourlyConsumption: 8.0 }
      };
      const techParams = refDef[tech] || fallbackRefMap[tech] || fallbackRefMap.gasolio;
      const telDef = curSettings?.accessoryParams?.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12 };
      const washDef = curSettings?.accessoryParams?.washing || { costPerWash: 80, washesPerMonth: 2 };

      const hasMulti = Boolean(project.isMultiClient) && Array.isArray(project.billingEntities) && project.billingEntities.length > 1;
      const existingEntities = hasMulti
        ? project.billingEntities
        : [
            { id: 'c1', clientName: project.client || 'Cliente 1', route: project.route || '', driverMetric: Math.round((project.kmDaily || 250) / 2), costSharePercent: 50, pricingMode: 'revenue', targetMarginPercent: project.molPercent || 21, revenueDaily: +((project.revenueDaily || 750) / 2).toFixed(2), paymentTermsClient: project.paymentTermsClient ?? 60 },
            { id: 'c2', clientName: 'Cliente 2', route: '', driverMetric: Math.round((project.kmDaily || 250) / 2), costSharePercent: 50, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: +((project.revenueDaily || 750) / 2).toFixed(2), paymentTermsClient: project.paymentTermsClient ?? 60 }
          ];

      setFormData({
        code: project.code || '',
        name: project.name || '',
        client: project.client || '',
        route: project.route || '',
        operatingUnit: project.operatingUnit || 'auto',
        isMultiClient: hasMulti,
        costAllocationMode: project.costAllocationMode || 'equal',
        billingEntities: existingEntities,
        routeStops: Array.isArray(project.routeStops) && project.routeStops.length >= 2
          ? project.routeStops
          : [
              { id: 's1', address: 'Bologna Interporto (Bentivoglio)' },
              { id: 's2', address: project.route || 'Firenze' }
            ],
        isRoundTrip: project.isRoundTrip !== undefined ? Boolean(project.isRoundTrip) : true,
        highwayPercent: project.highwayPercent ?? 65,
        tollRate: project.tollRate ?? 0.12,
        orographicMultiplier: project.orographicMultiplier ?? 1.0,
        orographyProfile: project.orographyProfile || null,
        sourceSimulationCode: project.sourceSimulationCode || null,
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
        costVariations: Array.isArray(project.costVariations) ? project.costVariations : [],
        vehicleLeaseVariations: Array.isArray(projVeh?.leaseVariations)
          ? projVeh.leaseVariations
          : (Array.isArray(project.vehicleLeaseVariations) ? project.vehicleLeaseVariations : []),
        trailerLeaseVariations: Array.isArray(projTrl?.leaseVariations)
          ? projTrl.leaseVariations
          : (Array.isArray(project.trailerLeaseVariations) ? project.trailerLeaseVariations : []),
        notes: project.notes || ''
      });
    } else {
      setEditingProject(null);
      const defaultVeh = preselectedVehicle || curFleet[0];
      const workingDays = 22;
      const defaultShift = (defaultVeh?.licenseTypeId || '').includes('doppio') ? '2_turni'
        : (defaultVeh?.licenseTypeId || '').includes('notturno') ? '1_notturno' : '1_diurno';
      const telDef = curSettings?.accessoryParams?.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12 };
      const washDef = curSettings?.accessoryParams?.washing || { costPerWash: 80, washesPerMonth: 2 };
      const payDef = curSettings?.paymentTermsDefaults || {};
      const gasolioRef = curSettings?.refrigerationParams?.gasolio || { unitCost: 1.80, hourlyConsumption: 3.0 };
      const initTrailer = preselectedTrailer || null;
      const initTrlIsFrigo = initTrailer ? isRefrigeratedTrailer(initTrailer) && initTrailer.fridgeTech !== 'nessuno' : false;
      const initFrigoTech = initTrailer?.fridgeTech && initTrailer.fridgeTech !== 'nessuno'
        ? initTrailer.fridgeTech
        : (initTrailer?.category === 'refrigerato_azoto' ? 'azoto' : (initTrailer?.fuelTypeId === 'elettrico' ? 'elettrico' : 'gasolio'));
      const initFrigoDef = curSettings?.refrigerationParams?.[initFrigoTech] || gasolioRef;

      const isPot = defaultContractStatus === 'potential';
      const initialProject = {
        code: (isPot ? 'SIM-' : 'PRJ-') + Math.floor(100 + Math.random() * 900),
        name: isPot
          ? (defaultVeh ? `Trattativa con ${defaultVeh.name}` : 'Trattativa Commerciale')
          : (defaultVeh ? `Servizio con ${defaultVeh.name}` : ''),
        client: isPot ? 'Nuova Trattativa' : '',
        route: '',
        operatingUnit: 'auto',
        isMultiClient: false,
        costAllocationMode: 'equal',
        billingEntities: defaultBillingEntities,
        startDate: '2026-01-01',
        operatingMonths: 36,
        workingDaysMonth: workingDays,
        kmDaily: 250,
        managementType: defaultVeh?.ownershipType === 'terzi' ? 'T' : 'D',
        vehicleId: defaultVeh ? defaultVeh.id : '',
        trailerId: initTrailer ? initTrailer.id : '',
        driverShiftType: defaultShift,
        driverManualOverride: false,
        driverCostDaily: calculateDriverDailyCost(defaultVeh, defaultShift, curSettings),
        energyPayer: 'four',
        fuelCostDaily: 35,
        tollsDaily: 30,
        tiresDaily: 12,
        refrigerationEnabled: initTrlIsFrigo,
        refrigerationTech: initTrlIsFrigo ? initFrigoTech : 'gasolio',
        refrigerationUnitCost: initTrlIsFrigo ? initFrigoDef.unitCost : gasolioRef.unitCost,
        refrigerationHourlyConsumption: initTrlIsFrigo ? (initTrailer?.fridgeHourlyConsumption || initFrigoDef.hourlyConsumption) : gasolioRef.hourlyConsumption,
        refrigerationHoursDaily: initTrlIsFrigo ? 8 : 0,
        refrigerationCostDaily: 0,
        telematicsEnabled: true,
        telematicsAuto: true,
        telematicsMonthly: (defaultVeh?.category === 'trattore' ? telDef.tractorMonthly : telDef.rigidMonthly) + (initTrailer ? (telDef.trailerMonthly ?? 13) : 0),
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
        trailerLeaseDaily: initTrailer && initTrailer.monthlyLease ? +(initTrailer.monthlyLease / workingDays).toFixed(2) : 0,
        revenueDaily: 750,
        targetMarginPercent: 21,
        contractStatus: isPot ? 'potential' : 'active',
        isPipelineFuture: isPot,
        paymentTermsClient: 60,
        paymentTermsSuppliers: payDef.suppliersPaymentTermsDays ?? 30,
        paymentTermsLease: defaultVeh?.leasePaymentTerms ?? 0,
        leasePaymentTiming: defaultVeh?.leasePaymentTiming || 'M1_D10',
        trailerLeasePaymentTiming: initTrailer ? normalizeLeaseTiming(initTrailer) : (defaultVeh?.leasePaymentTiming || 'M1_D30'),
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
      const recalculated = recalculateProjectCost(initialProject, curFleet, curTrailers, curSettings);
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
    const newMgmt = selectedVeh ? (isTerzi ? 'T' : 'D') : formData.managementType;
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
    const isFrigo = selectedTrl ? (isRefrigeratedTrailer(selectedTrl) && selectedTrl.fridgeTech !== 'nessuno') : false;
    let tech = 'gasolio';
    if (selectedTrl?.fridgeTech && selectedTrl.fridgeTech !== 'nessuno') {
      tech = selectedTrl.fridgeTech;
    } else if (selectedTrl?.category === 'refrigerato_azoto' || (selectedTrl?.tractionType || '').toLowerCase().includes('azoto')) {
      tech = 'azoto';
    } else if (selectedTrl?.fuelTypeId === 'elettrico' || (selectedTrl?.categoryLabel || '').toLowerCase().includes('elettric')) {
      tech = 'elettrico';
    }
    const defaultsMap = {
      azoto: { unitCost: 0.13, hourlyConsumption: 30 },
      gasolio: { unitCost: 1.80, hourlyConsumption: 3.0 },
      elettrico: { unitCost: 0.35, hourlyConsumption: 8.0 }
    };
    const techDef = refParams[tech] || defaultsMap[tech];

    const partial = {
      trailerId: tId,
      telematicsAuto: true,
      trailerLeasePaymentTiming: selectedTrl ? normalizeLeaseTiming(selectedTrl) : formData.leasePaymentTiming,
      refrigerationEnabled: isFrigo,
      refrigerationTech: tech,
      refrigerationUnitCost: techDef.unitCost,
      refrigerationHourlyConsumption: selectedTrl?.fridgeHourlyConsumption > 0 ? Number(selectedTrl.fridgeHourlyConsumption) : techDef.hourlyConsumption,
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
    const defaultsMap = {
      azoto: { unitCost: 0.13, hourlyConsumption: 30 },
      gasolio: { unitCost: 1.80, hourlyConsumption: 3.0 },
      elettrico: { unitCost: 0.35, hourlyConsumption: 8.0 }
    };
    const techDef = refParams[tech] || defaultsMap[tech] || defaultsMap.gasolio;
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
      washingEnabled: type === 'D' ? true : false
    }, { forceRecalculateDriver: type === 'D' });
    setFormData(updated);
  };

  // Assistente di Calcolo Automatico dei costi della commessa da parametri fisici
  const handleAutoCalculateCosts = () => {
    const updated = applyAutoRecalculation({ telematicsAuto: true }, { forceRecalculateDriver: true });
    setFormData(updated);
  };

  // Gestione Multi-Commessa (1..4 Clienti) nel Modal Commessa
  const handleModalClientCountChange = (count) => {
    if (count <= 1) {
      setFormData(prev => ({
        ...prev,
        isMultiClient: false
      }));
      return;
    }
    setFormData(prev => {
      const currentList = Array.isArray(prev.billingEntities) ? [...prev.billingEntities] : [];
      const eqShare = +(100 / count).toFixed(2);
      const nextEntities = Array.from({ length: count }, (_, idx) => {
        const existing = currentList[idx];
        const share = idx === count - 1 ? +(100 - eqShare * (count - 1)).toFixed(2) : eqShare;
        if (existing) {
          return {
            ...existing,
            costSharePercent: prev.costAllocationMode === 'manual_percent' ? share : existing.costSharePercent
          };
        }
        return {
          id: `c${idx + 1}`,
          clientName: idx === 0 && prev.client && !prev.client.includes('+') ? prev.client : `Cliente ${idx + 1}`,
          route: idx === 0 ? (prev.route || '') : '',
          driverMetric: Math.round((Number(prev.kmDaily) || 250) / count),
          costSharePercent: share,
          pricingMode: 'margin',
          targetMarginPercent: 21,
          revenueDaily: 0,
          paymentTermsClient: prev.paymentTermsClient ?? 60
        };
      });
      return {
        ...prev,
        isMultiClient: true,
        billingEntities: nextEntities
      };
    });
  };

  const handleModalAllocationModeChange = (nextMode) => {
    setFormData(prev => {
      const list = Array.isArray(prev.billingEntities) ? [...prev.billingEntities] : [];
      if (nextMode === 'manual_percent' && list.length > 1) {
        const sum = list.reduce((s, e) => s + (Number(e.costSharePercent) || 0), 0);
        if (Math.abs(sum - 100) > 0.5) {
          const count = list.length;
          const eq = +(100 / count).toFixed(2);
          return {
            ...prev,
            costAllocationMode: nextMode,
            billingEntities: list.map((e, i) => ({
              ...e,
              costSharePercent: i === count - 1 ? +(100 - eq * (count - 1)).toFixed(2) : eq
            }))
          };
        }
      }
      return { ...prev, costAllocationMode: nextMode };
    });
  };

  const handleModalUpdateBillingEntity = (idx, patch) => {
    setFormData(prev => {
      const list = Array.isArray(prev.billingEntities) ? [...prev.billingEntities] : [];
      const next = list.map((item, i) => (i === idx ? { ...item, ...patch } : item));
      return {
        ...prev,
        billingEntities: next
      };
    });
  };

  const handleModalShareBlur = (idx) => {
    setFormData(prev => {
      if (prev.costAllocationMode !== 'manual_percent') return prev;
      const list = Array.isArray(prev.billingEntities) ? [...prev.billingEntities] : [];
      const raw = parseFloat(list[idx]?.costSharePercent);
      const clamped = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
      return {
        ...prev,
        billingEntities: rebalanceManualCostShares(list, list.length, idx, clamped)
      };
    });
  };

  const handleModalNormalizeShares = () => {
    setFormData(prev => {
      const list = Array.isArray(prev.billingEntities) ? [...prev.billingEntities] : [];
      const count = list.length || 1;
      const sum = list.reduce((s, e) => s + (Number(e.costSharePercent) || 0), 0);
      if (sum <= 0) {
        const eq = +(100 / count).toFixed(2);
        return {
          ...prev,
          billingEntities: list.map((e, i) => ({
            ...e,
            costSharePercent: i === count - 1 ? +(100 - eq * (count - 1)).toFixed(2) : eq
          }))
        };
      }
      let running = 0;
      return {
        ...prev,
        billingEntities: list.map((e, i) => {
          if (i === count - 1) return { ...e, costSharePercent: +Math.max(0, 100 - running).toFixed(2) };
          const norm = +(((Number(e.costSharePercent) || 0) / sum) * 100).toFixed(2);
          running += norm;
          return { ...e, costSharePercent: norm };
        })
      };
    });
  };

  const handleSaveProject = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.name.trim()) {
      setModalTab('general');
      setModalFormError('Inserisci il Nome / Descrizione della Linea prima di salvare.');
      return;
    }
    if (!formData.isMultiClient && (!formData.client || !formData.client.trim())) {
      setModalTab('general');
      setModalFormError('Inserisci il nome del Cliente prima di salvare.');
      return;
    }
    if (formData.isMultiClient && Array.isArray(formData.billingEntities)) {
      const missingClient = formData.billingEntities.some(be => !be.clientName || !be.clientName.trim());
      if (missingClient) {
        setModalTab('general');
        setModalFormError('Compila la Ragione Sociale di tutti i clienti configurati in Multi-Commessa.');
        return;
      }
    }
    setModalFormError('');

    // Ricalcola totali di competenza (supporta Multi-Commessa 1-4 clienti)
    const metrics = calculateSingleProjectMetrics(formData);

    const isPot = formData.contractStatus === 'potential' || Boolean(formData.isPipelineFuture);
    const hasMulti = Boolean(formData.isMultiClient) && Array.isArray(formData.billingEntities) && formData.billingEntities.length > 1;
    const resolvedClient = hasMulti
      ? (metrics.multiAllocation?.combinedClientLabel || formData.client || 'Multi-Commessa')
      : formData.client;

    const projectDataToSave = {
      ...formData,
      client: resolvedClient,
      isMultiClient: hasMulti,
      costAllocationMode: formData.costAllocationMode || 'equal',
      billingEntities: hasMulti ? metrics.billingEntities : [],
      paymentTermsClient: hasMulti ? metrics.clientDso : formData.paymentTermsClient,
      contractStatus: isPot ? 'potential' : 'active',
      isPipelineFuture: isPot,
      revenueDaily: hasMulti ? metrics.revenueDaily : (Number(formData.revenueDaily) || 0),
      totalCostDaily: metrics.totalCostDaily,
      molDaily: metrics.molDaily,
      monthlyCost: metrics.monthlyCost,
      monthlyRevenue: metrics.monthlyRevenue,
      monthlyMol: metrics.monthlyMol,
      molPercent: +metrics.molPercent.toFixed(2),
      targetMarginPercent: +metrics.molPercent.toFixed(2),
      cashAdvanceRequired: metrics.estimatedWorkingCapitalGap
    };

    if (editingProject && editingProject.id) {
      storageService.updateProject(editingProject.id, projectDataToSave);
    } else {
      storageService.addProject(projectDataToSave);
    }

    handleCloseModal();
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

  // Proroga rapida singolo contratto (+12 mesi o allineamento al 2026 se scaduto)
  const handleExtendContract = (projectId, monthsToAdd = 12) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      const v = getContractValidity(p);
      let newStart = p.startDate || '2026-01-01';
      let newMonths = Number(p.operatingMonths) || 12;
      if (v.isExpired || v.endYear < 2026) {
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

  // Allineamento / rinnovo massivo dei soli contratti scaduti all'esercizio 2026
  const handleRenewAllTo2026 = () => {
    const updated = projects.map(p => {
      if (isFutureProject(p)) return p;
      const v = getContractValidity(p);
      if (v.isExpired || v.endYear < 2026) {
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

  // Estensione formale dei contratti attivi che scadono prima del 31/12/2027 fino a fine 2027
  const handleExtendAllTo2027 = () => {
    const updated = projects.map(p => {
      if (isFutureProject(p)) return p;
      const v = getContractValidity(p);
      if (v.isExpired) return p;
      const s = p.startDate ? String(p.startDate).slice(0, 10) : '2026-01-01';
      const startYear = parseInt(s.slice(0, 4), 10) || 2026;
      const startMonth = parseInt(s.slice(5, 7), 10) || 1; // 1..12
      const startDay = parseInt(s.slice(8, 10), 10) || 1;
      // Numero mesi da inizio contratto a fine Dicembre 2027
      let monthsNeededToEnd2027 = (2027 - startYear) * 12 + (13 - startMonth);
      if (startDay > 15) monthsNeededToEnd2027 += 1;
      const currentMonths = Number(p.operatingMonths) || 12;
      if (currentMonths >= monthsNeededToEnd2027) return p;
      return {
        ...p,
        operatingMonths: monthsNeededToEnd2027
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

  // Statistiche scadenze contrattuali & elenco contratti attivi scaduti
  const isFutureProject = (p) => isPotentialProject(p);

  const expiredProjects = useMemo(() => {
    return projects.filter(p => !isPotentialProject(p) && getContractValidity(p).isExpired);
  }, [projects]);

  const contractStats = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    projects.forEach(p => {
      const v = getContractValidity(p);
      if (v.isExpired) expired++;
      else {
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
  // Visione Strategica di Portafoglio SEMPRE VISIBILE; Dettaglio elenco commesse apribile in caso di bisogno
  const [showProjectsDetailList, setShowProjectsDetailList] = useState(false);
  const [expandedRowDetailId, setExpandedRowDetailId] = useState(null);
  const [modalRouteCalculating, setModalRouteCalculating] = useState(false);
  const [modalRouteError, setModalRouteError] = useState('');

  const handleModalCalculateRouteFromStops = async () => {
    setModalRouteError('');
    setModalRouteCalculating(true);
    try {
      const stops = Array.isArray(formData.routeStops) && formData.routeStops.length >= 2
        ? formData.routeStops
        : [
            { id: 's1', address: 'Bologna Interporto (Bentivoglio)' },
            { id: 's2', address: formData.route || 'Milano' }
          ];
      const veh = fleet.find(v => v.id === formData.vehicleId);
      const trl = trailers.find(t => t.id === formData.trailerId);
      const res = await calculateRouteFromStops(stops, {
        isRoundTrip: formData.isRoundTrip !== false,
        tripsPerDay: 1,
        vehicle: veh,
        trailer: trl
      });
      const updated = applyAutoRecalculation({
        kmDaily: res.totalDailyKm,
        highwayPercent: res.highwayPercent,
        tollRate: res.tollEstimation.suggestedRate,
        orographicMultiplier: res.orography.consumptionMultiplier,
        orographyProfile: res.orography,
        routeStops: stops,
        route: res.generatedRouteName || formData.route
      });
      setFormData(updated);
    } catch (err) {
      setModalRouteError(err.message || 'Errore calcolo percorso da tappe.');
    } finally {
      setModalRouteCalculating(false);
    }
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

  // Auto-inclusione di default delle trattative/simulazioni al primo caricamento (rispetta "Escludi Trattative" in seguito)
  useEffect(() => {
    if (hasInitializedWhatIfRef.current) return;
    const potIds = projects.filter(isFutureProject).map(p => p.id);
    if (potIds.length > 0) {
      hasInitializedWhatIfRef.current = true;
      setWhatIfIncludedIds(new Set(potIds));
    }
  }, [projects]);

  const handleSelectScenario = (scen) => {
    setSelectedScenario(scen);
    if (scen === 'whatIf' && whatIfIncludedIds.size === 0 && !hasInitializedWhatIfRef.current) {
      const potIds = projects.filter(isFutureProject).map(p => p.id);
      if (potIds.length > 0) {
        hasInitializedWhatIfRef.current = true;
        setWhatIfIncludedIds(new Set(potIds));
      }
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

  const projectMetricsMap = useMemo(() => {
    const map = {};
    const opts = budgetHorizon !== 'regime' ? { year: Number(budgetHorizon) } : {};
    projects.forEach(p => {
      map[p.id] = calculateSingleProjectMetrics(p, opts);
    });
    return map;
  }, [projects, budgetHorizon]);

  const calcPortfolioTotals = (projList) => {
    const isAnnualHorizon = budgetHorizon === '2026' || budgetHorizon === '2027';
    const horizonYear = isAnnualHorizon ? Number(budgetHorizon) : 2026;
    const rolloverPrev = horizonYear === 2027;
    const effectiveList = isAnnualHorizon
      ? projList.filter(p =>
          Array.from({ length: 12 }, (_, m) =>
            isProjectActiveInMonth(p, m, horizonYear, { rolloverPreviousYearBudget: rolloverPrev })
          ).some(Boolean)
        )
      : projList;

    const count = effectiveList.length;
    let revenueMonthly = 0;
    let revenueAnnual = 0;
    let costMonthly = 0;
    let costAnnual = 0;
    let molMonthly = 0;
    let molAnnual = 0;
    let molPercent = 0;

    if (isAnnualHorizon) {
      const annualModel = calculateAnnualBudgetAndCashFlow(effectiveList, {
        year: horizonYear,
        rolloverPreviousYearBudget: rolloverPrev,
        fleet,
        trailers
      });
      revenueAnnual = annualModel.annualRevenue;
      revenueMonthly = annualModel.annualRevenue / 12;
      costAnnual = annualModel.annualCost;
      costMonthly = annualModel.annualCost / 12;
      molAnnual = annualModel.annualMol;
      molMonthly = annualModel.annualMol / 12;
      molPercent = annualModel.annualMolPercent;
    } else {
      revenueMonthly = effectiveList.reduce((sum, p) => sum + (Number(calculateSingleProjectMetrics(p).monthlyRevenue) || 0), 0);
      costMonthly = effectiveList.reduce((sum, p) => sum + (Number(calculateSingleProjectMetrics(p).monthlyCost) || 0), 0);
      molMonthly = revenueMonthly - costMonthly;
      molPercent = revenueMonthly > 0 ? (molMonthly / revenueMonthly) * 100 : 0;
      revenueAnnual = revenueMonthly * 12;
      costAnnual = costMonthly * 12;
      molAnnual = molMonthly * 12;
    }

    const workingCapital = effectiveList.reduce((sum, p) => {
      const m = calculateSingleProjectMetrics(p, isAnnualHorizon ? { year: horizonYear } : {});
      return sum + (m.estimatedWorkingCapitalGap || 0);
    }, 0);
    const creditLine = workingCapital > 0 ? Math.ceil((workingCapital * 1.15) / 5000) * 5000 : 0;

    const uniqueVehicleIds = new Set(effectiveList.map(p => p.vehicleId).filter(Boolean));
    const uniqueTrailerIds = new Set(effectiveList.map(p => p.trailerId).filter(Boolean));
    let electricVehiclesCount = 0;
    let biolngVehiclesCount = 0;
    uniqueVehicleIds.forEach(vId => {
      const v = fleet.find(item => item.id === vId);
      if (v) {
        if (v.fuelTypeId === 'elettrico') electricVehiclesCount++;
        else if (v.fuelTypeId === 'biolng') biolngVehiclesCount++;
      }
    });

    const directCount = effectiveList.filter(p => (p.managementType || 'D') === 'D').length;
    const thirdPartyCount = effectiveList.filter(p => p.managementType === 'T').length;
    const multiCommessaCount = effectiveList.filter(p => p.isMultiClient && Array.isArray(p.billingEntities) && p.billingEntities.length > 1).length;

    const clientEntitiesSet = new Set();
    let totalBillingSlices = 0;
    effectiveList.forEach(p => {
      if (p.isMultiClient && Array.isArray(p.billingEntities) && p.billingEntities.length > 1) {
        p.billingEntities.forEach(be => {
          totalBillingSlices++;
          if (be.clientName) clientEntitiesSet.add(be.clientName.trim());
        });
      } else {
        totalBillingSlices++;
        if (p.client) clientEntitiesSet.add(p.client.trim());
      }
    });

    const totalKmDaily = effectiveList.reduce((sum, p) => sum + (Number(p.kmDaily) || 0), 0);
    const totalKmMonthly = effectiveList.reduce((sum, p) => {
      const monthlyKm = (Number(p.kmDaily) || 0) * (Number(p.workingDaysMonth) || 22);
      if (!isAnnualHorizon) return sum + monthlyKm;
      const activeMonthsInYear = Array.from({ length: 12 }, (_, m) =>
        isProjectActiveInMonth(p, m, horizonYear, { rolloverPreviousYearBudget: rolloverPrev })
      ).filter(Boolean).length;
      return sum + monthlyKm * (activeMonthsInYear / 12);
    }, 0);
    const avgRevenuePerKm = totalKmMonthly > 0 ? revenueMonthly / totalKmMonthly : 0;
    const avgCostPerKm = totalKmMonthly > 0 ? costMonthly / totalKmMonthly : 0;

    const hubsSet = new Set(effectiveList.map(p => {
      const v = fleet.find(item => item.id === p.vehicleId);
      return getProjectOperatingUnit(p, v);
    }).filter(Boolean));

    return {
      count,
      totalInList: projList.length,
      revenueMonthly,
      revenueAnnual,
      costMonthly,
      costAnnual,
      molMonthly,
      molAnnual,
      molPercent,
      workingCapital,
      creditLine,
      vehiclesUsedCount: uniqueVehicleIds.size,
      trailersUsedCount: uniqueTrailerIds.size,
      electricVehiclesCount,
      biolngVehiclesCount,
      directCount,
      thirdPartyCount,
      multiCommessaCount,
      uniqueClientsCount: clientEntitiesSet.size,
      totalBillingSlices,
      totalKmDaily,
      totalKmMonthly,
      avgRevenuePerKm,
      avgCostPerKm,
      activeHubsCount: hubsSet.size
    };
  };

  // Progetti appartenenti allo scenario attivo della vista tabellare
  const effectiveScenarioProjects = useMemo(() => {
    if (selectedScenario === 'whatIf') {
      return [...statusQuoProjects, ...simulatedPotentialProjects];
    }
    if (selectedScenario === 'active2026') {
      return statusQuoProjects;
    }
    if (selectedScenario === 'futureOnly') {
      return allPotentialProjects;
    }
    return [...statusQuoProjects, ...allPotentialProjects]; // consolidated
  }, [selectedScenario, statusQuoProjects, simulatedPotentialProjects, allPotentialProjects]);

  const scenarioTotals = useMemo(() => calcPortfolioTotals(effectiveScenarioProjects), [effectiveScenarioProjects, fleet, trailers, budgetHorizon]);
  const statusQuoTotals = useMemo(() => calcPortfolioTotals(statusQuoProjects), [statusQuoProjects, fleet, trailers, budgetHorizon]);
  const potentialTotals = useMemo(() => calcPortfolioTotals(simulatedPotentialProjects), [simulatedPotentialProjects, fleet, trailers, budgetHorizon]);
  const combinedTotals = useMemo(() => calcPortfolioTotals(combinedProjects), [combinedProjects, fleet, trailers, budgetHorizon]);

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

  // Lista clienti unici per filtro (include sia i clienti singoli sia le singole entità delle Multi-Commesse)
  const uniqueClients = useMemo(() => {
    const set = new Set();
    projects.forEach(p => {
      if (p.client) set.add(p.client);
      if (p.isMultiClient && Array.isArray(p.billingEntities)) {
        p.billingEntities.forEach(be => {
          if (be.clientName && be.clientName.trim()) set.add(be.clientName.trim());
        });
      }
    });
    return Array.from(set);
  }, [projects]);

  // Filtro progetti
  const filteredProjects = projects.filter(p => {
    // 1. Filtro Scenario Previsionale (Attive 2026 / Nuove Future / Consolidato / What-If)
    const validity = getContractValidity(p);
    if (selectedScenario === 'active2026') {
      if (isFutureProject(p) || validity.isExpired) return false;
    } else if (selectedScenario === 'futureOnly') {
      if (!isFutureProject(p)) return false;
    } else if (selectedScenario === 'whatIf') {
      if (isFutureProject(p)) {
        if (!whatIfIncludedIds.has(p.id)) return false;
      } else if (validity.isExpired && contractFilter !== 'expired') {
        return false;
      }
    } else if (selectedScenario === 'consolidated') {
      if (!isFutureProject(p) && validity.isExpired && contractFilter !== 'expired') return false;
    }

    const q = searchQuery.toLowerCase();
    const matchesEntitySearch = p.isMultiClient && Array.isArray(p.billingEntities) &&
      p.billingEntities.some(be =>
        (be.clientName && be.clientName.toLowerCase().includes(q)) ||
        (be.route && be.route.toLowerCase().includes(q))
      );

    const matchesSearch = p.name.toLowerCase().includes(q) ||
      (p.client && p.client.toLowerCase().includes(q)) ||
      (p.route && p.route.toLowerCase().includes(q)) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      matchesEntitySearch;

    const matchesClient = clientFilter === 'all' ||
      p.client === clientFilter ||
      (p.isMultiClient && Array.isArray(p.billingEntities) && p.billingEntities.some(be => be.clientName && be.clientName.trim() === clientFilter));
    const matchesManagement = managementFilter === 'all' || p.managementType === managementFilter;

    const pMetrics = projectMetricsMap[p.id];
    const effectiveMolPercent = pMetrics ? pMetrics.molPercent : (p.molPercent || 0);
    let matchesMargin = true;
    if (marginFilter === 'positive') matchesMargin = effectiveMolPercent >= 15;
    if (marginFilter === 'low') matchesMargin = effectiveMolPercent > 0 && effectiveMolPercent < 15;
    if (marginFilter === 'negative') matchesMargin = effectiveMolPercent <= 0;

    let matchesContract = true;
    if (contractFilter === 'active2026') matchesContract = validity.isActive && validity.endYear >= 2026;
    if (contractFilter === 'expiring') matchesContract = validity.isExpiringSoon;
    if (contractFilter === 'expired') matchesContract = validity.isExpired;

    return matchesSearch && matchesClient && matchesManagement && matchesMargin && matchesContract;
  });

  // Ordinamento e filtro per Unità Operativa
  const displayProjects = useMemo(() => {
    let list = [...filteredProjects];

    if (operatingUnitFilter !== 'all') {
      list = list.filter(p => {
        const v = fleet.find(item => item.id === p.vehicleId);
        return getProjectOperatingUnit(p, v) === operatingUnitFilter;
      });
    }

    if (sortBy === 'operatingUnit') {
      const order = { 'Arborio': 1, 'Buccinasco': 2, 'Landriano': 3, 'Caorso': 4, 'Bologna': 5, 'Altro / Sede': 6 };
      list.sort((a, b) => {
        const vA = fleet.find(item => item.id === a.vehicleId);
        const vB = fleet.find(item => item.id === b.vehicleId);
        const uA = getProjectOperatingUnit(a, vA);
        const uB = getProjectOperatingUnit(b, vB);
        const orderA = order[uA] || 99;
        const orderB = order[uB] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
    } else if (sortBy === 'client') {
      list.sort((a, b) => (a.client || '').localeCompare(b.client || ''));
    } else if (sortBy === 'molDesc') {
      list.sort((a, b) => (projectMetricsMap[b.id]?.monthlyMol ?? b.monthlyMol ?? 0) - (projectMetricsMap[a.id]?.monthlyMol ?? a.monthlyMol ?? 0));
    } else if (sortBy === 'revenueDesc') {
      list.sort((a, b) => (projectMetricsMap[b.id]?.monthlyRevenue ?? b.monthlyRevenue ?? 0) - (projectMetricsMap[a.id]?.monthlyRevenue ?? a.monthlyRevenue ?? 0));
    } else if (sortBy === 'marginDesc') {
      list.sort((a, b) => (projectMetricsMap[b.id]?.molPercent ?? b.molPercent ?? 0) - (projectMetricsMap[a.id]?.molPercent ?? a.molPercent ?? 0));
    }

    return list;
  }, [filteredProjects, operatingUnitFilter, sortBy, fleet, projectMetricsMap]);

  // Gestione riordino manuale delle commesse (Drag & Drop e pulsanti Sposta Su/Giù sui vicini visibili)
  const handleMoveProject = (projectId, direction) => {
    const visibleIdx = displayProjects.findIndex(p => p.id === projectId);
    if (visibleIdx === -1) return;
    const neighborIdx = direction === 'up' ? visibleIdx - 1 : visibleIdx + 1;
    if (neighborIdx < 0 || neighborIdx >= displayProjects.length) return;

    const neighborId = displayProjects[neighborIdx].id;
    const currentIndex = projects.findIndex(p => p.id === projectId);
    const targetIndex = projects.findIndex(p => p.id === neighborId);
    if (currentIndex === -1 || targetIndex === -1) return;

    const newProjects = [...projects];
    const [moved] = newProjects.splice(currentIndex, 1);
    newProjects.splice(targetIndex, 0, moved);

    storageService.saveProjects(newProjects);
    setProjects(newProjects);
  };

  const handleDragStart = (e, projectId) => {
    setDraggedProjectId(projectId);
    e.dataTransfer.setData('text/plain', projectId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e, targetProjectId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedProjectId;
    setDraggedProjectId(null);
    if (!sourceId || sourceId === targetProjectId) return;

    const sourceIndex = projects.findIndex(p => p.id === sourceId);
    const targetIndex = projects.findIndex(p => p.id === targetProjectId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const newProjects = [...projects];
    const [moved] = newProjects.splice(sourceIndex, 1);
    newProjects.splice(targetIndex, 0, moved);

    storageService.saveProjects(newProjects);
    setProjects(newProjects);
  };

  // Progetti attivi nello scenario E nei filtri correnti (per ricalcolare dinamicamente tutti i KPI della Vista Scenario)
  const activeFilteredScenarioProjects = useMemo(() => {
    return displayProjects.filter(p => {
      if (selectedScenario === 'futureOnly') return true;
      if (isFutureProject(p)) return whatIfIncludedIds.has(p.id);
      return true;
    });
  }, [displayProjects, selectedScenario, whatIfIncludedIds]);

  const activeFilteredTotals = useMemo(
    () => calcPortfolioTotals(activeFilteredScenarioProjects),
    [activeFilteredScenarioProjects, fleet, trailers, budgetHorizon]
  );

  const hasActiveFilters = Boolean(
    searchQuery.trim() !== '' ||
    clientFilter !== 'all' ||
    managementFilter !== 'all' ||
    marginFilter !== 'all' ||
    contractFilter !== 'all' ||
    operatingUnitFilter !== 'all'
  );

  useEffect(() => {
    if (hasActiveFilters && !prevHasActiveFiltersRef.current) {
      setShowProjectsDetailList(true);
    }
    prevHasActiveFiltersRef.current = hasActiveFilters;
  }, [hasActiveFilters]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setClientFilter('all');
    setManagementFilter('all');
    setMarginFilter('all');
    setContractFilter('all');
    setOperatingUnitFilter('all');
  };

  // Calcoli live per la modal (rispettano l'orizzonte temporale selezionato se annuale)
  const liveModalMetrics = calculateSingleProjectMetrics(
    formData,
    budgetHorizon !== 'regime' ? { year: Number(budgetHorizon) } : {}
  );
  const liveValidity = getContractValidity(formData);

  const horizonLabel = budgetHorizon === '2026' ? 'Budget 2026' : budgetHorizon === '2027' ? 'Budget 2027' : 'Regime 12m';

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header Compatto su 1 Riga */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#164e87]/10 text-[#164e87] rounded-xl border border-[#164e87]/20 flex-shrink-0">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight sm:whitespace-nowrap">
                Commesse &amp; Budget Progetti
              </h1>
              <p className="text-xs text-slate-500">
                Controllo economico linee operative, marginalità, termini d&apos;incasso e scenari multi-commessa
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selettore Orizzonte (Budget 2026 | Budget 2027 | Regime 12m) */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              {[
                { id: '2026', label: 'Budget 2026' },
                { id: '2027', label: 'Budget 2027' },
                { id: 'regime', label: 'Regime 12m' }
              ].map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setBudgetHorizon(h.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                    budgetHorizon === h.id
                      ? 'bg-[#164e87] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleOpenModal(null, null, 'active')}
              className="inline-flex items-center space-x-1.5 bg-[#164e87] hover:bg-[#0e3a6c] text-white px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm transition whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Nuova Commessa</span>
            </button>

            <button
              onClick={() => handleOpenModal(null, null, 'potential')}
              className="inline-flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2 rounded-xl font-black text-xs shadow-sm transition whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>+ Trattativa</span>
            </button>

            {/* Dropdown Strumenti Batch */}
            <div className="relative" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={() => setShowToolsMenu(prev => !prev)}
                className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-2 rounded-xl font-bold text-xs border border-slate-300 transition whitespace-nowrap"
              >
                <Sliders className="w-3.5 h-3.5 text-[#164e87]" />
                <span>Strumenti</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showToolsMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-40 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      navigate('/simulation');
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 font-bold text-[#164e87] flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Archivio Simulazioni ({simulationsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      setShowNextYearModal(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 font-bold text-emerald-800 flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Estendi Contratti al 2027 (+12m)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      handleRenewAllTo2026();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 font-semibold text-slate-700 flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4 text-slate-500" />
                    <span>Allinea scaduti al 2026</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowToolsMenu(false);
                      handleApplyStandardAccessoriesToAll();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50 font-semibold text-indigo-800 flex items-center gap-2"
                  >
                    <Wifi className="w-4 h-4 text-indigo-600" />
                    <span>Applica Telematica &amp; Lavaggi</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Banner Notifica Contratti Scaduti (con nomi cliccabili) */}
        {expiredProjects.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-950">
                  Attenzione: {expiredProjects.length === 1 ? '1 contratto risulta scaduto' : `${expiredProjects.length} contratti risultano scaduti`} rispetto al 2026
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {expiredProjects.map(ep => (
                    <button
                      key={ep.id}
                      type="button"
                      onClick={() => handleOpenModal(ep)}
                      className="px-2 py-0.5 rounded-lg bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-[11px] transition"
                    >
                      {ep.name} ({getContractValidity(ep).formattedEnd}) ✎
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={handleRenewAllTo2026}
              className="inline-flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition whitespace-nowrap self-start sm:self-center"
            >
              <RotateCw className="w-4 h-4" />
              <span>Rinnova tutti per il 2026</span>
            </button>
          </div>
        )}

        {/* CRUSCOTTO STRATEGICO DI PORTAFOGLIO UNIFICATO + STRIP KPI SUI FILTRI ATTIVI */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-gradient-to-r from-slate-50 to-blue-50/40 border-b border-slate-200">
            <div className="flex items-center space-x-3">
              <span className="p-2 bg-[#164e87]/10 text-[#164e87] rounded-xl border border-[#164e87]/20 flex-shrink-0">
                <Layers className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    Visione Strategica di Portafoglio • {horizonLabel}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-50 text-[#164e87] border border-cyan-200">
                    {statusQuoProjects.length} Attivi + {allPotentialProjects.length} Trattative{expiredProjects.length > 0 ? ` (+${expiredProjects.length} ${expiredProjects.length === 1 ? 'scaduto' : 'scaduti'})` : ''} = {projects.length}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clicca su una card per filtrare lo scenario • What-If attivo: {simulatedPotentialProjects.length}/{allPotentialProjects.length} trattative incluse
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {allPotentialProjects.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setWhatIfIncludedIds(new Set(allPotentialProjects.map(p => p.id)))}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-xl border border-slate-300 transition whitespace-nowrap"
                  >
                    Simula Tutte ({allPotentialProjects.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWhatIfIncludedIds(new Set())}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-xl border border-slate-300 transition whitespace-nowrap"
                  >
                    Escludi Trattative
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowScenarioSaveBox(!showScenarioSaveBox)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl transition shadow-sm whitespace-nowrap"
              >
                Salva Scenario What-If
              </button>
              <button
                type="button"
                onClick={() => setShowProjectsDetailList(!showProjectsDetailList)}
                className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition border whitespace-nowrap ${
                  showProjectsDetailList
                    ? 'bg-slate-800 text-white border-slate-900'
                    : 'bg-[#164e87] hover:bg-[#0e3a6c] text-white border-[#164e87]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showProjectsDetailList ? 'Chiudi Dettaglio Commesse' : `Apri Dettaglio Commesse (${displayProjects.length})`}</span>
                {showProjectsDetailList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {showScenarioSaveBox && (
            <div className="p-3 mx-4 mt-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                placeholder="Nome scenario (es. 'Ipotesi Espansione Lindt + Conad')..."
                value={scenarioNameInput}
                onChange={(e) => setScenarioNameInput(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs flex-1 min-w-[240px]"
              />
              <button
                type="button"
                onClick={handleSaveCurrentScenario}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm"
              >
                Salva Simulazione
              </button>
              {savedScenarios.length > 0 && (
                <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200 flex-wrap">
                  <span className="text-slate-500 text-[11px]">Scenari:</span>
                  {savedScenarios.map(sc => (
                    <span key={sc.id} className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 text-[11px]">
                      <button type="button" onClick={() => handleLoadSavedScenario(sc.id)} className="font-bold text-[#164e87] hover:underline">
                        {sc.name}
                      </button>
                      <button type="button" onClick={() => handleDeleteSavedScenario(sc.id)} className="text-rose-500 hover:text-rose-700 font-bold ml-1">
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3 Card Strategiche Cliccabili */}
          <div className="p-5 bg-slate-50/60 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 1. STATUS QUO */}
              <div
                onClick={() => handleSelectScenario('active2026')}
                className={`bg-white rounded-xl p-4 border cursor-pointer transition flex flex-col justify-between ${
                  selectedScenario === 'active2026'
                    ? 'border-emerald-600 ring-2 ring-emerald-500/30 shadow-md'
                    : 'border-emerald-300 hover:border-emerald-500 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                        Status Quo Operativo
                      </h4>
                    </div>
                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                      Contratti Attivi
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-black text-slate-900">{statusQuoTotals.count}</span>
                      <span className="text-xs text-slate-500 font-medium">commesse ({statusQuoTotals.uniqueClientsCount} clienti)</span>
                    </div>
                    <span className="text-[11px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      🚛 {statusQuoTotals.vehiclesUsedCount} Mezzi
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Fatturato ({horizonLabel}):</span>
                    <span className="font-bold text-slate-800">{formatEUR(statusQuoTotals.revenueMonthly)}/m • <strong className="text-[#164e87]">{formatEUR(statusQuoTotals.revenueAnnual)}/a</strong></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Costi Operativi:</span>
                    <span className="font-medium text-slate-700">{formatEUR(statusQuoTotals.costMonthly)}/m • {formatEUR(statusQuoTotals.costAnnual)}/a</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                    <span className="text-emerald-700 font-bold">M.O.L. / EBITDA:</span>
                    <span className="font-black text-emerald-700">{formatEUR(statusQuoTotals.molMonthly)}/m ({formatPercent(statusQuoTotals.molPercent)})</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Circolante (Gap Cassa):</span>
                    <span className="font-bold text-amber-700">{formatEUR(statusQuoTotals.workingCapital)}</span>
                  </div>
                </div>
              </div>

              {/* 2. TRATTATIVE & WHAT-IF */}
              <div
                onClick={() => handleSelectScenario('futureOnly')}
                className={`bg-white rounded-xl p-4 border cursor-pointer transition flex flex-col justify-between ${
                  selectedScenario === 'futureOnly'
                    ? 'border-amber-600 ring-2 ring-amber-500/30 shadow-md'
                    : 'border-amber-300 hover:border-amber-500 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                        Trattative &amp; What-If
                      </h4>
                    </div>
                    <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                      Potenziali
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-black text-slate-900">+{potentialTotals.count}</span>
                      <span className="text-xs text-slate-500 font-medium">attive in {horizonLabel} ({allPotentialProjects.length} in pipeline)</span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      🚛 {potentialTotals.vehiclesUsedCount} Mezzi
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Delta Fatturato ({horizonLabel}):</span>
                    <span className="font-bold text-[#164e87]">+{formatEUR(potentialTotals.revenueMonthly)}/m • +{formatEUR(potentialTotals.revenueAnnual)}/a</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Delta Costi:</span>
                    <span className="font-medium text-slate-700">+{formatEUR(potentialTotals.costMonthly)}/m • +{formatEUR(potentialTotals.costAnnual)}/a</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                    <span className="text-amber-800 font-bold">Delta M.O.L. Atteso:</span>
                    <span className="font-black text-amber-800">+{formatEUR(potentialTotals.molMonthly)}/m ({formatPercent(potentialTotals.molPercent)})</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Circolante Extra (Gap Cassa):</span>
                    <span className="font-bold text-amber-700">+{formatEUR(potentialTotals.workingCapital)}</span>
                  </div>
                </div>
              </div>

              {/* 3. SCENARIO GLOBALE CONSOLIDATO */}
              <div
                onClick={() => handleSelectScenario('consolidated')}
                className={`bg-gradient-to-br from-blue-50/80 to-slate-50 rounded-xl p-4 border cursor-pointer transition flex flex-col justify-between ${
                  selectedScenario === 'consolidated' || selectedScenario === 'whatIf'
                    ? 'border-[#164e87] ring-2 ring-[#164e87]/30 shadow-md'
                    : 'border-blue-300 hover:border-[#164e87] shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#164e87]" />
                      <h4 className="text-xs font-black text-[#164e87] uppercase tracking-wider">
                        Scenario Globale Consolidato
                      </h4>
                    </div>
                    <span className="text-[10px] font-black bg-[#164e87]/15 text-[#164e87] px-2 py-0.5 rounded-full border border-blue-300">
                      Totale Consolidato
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-black text-slate-900">{combinedTotals.count}</span>
                      <span className="text-xs text-slate-500 font-medium">commesse ({combinedTotals.uniqueClientsCount} clienti)</span>
                    </div>
                    <span className="text-[11px] font-black text-[#164e87] bg-white px-2 py-0.5 rounded border border-blue-300">
                      🚛 {combinedTotals.vehiclesUsedCount}/{fleet.length} Mezzi
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-blue-200/60 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Fatturato ({horizonLabel}):</span>
                    <span className="font-black text-slate-900">{formatEUR(combinedTotals.revenueMonthly)}/m • <strong className="text-[#164e87]">{formatEUR(combinedTotals.revenueAnnual)}/a</strong></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Costi Totali:</span>
                    <span className="font-medium text-slate-800">{formatEUR(combinedTotals.costMonthly)}/m • {formatEUR(combinedTotals.costAnnual)}/a</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-blue-200/60">
                    <span className="text-[#164e87] font-bold">M.O.L. Globale:</span>
                    <span className="font-black text-emerald-700">{formatEUR(combinedTotals.molMonthly)}/m ({formatPercent(combinedTotals.molPercent)})</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Circolante (Gap Cassa):</span>
                    <span className="font-black text-amber-700">{formatEUR(combinedTotals.workingCapital)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Strip Unica Indicatori Aggregati sullo Scenario & Filtri Attivi */}
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-slate-600 uppercase tracking-wider">
                  Sintesi Scenario Attivo ({selectedScenario === 'active2026' ? 'Solo Status Quo' : selectedScenario === 'futureOnly' ? 'Solo Trattative' : 'Consolidato What-If'} • {horizonLabel})
                </span>
                {hasActiveFilters && (
                  <span className="px-2 py-0.5 rounded-full font-black bg-blue-100 text-[#164e87] border border-blue-300 text-[10px]">
                    ⚡ Filtrato su {activeFilteredTotals.count} commesse
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                <div className="bg-white px-3 py-2 rounded-xl border border-blue-200/80">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>Fatturato</span>
                    <span className="text-[#164e87] font-black">{formatEUR(activeFilteredTotals.avgRevenuePerKm)}/km</span>
                  </div>
                  <div className="font-black text-[#164e87] text-sm mt-0.5">{formatEUR(activeFilteredTotals.revenueMonthly)}<span className="text-[10px] font-semibold">/m</span></div>
                  <div className="text-[10px] text-slate-500">Annuo: <strong>{formatEUR(activeFilteredTotals.revenueAnnual)}</strong></div>
                </div>

                <div className="bg-white px-3 py-2 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>Costi Totali</span>
                    <span className="text-slate-700 font-bold">{formatEUR(activeFilteredTotals.avgCostPerKm)}/km</span>
                  </div>
                  <div className="font-black text-slate-800 text-sm mt-0.5">{formatEUR(activeFilteredTotals.costMonthly)}<span className="text-[10px] font-semibold">/m</span></div>
                  <div className="text-[10px] text-slate-500">Annuo: <strong>{formatEUR(activeFilteredTotals.costAnnual)}</strong></div>
                </div>

                <div className="bg-white px-3 py-2 rounded-xl border border-emerald-200/80">
                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-800 uppercase">
                    <span>M.O.L.</span>
                    <span className={`px-1.5 rounded font-black ${
                      activeFilteredTotals.molPercent >= 15 ? 'bg-emerald-100 text-emerald-900' : activeFilteredTotals.molPercent >= 0 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'
                    }`}>{formatPercent(activeFilteredTotals.molPercent)}</span>
                  </div>
                  <div className={`font-black text-sm mt-0.5 ${activeFilteredTotals.molMonthly >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatEUR(activeFilteredTotals.molMonthly)}<span className="text-[10px] font-semibold">/m</span></div>
                  <div className="text-[10px] text-slate-500">Annuo: <strong>{formatEUR(activeFilteredTotals.molAnnual)}</strong></div>
                </div>

                <div className="bg-white px-3 py-2 rounded-xl border border-amber-200/80">
                  <div className="flex items-center justify-between text-[10px] font-bold text-amber-900 uppercase">
                    <span>Circolante</span>
                    <Clock className="w-3 h-3 text-amber-700" />
                  </div>
                  <div className="font-black text-amber-800 text-sm mt-0.5">{formatEUR(activeFilteredTotals.workingCapital)}</div>
                  <div className="text-[10px] text-amber-900/80">Fido cons.: <strong>{formatEUR(activeFilteredTotals.creditLine)}</strong></div>
                </div>

                <div className="bg-white px-3 py-2 rounded-xl border border-indigo-200/80">
                  <div className="flex items-center justify-between text-[10px] font-bold text-indigo-900 uppercase">
                    <span>Flotta</span>
                    <Truck className="w-3 h-3 text-indigo-700" />
                  </div>
                  <div className="font-black text-indigo-950 text-sm mt-0.5">
                    {activeFilteredTotals.vehiclesUsedCount} <span className="text-[10px] font-semibold text-slate-500">/ {fleet.length} Mezzi</span>
                    {activeFilteredTotals.trailersUsedCount > 0 && <span className="text-[10px] font-bold text-indigo-700"> • {activeFilteredTotals.trailersUsedCount} Rim.</span>}
                  </div>
                  <div className="text-[10px] text-slate-600 flex justify-between">
                    <span>⚡{activeFilteredTotals.electricVehiclesCount} BEV • 🔥{activeFilteredTotals.biolngVehiclesCount} LNG</span>
                    <span className="font-bold text-indigo-800">{activeFilteredTotals.directCount}D/{activeFilteredTotals.thirdPartyCount}T</span>
                  </div>
                </div>

                <div className="bg-white px-3 py-2 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>Volumi &amp; Poli</span>
                    <span className="text-[#164e87] font-black">{activeFilteredTotals.activeHubsCount} Poli</span>
                  </div>
                  <div className="font-black text-slate-900 text-sm mt-0.5">
                    {activeFilteredTotals.count} <span className="text-[10px] font-semibold text-slate-500">Linee</span> • {activeFilteredTotals.uniqueClientsCount} <span className="text-[10px] font-semibold text-slate-500">Clienti</span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between">
                    <span>{activeFilteredTotals.totalKmDaily.toLocaleString('it-IT')} km/gg</span>
                    {activeFilteredTotals.multiCommessaCount > 0 ? <span className="text-[#164e87] font-bold">{activeFilteredTotals.multiCommessaCount} Multi</span> : <span>{(activeFilteredTotals.totalKmMonthly / 1000).toFixed(1)}k km/m</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barra Filtri Pulita & Ricerca Largo Respiro */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[240px] flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cerca per codice, linea, cliente o tratta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#164e87] outline-none transition"
              />
            </div>

            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tutti i Clienti ({uniqueClients.length})</option>
              {uniqueClients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={managementFilter}
              onChange={(e) => setManagementFilter(e.target.value)}
              className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tutte le Gestioni (D / T)</option>
              <option value="D">Gestione Diretta (D)</option>
              <option value="T">Gestione Terzi (T)</option>
            </select>

            <select
              value={marginFilter}
              onChange={(e) => setMarginFilter(e.target.value)}
              className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tutti i Margini</option>
              <option value="positive">🟢 Margine Sano (≥ 15%)</option>
              <option value="low">🟡 Margine Basso (&lt; 15%)</option>
              <option value="negative">🔴 Margine Negativo</option>
            </select>

            <select
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}
              className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tutti i Contratti ({projects.length})</option>
              <option value="active2026">🟢 Attivi nel 2026 ({contractStats.active})</option>
              <option value="expiring">🟡 In Scadenza (≤ 60gg) ({contractStats.expiring})</option>
              <option value="expired">🔴 Scaduti (&lt; 2026) ({contractStats.expired})</option>
            </select>

            <select
              value={operatingUnitFilter}
              onChange={(e) => setOperatingUnitFilter(e.target.value)}
              className="text-xs font-semibold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tutti i Poli / Unità</option>
              {OPERATING_UNITS.map(hub => (
                <option key={hub} value={hub}>📍 Polo {hub}</option>
              ))}
            </select>

            <div className="flex items-center space-x-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#164e87]" />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  localStorage.setItem('four_projects_sort_by', e.target.value);
                }}
                className="text-xs font-bold py-2 px-3 rounded-xl border border-blue-300 bg-blue-50/60 text-[#164e87] outline-none cursor-pointer"
              >
                <option value="custom">⇅ Ordine Manuale (Drag &amp; Drop)</option>
                <option value="operatingUnit">📍 Raggruppa per Polo</option>
                <option value="client">🏢 Cliente (A-Z)</option>
                <option value="molDesc">💰 M.O.L. Mensile (↓)</option>
                <option value="revenueDesc">📈 Fatturato (↓)</option>
                <option value="marginDesc">🎯 Margine % (↓)</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition whitespace-nowrap"
              >
                ✕ Reset Filtri
              </button>
            )}
          </div>
        </div>

        {/* DETTAGLIO DELLE COMMESSE (APRIBILE IN CASO DI BISOGNO) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div
            onClick={() => setShowProjectsDetailList(!showProjectsDetailList)}
            className="p-4 bg-gradient-to-r from-slate-50 via-white to-blue-50/40 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-blue-50/30 transition"
          >
            <div className="flex items-center space-x-3">
              <span className="p-2 bg-[#164e87] text-white rounded-xl shadow-sm">
                <Briefcase className="w-4 h-4" />
              </span>
              <div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <h3 className="text-sm font-black text-slate-900">
                    Dettaglio Analitico Singole Commesse ({displayProjects.length} linee)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-[#164e87] border border-blue-200">
                    {activeFilteredTotals.totalBillingSlices} Entità Fatturate • {activeFilteredTotals.vehiclesUsedCount} Mezzi
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {showProjectsDetailList
                    ? 'Clicca su una riga per modificare mezzo, tariffe, variazioni o configurare Multi-Commessa (1-4 Clienti). Trascina per riordinare.'
                    : 'Clicca qui per aprire ed esplorare l\'elenco dettagliato di tutte le singole commesse.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowProjectsDetailList(!showProjectsDetailList);
              }}
              className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl font-black text-xs shadow-sm transition ${
                showProjectsDetailList
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  : 'bg-[#164e87] hover:bg-[#0e3a6c] text-white'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>
                {showProjectsDetailList
                  ? 'Chiudi Elenco Commesse'
                  : `Apri Elenco Commesse (${displayProjects.length})`}
              </span>
              {showProjectsDetailList ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          {showProjectsDetailList && (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[980px] divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-[#f0f4f9] text-[#164e87] font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-2 w-[4%] text-center">Pos.</th>
                    <th className="py-3 px-4 w-[28%]">Commessa, Cliente &amp; Stato</th>
                    <th className="py-3 px-3 w-[25%]">Mezzo Assegnato &amp; Risorse</th>
                    <th className="py-3 px-3 w-[19%] text-right">Conto Economico / Mese</th>
                    <th className="py-3 px-3 w-[13%] text-right">Cassa &amp; Termini</th>
                    <th className="py-3 px-3 w-[11%] text-center">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayProjects.map((project, idx) => {
                    const metrics = projectMetricsMap[project.id] || calculateSingleProjectMetrics(
                      project,
                      budgetHorizon !== 'regime' ? { year: Number(budgetHorizon) } : {}
                    );
                    const validity = getContractValidity(project);
                    const startYear = getProjectStartYear(project);
                    const isNegative = metrics.monthlyMol < 0;
                    const isLowMargin = !isNegative && metrics.molPercent < 15;
                    const assignedVeh = fleet.find(v => v.id === project.vehicleId);
                    const assignedTrailer = trailers.find(t => t.id === project.trailerId);
                    const isPot = isFutureProject(project);
                    const hubName = getProjectOperatingUnit(project, assignedVeh);
                    const isRowExpanded = expandedRowDetailId === project.id;

                    return (
                      <Fragment key={project.id}>
                      <tr
                        draggable={sortBy === 'custom'}
                        onDragStart={(e) => handleDragStart(e, project.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, project.id)}
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
                        {/* Colonna Posizione / Riordino Drag & Drop */}
                        <td className="py-3.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {sortBy === 'custom' ? (
                            <div className="flex items-center justify-center space-x-1">
                              <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 cursor-grab active:cursor-grabbing" title="Trascina riga per riordinare" />
                              <div className="flex flex-col text-[8px] leading-tight text-slate-400">
                                <button
                                  type="button"
                                  onClick={() => handleMoveProject(project.id, 'up')}
                                  disabled={idx === 0}
                                  className="hover:text-blue-700 hover:bg-slate-200 px-0.5 rounded disabled:opacity-20"
                                  title="Sposta su"
                                >▲</button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveProject(project.id, 'down')}
                                  disabled={idx === displayProjects.length - 1}
                                  className="hover:text-blue-700 hover:bg-slate-200 px-0.5 rounded disabled:opacity-20"
                                  title="Sposta giù"
                                >▼</button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono font-bold">
                              {idx + 1}
                            </span>
                          )}
                        </td>

                        {/* Colonna 1: Commessa, Cliente & Stato */}
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {/* Riga Superiore: Checkbox + Codice + Unità Operativa + Badge Stato + Tasto Attiva */}
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 mb-1" onClick={(e) => e.stopPropagation()}>
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

                            {/* Unità Operativa / Polo Badge */}
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#164e87] border border-blue-200 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-blue-600" />
                              <span>{hubName}</span>
                            </span>

                            {/* Badge Multi-Commessa (2-4 Clienti con Costi Condivisi) */}
                            {metrics.isMultiClient && (
                              <span
                                className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300 flex items-center gap-1"
                                title={`Costi a fattor comune ribaltati su ${metrics.billingEntities.length} clienti (${COST_ALLOCATION_MODES[project.costAllocationMode]?.shortLabel || 'Condiviso'})`}
                              >
                                <Users className="w-2.5 h-2.5 text-indigo-700" />
                                <span>Multi-Commessa ({metrics.billingEntities.length} Clienti • {COST_ALLOCATION_MODES[project.costAllocationMode]?.shortLabel || 'Riparto'})</span>
                              </span>
                            )}

                             {project.orographyProfile && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                ⛰️ {project.orographyProfile.terrainLabel} (D+ {project.orographyProfile.elevationGainM}m)
                              </span>
                            )}

                            {metrics.hasPriceVariations && metrics.variationSummary && (
                              <span
                                className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 border border-violet-300 flex items-center gap-1"
                                title={`Pre-variazione: ${formatEUR(metrics.variationSummary.beforeMonthlyCost)}/m → Post-variazione: ${formatEUR(metrics.variationSummary.afterMonthlyCost)}/m`}
                              >
                                <Calendar className="w-2.5 h-2.5 text-violet-700" />
                                <span>
                                  Variazione Prezzi dal {metrics.variationSummary.latestEffectiveDateFormatted}
                                </span>
                              </span>
                            )}

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
                                  className="inline-flex items-center space-x-1 text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                                  title="Converti questa trattativa in un contratto vero e operativo a budget"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Converti in Attiva</span>
                                </button>
                              </div>
                            ) : validity.isExpired ? (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1"
                                title={`Contratto scaduto il ${validity.formattedEnd}`}
                              >
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>Scaduto ({validity.formattedEnd})</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleFutureStatus(project.id);
                                }}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 cursor-pointer transition ${
                                  startYear > 2026
                                    ? 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                }`}
                                title="Commessa operativa a budget. Clicca per retrocederla a simulazione."
                              >
                                <CheckCircle2 className={`w-3 h-3 ${startYear > 2026 ? 'text-sky-600' : 'text-emerald-600'}`} />
                                <span>{startYear > 2026 ? `Avvio ${startYear}` : 'Attivo 2026'}</span>
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

                          {/* Breakdown Entità di Fatturazione se Multi-Commessa */}
                          {metrics.isMultiClient && Array.isArray(metrics.billingEntities) && (
                            <div className="mt-2 p-2 bg-indigo-50/50 rounded-xl border border-indigo-200/80 space-y-1">
                              {metrics.billingEntities.map((be, bIdx) => (
                                <div key={be.id || bIdx} className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-mono font-black text-indigo-800 bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                                      {formatPercent(be.costSharePercent)}
                                    </span>
                                    <span className="font-bold text-slate-800">{be.clientName || `Cliente ${bIdx + 1}`}</span>
                                    {be.route && <span className="text-slate-400">({be.route})</span>}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-slate-500">Costo: <strong>{formatEUR(be.allocatedCostMonthly)}/m</strong></span>
                                    <span className="text-[#164e87] font-bold">Ricavo: {formatEUR(be.revenueMonthly)}/m</span>
                                    <span className={`font-black px-1.5 py-0.5 rounded border ${
                                      be.molPercent < 0
                                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                                        : be.molPercent < 15
                                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}>
                                      MOL {formatPercent(be.molPercent)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
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
                              <span className="font-mono text-[11px] font-bold bg-white text-slate-800 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm tracking-wider inline-flex items-center gap-0.5">
                                <span className="text-[9px] text-blue-700 font-black">IT</span> {assignedVeh.plate}
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
                                <span className="font-mono text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded border border-slate-200">
                                  {assignedTrailer.plate}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Tag Operativi + Tasto Cambia Mezzo + Dettaglio Voci */}
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
                              onClick={() => setExpandedRowDetailId(isRowExpanded ? null : project.id)}
                              className="text-slate-700 hover:text-[#164e87] bg-slate-100 hover:bg-blue-50 px-1.5 py-0.5 rounded font-bold text-[10px] border border-slate-200 transition"
                              title="Apri/chiudi scomposizione costi di questa commessa"
                            >
                              {isRowExpanded ? '▲ Chiudi Voci' : '▼ Dettaglio Costi'}
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
                          {metrics.hasPriceVariations && metrics.variationSummary && (
                            <div className="text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 mt-1 inline-block">
                              Pre: {formatEUR(metrics.variationSummary.beforeMonthlyCost)} → Post: {formatEUR(metrics.variationSummary.afterMonthlyCost)}/m
                            </div>
                          )}
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
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-[#164e87] hover:bg-[#0b2440] text-white rounded-lg text-xs font-bold transition shadow-sm"
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
                      {isRowExpanded && (
                        <tr className="bg-slate-50/90" onClick={(e) => e.stopPropagation()}>
                          <td colSpan={6} className="px-6 py-3 border-t border-slate-200">
                            <div className="bg-white rounded-xl border border-slate-200 p-3 text-xs space-y-2 shadow-sm">
                              <div className="font-black text-slate-800 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                                <span>Scomposizione Completa Costi Giornalieri ({formatEUR(metrics.totalCostDaily)}/gg • {formatEUR(metrics.monthlyCost)}/m)</span>
                                <span className="text-[#164e87]">
                                  Ricavo: {formatEUR(metrics.revenueDaily)}/gg • M.O.L.: {formatEUR(metrics.molDaily)}/gg ({formatPercent(metrics.molPercent)})
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px] text-slate-600">
                                {project.managementType !== 'T' && (
                                  <>
                                    <div>Autista: <strong className="text-slate-900">{formatEUR(project.driverCostDaily || 0)}/gg</strong></div>
                                    <div>Energia: <strong className="text-slate-900">{formatEUR(project.energyPayer === 'client' ? 0 : (project.fuelCostDaily || 0))}/gg</strong></div>
                                    <div>Pedaggi: <strong className="text-slate-900">{formatEUR(project.tollsDaily || 0)}/gg</strong></div>
                                    <div>Pneumatici: <strong className="text-slate-900">{formatEUR(project.tiresDaily || 0)}/gg</strong></div>
                                    <div>Nolo Mezzo: <strong className="text-slate-900">{formatEUR(project.vehicleLeaseDaily || 0)}/gg</strong></div>
                                  </>
                                )}
                                <div>Nolo Rimorchio: <strong className="text-slate-900">{formatEUR(project.trailerLeaseDaily || 0)}/gg</strong></div>
                                {(Number(project.refrigerationCostDaily) || 0) > 0 && (
                                  <div>Frigo: <strong className="text-cyan-800">{formatEUR(project.refrigerationCostDaily)}/gg</strong></div>
                                )}
                                {(Number(project.telematicsCostDaily) || 0) > 0 && (
                                  <div>Telematica: <strong className="text-indigo-700">{formatEUR(project.telematicsCostDaily)}/gg</strong></div>
                                )}
                                {(Number(project.washingCostDaily) || 0) > 0 && (
                                  <div>Lavaggi: <strong className="text-indigo-700">{formatEUR(project.washingCostDaily)}/gg</strong></div>
                                )}
                                {(Number(project.extraCostDaily) || 0) > 0 && (
                                  <div>Extra: <strong className="text-indigo-700">{formatEUR(project.extraCostDaily)}/gg</strong></div>
                                )}
                                {(Number(project.porterageDaily) || 0) > 0 && (
                                  <div>Facchinaggio: <strong className="text-purple-800">{formatEUR(project.porterageDaily)}/gg</strong></div>
                                )}
                                {(Number(project.partnerMarginDaily) || 0) > 0 && (
                                  <div>Partner/Terzi: <strong className="text-blue-900">{formatEUR(project.partnerMarginDaily)}/gg</strong></div>
                                )}
                                {(Number(project.otherCostsDaily) || 0) > 0 && (
                                  <div>Altre Spese: <strong className="text-slate-900">{formatEUR(project.otherCostsDaily)}/gg</strong></div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Modifica/Crea Commessa a 4 Tab + Footer Live Sticky */}
        {showModal && (
          <div
            onClick={handleCloseModal}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden"
            >
              {/* Top Modal Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50/70">
                <div className="flex items-center space-x-2">
                  {formData.contractStatus === 'potential' ? (
                    <Sparkles className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Briefcase className="w-5 h-5 text-[#164e87]" />
                  )}
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingProject
                      ? (formData.contractStatus === 'potential' ? 'Modifica Trattativa / Simulazione' : 'Modifica Commessa di Budget')
                      : (formData.contractStatus === 'potential' ? 'Nuova Trattativa / Simulazione' : 'Crea Nuova Commessa & Budget')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigazione 4 Tab */}
              <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: 'general', label: '1. Anagrafica & Clienti' },
                  { id: 'costs', label: '2. Mezzo & Costi' },
                  {
                    id: 'variations',
                    label: `3. Variazioni Prezzi${((formData.costVariations?.length || 0) + (formData.vehicleLeaseVariations?.length || 0) + (formData.trailerLeaseVariations?.length || 0)) > 0 ? ` (${(formData.costVariations?.length || 0) + (formData.vehicleLeaseVariations?.length || 0) + (formData.trailerLeaseVariations?.length || 0)})` : ''}`
                  },
                  { id: 'terms', label: '4. Pagamenti & Cassa' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setModalTab(t.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      modalTab === t.id
                        ? 'bg-[#164e87] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSaveProject} noValidate className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                  {modalFormError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{modalFormError}</span>
                    </div>
                  )}

                  {modalTab === 'general' && (
                    <div className="space-y-4">
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
                {/* Dati Generali & Sistema Multi-Commessa (1-4 Clienti con Costi a Fattor Comune) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className={formData.isMultiClient ? 'md:col-span-3' : 'md:col-span-2'}>
                    <label className="block font-semibold text-slate-700 mb-1">Nome / Descrizione Linea *</label>
                    <input
                      type="text"
                      required
                      placeholder="Es. Bilico Elettrico 33 plt x Decathlon BO (o Giro Condiviso Multi-Cliente)"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>
                  {!formData.isMultiClient && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Cliente *</label>
                      <input
                        type="text"
                        required={!formData.isMultiClient}
                        placeholder="Es. Decathlon Italia"
                        value={formData.client}
                        onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}
                </div>

                {/* BOX SISTEMA MULTI-COMMESSA: DA 1 A 4 CLIENTI CON COSTI A FATTOR COMUNE */}
                <div className="p-4 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 rounded-xl border border-blue-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-[#164e87]" />
                      <span className="font-extrabold text-[#164e87] text-xs uppercase tracking-wider">
                        Sistema Multi-Commessa (1 - 4 Clienti con Costi a Fattor Comune)
                      </span>
                    </div>
                    <div className="inline-flex rounded-xl bg-white p-1 border border-blue-200 gap-1">
                      {[1, 2, 3, 4].map(n => {
                        const activeCount = formData.isMultiClient ? (formData.billingEntities?.length || 2) : 1;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleModalClientCountChange(n)}
                            className={`px-2.5 py-1 rounded-lg font-black text-xs transition ${
                              activeCount === n
                                ? 'bg-[#164e87] text-white shadow-sm'
                                : 'text-slate-600 hover:bg-blue-50'
                            }`}
                          >
                            {n === 1 ? '1 Cliente (Singola)' : `${n} Clienti`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {formData.isMultiClient && Array.isArray(formData.billingEntities) && (
                    <div className="space-y-3 pt-2 border-t border-blue-200/70">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                        <div>
                          <label className="block font-bold text-[#164e87] mb-1">
                            Modello di Ribaltamento Costi Comuni ({formatEUR(liveModalMetrics.totalCostDaily)}/gg)
                          </label>
                          <select
                            value={formData.costAllocationMode || 'equal'}
                            onChange={(e) => handleModalAllocationModeChange(e.target.value)}
                            className="w-full px-3 py-2 border border-blue-300 rounded-xl bg-white font-bold text-slate-800 text-xs"
                          >
                            {Object.values(COST_ALLOCATION_MODES).map(mode => (
                              <option key={mode.id} value={mode.id}>{mode.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="text-[11px] text-slate-600 bg-white/80 p-2.5 rounded-xl border border-blue-200">
                          <div className="font-bold text-slate-800 mb-0.5">
                            {COST_ALLOCATION_MODES[formData.costAllocationMode || 'equal']?.shortLabel}:
                          </div>
                          <div>{COST_ALLOCATION_MODES[formData.costAllocationMode || 'equal']?.description}</div>
                          {formData.costAllocationMode === 'manual_percent' && (
                            <div className="mt-1 flex items-center justify-between">
                              <span className={`font-black ${Math.abs((liveModalMetrics.multiAllocation?.totalSharePercent || 100) - 100) > 0.1 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                Somma quote attuali: {formatPercent(liveModalMetrics.multiAllocation?.totalSharePercent || 100)}
                              </span>
                              <button
                                type="button"
                                onClick={handleModalNormalizeShares}
                                className="px-2 py-0.5 bg-[#164e87] text-white rounded font-bold text-[10px]"
                              >
                                Normalizza a 100%
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tabella Entità di Fatturazione Separate (Tariffa Attiva & Marginalità per Cliente) */}
                      <div className="space-y-2">
                        {(liveModalMetrics.billingEntities || formData.billingEntities).map((entity, idx) => (
                          <div key={entity.id || idx} className="p-3 bg-white rounded-xl border border-blue-200 shadow-sm space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                              <div className="flex items-center space-x-2">
                                <span className="px-2 py-0.5 rounded bg-[#164e87] text-white font-black text-[10px]">
                                  Entità Fatturazione #{idx + 1}
                                </span>
                                <span className="text-[11px] font-bold text-slate-600">
                                  Quota Costo Ribaltata: <strong className="text-slate-900">{formatEUR(entity.allocatedCostDaily)}/gg</strong> ({formatEUR(entity.allocatedCostMonthly)}/m • {formatPercent(entity.costSharePercent)})
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="flex items-center space-x-1">
                                  <span className="text-[10px] text-slate-500 font-semibold">Incasso DSO:</span>
                                  <select
                                    value={formData.billingEntities[idx]?.paymentTermsClient ?? formData.paymentTermsClient ?? 60}
                                    onChange={(e) => handleModalUpdateBillingEntity(idx, { paymentTermsClient: parseInt(e.target.value, 10) })}
                                    className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px] font-bold bg-slate-50"
                                  >
                                    <option value="0">0 gg</option>
                                    <option value="30">30 gg</option>
                                    <option value="60">60 gg</option>
                                    <option value="90">90 gg</option>
                                    <option value="120">120 gg</option>
                                  </select>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                  entity.molPercent < 0
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : entity.molPercent < 15
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                }`}>
                                  M.O.L.: {formatEUR(entity.molDaily)}/gg ({formatEUR(entity.molMonthly)}/m • {formatPercent(entity.molPercent)})
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2">
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Cliente / Ragione Sociale *</label>
                                <input
                                  type="text"
                                  required
                                  placeholder={`Cliente ${idx + 1}`}
                                  value={formData.billingEntities[idx]?.clientName || ''}
                                  onChange={(e) => handleModalUpdateBillingEntity(idx, { clientName: e.target.value })}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold text-xs"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Sub-Tratta / Note</label>
                                <input
                                  type="text"
                                  placeholder="Tratta o Pallets"
                                  value={formData.billingEntities[idx]?.route || ''}
                                  onChange={(e) => handleModalUpdateBillingEntity(idx, { route: e.target.value })}
                                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                                />
                              </div>

                              {formData.costAllocationMode === 'proportional_metric' ? (
                                <div>
                                  <label className="block text-[10px] font-bold text-blue-800 mb-0.5">Km / Pallets / Quota</label>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={formData.billingEntities[idx]?.driverMetric ?? 100}
                                    onChange={(e) => handleModalUpdateBillingEntity(idx, { driverMetric: parseFloat(e.target.value) || 0 })}
                                    className="w-full px-2 py-1.5 border border-blue-400 bg-blue-50/50 rounded-lg font-black text-blue-950 text-xs"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5 flex items-center justify-between">
                                    <span>% Costo Ribaltato</span>
                                    {formData.costAllocationMode === 'manual_percent' && (
                                      <span className="text-[9px] text-blue-700 font-bold" title="Modificando una quota, le altre si bilanciano automaticamente a 100%">
                                        Auto 100%
                                      </span>
                                    )}
                                  </label>
                                  <div className="flex items-center space-x-1">
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      max="100"
                                      disabled={formData.costAllocationMode !== 'manual_percent'}
                                      value={formData.costAllocationMode === 'manual_percent' ? (formData.billingEntities[idx]?.costSharePercent ?? 0) : entity.costSharePercent}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                          handleModalUpdateBillingEntity(idx, { costSharePercent: '' });
                                        } else {
                                          const raw = parseFloat(val);
                                          if (!isNaN(raw)) {
                                            handleModalUpdateBillingEntity(idx, { costSharePercent: Math.min(100, Math.max(0, raw)) });
                                          }
                                        }
                                      }}
                                      onBlur={() => handleModalShareBlur(idx)}
                                      className={`w-full px-2 py-1.5 border rounded-lg font-black text-xs ${
                                        formData.costAllocationMode === 'manual_percent'
                                          ? 'border-blue-400 bg-white text-slate-900'
                                          : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                                      }`}
                                    />
                                    <span className="text-[10px] font-bold text-slate-500">%</span>
                                  </div>
                                </div>
                              )}

                              <div>
                                <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">Tariffa Attiva (€/gg) *</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={formData.billingEntities[idx]?.pricingMode === 'revenue' ? (formData.billingEntities[idx]?.revenueDaily ?? entity.revenueDaily) : entity.revenueDaily}
                                  onChange={(e) => {
                                    const rev = parseFloat(e.target.value) || 0;
                                    const alloc = entity.allocatedCostDaily;
                                    const mPct = rev > 0 ? +(((rev - alloc) / rev) * 100).toFixed(2) : (alloc > 0 ? -100 : 0);
                                    handleModalUpdateBillingEntity(idx, {
                                      pricingMode: 'revenue',
                                      revenueDaily: rev,
                                      targetMarginPercent: mPct
                                    });
                                  }}
                                  className="w-full px-2 py-1.5 border border-emerald-500 bg-emerald-50 rounded-lg font-black text-emerald-900 text-xs"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Margine Cliente (%)</label>
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number"
                                    step="any"
                                    value={formData.billingEntities[idx]?.pricingMode === 'margin' ? (formData.billingEntities[idx]?.targetMarginPercent ?? entity.molPercent) : entity.molPercent}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const mPct = raw === '' ? 0 : parseFloat(raw);
                                      const alloc = entity.allocatedCostDaily;
                                      const rev = !isNaN(mPct) && mPct < 100 ? +(alloc / (1 - (mPct / 100))).toFixed(2) : +(alloc * 1.25).toFixed(2);
                                      handleModalUpdateBillingEntity(idx, {
                                        pricingMode: 'margin',
                                        targetMarginPercent: isNaN(mPct) ? 0 : mPct,
                                        revenueDaily: rev
                                      });
                                    }}
                                    className={`w-full px-2 py-1.5 border rounded-lg font-black text-xs ${
                                      entity.molPercent < 0
                                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                                        : 'border-emerald-400 bg-white text-emerald-800'
                                    }`}
                                  />
                                  <span className="text-[10px] font-bold text-slate-500">%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tratta / Punti di Carico &amp; Scarico</label>
                    <input
                      type="text"
                      placeholder="Es. Interporto BO - Negozi Decathlon Centro-Nord"
                      value={formData.route}
                      onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Unità Operativa (Polo Logistico)</span>
                      <span className="text-[10px] text-slate-400 font-normal">Arborio, Buccinasco, Landriano, Caorso, Bologna</span>
                    </label>
                    <select
                      value={formData.operatingUnit || 'auto'}
                      onChange={(e) => setFormData({ ...formData, operatingUnit: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="auto">⚡ Rilevamento Automatico (da Mezzo o Tratta)</option>
                      {OPERATING_UNITS.map(hub => (
                        <option key={hub} value={hub}>📍 Polo di {hub}</option>
                      ))}
                      <option value="Altro / Sede">🏢 Altro / Sede Centrale</option>
                    </select>
                  </div>
                </div>

                {/* CALCOLATORE AUTOMATICO KM, AUTOSTRADA, PEDAGGI & OROGRAFIA CONSUMI DA TAPPE IN REALIZZAZIONE COMMESSA */}
                <div className="p-3.5 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 rounded-xl border border-emerald-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5">
                      <Navigation className="w-4 h-4 text-emerald-700" />
                      <span className="font-extrabold text-emerald-950 text-xs uppercase tracking-wider">
                        Calcolo Automatico Km, Autostrada, Pedaggi &amp; Orografia da Tappe
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {formData.sourceSimulationCode && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-[#164e87] border border-blue-300">
                          Da Preventivo {formData.sourceSimulationCode}
                        </span>
                      )}
                      {formData.orographyProfile && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ⛰️ {formData.orographyProfile.terrainLabel} (D+ {formData.orographyProfile.elevationGainM}m • Consumi {formData.orographicMultiplier || 1}x)
                        </span>
                      )}
                    </div>
                  </div>

                  <datalist id="modal-known-hubs-list">
                    {KNOWN_LOGISTICS_HUBS.map(h => (
                      <option key={h.name} value={h.name} />
                    ))}
                  </datalist>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Array.isArray(formData.routeStops) && formData.routeStops.length >= 2
                      ? formData.routeStops
                      : [{ id: 's1', address: 'Bologna Interporto (Bentivoglio)' }, { id: 's2', address: '' }]
                    ).map((st, sIdx, arr) => (
                      <div key={st.id || sIdx} className="flex items-center space-x-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-700 text-white font-black text-[10px] flex items-center justify-center flex-shrink-0">
                          {sIdx + 1}
                        </span>
                        <input
                          type="text"
                          list="modal-known-hubs-list"
                          placeholder={sIdx === 0 ? 'Partenza / Hub Carico' : `Tappa / Scarico #${sIdx}`}
                          value={st.address}
                          onChange={(e) => {
                            const nextStops = arr.map((item, i) => (i === sIdx ? { ...item, address: e.target.value } : item));
                            setFormData({ ...formData, routeStops: nextStops });
                          }}
                          className="w-full px-2.5 py-1.5 border border-emerald-300 rounded-lg bg-white font-semibold text-xs"
                        />
                        {arr.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, routeStops: arr.filter((_, i) => i !== sIdx) })}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          const cur = Array.isArray(formData.routeStops) && formData.routeStops.length >= 2
                            ? formData.routeStops
                            : [{ id: 's1', address: 'Bologna Interporto (Bentivoglio)' }, { id: 's2', address: '' }];
                          if (cur.length >= 8) return;
                          setFormData({ ...formData, routeStops: [...cur, { id: 's_' + Date.now(), address: '' }] });
                        }}
                        className="text-[11px] font-bold text-[#164e87] hover:underline"
                      >
                        + Aggiungi Tappa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = Array.isArray(formData.routeStops) && formData.routeStops.length >= 2
                            ? formData.routeStops
                            : [{ id: 's1', address: 'Bologna Interporto (Bentivoglio)' }, { id: 's2', address: '' }];
                          const startAddr = (cur[0]?.address || '').trim();
                          if (cur.length >= 8 || !startAddr) return;
                          setFormData({ ...formData, routeStops: [...cur, { id: 's_' + Date.now(), address: startAddr }] });
                        }}
                        disabled={(Array.isArray(formData.routeStops) ? formData.routeStops.length : 2) >= 8 || !((formData.routeStops?.[0]?.address) || '').trim()}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold transition disabled:opacity-40"
                        title="Inserisce una tappa intermedia uguale alla Partenza (es. per secondo viaggio dall'Hub)"
                      >
                        + Rientro a Partenza
                      </button>
                      <label className="inline-flex items-center space-x-1.5 text-[11px] font-bold text-emerald-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isRoundTrip !== false}
                          onChange={(e) => setFormData({ ...formData, isRoundTrip: e.target.checked })}
                          className="rounded text-emerald-600"
                        />
                        <span>Rientro finale alla Partenza (Tappa 1)</span>
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={handleModalCalculateRouteFromStops}
                      disabled={modalRouteCalculating}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white rounded-lg font-black text-xs shadow-sm transition flex items-center space-x-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{modalRouteCalculating ? 'Calcolo API in corso...' : 'Calcola Km, Pedaggi & Consumi Orografici'}</span>
                    </button>
                  </div>

                  {(() => {
                    const curStops = Array.isArray(formData.routeStops) && formData.routeStops.length >= 2
                      ? formData.routeStops
                      : [{ id: 's1', address: 'Bologna Interporto (Bentivoglio)' }, { id: 's2', address: '' }];
                    const filledStops = curStops.map(s => (s.address || '').trim()).filter(Boolean);
                    const firstStop = filledStops[0] || '';
                    const lastStop = filledStops[filledStops.length - 1] || '';
                    const isRT = formData.isRoundTrip !== false;
                    const needsClosingReturn = Boolean(isRT && filledStops.length >= 2 && lastStop.toLowerCase() !== firstStop.toLowerCase());
                    const shortName = (addr) => addr.split(',')[0].trim();

                    return (
                      <div className="bg-white/80 border border-emerald-200 rounded-lg p-2 text-[10px] text-slate-600 space-y-1">
                        {filledStops.length >= 2 && (
                          <div className="flex flex-wrap items-center gap-1 font-bold text-slate-800">
                            <span className="text-slate-500 uppercase mr-1">Percorso calcolato:</span>
                            {filledStops.map((addr, i) => (
                              <span key={`${addr}-${i}`} className="inline-flex items-center gap-1">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">{i + 1}. {shortName(addr)}</span>
                                {(i < filledStops.length - 1 || needsClosingReturn) && <span className="text-emerald-600">→</span>}
                              </span>
                            ))}
                            {needsClosingReturn && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                                {shortName(firstStop)} (rientro finale)
                              </span>
                            )}
                          </div>
                        )}
                        <div>
                          Inserisci le tappe in <strong>ordine sequenziale</strong> (es. <code className="bg-slate-100 px-1 rounded">Basiano → Corsico → Basiano → Rozzano</code>). La spunta aggiunge <strong>solo il rientro finale</strong> verso la Tappa 1, senza raddoppiare ogni tappa.
                        </div>
                      </div>
                    );
                  })()}

                  {modalRouteError && (
                    <div className="text-[11px] text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                      ⚠️ {modalRouteError}
                    </div>
                  )}
                </div>

                {/* Selezione Mezzo dalla Flotta & Tipologia Gestione */}
                    </div>
                  )}

                  {modalTab === 'costs' && (
                    <div className="space-y-4">
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
                      onChange={(e) => {
                        const raw = e.target.value;
                        setFormData({ ...formData, operatingMonths: raw === '' ? '' : (parseInt(raw, 10) || '') });
                      }}
                      onBlur={() => {
                        const parsed = parseInt(formData.operatingMonths, 10);
                        setFormData(prev => ({
                          ...prev,
                          operatingMonths: Number.isFinite(parsed) && parsed >= 1 ? Math.min(120, parsed) : 36
                        }));
                      }}
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
                              ? 'bg-[#164e87] text-white shadow-sm'
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
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setFormData({ ...formData, workingDaysMonth: '' });
                        } else {
                          const parsed = parseInt(raw, 10);
                          if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
                            handleWorkingDaysChange(parsed);
                          } else {
                            setFormData({ ...formData, workingDaysMonth: raw });
                          }
                        }
                      }}
                      onBlur={() => {
                        const parsed = parseInt(formData.workingDaysMonth, 10);
                        const safeDays = Number.isFinite(parsed) && parsed >= 1 && parsed <= 31 ? parsed : 22;
                        if (safeDays !== formData.workingDaysMonth) {
                          handleWorkingDaysChange(safeDays);
                        }
                      }}
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

                  {/* Parametri Tratta Stradali & Orografici */}
                  <div className="col-span-2 md:col-span-4 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/90 border border-slate-200 rounded-xl p-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">% Percorrenza Autostrada</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.highwayPercent ?? 65}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          const val = isNaN(raw) ? 0 : Math.min(100, Math.max(0, raw));
                          setFormData(applyAutoRecalculation({ highwayPercent: val }));
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Tariffa Pedaggio (€/km autostr.)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.tollRate ?? 0.12}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          const val = isNaN(raw) ? 0 : Math.max(0, raw);
                          setFormData(applyAutoRecalculation({ tollRate: val }));
                        }}
                        className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg bg-white font-bold text-[#164e87] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Fattore Orografia Consumi (x)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.7"
                        max="2.5"
                        value={formData.orographicMultiplier ?? 1.0}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value);
                          const val = isNaN(raw) || raw <= 0 ? 1.0 : raw;
                          setFormData(applyAutoRecalculation({ orographicMultiplier: val }));
                        }}
                        className="w-full px-2.5 py-1.5 border border-emerald-300 rounded-lg bg-white font-bold text-emerald-900 text-xs"
                      />
                    </div>
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
                        {formData.isMultiClient ? (
                          <div className="md:col-span-3 p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div>
                              <span className="font-black text-[#164e87] block">
                                Fatturazione Aggregata Multi-Commessa ({formData.billingEntities?.length || 2} Clienti):
                              </span>
                              <span className="text-[10px] text-slate-600">
                                Le tariffe attive e le marginalità sono gestite separatamente per ciascun cliente nel Tab 1 (Anagrafica &amp; Clienti).
                              </span>
                            </div>
                            <div className="flex items-center space-x-3">
                              <span className="font-bold text-slate-700">
                                Costo Comune: <strong>{formatEUR(liveModalMetrics.totalCostDaily)}/gg</strong>
                              </span>
                              <span className="font-black text-[#164e87]">
                                Ricavo Tot.: {formatEUR(liveModalMetrics.revenueDaily)}/gg
                              </span>
                              <span className="px-2 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                M.O.L. {formatEUR(liveModalMetrics.molDaily)}/gg ({formatPercent(liveModalMetrics.molPercent)})
                              </span>
                            </div>
                          </div>
                        ) : (
                        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-emerald-900 mb-0.5">Ricavo Giornaliero Riconosciuto da Cliente (€/gg) *</label>
                            <input
                              type="number"
                              step="any"
                              value={formData.revenueDaily}
                              onChange={(e) => {
                                const rev = parseFloat(e.target.value) || 0;
                                const cost = liveModalMetrics.totalCostDaily;
                                const margin = rev > 0 ? +(((rev - cost) / rev) * 100).toFixed(2) : (rev === 0 ? -100 : 0);
                                setFormData({ ...formData, revenueDaily: rev, targetMarginPercent: margin });
                              }}
                              className="w-full px-3 py-1.5 border border-emerald-500 rounded-lg font-black text-emerald-800 bg-emerald-50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-800 mb-0.5 flex items-center justify-between">
                              <span>Margine M.O.L. (%)</span>
                              <span className={`text-[10px] font-bold ${liveModalMetrics.molPercent < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {liveModalMetrics.molPercent < 0 ? 'In Perdita' : 'sul Ricavo'}
                              </span>
                            </label>
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                step="any"
                                value={formData.targetMarginPercent !== undefined ? formData.targetMarginPercent : +liveModalMetrics.molPercent.toFixed(2)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const margin = val === '' ? 0 : parseFloat(val);
                                  const cost = liveModalMetrics.totalCostDaily;
                                  const rev = !isNaN(margin) && margin < 100 ? +(cost / (1 - (margin / 100))).toFixed(2) : cost * 1.2;
                                  setFormData({ ...formData, targetMarginPercent: isNaN(margin) ? 0 : margin, revenueDaily: rev });
                                }}
                                className={`w-full px-2 py-1.5 border rounded-lg font-black text-xs ${
                                  (formData.targetMarginPercent || 0) < 0
                                    ? 'border-rose-400 text-rose-700 bg-rose-50'
                                    : 'border-emerald-400 text-emerald-800 bg-white'
                                }`}
                              />
                              <span className={`font-bold text-xs ${
                                (formData.targetMarginPercent || 0) < 0 ? 'text-rose-600' : 'text-emerald-800'
                              }`}>%</span>
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
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                                    Math.round(formData.targetMarginPercent ?? liveModalMetrics.molPercent) === pct
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  }`}
                                >
                                  {pct}%{pct === 21 ? ' (Std)' : ''}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        )}
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
                            <option value="elettrico">
                              Frigo Elettrico ({settings?.refrigerationParams?.elettrico?.unitCost ?? 0.35} €/kWh • {settings?.refrigerationParams?.elettrico?.hourlyConsumption ?? 8} kWh/h)
                            </option>
                            <option value="azoto">
                              Azoto Liquido ({settings?.refrigerationParams?.azoto?.unitCost ?? 0.13} €/kg • {settings?.refrigerationParams?.azoto?.hourlyConsumption ?? 30} kg/h)
                            </option>
                            <option value="gasolio">
                              Gasolio Frigo ({settings?.refrigerationParams?.gasolio?.unitCost ?? 1.8} €/L • {settings?.refrigerationParams?.gasolio?.hourlyConsumption ?? 3} L/h)
                            </option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">
                            Costo Unitario (€/{formData.refrigerationTech === 'azoto' ? 'kg' : formData.refrigerationTech === 'elettrico' ? 'kWh' : 'L'})
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
                            Consumo Orario ({formData.refrigerationTech === 'azoto' ? 'kg/h' : formData.refrigerationTech === 'elettrico' ? 'kWh/h' : 'L/h'})
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
                          <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">Ore Frigo / Giorno (h)</label>
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

                  {/* FINE TAB COSTI -> SPOSTIAMO RICAVO & MARGINALITÀ QUI DENTRO E SEPARIAMO VARIAZIONI PREZZI IN TAB 3 */}
                  {formData.managementType !== 'T' && (
                    <div className="pt-2 border-t border-slate-200 space-y-1.5">
                      {formData.isMultiClient ? (
                        <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="font-black text-[#164e87] block">
                              Fatturazione Aggregata Multi-Commessa ({formData.billingEntities?.length || 2} Clienti):
                            </span>
                            <span className="text-[10px] text-slate-600">
                              Le tariffe attive e le marginalità sono gestite separatamente per ciascun cliente nel Tab 1 (Anagrafica &amp; Clienti).
                            </span>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="font-bold text-slate-700">
                              Costo Comune: <strong>{formatEUR(liveModalMetrics.totalCostDaily)}/gg</strong>
                            </span>
                            <span className="font-black text-[#164e87]">
                              Ricavo Tot.: {formatEUR(liveModalMetrics.revenueDaily)}/gg
                            </span>
                            <span className="px-2 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              M.O.L. {formatEUR(liveModalMetrics.molDaily)}/gg ({formatPercent(liveModalMetrics.molPercent)})
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block font-bold text-slate-900 mb-0.5">Ricavo Giornaliero (€/gg) *</label>
                              <input
                                type="number"
                                step="any"
                                value={formData.revenueDaily}
                                onChange={(e) => {
                                  const rev = parseFloat(e.target.value) || 0;
                                  const cost = liveModalMetrics.totalCostDaily;
                                  const margin = rev > 0 ? +(((rev - cost) / rev) * 100).toFixed(2) : (rev === 0 ? -100 : 0);
                                  setFormData({ ...formData, revenueDaily: rev, targetMarginPercent: margin });
                                }}
                                className="w-full px-3 py-2 border border-emerald-500 rounded-lg font-black text-emerald-800 bg-emerald-50 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-900 mb-0.5 flex items-center justify-between">
                                <span>Margine M.O.L. (%)</span>
                                <span className={`text-[10px] font-bold ${liveModalMetrics.molPercent < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                  {liveModalMetrics.molPercent < 0 ? 'In Perdita' : 'sul Ricavo'}
                                </span>
                              </label>
                              <div className="flex items-center space-x-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={formData.targetMarginPercent !== undefined ? formData.targetMarginPercent : +liveModalMetrics.molPercent.toFixed(2)}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const margin = val === '' ? 0 : parseFloat(val);
                                    const cost = liveModalMetrics.totalCostDaily;
                                    const rev = !isNaN(margin) && margin < 100 ? +(cost / (1 - (margin / 100))).toFixed(2) : cost * 1.2;
                                    setFormData({ ...formData, targetMarginPercent: isNaN(margin) ? 0 : margin, revenueDaily: rev });
                                  }}
                                  className={`w-full px-3 py-2 border rounded-lg font-black text-sm ${
                                    (formData.targetMarginPercent || 0) < 0
                                      ? 'border-rose-400 text-rose-700 bg-rose-50'
                                      : 'border-emerald-400 text-emerald-800 bg-white'
                                  }`}
                                />
                                <span className={`font-bold text-sm ${
                                  (formData.targetMarginPercent || 0) < 0 ? 'text-rose-600' : 'text-emerald-800'
                                }`}>%</span>
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
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                                      Math.round(formData.targetMarginPercent ?? liveModalMetrics.molPercent) === pct
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                    }`}
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
                        </>
                      )}
                    </div>
                  )}
                </div>
                    </div>
                  )}

                  {modalTab === 'variations' && (
                    <div className="space-y-4">
                  {/* SEZIONE VARIAZIONI PREZZI / COSTI & NOLI A PARTIRE DA UNA DATA (Ricalcolo Dinamico per Decorrenza) */}
                  <div className="p-4 bg-violet-50/70 rounded-xl border border-violet-200 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-violet-950 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-violet-700" />
                        <span>Variazioni Prezzi / Costi &amp; Noli Mezzi a partire da una Data</span>
                      </span>
                      <span className="text-[10px] text-violet-900 font-bold bg-white px-2.5 py-0.5 rounded-full border border-violet-200">
                        Ricalcolo Pro-Rata per Mese &amp; Media Ponderata Annua
                      </span>
                    </div>

                    {/* Variazioni Canone Nolo ereditate automaticamente da Anagrafica Flotta (Mezzo / Rimorchio) */}
                    {((Array.isArray(formData.vehicleLeaseVariations) && formData.vehicleLeaseVariations.length > 0) ||
                      (Array.isArray(formData.trailerLeaseVariations) && formData.trailerLeaseVariations.length > 0)) && (
                      <div className="p-2.5 bg-white rounded-xl border border-violet-200 space-y-1">
                        <div className="text-[10px] font-black text-violet-900 uppercase">
                          🚛 Variazioni Canone Nolo Ereditate da Anagrafica Flotta:
                        </div>
                        {(formData.vehicleLeaseVariations || []).map((vVar, idx) => (
                          <div key={vVar.id || `v_${idx}`} className="flex items-center justify-between text-[11px] text-slate-700">
                            <span>
                              <strong>Nolo Mezzo Motore</strong> — Valido dal <strong className="text-violet-900">{formatVariationDate(vVar.effectiveDate)}</strong>
                              {vVar.note ? ` (${vVar.note})` : ''}
                            </span>
                            <span className="font-mono font-black text-violet-950">
                              {vVar.previousMonthlyLease !== undefined ? `${formatEUR(vVar.previousMonthlyLease)}/m → ` : ''}
                              {formatEUR(vVar.monthlyLease ?? vVar.newValue)}/m
                            </span>
                          </div>
                        ))}
                        {(formData.trailerLeaseVariations || []).map((tVar, idx) => (
                          <div key={tVar.id || `t_${idx}`} className="flex items-center justify-between text-[11px] text-slate-700">
                            <span>
                              <strong>Nolo Semirimorchio</strong> — Valido dal <strong className="text-violet-900">{formatVariationDate(tVar.effectiveDate)}</strong>
                              {tVar.note ? ` (${tVar.note})` : ''}
                            </span>
                            <span className="font-mono font-black text-violet-950">
                              {tVar.previousMonthlyLease !== undefined ? `${formatEUR(tVar.previousMonthlyLease)}/m → ` : ''}
                              {formatEUR(tVar.monthlyLease ?? tVar.newValue)}/m
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Elenco Variazioni Specifiche registrate sulla Commessa */}
                    {Array.isArray(formData.costVariations) && formData.costVariations.length > 0 && (
                      <div className="space-y-1.5">
                        {formData.costVariations.map((cv, cIdx) => {
                          const targetMeta = COST_VARIATION_TARGETS[cv.targetField] || { label: cv.targetField, unit: '€' };
                          return (
                            <div key={cv.id || cIdx} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-violet-200 text-[11px]">
                              <div>
                                <span className="font-black text-violet-900">Dal {formatVariationDate(cv.effectiveDate)}</span>
                                <span className="mx-1.5 text-slate-400">•</span>
                                <strong className="text-slate-800">{targetMeta.label}:</strong>{' '}
                                <span className="font-mono text-slate-600">
                                  {cv.previousValue !== undefined && cv.previousValue !== '' ? `${formatEUR(cv.previousValue)} → ` : ''}
                                  <strong className="text-violet-950">{formatEUR(cv.newValue)} ({targetMeta.unit})</strong>
                                </span>
                                {cv.note && <span className="text-slate-400 ml-1.5">({cv.note})</span>}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVars = (formData.costVariations || []).filter((_, i) => i !== cIdx);
                                  setFormData({ ...formData, costVariations: nextVars });
                                }}
                                className="text-rose-500 hover:text-rose-700 p-1"
                                title="Elimina variazione"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Form Inserimento Nuova Variazione Prezzo/Costo da Data */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white p-2.5 rounded-xl border border-violet-200/80">
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Voce soggetta a Variazione</label>
                        <select
                          value={newVariationDraft.targetField}
                          onChange={(e) => {
                            const tf = e.target.value;
                            const wDays = Number(formData.workingDaysMonth) || 22;
                            let currentVal = 0;
                            if (tf === 'vehicleLeaseMonthly') currentVal = +((Number(formData.vehicleLeaseDaily) || 0) * wDays).toFixed(2);
                            else if (tf === 'trailerLeaseMonthly') currentVal = +((Number(formData.trailerLeaseDaily) || 0) * wDays).toFixed(2);
                            else currentVal = Number(formData[tf]) || 0;
                            setNewVariationDraft(prev => ({
                              ...prev,
                              targetField: tf,
                              previousValue: currentVal,
                              newValue: currentVal
                            }));
                          }}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-bold"
                        >
                          {Object.values(COST_VARIATION_TARGETS)
                            .filter(t => !(formData.isMultiClient && t.id === 'revenueDaily'))
                            .map(t => (
                              <option key={t.id} value={t.id}>{t.label} ({t.unit})</option>
                            ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Valido dal *</label>
                        <input
                          type="date"
                          value={newVariationDraft.effectiveDate}
                          onChange={(e) => setNewVariationDraft(prev => ({ ...prev, effectiveDate: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-violet-300 rounded-lg bg-violet-50/40 text-xs font-bold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Valore Prima</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="Prima"
                          value={
                            newVariationDraft.previousValue !== ''
                              ? newVariationDraft.previousValue
                              : newVariationDraft.targetField === 'vehicleLeaseMonthly'
                                ? +((Number(formData.vehicleLeaseDaily) || 0) * (Number(formData.workingDaysMonth) || 22)).toFixed(0)
                                : newVariationDraft.targetField === 'trailerLeaseMonthly'
                                  ? +((Number(formData.trailerLeaseDaily) || 0) * (Number(formData.workingDaysMonth) || 22)).toFixed(0)
                                  : (Number(formData[newVariationDraft.targetField]) || 0)
                          }
                          onChange={(e) => setNewVariationDraft(prev => ({ ...prev, previousValue: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-violet-900 mb-0.5">Nuovo Valore *</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="Nuovo €"
                          value={newVariationDraft.newValue}
                          onChange={(e) => setNewVariationDraft(prev => ({ ...prev, newValue: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-violet-400 rounded-lg bg-white text-xs font-black text-violet-950"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Nota</label>
                        <input
                          type="text"
                          placeholder="Es. Adeguam. ISTAT"
                          value={newVariationDraft.note}
                          onChange={(e) => setNewVariationDraft(prev => ({ ...prev, note: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!newVariationDraft.effectiveDate || newVariationDraft.newValue === '') return;
                            const wDays = Number(formData.workingDaysMonth) || 22;
                            const fallbackPrev = newVariationDraft.targetField === 'vehicleLeaseMonthly'
                              ? +((Number(formData.vehicleLeaseDaily) || 0) * wDays).toFixed(2)
                              : newVariationDraft.targetField === 'trailerLeaseMonthly'
                                ? +((Number(formData.trailerLeaseDaily) || 0) * wDays).toFixed(2)
                                : (Number(formData[newVariationDraft.targetField]) || 0);
                            const prevVal = newVariationDraft.previousValue !== ''
                              ? parseFloat(newVariationDraft.previousValue)
                              : fallbackPrev;
                            const nextVal = parseFloat(newVariationDraft.newValue) || 0;
                            const entry = {
                              id: 'cvar_' + Date.now(),
                              targetField: newVariationDraft.targetField,
                              effectiveDate: newVariationDraft.effectiveDate,
                              previousValue: prevVal,
                              newValue: nextVal,
                              note: newVariationDraft.note || ''
                            };
                            const nextList = [...(formData.costVariations || []), entry]
                              .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
                            setFormData({ ...formData, costVariations: nextList });
                            setNewVariationDraft(prev => ({ ...prev, previousValue: '', newValue: '', note: '' }));
                          }}
                          className="w-full py-1.5 px-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-bold text-xs transition shadow-sm"
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    {/* Riepilogo Impatto Economico Pre-Data vs Post-Data vs Media Ponderata Annua */}
                    {liveModalMetrics.hasPriceVariations && liveModalMetrics.variationSummary && (
                      <div className="p-2.5 bg-violet-100/80 border border-violet-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div>
                          <span className="font-black text-violet-950">
                            📊 Ricalcolo Commessa con Decorrenza {liveModalMetrics.variationSummary.latestEffectiveDateFormatted}:
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-slate-700">
                            Prima: <strong>{formatEUR(liveModalMetrics.variationSummary.beforeMonthlyCost)}/m</strong> (MOL {formatPercent(liveModalMetrics.variationSummary.beforeMolPercent)})
                          </span>
                          <span className="text-violet-900">
                            Dal {liveModalMetrics.variationSummary.latestEffectiveDateFormatted}: <strong>{formatEUR(liveModalMetrics.variationSummary.afterMonthlyCost)}/m</strong> (MOL {formatPercent(liveModalMetrics.variationSummary.afterMolPercent)})
                          </span>
                          <span className="px-2 py-0.5 rounded-full font-black bg-white text-violet-950 border border-violet-300">
                            Media Ponderata Annua: {formatEUR(liveModalMetrics.monthlyCost)}/m • MOL {formatEUR(liveModalMetrics.monthlyMol)}/m ({formatPercent(liveModalMetrics.molPercent)})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                    </div>
                  )}

                  {modalTab === 'terms' && (
                    <div className="space-y-4">
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
                      {formData.isMultiClient ? (
                        <div className="w-full px-3 py-2 border border-blue-200 rounded-xl bg-blue-50/70 font-bold text-xs text-[#164e87]">
                          Ponderato Multi-Cliente: {liveModalMetrics.clientDso} gg (impostato per singolo cliente in Tab 1)
                        </div>
                      ) : (
                        <select
                          value={formData.paymentTermsClient}
                          onChange={(e) => setFormData({ ...formData, paymentTermsClient: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold"
                        >
                          <option value="0">0 giorni (Vista fattura)</option>
                          <option value="30">30 giorni d.f.f.m.</option>
                          <option value="60">60 giorni d.f.f.m. (Standard)</option>
                          <option value="90">90 giorni d.f.f.m.</option>
                          <option value="120">120 giorni d.f.f.m.</option>
                        </select>
                      )}
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
                        Tariffa Carburanti
                      </label>
                      <div className="w-full px-3 py-2 border border-emerald-200 rounded-xl bg-emerald-50/70 font-bold text-xs text-emerald-900">
                        Alla Pompa (Senza Accise)
                      </div>
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
                    </div>
                  )}
                </div>

                {/* Footer Live Fissa in Basso */}
                <div className="px-6 py-3.5 bg-slate-900 text-white border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase block">Ricavo / m</span>
                      <span className="text-sm font-black">{formatEUR(liveModalMetrics.monthlyRevenue)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase block">Costi / m</span>
                      <span className="text-sm font-extrabold text-slate-300">{formatEUR(liveModalMetrics.monthlyCost)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase block">M.O.L. / m</span>
                      <span className={`text-sm font-black ${liveModalMetrics.monthlyMol >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatEUR(liveModalMetrics.monthlyMol)} ({formatPercent(liveModalMetrics.molPercent)})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase block">Circolante</span>
                      <span className="text-sm font-black text-amber-300">{formatEUR(liveModalMetrics.estimatedWorkingCapitalGap)}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-4 py-2 border border-slate-600 rounded-xl font-bold text-xs text-slate-200 hover:bg-slate-800 transition"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl font-black text-xs shadow-sm transition flex items-center space-x-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>Salva Commessa</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Modal Pianificazione Budget Anno Successivo 2027 */}
        {showNextYearModal && (() => {
          const forecast2027 = calculateAnnualBudgetAndCashFlow(statusQuoProjects, {
            year: 2027,
            rolloverPreviousYearBudget: true,
            fleet,
            trailers
          });
          return (
          <div
            onClick={() => setShowNextYearModal(false)}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200"
            >
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
                  tutte le <strong>{statusQuoProjects.length}</strong> linee operative attive vengono considerate in esercizio con le medesime tariffe,
                  percorrenze chilometriche e canoni di noleggio, con continuità finanziaria rispetto al 2026.
                </p>

                {/* KPI Anteprima 2027 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ricavi Stimati 2027</span>
                    <div className="text-sm font-black text-slate-900 mt-0.5">
                      {formatEUR(forecast2027.annualRevenue)}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Costi Operativi 2027</span>
                    <div className="text-sm font-bold text-slate-700 mt-0.5">
                      {formatEUR(forecast2027.annualCost)}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">M.O.L. Annuo (EBITDA)</span>
                    <div className="text-sm font-black text-emerald-600 mt-0.5">
                      {formatEUR(forecast2027.annualMol)}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1 text-emerald-950">
                  <p className="font-bold">Come viene applicato il Budget 2027:</p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-900">
                    <li>
                      <strong>Proiezione nei Report (Attiva)</strong>: selezionando <em>&quot;Budget 2027&quot;</em> in Commesse, Cash Flow o Dashboard visualizzi il piano finanziario completo con continuità dal 2026 senza modificare i contratti.
                    </li>
                    <li>
                      <strong>Proroga Formale Contratti al 31/12/2027</strong>: estende automaticamente la durata dei soli contratti attivi che terminano prima di fine 2027 fino al <strong>31 Dicembre 2027</strong>.
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
                    <span>Estendi Contratti al 31/12/2027</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
};

export default ProjectsPage;
