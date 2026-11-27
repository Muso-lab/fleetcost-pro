import { useState, useEffect, useMemo } from 'react';
import storageService from '../services/storageService';
import {
  formatEUR,
  LEASE_PAYMENT_TIMINGS,
  normalizeLeaseTiming,
  formatVariationDate,
  calculateTireCostPerKm,
  isRefrigeratedTrailer
} from '../utils/cashFlowCalculations';
import { MARKET_VEHICLE_BENCHMARKS } from '../data/initialData';
import {
  Truck,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  Flame,
  Leaf,
  Fuel,
  Layers,
  Search,
  ArrowRight,
  X,
  Save,
  Shield,
  ArrowRightLeft,
  Sparkles,
  Calendar,
  Snowflake,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TRAILER_CATEGORIES = [
  { id: 'refrigerato', label: 'Semirimorchio Frigo Elettrico', isFrigo: true, defaultTech: 'elettrico' },
  { id: 'refrigerato_azoto', label: 'Semirimorchio Frigo Azoto (Cryo)', isFrigo: true, defaultTech: 'azoto' },
  { id: 'refrigerato_gasolio', label: 'Semirimorchio Frigo Gasolio', isFrigo: true, defaultTech: 'gasolio' },
  { id: 'double_deck', label: 'Semirimorchio Double Deck (55 plt)', isFrigo: false, defaultTech: 'nessuno' },
  { id: 'standard', label: 'Centinato Tradizionale (33 plt)', isFrigo: false, defaultTech: 'nessuno' },
  { id: 'cassa_mobile', label: 'Cassa Mobile Intermodale', isFrigo: false, defaultTech: 'nessuno' }
];

const FRIDGE_TECH_CONFIG = {
  elettrico: { label: 'Frigo Elettrico', short: 'Elettrico', unit: 'kWh/h', defaultCost: 0.35, defaultHourly: 8.0, catId: 'refrigerato', catLabel: 'Semirimorchio Frigo Elettrico' },
  azoto: { label: 'Frigo Azoto Cryo', short: 'Azoto Cryo', unit: 'kg/h', defaultCost: 0.13, defaultHourly: 30, catId: 'refrigerato_azoto', catLabel: 'Semirimorchio Frigo Azoto (Cryo)' },
  gasolio: { label: 'Frigo Gasolio', short: 'Gasolio', unit: 'L/h', defaultCost: 1.80, defaultHourly: 3.0, catId: 'refrigerato_gasolio', catLabel: 'Semirimorchio Frigo Gasolio' }
};

const getFuelUnits = (fuelTypeId) => {
  if (fuelTypeId === 'elettrico') {
    return { consUnit: 'kWh/km', yieldUnit: 'km/kWh', isDirectPerKm: true, defaultCons: 1.2, defaultYield: 0.83 };
  }
  if (fuelTypeId === 'biolng') {
    return { consUnit: 'kg/100km', yieldUnit: 'km/kg', isDirectPerKm: false, defaultCons: 29.5, defaultYield: 3.39 };
  }
  return { consUnit: 'L/100km', yieldUnit: 'km/L', isDirectPerKm: false, defaultCons: 29.0, defaultYield: 3.45 };
};

const getDefaultNextMonthIso = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
};

const toNumOrEmpty = (val) => (val === '' || val === null || val === undefined ? '' : val);

const FleetPage = () => {
  const navigate = useNavigate();
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);

  const [activeTab, setActiveTab] = useState('vehicles'); // 'vehicles' | 'trailers'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'available' | 'assigned' | 'maintenance'
  const [fuelFilter, setFuelFilter] = useState('all');
  const [trailerCategoryFilter, setTrailerCategoryFilter] = useState('all');

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showLeaseVariationsSection, setShowLeaseVariationsSection] = useState(false);
  const [applyLeaseFromEffectiveDate, setApplyLeaseFromEffectiveDate] = useState(false);
  const [newLeaseEffectiveDate, setNewLeaseEffectiveDate] = useState(getDefaultNextMonthIso);
  const [variationPrevLease, setVariationPrevLease] = useState(0);
  const [variationNewLease, setVariationNewLease] = useState(0);
  const [newLeaseVariationNote, setNewLeaseVariationNote] = useState('');
  const [savedNltLease, setSavedNltLease] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    plate: '',
    code: '',
    category: 'trattore',
    categoryLabel: 'Trattore Stradale 4x2',
    fuelTypeId: 'elettrico',
    fridgeTech: 'nessuno',
    fridgeHourlyConsumption: 0,
    avgConsumption: 1.2,
    yieldKmPerUnit: 0.83,
    monthlyLease: 4500,
    leaseVariations: [],
    ownershipType: 'noleggio',
    purchaseCost: 140000,
    amortizationYears: 5,
    insuranceIncluded: true,
    insuranceYearly: 0,
    roadTaxYearly: 0,
    maintenanceMonthly: 350,
    costPerTire: '',
    tireCostKm: 0.04,
    tireCount: 6,
    leasePaymentTiming: 'M1_D10',
    leasePaymentTerms: 0,
    lessorName: '',
    licenseTypeId: 'ce_diurno',
    capacityPlt: 33,
    status: 'available',
    assignedProject: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
    const unsubscribe = storageService.subscribe((event) => {
      if (
        event.type === 'data' &&
        (event.scopes?.includes('fleet') ||
          event.scopes?.includes('trailers') ||
          event.scopes?.includes('projects') ||
          event.scopes?.includes('settings'))
      ) {
        loadData();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!showModal) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showModal]);

  const loadData = () => {
    setFleet(storageService.getFleet());
    setTrailers(storageService.getTrailers());
    setProjects(storageService.getProjects());
    setSettings(storageService.getSettings());
  };

  const handleSwitchTab = (nextTab) => {
    setActiveTab(nextTab);
    setFuelFilter('all');
    setTrailerCategoryFilter('all');
  };

  const getTrailerFridgeInfo = (trailer) => {
    if (!trailer) return { hasFridge: false, tech: 'nessuno', label: 'Non refrigerato', hourlyConsumption: 0, unit: '' };
    if (trailer.fridgeTech === 'nessuno' || trailer.fuelTypeId === 'nessuno') {
      return { hasFridge: false, tech: 'nessuno', label: 'Non refrigerato', hourlyConsumption: 0, unit: '' };
    }
    const isFrigo =
      trailer.fridgeTech === 'elettrico' ||
      trailer.fridgeTech === 'azoto' ||
      trailer.fridgeTech === 'gasolio' ||
      isRefrigeratedTrailer(trailer);
    if (!isFrigo) {
      return { hasFridge: false, tech: 'nessuno', label: 'Non refrigerato', hourlyConsumption: 0, unit: '' };
    }
    const catLabel = (trailer.categoryLabel || '').toLowerCase();
    const traction = (trailer.tractionType || '').toLowerCase();
    let tech = 'gasolio';
    if (trailer.fridgeTech && FRIDGE_TECH_CONFIG[trailer.fridgeTech]) {
      tech = trailer.fridgeTech;
    } else if (trailer.category === 'refrigerato_azoto' || trailer.fuelTypeId === 'azoto' || traction.includes('azoto')) {
      tech = 'azoto';
    } else if (trailer.fuelTypeId === 'elettrico' || catLabel.includes('elettric')) {
      tech = 'elettrico';
    }
    const cfg = FRIDGE_TECH_CONFIG[tech];
    const refSettings = settings?.refrigerationParams?.[tech];
    const defaultHourly = Number(refSettings?.hourlyConsumption ?? cfg.defaultHourly);
    const hourlyConsumption = Number(trailer.fridgeHourlyConsumption) > 0 ? Number(trailer.fridgeHourlyConsumption) : defaultHourly;
    return {
      hasFridge: true,
      tech,
      label: cfg.label,
      shortLabel: cfg.short,
      hourlyConsumption,
      unit: cfg.unit,
      unitCost: Number(refSettings?.unitCost ?? cfg.defaultCost)
    };
  };

  const getLinkedProjects = (item, type) => {
    if (!item?.id) return [];
    return projects.filter((p) => (type === 'vehicles' ? p.vehicleId === item.id : p.trailerId === item.id));
  };

  const getEffectiveStatus = (item, type) => {
    if (item.status === 'maintenance') return 'maintenance';
    const linked = getLinkedProjects(item, type);
    if (linked.length > 0) return 'assigned';
    return 'available';
  };

  const handleOpenModal = (item = null, type = activeTab) => {
    setApplyLeaseFromEffectiveDate(false);
    setNewLeaseEffectiveDate(getDefaultNextMonthIso());
    setNewLeaseVariationNote('');

    const curSettings = settings || storageService.getSettings();
    const curRefParams = curSettings?.refrigerationParams || {};
    const curOwnDef = curSettings?.ownershipDefaults || {};
    const defaultInsuranceOwn = (Number(curOwnDef.annualInsuranceRCA ?? 3200) + Number(curOwnDef.annualInsuranceKasko ?? 2400));
    const defaultTiming = curSettings?.treasuryRules?.defaultLeaseTiming || (type === 'trailers' ? 'M1_D30' : 'M1_D10');
    const defaultTrailerIns = Number(curOwnDef.trailerInsuranceYearlyDefault ?? 1200);

    if (item) {
      setEditingItem({ ...item, itemType: type });
      const cons = Number(item.avgConsumption) || 0;
      const yieldVal = item.fuelTypeId === 'elettrico'
        ? (cons > 0 ? +(1 / cons).toFixed(2) : 0.83)
        : (cons > 0 ? +(100 / cons).toFixed(2) : 2.7);
      const frInfo = type === 'trailers' ? getTrailerFridgeInfo(item) : null;
      const existingVars = Array.isArray(item.leaseVariations) ? item.leaseVariations : [];
      setShowLeaseVariationsSection(existingVars.length > 0);
      setVariationPrevLease(Number(item.monthlyLease) || 0);
      setVariationNewLease(Number(item.monthlyLease) || 0);
      setSavedNltLease(item.ownershipType === 'proprieta' ? null : (Number(item.monthlyLease) || 0));

      setFormData({
        name: item.name || '',
        plate: item.plate || '',
        code: item.code || '',
        category: item.category || (type === 'vehicles' ? 'trattore' : 'refrigerato'),
        categoryLabel: item.categoryLabel || '',
        fuelTypeId: type === 'trailers' ? (frInfo.hasFridge ? frInfo.tech : 'nessuno') : (item.fuelTypeId || 'elettrico'),
        fridgeTech: type === 'trailers' ? frInfo.tech : 'nessuno',
        fridgeHourlyConsumption: type === 'trailers' ? (item.fridgeHourlyConsumption !== undefined ? Number(item.fridgeHourlyConsumption) : frInfo.hourlyConsumption) : 0,
        avgConsumption: cons || (type === 'vehicles' ? 1.2 : 0),
        yieldKmPerUnit: item.yieldKmPerUnit || yieldVal,
        monthlyLease: item.monthlyLease ?? 0,
        leaseVariations: existingVars,
        ownershipType: item.ownershipType || 'noleggio',
        purchaseCost: item.purchaseCost || (type === 'vehicles' ? 140000 : 65000),
        amortizationYears: item.amortizationYears || (type === 'vehicles' ? (Number(curOwnDef.amortizationYears) || 5) : 7),
        insuranceIncluded: (item.ownershipType === 'proprieta')
          ? true
          : (item.insuranceIncluded !== undefined
              ? Boolean(item.insuranceIncluded)
              : (type === 'vehicles' && (item.ownershipType || 'noleggio') === 'noleggio')),
        insuranceYearly: item.insuranceYearly !== undefined
          ? item.insuranceYearly
          : (type === 'trailers' ? defaultTrailerIns : ((item.ownershipType === 'proprieta') ? defaultInsuranceOwn : 0)),
        roadTaxYearly: item.roadTaxYearly ?? (Number(curOwnDef.annualRoadTax ?? 1100)),
        maintenanceMonthly: item.maintenanceMonthly ?? (type === 'vehicles' ? Number(curOwnDef.monthlyMaintenance ?? 350) : 150),
        costPerTire: item.costPerTire ?? '',
        tireCostKm: item.tireCostKm || 0.04,
        tireCount: item.tireCount || 6,
        leasePaymentTiming: item.leasePaymentTiming || normalizeLeaseTiming(item),
        leasePaymentTerms: item.leasePaymentTerms !== undefined ? item.leasePaymentTerms : (type === 'trailers' ? 30 : 0),
        lessorName: item.lessorName || '',
        licenseTypeId: item.licenseTypeId || 'ce_diurno',
        capacityPlt: item.capacityPlt || 33,
        status: item.status === 'maintenance' ? 'maintenance' : 'available',
        assignedProject: item.assignedProject || '',
        notes: item.notes || ''
      });
    } else {
      setEditingItem(null);
      setShowLeaseVariationsSection(false);
      if (type === 'vehicles') {
        setVariationPrevLease(4800);
        setVariationNewLease(4800);
        setSavedNltLease(4800);
        setFormData({
          name: '',
          plate: '',
          code: '',
          category: 'trattore',
          categoryLabel: 'Trattore Stradale 4x2',
          fuelTypeId: 'elettrico',
          fridgeTech: 'nessuno',
          fridgeHourlyConsumption: 0,
          avgConsumption: 1.2,
          yieldKmPerUnit: 0.83,
          monthlyLease: 4800,
          leaseVariations: [],
          ownershipType: 'noleggio',
          purchaseCost: 150000,
          amortizationYears: Number(curOwnDef.amortizationYears) || 5,
          insuranceIncluded: true,
          insuranceYearly: defaultInsuranceOwn,
          roadTaxYearly: Number(curOwnDef.annualRoadTax ?? 1100),
          maintenanceMonthly: Number(curOwnDef.monthlyMaintenance ?? 350),
          costPerTire: '',
          tireCostKm: 0.04,
          tireCount: 6,
          leasePaymentTiming: defaultTiming,
          leasePaymentTerms: defaultTiming === 'M1_D10' ? 0 : defaultTiming === 'M1_D30' ? 30 : 60,
          lessorName: '',
          licenseTypeId: 'ce_diurno',
          capacityPlt: 33,
          status: 'available',
          assignedProject: '',
          notes: ''
        });
      } else {
        setVariationPrevLease(1600);
        setVariationNewLease(1600);
        setSavedNltLease(1600);
        const defElecHourly = Number(curRefParams?.elettrico?.hourlyConsumption ?? 8.0);
        setFormData({
          name: '',
          plate: '',
          code: '',
          category: 'refrigerato',
          categoryLabel: 'Semirimorchio Frigo Elettrico',
          fuelTypeId: 'elettrico',
          fridgeTech: 'elettrico',
          fridgeHourlyConsumption: defElecHourly,
          avgConsumption: 0,
          yieldKmPerUnit: 0,
          monthlyLease: 1600,
          leaseVariations: [],
          ownershipType: 'noleggio',
          purchaseCost: 65000,
          amortizationYears: 7,
          insuranceIncluded: false,
          insuranceYearly: defaultTrailerIns,
          roadTaxYearly: 400,
          maintenanceMonthly: 150,
          costPerTire: 380,
          tireCostKm: 0.0285,
          tireCount: 6,
          leasePaymentTiming: curSettings?.treasuryRules?.defaultLeaseTiming || 'M1_D30',
          leasePaymentTerms: 30,
          lessorName: '',
          licenseTypeId: 'ce_diurno',
          capacityPlt: 33,
          status: 'available',
          assignedProject: '',
          notes: ''
        });
      }
    }
    setShowModal(true);
  };

  const calculateOwnedMonthlyCost = (fData) => {
    const amortMonths = (Number(fData.amortizationYears) || 5) * 12;
    const amortMonthly = amortMonths > 0 ? (Number(fData.purchaseCost) || 0) / amortMonths : 0;
    const insMonthly = (Number(fData.insuranceYearly) || 0) / 12;
    const taxMonthly = (Number(fData.roadTaxYearly) || 0) / 12;
    const maintMonthly = Number(fData.maintenanceMonthly) || 0;
    return Math.round(amortMonthly + insMonthly + taxMonthly + maintMonthly);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name) return;

    const modalType = editingItem?.itemType || activeTab;
    const linked = editingItem?.id ? getLinkedProjects(editingItem, modalType) : [];
    if (formData.status === 'maintenance' && linked.length > 0 && editingItem?.status !== 'maintenance') {
      const ok = confirm(
        `Attenzione: questa unità è attualmente assegnata a ${linked.length} commess${linked.length === 1 ? 'a' : 'e'}. Impostandola "In Manutenzione" verrà contrassegnata come non operativa pur rimanendo collegata alle commesse finché non sostituita. Confermi?`
      );
      if (!ok) return;
    }

    const previewTireRate = modalType === 'vehicles' ? modalTirePreview.vehicleRate : modalTirePreview.trailerRate;
    const cleanTireCount = Number(formData.tireCount) >= 4 ? Number(formData.tireCount) : 6;
    const cleanCapacityPlt = Number(formData.capacityPlt) > 0 ? Number(formData.capacityPlt) : 33;
    const cleanAmortYears = Number(formData.amortizationYears) >= 2 ? Number(formData.amortizationYears) : 5;

    let payload = {
      ...formData,
      tireCount: cleanTireCount,
      capacityPlt: cleanCapacityPlt,
      amortizationYears: cleanAmortYears,
      tireCostKm: Number(previewTireRate) > 0 ? +Number(previewTireRate).toFixed(4) : (formData.tireCostKm || 0.04),
      insuranceIncluded: formData.ownershipType === 'proprieta' ? true : Boolean(formData.insuranceIncluded)
    };

    if (modalType === 'trailers') {
      const catObj = TRAILER_CATEGORIES.find(c => c.id === formData.category);
      const isFrigoCat = catObj ? catObj.isFrigo : isRefrigeratedTrailer(formData);
      if (isFrigoCat && formData.fridgeTech && formData.fridgeTech !== 'nessuno') {
        const cfg = FRIDGE_TECH_CONFIG[formData.fridgeTech];
        const parsedHourly = Number(formData.fridgeHourlyConsumption);
        payload.fuelTypeId = formData.fridgeTech;
        payload.tractionType = cfg?.label || formData.fridgeTech;
        payload.category = cfg?.catId || formData.category;
        payload.categoryLabel = cfg?.catLabel || formData.categoryLabel;
        payload.avgConsumption = 0;
        payload.yieldKmPerUnit = 0;
        payload.fridgeHourlyConsumption = (formData.fridgeHourlyConsumption !== '' && formData.fridgeHourlyConsumption !== undefined && Number.isFinite(parsedHourly) && parsedHourly >= 0)
          ? parsedHourly
          : (cfg?.defaultHourly ?? 0);
      } else {
        payload.fridgeTech = 'nessuno';
        payload.fuelTypeId = 'nessuno';
        payload.tractionType = '';
        payload.avgConsumption = 0;
        payload.yieldKmPerUnit = 0;
        payload.fridgeHourlyConsumption = 0;
      }
    }

    if (
      formData.ownershipType !== 'proprieta' &&
      editingItem &&
      editingItem.id &&
      applyLeaseFromEffectiveDate &&
      newLeaseEffectiveDate &&
      Number(editingItem.monthlyLease) !== Number(formData.monthlyLease)
    ) {
      const existingVars = Array.isArray(formData.leaseVariations) ? [...formData.leaseVariations] : [];
      const newVarEntry = {
        id: 'lvar_' + Date.now(),
        effectiveDate: newLeaseEffectiveDate,
        previousMonthlyLease: Number(editingItem.monthlyLease) || 0,
        monthlyLease: Number(formData.monthlyLease) || 0,
        note: newLeaseVariationNote || `Adeguamento canone nolo dal ${formatVariationDate(newLeaseEffectiveDate)}`
      };
      payload.leaseVariations = [...existingVars.filter(v => v.effectiveDate !== newLeaseEffectiveDate), newVarEntry]
        .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
    }

    if (modalType === 'vehicles') {
      if (editingItem && editingItem.id) {
        storageService.updateVehicle(editingItem.id, payload);
      } else {
        storageService.addVehicle(payload);
      }
    } else {
      if (editingItem && editingItem.id) {
        storageService.updateTrailer(editingItem.id, payload);
      } else {
        storageService.addTrailer(payload);
      }
    }

    setShowModal(false);
    loadData();
  };

  const handleDelete = (id, type) => {
    const linked = projects.filter(p => (type === 'vehicles' ? p.vehicleId === id : p.trailerId === id));
    const msg = linked.length > 0
      ? `ATTENZIONE: questa unità è collegata a ${linked.length} commess${linked.length === 1 ? 'a' : 'e'} (${linked.slice(0, 2).map(p => p.name).join(', ')}). Eliminandola i riferimenti sulle commesse resteranno scollegati. Confermi l'eliminazione?`
      : 'Sei sicuro di voler eliminare questa unità dalla flotta?';
    if (confirm(msg)) {
      if (type === 'vehicles') {
        storageService.deleteVehicle(id);
      } else {
        storageService.deleteTrailer(id);
      }
      loadData();
    }
  };

  // KPI dinamici allineati alle commesse reali
  const vehicleStats = useMemo(() => {
    let available = 0;
    let assigned = 0;
    let maintenance = 0;
    fleet.forEach((v) => {
      const st = getEffectiveStatus(v, 'vehicles');
      if (st === 'maintenance') maintenance++;
      else if (st === 'assigned') assigned++;
      else available++;
    });
    const total = fleet.length;
    const rate = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return { total, available, assigned, maintenance, rate };
  }, [fleet, projects]);

  const trailerStats = useMemo(() => {
    let available = 0;
    let assigned = 0;
    let maintenance = 0;
    trailers.forEach((t) => {
      const st = getEffectiveStatus(t, 'trailers');
      if (st === 'maintenance') maintenance++;
      else if (st === 'assigned') assigned++;
      else available++;
    });
    const total = trailers.length;
    const rate = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return { total, available, assigned, maintenance, rate };
  }, [trailers, projects]);

  const totalMonthlyLeaseVehicles = fleet.reduce((sum, v) => sum + (Number(v.monthlyLease) || 0), 0);
  const totalMonthlyLeaseTrailers = trailers.reduce((sum, t) => sum + (Number(t.monthlyLease) || 0), 0);
  const totalNltOnlyMonthly = [...fleet, ...trailers]
    .filter(it => (it.ownershipType || 'noleggio') !== 'proprieta' && it.ownershipType !== 'terzi')
    .reduce((sum, it) => sum + (Number(it.monthlyLease) || 0), 0);
  const totalMonthlyLease = totalMonthlyLeaseVehicles + totalMonthlyLeaseTrailers;

  const defaultTrailerInsYearly = Number(settings?.ownershipDefaults?.trailerInsuranceYearlyDefault ?? 1200);
  const totalExtraInsuranceMonthly = useMemo(() => {
    const calcExtra = (list, defaultIncluded) =>
      list.reduce((sum, it) => {
        if (it.ownershipType === 'proprieta' || it.ownershipType === 'terzi') return sum;
        const inc = it.insuranceIncluded !== undefined ? Boolean(it.insuranceIncluded) : defaultIncluded;
        if (inc) return sum;
        return sum + (Number(it.insuranceYearly) || defaultTrailerInsYearly) / 12;
      }, 0);
    return calcExtra(fleet, true) + calcExtra(trailers, false);
  }, [fleet, trailers, defaultTrailerInsYearly]);

  const activeTabStats = activeTab === 'vehicles' ? vehicleStats : trailerStats;

  // Filtraggio
  const itemsToDisplay = activeTab === 'vehicles' ? fleet : trailers;
  const filteredItems = itemsToDisplay.filter((item) => {
    const q = searchQuery.toLowerCase();
    const linked = getLinkedProjects(item, activeTab);
    const linkedMatch = linked.some(
      (p) => (p.name && p.name.toLowerCase().includes(q)) || (p.client && p.client.toLowerCase().includes(q))
    );
    const matchesSearch =
      !q ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.plate && item.plate.toLowerCase().includes(q)) ||
      (item.code && item.code.toLowerCase().includes(q)) ||
      (item.lessorName && item.lessorName.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q)) ||
      (item.assignedProject && item.assignedProject.toLowerCase().includes(q)) ||
      linkedMatch;

    const effStatus = getEffectiveStatus(item, activeTab);
    const matchesStatus = statusFilter === 'all' || effStatus === statusFilter;

    if (activeTab === 'vehicles') {
      const matchesFuel = fuelFilter === 'all' || item.fuelTypeId === fuelFilter;
      return matchesSearch && matchesStatus && matchesFuel;
    } else {
      const frInfo = getTrailerFridgeInfo(item);
      let matchesCat = true;
      if (trailerCategoryFilter === 'refrigerato_elettrico') {
        matchesCat = frInfo.hasFridge && frInfo.tech === 'elettrico';
      } else if (trailerCategoryFilter === 'refrigerato_azoto') {
        matchesCat = frInfo.hasFridge && frInfo.tech === 'azoto';
      } else if (trailerCategoryFilter === 'refrigerato_gasolio') {
        matchesCat = frInfo.hasFridge && frInfo.tech === 'gasolio';
      } else if (trailerCategoryFilter !== 'all') {
        matchesCat = item.category === trailerCategoryFilter;
      }
      return matchesSearch && matchesStatus && matchesCat;
    }
  });

  const getFuelBadge = (fuelTypeId) => {
    switch (fuelTypeId) {
      case 'elettrico':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
            <Zap className="w-3 h-3 mr-1 text-emerald-600 flex-shrink-0" />
            100% Elettrico (BEV)
          </span>
        );
      case 'biolng':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">
            <Flame className="w-3 h-3 mr-1 text-blue-600 flex-shrink-0" />
            Bio-LNG
          </span>
        );
      case 'hvo':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-800 border border-teal-300 whitespace-nowrap">
            <Leaf className="w-3 h-3 mr-1 text-teal-600 flex-shrink-0" />
            HVO Biodiesel
          </span>
        );
      case 'gasolio':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
            <Fuel className="w-3 h-3 mr-1 text-amber-700 flex-shrink-0" />
            Gasolio
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
            <Fuel className="w-3 h-3 mr-1 text-slate-600 flex-shrink-0" />
            {fuelTypeId || 'Standard'}
          </span>
        );
    }
  };

  const getFridgeBadge = (frInfo) => {
    if (!frInfo.hasFridge) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
          Non refrigerato
        </span>
      );
    }
    if (frInfo.tech === 'azoto') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300 whitespace-nowrap">
          <Snowflake className="w-3 h-3 mr-1 text-cyan-600 flex-shrink-0" />
          Frigo Azoto Cryo
        </span>
      );
    }
    if (frInfo.tech === 'elettrico') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
          <Zap className="w-3 h-3 mr-1 text-emerald-600 flex-shrink-0" />
          Frigo Elettrico
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
        <Snowflake className="w-3 h-3 mr-1 text-amber-600 flex-shrink-0" />
        Frigo Gasolio
      </span>
    );
  };

  const renderStatusBlock = (item, type) => {
    const effStatus = getEffectiveStatus(item, type);
    const linked = getLinkedProjects(item, type);

    if (effStatus === 'available') {
      return (
        <div className="min-h-[46px] flex flex-col justify-start">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-800 border border-green-300 w-fit whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 mr-1 text-green-600 flex-shrink-0" />
            LIBERO / DISPONIBILE
          </span>
          <span className="text-[11px] text-slate-400 font-medium mt-1">
            Pronto per nuova assegnazione
          </span>
        </div>
      );
    }

    if (effStatus === 'assigned') {
      return (
        <div className="min-h-[46px] flex flex-col justify-start">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">
              <Clock className="w-3 h-3 mr-1 text-blue-600 flex-shrink-0" />
              ASSEGNATO A COMMESSA
            </span>
            {linked.length >= 2 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                Su {linked.length} linee
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-blue-900 font-semibold">
            {linked.length > 0 ? (
              linked.slice(0, 2).map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/projects?edit=${p.id}`)}
                  className="hover:underline text-left truncate max-w-[210px]"
                  title={`${p.name}${p.client ? ` • ${p.client}` : ''}`}
                >
                  {i > 0 ? '• ' : ''}{p.name}
                </button>
              ))
            ) : (
              <span className="truncate">{item.assignedProject || 'Assegnato'}</span>
            )}
            {linked.length > 2 && <span className="text-slate-500">+{linked.length - 2} altre</span>}
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[46px] flex flex-col justify-start">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 w-fit whitespace-nowrap">
          <AlertTriangle className="w-3 h-3 mr-1 text-amber-600 flex-shrink-0" />
          IN MANUTENZIONE
        </span>
        <span className="text-[11px] text-amber-700/80 font-medium mt-1">
          Non assegnabile a commesse
        </span>
      </div>
    );
  };

  const modalType = editingItem?.itemType || activeTab;
  const isModalTrailerFrigo = useMemo(() => {
    if (modalType !== 'trailers') return false;
    const cat = TRAILER_CATEGORIES.find(c => c.id === formData.category);
    return cat ? cat.isFrigo : isRefrigeratedTrailer(formData);
  }, [modalType, formData.category]);

  const modalTirePreview = useMemo(() => {
    const dummyVeh = modalType === 'vehicles' ? formData : null;
    const dummyTrl = modalType === 'trailers' ? formData : null;
    return calculateTireCostPerKm(dummyVeh, dummyTrl, settings?.tireParameters || {});
  }, [modalType, formData, settings]);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Compatto */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center space-x-3">
            <span className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
              <Truck className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Flotta Disponibile FOUR</h1>
              <p className="text-xs text-slate-500">
                Anagrafica mezzi motori e semirimorchi sincronizzata con le commesse attive, canoni nolo, assicurazioni e consumi
              </p>
            </div>
          </div>

          <button
            onClick={() => handleOpenModal(null, activeTab)}
            className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition whitespace-nowrap self-start md:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>{activeTab === 'vehicles' ? 'Nuovo Mezzo' : 'Nuovo Semirimorchio'}</span>
          </button>
        </div>

        {/* KPI Cards Dinamiche sul Tab + Riepilogo Canoni */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {activeTab === 'vehicles' ? 'Flotta Mezzi Motori' : 'Semirimorchi & Casse'}
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-black text-slate-900">{activeTabStats.total}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">
                {activeTab === 'vehicles' ? `+${trailerStats.total} Rimorchi` : `+${vehicleStats.total} Mezzi Motori`}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {activeTab === 'vehicles' ? 'Trattori, motrici e furgoni' : 'Frigo, centinati, double deck e casse'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {activeTab === 'vehicles' ? 'Mezzi Disponibili (Liberi)' : 'Rimorchi Disponibili (Liberi)'}
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-black text-emerald-600">{activeTabStats.available}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">
                Pronti subito
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Stato calcolato sulle commesse reali</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tasso di Impiego Reale</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-black text-blue-600">{activeTabStats.rate}%</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                {activeTabStats.assigned} su commesse
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {activeTabStats.maintenance > 0 ? `${activeTabStats.maintenance} in manutenzione` : 'Unità abbinate a linee operative'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Costo Fisso &amp; Canoni Flotta / Mese</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-slate-900">{formatEUR(totalMonthlyLease)}</span>
              <span className="text-[11px] font-medium text-slate-500">fisso/m</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              NLT: <strong className="text-slate-700">{formatEUR(totalNltOnlyMonthly)}</strong> • Mezzi: <strong className="text-slate-700">{formatEUR(totalMonthlyLeaseVehicles)}</strong> • Rim.: <strong className="text-slate-700">{formatEUR(totalMonthlyLeaseTrailers)}</strong>
              {totalExtraInsuranceMonthly > 0 && ` (+${formatEUR(totalExtraInsuranceMonthly)} assic.)`}
            </p>
          </div>
        </div>

        {/* Tabs, Filtri & Toggle Vista */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Switch Mezzi / Rimorchi */}
            <div className="flex p-1 bg-slate-100 rounded-xl max-w-fit">
              <button
                onClick={() => handleSwitchTab('vehicles')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'vehicles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>Mezzi Motori ({fleet.length})</span>
              </button>
              <button
                onClick={() => handleSwitchTab('trailers')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'trailers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Semirimorchi &amp; Casse ({trailers.length})</span>
              </button>
            </div>

            {/* Filters + View Mode */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-auto">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cerca targa, modello, fornitore, commessa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 w-full sm:w-64"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tutti gli stati</option>
                <option value="available">Solo Liberi / Disponibili</option>
                <option value="assigned">Solo Assegnati a Commessa</option>
                <option value="maintenance">In Manutenzione</option>
              </select>

              {activeTab === 'vehicles' ? (
                <select
                  value={fuelFilter}
                  onChange={(e) => setFuelFilter(e.target.value)}
                  className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Tutte le alimentazioni</option>
                  <option value="elettrico">Elettrico (BEV)</option>
                  <option value="biolng">Bio-LNG</option>
                  <option value="hvo">HVO</option>
                  <option value="gasolio">Gasolio</option>
                </select>
              ) : (
                <select
                  value={trailerCategoryFilter}
                  onChange={(e) => setTrailerCategoryFilter(e.target.value)}
                  className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Tutte le tipologie</option>
                  <option value="refrigerato_elettrico">Frigo Elettrico</option>
                  <option value="refrigerato_azoto">Frigo Azoto Cryo</option>
                  <option value="refrigerato_gasolio">Frigo Gasolio</option>
                  <option value="double_deck">Double Deck (55 plt)</option>
                  <option value="standard">Centinato (33 plt)</option>
                  <option value="cassa_mobile">Cassa Mobile</option>
                </select>
              )}

              {/* View Toggle Schede / Tabella */}
              <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-lg transition ${viewMode === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  title="Vista Schede"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  title="Vista Tabella Compatta"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Vista Schede Allineate */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map((item) => {
              const effStatus = getEffectiveStatus(item, activeTab);
              const linked = getLinkedProjects(item, activeTab);
              const frInfo = activeTab === 'trailers' ? getTrailerFridgeInfo(item) : null;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow-md transition p-5 flex flex-col justify-between"
                >
                  <div>
                    {/* Header Card con altezza minima uniforme */}
                    <div className="flex items-start justify-between gap-2 mb-3 min-h-[62px]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-1.5 mb-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[170px]">
                            {item.categoryLabel || item.category}
                          </span>
                          {item.code && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                              {item.code}
                            </span>
                          )}
                          {item.plate && (
                            <span className="font-mono font-bold text-[11px] bg-slate-900 text-amber-300 px-2 py-0.5 rounded shadow-sm border border-slate-700 tracking-wider whitespace-nowrap">
                              {item.plate}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">{item.name}</h3>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={() => handleOpenModal(item, activeTab)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition"
                          title="Modifica"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, activeTab)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Blocco Stato con altezza uniforme */}
                    <div className="mb-3">
                      {renderStatusBlock(item, activeTab)}
                    </div>

                    {/* Righe Dati Allineate */}
                    <div className="space-y-2 py-3 border-y border-slate-100 text-xs">
                      {activeTab === 'vehicles' ? (
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-500">Alimentazione:</span>
                          {getFuelBadge(item.fuelTypeId)}
                        </div>
                      ) : (
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-500">Gruppo Frigorifero:</span>
                          {getFridgeBadge(frInfo)}
                        </div>
                      )}

                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Possesso:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                          item.ownershipType === 'proprieta'
                            ? 'bg-blue-100 text-blue-900 border border-blue-300'
                            : item.ownershipType === 'terzi'
                            ? 'bg-purple-100 text-purple-900 border border-purple-300'
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {item.ownershipType === 'proprieta' ? 'Proprietà FOUR' : item.ownershipType === 'terzi' ? 'Padroncino / Terzi' : 'Noleggio NLT'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">
                          {item.ownershipType === 'proprieta' ? 'Costo Fisso / Mese:' : 'Canone Noleggio / Mese:'}
                        </span>
                        <span className="font-extrabold text-slate-900 whitespace-nowrap">{formatEUR(item.monthlyLease)} / m</span>
                      </div>

                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Assicurazione Specifica:</span>
                        {item.ownershipType === 'proprieta' ? (
                          <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 whitespace-nowrap">
                            Inclusa ({formatEUR(item.insuranceYearly ?? (activeTab === 'trailers' ? defaultTrailerInsYearly : 5600))}/a)
                          </span>
                        ) : (item.insuranceIncluded !== undefined ? item.insuranceIncluded : (activeTab === 'vehicles')) ? (
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                            ✓ Integrata nel Nolo
                          </span>
                        ) : (
                          <span className="text-[11px] font-extrabold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-300 whitespace-nowrap">
                            +{formatEUR((Number(item.insuranceYearly ?? defaultTrailerInsYearly) || 0) / 12)}/m ({formatEUR(item.insuranceYearly ?? defaultTrailerInsYearly)}/a)
                          </span>
                        )}
                      </div>

                      {item.ownershipType !== 'proprieta' && Array.isArray(item.leaseVariations) && item.leaseVariations.length > 0 && (
                        <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 space-y-1">
                          {item.leaseVariations.map((lv, lIdx) => (
                            <div key={lv.id || lIdx} className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-indigo-900 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-indigo-600" />
                                <span>Dal {formatVariationDate(lv.effectiveDate)}:</span>
                              </span>
                              <span className="font-mono font-extrabold text-indigo-950">
                                {lv.previousMonthlyLease !== undefined ? `${formatEUR(lv.previousMonthlyLease)} → ` : ''}
                                {formatEUR(lv.monthlyLease ?? lv.newValue)}/m
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.ownershipType === 'proprieta' ? (
                        <>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">Regime Finanziario:</span>
                            <span className="font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 whitespace-nowrap text-[11px]">
                              Ammort. {item.amortizationYears || 5} anni • Cespite
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">Manutenzione / Bollo:</span>
                            <span className="font-semibold text-slate-700 whitespace-nowrap">
                              {formatEUR(item.maintenanceMonthly || 0)}/m • {formatEUR(item.roadTaxYearly || 0)}/a
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">Addebito Scadenza Nolo:</span>
                            <span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap text-[11px]">
                              {LEASE_PAYMENT_TIMINGS[item.leasePaymentTiming || normalizeLeaseTiming(item)]?.shortName || `${item.leasePaymentTerms || 30} gg f.m.`}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">Fornitore / Noleggiatore:</span>
                            <span className="font-semibold text-slate-700 truncate max-w-[160px]" title={item.lessorName || 'Non indicato'}>
                              {item.lessorName || '—'}
                            </span>
                          </div>
                        </>
                      )}

                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Quota Giornaliera (22gg):</span>
                        <span className="font-semibold text-slate-700 whitespace-nowrap">
                          {(() => {
                            const hasExtraIns = item.ownershipType !== 'proprieta' && item.ownershipType !== 'terzi' &&
                              !(item.insuranceIncluded !== undefined ? Boolean(item.insuranceIncluded) : (activeTab === 'vehicles'));
                            const extraInsMonthly = hasExtraIns ? ((Number(item.insuranceYearly ?? defaultTrailerInsYearly) || 0) / 12) : 0;
                            return formatEUR(((Number(item.monthlyLease) || 0) + extraInsMonthly) / 22);
                          })()} / gg
                        </span>
                      </div>

                      {activeTab === 'vehicles' ? (
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-500">Consumo &amp; Resa:</span>
                          {item.avgConsumption > 0 ? (() => {
                            const u = getFuelUnits(item.fuelTypeId);
                            const yieldStr = u.isDirectPerKm
                              ? `~${(1 / item.avgConsumption).toFixed(2)} ${u.yieldUnit}`
                              : `~${(100 / item.avgConsumption).toFixed(1)} ${u.yieldUnit}`;
                            return (
                              <span className="font-bold text-slate-900 whitespace-nowrap">
                                {item.avgConsumption} {u.consUnit}
                                <span className="text-[10px] text-emerald-700 font-bold ml-1.5">({yieldStr})</span>
                              </span>
                            );
                          })() : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-500">Consumo Orario Frigo:</span>
                          {frInfo.hasFridge ? (
                            <span className="font-bold text-slate-900 whitespace-nowrap">
                              {frInfo.hourlyConsumption} {frInfo.unit}
                              <span className="text-[10px] text-cyan-700 font-bold ml-1.5">
                                (~{formatEUR(frInfo.hourlyConsumption * frInfo.unitCost)}/h)
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      )}

                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-500">Capacità di Carico:</span>
                        <span className="font-semibold text-slate-800 whitespace-nowrap">{item.capacityPlt || 33} Pallet EPAL</span>
                      </div>
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-slate-500 italic mt-3 bg-slate-50 p-2 rounded-lg line-clamp-2" title={item.notes}>
                        &ldquo;{item.notes}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    {effStatus === 'available' ? (
                      <button
                        onClick={() =>
                          navigate(
                            activeTab === 'vehicles'
                              ? `/projects?newFromVehicle=${item.id}`
                              : `/projects?newFromTrailer=${item.id}`
                          )
                        }
                        className="w-full flex items-center justify-center space-x-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 py-2 rounded-xl text-xs font-bold transition border border-emerald-200"
                      >
                        <span>Assegna a Nuovo Progetto</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : effStatus === 'assigned' ? (
                      <button
                        onClick={() =>
                          navigate(linked[0] ? `/projects?edit=${linked[0].id}` : '/projects')
                        }
                        className="w-full flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-blue-50 hover:text-[#164e87] text-slate-700 py-2 rounded-xl text-xs font-bold transition"
                      >
                        <span>{linked.length > 1 ? `Apri Commessa (${linked.length} linee)` : 'Apri Commessa Assegnata'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenModal(item, activeTab)}
                        className="w-full flex items-center justify-center space-x-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 py-2 rounded-xl text-xs font-bold transition border border-amber-200"
                      >
                        <span>Gestisci Manutenzione</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Vista Tabella Compatta */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-3">Cod. / Targa</th>
                  <th className="py-3 px-3">Modello &amp; Tipologia</th>
                  <th className="py-3 px-3">Stato &amp; Commessa/e</th>
                  <th className="py-3 px-3">Possesso &amp; Fornitore</th>
                  <th className="py-3 px-3 text-right">Canone / m</th>
                  <th className="py-3 px-3">Assicurazione</th>
                  <th className="py-3 px-3">Scadenza</th>
                  <th className="py-3 px-3">{activeTab === 'vehicles' ? 'Consumo' : 'Gruppo Frigo'}</th>
                  <th className="py-3 px-3 text-center">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const effStatus = getEffectiveStatus(item, activeTab);
                  const linked = getLinkedProjects(item, activeTab);
                  const frInfo = activeTab === 'trailers' ? getTrailerFridgeInfo(item) : null;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {item.code && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {item.code}
                            </span>
                          )}
                          {item.plate ? (
                            <span className="font-mono font-bold text-[11px] bg-slate-900 text-amber-300 px-1.5 py-0.5 rounded">
                              {item.plate}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900">{item.name}</span>
                          {activeTab === 'vehicles' && getFuelBadge(item.fuelTypeId)}
                          {item.ownershipType !== 'proprieta' && Array.isArray(item.leaseVariations) && item.leaseVariations.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[10px] font-bold">
                              {item.leaseVariations.length} var. canone
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{item.categoryLabel || item.category} • {item.capacityPlt || 33} plt</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {effStatus === 'available' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-200 whitespace-nowrap">
                            Libero
                          </span>
                        ) : effStatus === 'maintenance' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                            Manutenzione
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {linked.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => navigate(`/projects?edit=${p.id}`)}
                                className="block text-[11px] font-bold text-[#164e87] hover:underline truncate max-w-[200px]"
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {item.ownershipType === 'proprieta' ? 'Proprietà FOUR' : item.ownershipType === 'terzi' ? 'Terzi' : 'NLT'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.ownershipType === 'proprieta' ? `Amm. ${item.amortizationYears || 5} anni` : (item.lessorName || '—')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {formatEUR(item.monthlyLease)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                        {item.ownershipType === 'proprieta' ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold border border-blue-200">
                            Inclusa ({formatEUR(item.insuranceYearly ?? (activeTab === 'trailers' ? defaultTrailerInsYearly : 5600))}/a)
                          </span>
                        ) : (item.insuranceIncluded !== undefined ? item.insuranceIncluded : activeTab === 'vehicles') ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                            ✓ Integrata Nolo
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-bold border border-amber-200">
                            +{formatEUR((Number(item.insuranceYearly ?? defaultTrailerInsYearly) || 0) / 12)}/m
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] font-semibold text-amber-900">
                        {item.ownershipType === 'proprieta' ? (
                          <span className="text-blue-700 font-bold">Proprietà FOUR</span>
                        ) : (
                          LEASE_PAYMENT_TIMINGS[item.leasePaymentTiming || normalizeLeaseTiming(item)]?.shortName || `${item.leasePaymentTerms || 30} gg`
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {activeTab === 'vehicles' ? (
                          item.avgConsumption > 0 ? `${item.avgConsumption} ${getFuelUnits(item.fuelTypeId).consUnit}` : '—'
                        ) : frInfo.hasFridge ? (
                          `${frInfo.shortLabel} (${frInfo.hourlyConsumption} ${frInfo.unit})`
                        ) : (
                          'Non frigo'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {effStatus === 'available' && (
                          <button
                            type="button"
                            onClick={() => navigate(activeTab === 'vehicles' ? `/projects?newFromVehicle=${item.id}` : `/projects?newFromTrailer=${item.id}`)}
                            className="px-2 py-1 mr-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold transition"
                            title="Assegna a Nuova Commessa"
                          >
                            + Assegna
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenModal(item, activeTab)}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-lg transition"
                          title="Modifica"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, activeTab)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg transition"
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredItems.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">Nessun elemento trovato</h3>
            <p className="text-xs text-slate-500 mt-1">Prova a cambiare i filtri di ricerca o aggiungi una nuova unità.</p>
          </div>
        )}
      </div>

      {/* Modal Aggiungi / Modifica Mezzo o Semirimorchio (max-w-2xl allineato) */}
      {showModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem
                  ? (modalType === 'vehicles' ? 'Modifica Scheda Mezzo Motore' : 'Modifica Scheda Semirimorchio')
                  : (modalType === 'vehicles' ? 'Inserisci Nuovo Mezzo Motore' : 'Inserisci Nuovo Semirimorchio')}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Chiudi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4 text-xs">
              {/* Benchmark Costruttori (solo nuovi o modifica Mezzi Motori) */}
              {modalType === 'vehicles' && (
                <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl space-y-1.5">
                  <label className="text-[11px] font-extrabold text-emerald-950 uppercase flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center">
                      <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                      Applica Dati Ufficiali da Benchmark di Mercato
                    </span>
                    <span className="text-[10px] text-emerald-800 font-semibold">Auto-compilazione</span>
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const bId = e.target.value;
                      if (!bId) return;
                      const bench = MARKET_VEHICLE_BENCHMARKS.find(b => b.id === bId);
                      if (bench) {
                        const defLicense = bench.category === 'motrice' ? 'c_diurno' : 'ce_diurno';
                        setFormData(prev => {
                          const nextDraft = {
                            ...prev,
                            name: bench.name,
                            category: bench.category,
                            categoryLabel: bench.name,
                            licenseTypeId: defLicense,
                            fuelTypeId: bench.fuelTypeId,
                            avgConsumption: bench.avgConsumption,
                            yieldKmPerUnit: bench.yieldKmPerUnit,
                            purchaseCost: bench.indicativePurchasePrice,
                            capacityPlt: bench.capacityPlt,
                            tireCount: bench.tireCount || (bench.category === 'motrice' ? 6 : 6),
                            notes: `${bench.models}. ${bench.notes}`
                          };
                          return {
                            ...nextDraft,
                            monthlyLease: prev.ownershipType === 'proprieta'
                              ? calculateOwnedMonthlyCost(nextDraft)
                              : bench.indicativeMonthlyLease
                          };
                        });
                      }
                    }}
                    className="w-full px-2.5 py-1.5 border border-emerald-400 rounded-lg text-xs font-bold bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Seleziona un mezzo di riferimento per auto-compilare i consumi --</option>
                    {MARKET_VEHICLE_BENCHMARKS.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.avgConsumption} {b.consumptionUnit} • {b.yieldKmPerUnit} km/u • NLT ~{formatEUR(b.indicativeMonthlyLease)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Riga 1: Nome, Codice Interno, Targa */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-6">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nome / Modello {modalType === 'vehicles' ? 'Mezzo' : 'Semirimorchio'} *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={modalType === 'vehicles' ? 'Es. Volvo FH Electric 4x2' : 'Es. Lamberet SR2 Frigo Elettrico'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 mb-1">Codice Interno</label>
                  <input
                    type="text"
                    placeholder="Es. 1E / R04"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold uppercase bg-slate-50"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Targa {modalType === 'vehicles' ? 'Mezzo' : 'Rimorchio'}
                  </label>
                  <input
                    type="text"
                    placeholder="Es. GK 843 MH"
                    value={formData.plate || ''}
                    onChange={(e) => setFormData({ ...formData, plate: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono font-bold uppercase tracking-wider bg-slate-50"
                  />
                </div>
              </div>

              {/* Riga 2: Tipologia, Alimentazione/Patente (solo veicoli) o Capacità Pallet */}
              <div className={`grid grid-cols-1 ${modalType === 'vehicles' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3 items-start`}>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tipologia {modalType === 'vehicles' ? 'Mezzo' : 'Semirimorchio'}
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      if (modalType === 'vehicles') {
                        let label = 'Trattore Stradale 4x2';
                        let defLicense = formData.licenseTypeId || 'ce_diurno';
                        if (cat === 'motrice') { label = 'Motrice Pallet'; defLicense = 'c_diurno'; }
                        if (cat === 'biga') { label = 'Autotreno / Biga'; defLicense = 'ce_diurno'; }
                        if (cat === 'furgone') { label = 'Furgone Patente B'; defLicense = 'b'; }
                        setFormData({ ...formData, category: cat, categoryLabel: label, licenseTypeId: defLicense });
                      } else {
                        const catMeta = TRAILER_CATEGORIES.find(c => c.id === cat) || TRAILER_CATEGORIES[0];
                        const nextTech = catMeta.isFrigo ? catMeta.defaultTech : 'nessuno';
                        const curRef = settings?.refrigerationParams?.[nextTech];
                        const nextHourly = nextTech !== 'nessuno'
                          ? Number(curRef?.hourlyConsumption ?? FRIDGE_TECH_CONFIG[nextTech]?.defaultHourly ?? 0)
                          : 0;
                        setFormData({
                          ...formData,
                          category: cat,
                          categoryLabel: catMeta.label,
                          fridgeTech: nextTech,
                          fuelTypeId: nextTech,
                          fridgeHourlyConsumption: nextHourly,
                          capacityPlt: cat === 'double_deck' ? 55 : (formData.capacityPlt || 33)
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white font-semibold"
                  >
                    {modalType === 'vehicles' ? (
                      <>
                        <option value="trattore">Trattore Stradale 4x2</option>
                        <option value="motrice">Motrice (18/12/9 plt)</option>
                        <option value="biga">Autotreno / Biga</option>
                        <option value="furgone">Furgone Patente B</option>
                      </>
                    ) : (
                      TRAILER_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))
                    )}
                  </select>
                </div>

                {modalType === 'vehicles' && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Alimentazione</label>
                      <select
                        value={formData.fuelTypeId}
                        onChange={(e) => {
                          const nextFuel = e.target.value;
                          const u = getFuelUnits(nextFuel);
                          setFormData({
                            ...formData,
                            fuelTypeId: nextFuel,
                            avgConsumption: u.defaultCons,
                            yieldKmPerUnit: u.defaultYield
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white font-semibold"
                      >
                        <option value="elettrico">Elettrico 100% (BEV)</option>
                        <option value="biolng">Bio-LNG (Biometano)</option>
                        <option value="hvo">HVO Biodiesel</option>
                        <option value="gasolio">Gasolio</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Patente Richiesta</label>
                      <select
                        value={formData.licenseTypeId || 'ce_diurno'}
                        onChange={(e) => setFormData({ ...formData, licenseTypeId: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white font-semibold"
                      >
                        <option value="ce_diurno">Patente CE (Bilico / Trattore)</option>
                        <option value="c_diurno">Patente C / C1 (Motrice / Daily 72)</option>
                        <option value="b">Patente B (Furgone)</option>
                      </select>
                    </div>
                  </>
                )}

                {modalType === 'trailers' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Capacità Carico (Pallet EPAL)</label>
                    <input
                      type="number"
                      value={toNumOrEmpty(formData.capacityPlt)}
                      onChange={(e) => setFormData({ ...formData, capacityPlt: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                      onBlur={() => setFormData(prev => ({ ...prev, capacityPlt: Number(prev.capacityPlt) > 0 ? Number(prev.capacityPlt) : 33 }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>
                )}
              </div>

              {/* Riga 3: Possesso, Capacità (veicoli) / Stato Mezzo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipologia Possesso *</label>
                  <select
                    value={formData.ownershipType}
                    onChange={(e) => {
                      const own = e.target.value;
                      if (own === 'proprieta') {
                        setSavedNltLease(Number(formData.monthlyLease) || 0);
                        const calculated = calculateOwnedMonthlyCost(formData);
                        setFormData({
                          ...formData,
                          ownershipType: own,
                          monthlyLease: calculated,
                          insuranceIncluded: true
                        });
                      } else {
                        setFormData({
                          ...formData,
                          ownershipType: own,
                          monthlyLease: savedNltLease !== null ? savedNltLease : formData.monthlyLease,
                          insuranceIncluded: modalType === 'trailers' ? false : true
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold bg-white"
                  >
                    <option value="noleggio">Noleggio a Lungo Termine (NLT)</option>
                    <option value="proprieta">Proprietà FOUR</option>
                    <option value="terzi">Padroncino / Vettore Terzo</option>
                  </select>
                </div>

                {modalType === 'vehicles' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Capacità Carico (Pallet)</label>
                    <input
                      type="number"
                      value={toNumOrEmpty(formData.capacityPlt)}
                      onChange={(e) => setFormData({ ...formData, capacityPlt: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                      onBlur={() => setFormData(prev => ({ ...prev, capacityPlt: Number(prev.capacityPlt) > 0 ? Number(prev.capacityPlt) : 33 }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}

                <div className={modalType === 'trailers' ? 'sm:col-span-2' : ''}>
                  <label className="block font-semibold text-slate-700 mb-1">Stato Operativo</label>
                  <select
                    value={formData.status === 'maintenance' ? 'maintenance' : 'available'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold bg-white"
                  >
                    <option value="available">Operativo (Libero / Auto da commesse)</option>
                    <option value="maintenance">In Manutenzione (Fermo)</option>
                  </select>
                </div>
              </div>

              {/* Blocco Proprietà oppure Blocco NLT / Terzi */}
              {formData.ownershipType === 'proprieta' ? (
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                  <span className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wider flex items-center">
                    <Shield className="w-4 h-4 mr-1 text-blue-700" />
                    Parametri Unità di Proprietà FOUR (Calcolo Costo Fisso Mensile)
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-start">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Costo Acquisto (€)</label>
                      <input
                        type="number"
                        step="1000"
                        value={toNumOrEmpty(formData.purchaseCost)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val = raw === '' ? '' : (parseFloat(raw) || 0);
                          const next = { ...formData, purchaseCost: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Anni Ammortamento</label>
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={toNumOrEmpty(formData.amortizationYears)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val = raw === '' ? '' : parseInt(raw, 10);
                          const next = { ...formData, amortizationYears: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        onBlur={() => setFormData(prev => {
                          const safeY = Number(prev.amortizationYears) >= 2 ? Number(prev.amortizationYears) : 5;
                          const next = { ...prev, amortizationYears: safeY };
                          return { ...next, monthlyLease: calculateOwnedMonthlyCost(next) };
                        })}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Assicurazione (€/a)</label>
                      <input
                        type="number"
                        step="100"
                        value={formData.insuranceYearly}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = { ...formData, insuranceYearly: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Bollo (€/a)</label>
                      <input
                        type="number"
                        step="50"
                        value={formData.roadTaxYearly}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = { ...formData, roadTaxYearly: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Manutenzione (€/m)</label>
                      <input
                        type="number"
                        step="25"
                        value={formData.maintenanceMonthly}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = { ...formData, maintenanceMonthly: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-blue-900 mb-0.5">Costo Fisso / Mese</label>
                      <div className="px-2.5 py-1.5 bg-blue-100 rounded-lg font-black text-blue-950 text-sm">
                        {formatEUR(formData.monthlyLease)} / m
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Canone Noleggio Mensile (€) *</label>
                    <input
                      type="number"
                      step="50"
                      required
                      value={formData.monthlyLease}
                      onChange={(e) => setFormData({ ...formData, monthlyLease: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Fornitore / Noleggiatore</label>
                    <input
                      type="text"
                      placeholder="Es. RBS, Nolo System, TIP"
                      value={formData.lessorName || ''}
                      onChange={(e) => setFormData({ ...formData, lessorName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Scadenza Addebito Nolo *</label>
                    <select
                      value={formData.leasePaymentTiming || normalizeLeaseTiming(formData)}
                      onChange={(e) => {
                        const timingKey = e.target.value;
                        const terms = timingKey === 'M1_D10' ? 0 : timingKey === 'M1_D30' ? 30 : 60;
                        setFormData({ ...formData, leasePaymentTiming: timingKey, leasePaymentTerms: terms });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold bg-white text-xs"
                    >
                      <option value="M1_D10">Giorno 10 M1 (Anticipato)</option>
                      <option value="M1_D30">Giorno 30 M1 (Fine Mese)</option>
                      <option value="M2_D20">Giorno 20 M2 (Mese Succ.)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Box Assicurazione Specifica & Gomme (niente doppio campo assicurazione per Proprietà) */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-700" />
                    <span>
                      {formData.ownershipType === 'proprieta'
                        ? `Pneumatici Specifici (${modalType === 'vehicles' ? 'Mezzo' : 'Semirimorchio'})`
                        : `Assicurazione Specifica & Pneumatici (${modalType === 'vehicles' ? 'Mezzo' : 'Semirimorchio'})`}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-amber-900 bg-white px-2 py-0.5 rounded-full border border-amber-200">
                    Stima gomme: {(modalType === 'vehicles' ? modalTirePreview.vehicleRate : modalTirePreview.trailerRate).toFixed(4)} €/km
                  </span>
                </div>

                <div className={`grid grid-cols-1 ${formData.ownershipType === 'proprieta' ? 'sm:grid-cols-2' : 'sm:grid-cols-4'} gap-3 items-start`}>
                  {formData.ownershipType !== 'proprieta' && (
                    <>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-700 mb-1">Gestione Polizza Assicurativa</label>
                        <select
                          value={formData.insuranceIncluded ? 'included' : 'specific'}
                          onChange={(e) => {
                            const inc = e.target.value === 'included';
                            setFormData({
                              ...formData,
                              insuranceIncluded: inc,
                              insuranceYearly: inc ? 0 : (formData.insuranceYearly || (modalType === 'trailers' ? defaultTrailerInsYearly : 3200))
                            });
                          }}
                          className="w-full px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white text-xs font-bold"
                        >
                          <option value="included">✓ Integrata nel Canone Nolo (0 € extra)</option>
                          <option value="specific">Polizza Specifica (€/anno)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 mb-1">Premio Annuo (€/a)</label>
                        <input
                          type="number"
                          step="60"
                          disabled={Boolean(formData.insuranceIncluded)}
                          value={formData.insuranceIncluded ? 0 : (formData.insuranceYearly ?? defaultTrailerInsYearly)}
                          onChange={(e) => setFormData({ ...formData, insuranceYearly: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold ${
                            formData.insuranceIncluded
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 cursor-not-allowed'
                              : 'border-amber-400 bg-white text-amber-950'
                          }`}
                        />
                        {!formData.insuranceIncluded && (
                          <span className="text-[11px] text-amber-800 font-semibold block mt-0.5">
                            +{formatEUR((Number(formData.insuranceYearly) || 0) / 12)}/m
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  <div className={formData.ownershipType === 'proprieta' ? '' : 'sm:col-span-1'}>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Costo Gomma (€)</label>
                    <input
                      type="number"
                      step="10"
                      placeholder={modalType === 'trailers' ? '380 €' : formData.category === 'trattore' ? (formData.fuelTypeId === 'elettrico' ? '520 €' : '460 €') : '420 €'}
                      value={formData.costPerTire ?? ''}
                      onChange={(e) => setFormData({ ...formData, costPerTire: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-bold"
                    />
                  </div>

                  {formData.ownershipType === 'proprieta' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">N. Gomme per Unità</label>
                      <input
                        type="number"
                        step="2"
                        min="4"
                        max="12"
                        value={toNumOrEmpty(formData.tireCount)}
                        onChange={(e) => setFormData({ ...formData, tireCount: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                        onBlur={() => setFormData(prev => ({ ...prev, tireCount: Number(prev.tireCount) >= 4 ? Number(prev.tireCount) : 6 }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-bold"
                      />
                    </div>
                  )}
                </div>

                {formData.ownershipType !== 'proprieta' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-1">
                    <span>N. Gomme considerate: <strong>{formData.tireCount || 6}</strong></span>
                    <div className="flex items-center gap-1.5">
                      <span>Modifica N. Gomme:</span>
                      <input
                        type="number"
                        step="2"
                        min="4"
                        max="12"
                        value={toNumOrEmpty(formData.tireCount)}
                        onChange={(e) => setFormData({ ...formData, tireCount: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                        onBlur={() => setFormData(prev => ({ ...prev, tireCount: Number(prev.tireCount) >= 4 ? Number(prev.tireCount) : 6 }))}
                        className="w-16 px-2 py-0.5 border border-slate-300 rounded bg-white text-xs font-bold text-center"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SEZIONE CONSUMI: Trattori/Motrici vs Semirimorchi Frigo */}
              {modalType === 'vehicles' ? (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider flex items-center">
                      <ArrowRightLeft className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                      Consumo Specifico &amp; Resa &ldquo;Al Contrario&rdquo;
                    </span>
                    <span className="text-[10px] text-emerald-800 font-medium">Sincronizzazione Automatica</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Consumo ({getFuelUnits(formData.fuelTypeId).consUnit})
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={formData.avgConsumption}
                        onChange={(e) => {
                          const cons = parseFloat(e.target.value) || 0;
                          const y = formData.fuelTypeId === 'elettrico'
                            ? (cons > 0 ? +(1 / cons).toFixed(2) : 0)
                            : (cons > 0 ? +(100 / cons).toFixed(2) : 0);
                          setFormData({ ...formData, avgConsumption: cons, yieldKmPerUnit: y });
                        }}
                        className="w-full px-3 py-1.5 border border-emerald-300 rounded-lg font-bold bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-emerald-900 mb-1">
                        Resa &ldquo;Al Contrario&rdquo; ({getFuelUnits(formData.fuelTypeId).yieldUnit})
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={formData.yieldKmPerUnit}
                        onChange={(e) => {
                          const y = parseFloat(e.target.value) || 0;
                          const cons = formData.fuelTypeId === 'elettrico'
                            ? (y > 0 ? +(1 / y).toFixed(2) : 0)
                            : (y > 0 ? +(100 / y).toFixed(2) : 0);
                          setFormData({ ...formData, yieldKmPerUnit: y, avgConsumption: cons });
                        }}
                        className="w-full px-3 py-1.5 border border-emerald-400 rounded-lg font-extrabold text-emerald-900 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ) : isModalTrailerFrigo ? (
                <div className="p-3.5 bg-cyan-50/70 border border-cyan-200 rounded-xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-cyan-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Snowflake className="w-3.5 h-3.5 text-cyan-700" />
                      <span>Gruppo Frigorifero &amp; Consumo Orario</span>
                    </span>
                    <span className="text-[10px] font-bold text-cyan-900 bg-white px-2 py-0.5 rounded-full border border-cyan-200">
                      Costo stimato: {formatEUR(
                        (Number(formData.fridgeHourlyConsumption) || 0) *
                        Number(settings?.refrigerationParams?.[formData.fridgeTech]?.unitCost ?? FRIDGE_TECH_CONFIG[formData.fridgeTech]?.defaultCost ?? 0)
                      )} / ora
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tecnologia Gruppo Frigo</label>
                      <select
                        value={formData.fridgeTech || 'elettrico'}
                        onChange={(e) => {
                          const nextTech = e.target.value;
                          const cfg = FRIDGE_TECH_CONFIG[nextTech];
                          const defHourly = Number(settings?.refrigerationParams?.[nextTech]?.hourlyConsumption ?? cfg?.defaultHourly ?? 0);
                          setFormData({
                            ...formData,
                            fridgeTech: nextTech,
                            fuelTypeId: nextTech,
                            category: cfg?.catId || formData.category,
                            categoryLabel: cfg?.catLabel || formData.categoryLabel,
                            fridgeHourlyConsumption: defHourly
                          });
                        }}
                        className="w-full px-3 py-1.5 border border-cyan-300 rounded-lg font-bold bg-white"
                      >
                        <option value="elettrico">Gruppo Frigo Elettrico (kWh/h)</option>
                        <option value="azoto">Azoto Liquido Cryo (kg/h)</option>
                        <option value="gasolio">Gruppo Frigo Gasolio (L/h)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-cyan-950 mb-1">
                        Consumo Orario ({FRIDGE_TECH_CONFIG[formData.fridgeTech]?.unit || 'u/h'})
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={toNumOrEmpty(formData.fridgeHourlyConsumption)}
                        onChange={(e) => setFormData({
                          ...formData,
                          fridgeHourlyConsumption: e.target.value === '' ? '' : (Number.isFinite(parseFloat(e.target.value)) ? parseFloat(e.target.value) : 0)
                        })}
                        onBlur={() => setFormData(prev => ({
                          ...prev,
                          fridgeHourlyConsumption: prev.fridgeHourlyConsumption === '' ? 0 : Math.max(0, Number(prev.fridgeHourlyConsumption) || 0)
                        }))}
                        className="w-full px-3 py-1.5 border border-cyan-400 rounded-lg font-extrabold text-cyan-950 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Allestimento senza gruppo frigorifero autonomo</span>
                  <span className="font-bold text-slate-700">Nessun consumo energetico proprio</span>
                </div>
              )}

              {/* VARIAZIONE CANONE DA DATA (Collassabile, nascosta per Proprietà FOUR) */}
              {formData.ownershipType !== 'proprieta' && (
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5">
                <div
                  onClick={() => setShowLeaseVariationsSection(prev => !prev)}
                  className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="text-[11px] font-extrabold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-700" />
                    <span>
                      Variazioni Canone da Data
                      {Array.isArray(formData.leaseVariations) && formData.leaseVariations.length > 0 ? ` (${formData.leaseVariations.length})` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-900 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200"
                  >
                    <span>{showLeaseVariationsSection ? 'Nascondi' : 'Espandi'}</span>
                    {showLeaseVariationsSection ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {editingItem && Number(editingItem.monthlyLease) !== Number(formData.monthlyLease) && (
                  <div className="p-2.5 bg-white rounded-xl border border-indigo-300 space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyLeaseFromEffectiveDate}
                        onChange={(e) => setApplyLeaseFromEffectiveDate(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded accent-indigo-600"
                      />
                      <span className="font-bold text-indigo-950 text-xs">
                        Applica adeguamento ({formatEUR(editingItem.monthlyLease)} → {formatEUR(formData.monthlyLease)}/m) a partire da una data:
                      </span>
                    </label>

                    {applyLeaseFromEffectiveDate && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Valido dal *</label>
                          <input
                            type="date"
                            value={newLeaseEffectiveDate}
                            onChange={(e) => setNewLeaseEffectiveDate(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg font-bold bg-indigo-50/40 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Motivazione / Nota</label>
                          <input
                            type="text"
                            placeholder="Es. Adeguamento ISTAT / Rinnovo"
                            value={newLeaseVariationNote}
                            onChange={(e) => setNewLeaseVariationNote(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {showLeaseVariationsSection && (
                  <div className="space-y-2.5 pt-1">
                    {Array.isArray(formData.leaseVariations) && formData.leaseVariations.length > 0 && (
                      <div className="space-y-1.5">
                        {formData.leaseVariations.map((lv, idx) => (
                          <div key={lv.id || idx} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-indigo-200 text-[11px]">
                            <div>
                              <span className="font-black text-indigo-900">Dal {formatVariationDate(lv.effectiveDate)}:</span>{' '}
                              <span className="text-slate-600">
                                {lv.previousMonthlyLease !== undefined ? `${formatEUR(lv.previousMonthlyLease)}/m → ` : ''}
                                <strong className="text-slate-900">{formatEUR(lv.monthlyLease ?? lv.newValue)}/m</strong>
                              </span>
                              {lv.note && <span className="text-slate-400 ml-1.5">({lv.note})</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.leaseVariations.filter((_, i) => i !== idx);
                                setFormData({ ...formData, leaseVariations: updated });
                              }}
                              className="text-rose-500 hover:text-rose-700 p-1"
                              title="Rimuovi variazione"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-1 flex flex-wrap items-end gap-2">
                      <div className="min-w-[125px]">
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Data Decorrenza</label>
                        <input
                          type="date"
                          value={newLeaseEffectiveDate}
                          onChange={(e) => setNewLeaseEffectiveDate(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-bold"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Prima (€/m)</label>
                        <input
                          type="number"
                          step="50"
                          value={variationPrevLease}
                          onChange={(e) => setVariationPrevLease(parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-semibold text-indigo-900 mb-0.5">Nuovo (€/m)</label>
                        <input
                          type="number"
                          step="50"
                          value={variationNewLease}
                          onChange={(e) => setVariationNewLease(parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 border border-indigo-400 rounded-lg bg-white text-xs font-bold text-indigo-950"
                        />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Nota</label>
                        <input
                          type="text"
                          placeholder="Es. ISTAT / Rinnovo"
                          value={newLeaseVariationNote}
                          onChange={(e) => setNewLeaseVariationNote(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newLeaseEffectiveDate) return;
                          const prevVal = Number(variationPrevLease) || 0;
                          const nextVal = Number(variationNewLease) || 0;
                          const entry = {
                            id: 'lvar_' + Date.now(),
                            effectiveDate: newLeaseEffectiveDate,
                            previousMonthlyLease: prevVal,
                            monthlyLease: nextVal,
                            note: newLeaseVariationNote || `Variazione canone dal ${formatVariationDate(newLeaseEffectiveDate)}`
                          };
                          const nextList = [
                            ...(formData.leaseVariations || []).filter(v => v.effectiveDate !== newLeaseEffectiveDate),
                            entry
                          ].sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
                          setFormData({ ...formData, leaseVariations: nextList });
                          setVariationPrevLease(nextVal);
                          setNewLeaseVariationNote('');
                          setApplyLeaseFromEffectiveDate(false);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition"
                      >
                        + Registra Data
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Note e Allestimenti</label>
                <textarea
                  rows="2"
                  placeholder="Es. Sponda caricatrice idraulica, ATP scadenza 2028, gruppo frigo Carrier..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
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
                  <span>{modalType === 'vehicles' ? 'Salva Mezzo' : 'Salva Semirimorchio'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetPage;
