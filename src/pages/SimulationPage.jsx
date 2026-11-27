import { useState, useEffect, useRef, useMemo } from 'react';
import storageService from '../services/storageService';
import {
  formatEUR,
  formatPercent,
  calculateTireCostPerKm,
  calculateSpecificInsuranceCost,
  isRefrigeratedTrailer,
  calculateDriverDailyCost,
  calculateRefrigerationDailyCost,
  calculateAccessoriesDailyCost,
  calculateSingleProjectMetrics,
  LEASE_PAYMENT_TIMINGS,
  normalizeLeaseTiming,
  COST_ALLOCATION_MODES,
  computeMultiClientAllocation,
  rebalanceManualCostShares
} from '../utils/cashFlowCalculations';
import {
  calculateRouteFromStops,
  KNOWN_LOGISTICS_HUBS
} from '../services/routeCalculationService';
import {
  Calculator,
  TrendingUp,
  Download,
  Truck,
  Layers,
  ArrowRight,
  Save,
  CheckCircle2,
  Clock,
  Zap,
  Flame,
  FileSpreadsheet,
  FileText,
  Snowflake,
  Droplets,
  Wifi,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Briefcase,
  Users,
  MapPin,
  Navigation,
  Mountain,
  Plus,
  Trash2,
  RotateCw,
  FolderOpen,
  Check,
  AlertTriangle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

const toFiniteNumber = (val, fallback = 0) => {
  if (val === '' || val === null || val === undefined) return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
};

const DEFAULT_BILLING_ENTITIES = [
  { id: 'c1', clientName: 'Cliente 1', route: '', driverMetric: 125, costSharePercent: 50, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 },
  { id: 'c2', clientName: 'Cliente 2', route: '', driverMetric: 125, costSharePercent: 50, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 },
  { id: 'c3', clientName: 'Cliente 3', route: '', driverMetric: 100, costSharePercent: 0, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 },
  { id: 'c4', clientName: 'Cliente 4', route: '', driverMetric: 100, costSharePercent: 0, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 }
];

const DEFAULT_ROUTE_STOPS = [
  { id: 'stop_1', address: 'Bologna Interporto (Bentivoglio)', label: 'Partenza / Carico' },
  { id: 'stop_2', address: 'Firenze', label: 'Destinazione / Scarico 1' }
];

const SimulationPage = () => {
  const navigate = useNavigate();
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [settings, setSettings] = useState(null);
  const selectedVehicleIdRef = useRef('');
  const hasUserTouchedVehicleRef = useRef(false);

  // Form State
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedTrailerId, setSelectedTrailerId] = useState('');
  const [clientName, setClientName] = useState('');
  const [routeName, setRouteName] = useState('');

  // Sistema Multi-Commessa (da 1 a 4 Clienti con Costi a Fattor Comune)
  const [clientCount, setClientCount] = useState(1); // 1 | 2 | 3 | 4
  const [costAllocationMode, setCostAllocationMode] = useState('equal'); // 'equal' | 'proportional_metric' | 'proportional_revenue' | 'manual_percent'
  const [billingEntities, setBillingEntities] = useState(() => DEFAULT_BILLING_ENTITIES.map(e => ({ ...e })));

  const handleClientCountChange = (newCount) => {
    setClientCount(newCount);
    const eqShare = +(100 / newCount).toFixed(2);
    setBillingEntities(prev => prev.map((item, idx) => {
      if (idx >= newCount) return item;
      const share = idx === newCount - 1 ? +(100 - eqShare * (newCount - 1)).toFixed(2) : eqShare;
      return {
        ...item,
        costSharePercent: costAllocationMode === 'manual_percent' ? share : item.costSharePercent
      };
    }));
  };

  const handleCostAllocationModeChange = (nextMode) => {
    setCostAllocationMode(nextMode);
    if (nextMode === 'manual_percent' && clientCount > 1) {
      const sum = billingEntities.slice(0, clientCount).reduce((s, e) => s + (Number(e.costSharePercent) || 0), 0);
      if (Math.abs(sum - 100) > 0.5) {
        const eq = +(100 / clientCount).toFixed(2);
        setBillingEntities(prev => prev.map((e, i) => (
          i < clientCount
            ? { ...e, costSharePercent: i === clientCount - 1 ? +(100 - eq * (clientCount - 1)).toFixed(2) : eq }
            : e
        )));
      }
    }
  };

  const handleUpdateBillingEntity = (idx, patch) => {
    setBillingEntities(prev => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const handleBillingShareBlur = (idx) => {
    if (costAllocationMode !== 'manual_percent') return;
    setBillingEntities(prev => {
      const val = toFiniteNumber(prev[idx]?.costSharePercent, 0);
      return rebalanceManualCostShares(prev, clientCount, idx, Math.min(100, Math.max(0, val)));
    });
  };

  const handleNormalizeManualShares = () => {
    const activeSlice = billingEntities.slice(0, clientCount);
    const sum = activeSlice.reduce((s, e) => s + (Number(e.costSharePercent) || 0), 0);
    if (sum <= 0) {
      const eq = +(100 / clientCount).toFixed(2);
      setBillingEntities(prev => prev.map((e, i) => (i < clientCount ? { ...e, costSharePercent: i === clientCount - 1 ? +(100 - eq * (clientCount - 1)).toFixed(2) : eq } : e)));
      return;
    }
    let running = 0;
    setBillingEntities(prev => prev.map((e, i) => {
      if (i >= clientCount) return e;
      if (i === clientCount - 1) return { ...e, costSharePercent: +Math.max(0, 100 - running).toFixed(2) };
      const norm = +(((Number(e.costSharePercent) || 0) / sum) * 100).toFixed(2);
      running += norm;
      return { ...e, costSharePercent: norm };
    }));
  };

  const [kmTotal, setKmTotal] = useState(250);
  const [kmHighwayPercent, setKmHighwayPercent] = useState(60);
  const [workingDaysMonth, setWorkingDaysMonth] = useState(22);
  const [doubleDrivers, setDoubleDrivers] = useState(false);
  const [isNightShift, setIsNightShift] = useState(false);
  const [energyPayer, setEnergyPayer] = useState('four'); // 'four' | 'client'
  const [fuelPrice, setFuelPrice] = useState(0.38); // €/kWh o €/kg
  const [tollRate, setTollRate] = useState(0.12); // €/km autostrada
  const [tireRate, setTireRate] = useState(0.04); // €/km
  const [targetMarginPercent, setTargetMarginPercent] = useState(21); // Default 21% margine target
  const [operatingMonths, setOperatingMonths] = useState(36); // Default 36 mesi (Standard contratti FOUR)

  // Refrigerazione (NOTA 3.1)
  const [refrigerationEnabled, setRefrigerationEnabled] = useState(false);
  const [refrigerationTech, setRefrigerationTech] = useState('gasolio');
  const [refrigerationUnitCost, setRefrigerationUnitCost] = useState(1.80);
  const [refrigerationHourlyConsumption, setRefrigerationHourlyConsumption] = useState(3.0);
  const [refrigerationHoursDaily, setRefrigerationHoursDaily] = useState(8);

  // Costi Accessori (NOTA 3.2)
  const [telematicsEnabled, setTelematicsEnabled] = useState(true);
  const [telematicsAuto, setTelematicsAuto] = useState(true);
  const [telematicsMonthly, setTelematicsMonthly] = useState(14);
  const [washingEnabled, setWashingEnabled] = useState(true);
  const [washingUnitCost, setWashingUnitCost] = useState(80);
  const [washingCountPerMonth, setWashingCountPerMonth] = useState(2);
  const [extraCostDescription, setExtraCostDescription] = useState('');
  const [extraCostAmount, setExtraCostAmount] = useState(0);
  const [extraCostFrequency, setExtraCostFrequency] = useState('monthly');

  // Compenso Partner Coordinamento Operativo
  const [partnerFeePerTrip, setPartnerFeePerTrip] = useState(0); // € / viaggio
  const [tripsPerDay, setTripsPerDay] = useState(1); // viaggi previsti al giorno

  // Termini di Pagamento & Fabbisogno Ponderato (NOTA 1.1)
  const [paymentTermsClient, setPaymentTermsClient] = useState(60);
  const [paymentTermsSuppliers, setPaymentTermsSuppliers] = useState(30);
  const [leasePaymentTiming, setLeasePaymentTiming] = useState('M1_D10');
  const [trailerLeasePaymentTiming, setTrailerLeasePaymentTiming] = useState('M1_D30');
  const [paymentTermsDriver, setPaymentTermsDriver] = useState(16);
  const [paymentTermsFuel, setPaymentTermsFuel] = useState(30);
  const [paymentTermsTolls, setPaymentTermsTolls] = useState(15);
  const [paymentTermsTires, setPaymentTermsTires] = useState(30);
  const [paymentTermsRefrigeration, setPaymentTermsRefrigeration] = useState(30);
  const [paymentTermsTelematics, setPaymentTermsTelematics] = useState(30);
  const [paymentTermsWashing, setPaymentTermsWashing] = useState(30);
  const [paymentTermsExtra, setPaymentTermsExtra] = useState(30);
  const [showPerItemTerms, setShowPerItemTerms] = useState(false);

  // Results State & Registro Simulazioni Salvate
  const [simulationResult, setSimulationResult] = useState(null);
  const [lastComputedSignature, setLastComputedSignature] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedSimulations, setSavedSimulations] = useState([]);
  const [activeSimulationId, setActiveSimulationId] = useState(null);
  const [activeSimulationCode, setActiveSimulationCode] = useState('');
  const [showSavedRegistry, setShowSavedRegistry] = useState(false);
  const [regSaveBanner, setRegSaveBanner] = useState('');

  // Calcolatore Automatico Km, Autostrada & Orografia da Indirizzi Tappe (API Pubbliche OSM/OSRM/Open-Meteo)
  const [routeStops, setRouteStops] = useState(() => DEFAULT_ROUTE_STOPS.map(s => ({ ...s })));
  const [isRoundTrip, setIsRoundTrip] = useState(true);
  const [routeCalculating, setRouteCalculating] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [routeAnalysis, setRouteAnalysis] = useState(null);
  const [orographicMultiplier, setOrographicMultiplier] = useState(1.0);

  const handleAddRouteStop = () => {
    if (routeStops.length >= 8) return;
    setRouteStops(prev => [
      ...prev,
      {
        id: 'stop_' + Date.now(),
        address: '',
        label: `Tappa / Scarico ${prev.length}`
      }
    ]);
  };

  const handleRemoveRouteStop = (idx) => {
    if (routeStops.length <= 2) return;
    setRouteStops(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateRouteStop = (idx, address) => {
    setRouteStops(prev => prev.map((s, i) => (i === idx ? { ...s, address } : s)));
  };

  const handleCalculateRouteFromApi = async () => {
    setRouteError('');
    setRouteCalculating(true);
    try {
      const vehicle = fleet.find(v => v.id === selectedVehicleId);
      const trailer = trailers.find(t => t.id === selectedTrailerId);
      const res = await calculateRouteFromStops(routeStops, {
        isRoundTrip,
        tripsPerDay,
        vehicle,
        trailer
      });
      setRouteAnalysis(res);
      setKmTotal(res.totalDailyKm);
      setKmHighwayPercent(res.highwayPercent);
      setTollRate(res.tollEstimation.suggestedRate);
      setOrographicMultiplier(res.orography.consumptionMultiplier);
      if (res.generatedRouteName) {
        setRouteName(res.generatedRouteName);
      }

      // Se in modalità Multi-Commessa, pre-assegna solo le tratte di andata (esclude il leg di ritorno) ai clienti
      const forwardLegs = (res.legSummaries || []).filter(l => !l.isReturnLeg);
      if (clientCount > 1 && forwardLegs.length > 0) {
        setBillingEntities(prev => prev.map((be, idx) => {
          if (idx >= clientCount) return be;
          const leg = forwardLegs[idx];
          return {
            ...be,
            route: leg ? `${leg.from.split(',')[0]} → ${leg.to.split(',')[0]}` : be.route,
            driverMetric: leg ? Math.round(leg.km) : Math.round(res.singleTripKm / clientCount)
          };
        }));
      }
    } catch (err) {
      setRouteError(err.message || 'Errore durante il calcolo automatico del percorso.');
    } finally {
      setRouteCalculating(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = storageService.subscribe((event) => {
      if (event.type === 'data') {
        setFleet(storageService.getFleet());
        setTrailers(storageService.getTrailers());
        setSettings(storageService.getSettings());
        setSavedSimulations(storageService.getSimulations());
      }
    });
    return () => unsubscribe();
  }, []);

  const loadData = () => {
    const f = storageService.getFleet();
    const t = storageService.getTrailers();
    const s = storageService.getSettings();
    const sims = storageService.getSimulations();
    setFleet(f);
    setTrailers(t);
    setSettings(s);
    setSavedSimulations(sims);

    // Sincronizzazione settimanale automatica prezzi carburanti "Alla Pompa" da fonti ufficiali (MASE / GME)
    storageService.refreshWeeklyFuelPricesFromOfficialSources({ force: false }).then(res => {
      if (res && res.updated && res.settings) {
        setSettings(res.settings);
        const curVehId = selectedVehicleIdRef.current || f[0]?.id;
        const curVeh = f.find(item => item.id === curVehId);
        if (curVeh && !hasUserTouchedVehicleRef.current) {
          updateFuelForVehicle(curVeh, res.settings);
        }
      }
    });

    const washDef = s?.accessoryParams?.washing;
    if (washDef) {
      setWashingUnitCost(washDef.costPerWash ?? 80);
      setWashingCountPerMonth(washDef.washesPerMonth ?? 2);
    }

    if (f.length > 0) {
      const firstVeh = f[0];
      setSelectedVehicleId(firstVeh.id);
      selectedVehicleIdRef.current = firstVeh.id;
      setLeasePaymentTiming(firstVeh.leasePaymentTiming || normalizeLeaseTiming(firstVeh));
      updateFuelForVehicle(firstVeh, s);
      updateTireForCombo(firstVeh, null, s);
      updateTelematicsForCombo(firstVeh, null, s, true);
    }
  };

  const updateFuelForVehicle = (vehicle, curSettings) => {
    if (!vehicle || !curSettings) return;
    const fuel = curSettings.fuelTypes.find(ft => ft.id === vehicle.fuelTypeId);
    if (fuel) {
      setFuelPrice(fuel.price);
    }
  };

  const updateTireForCombo = (vehicle, trailer, curSettings) => {
    const calc = calculateTireCostPerKm(vehicle, trailer, curSettings?.tireParameters || {});
    setTireRate(calc.totalRate);
  };

  const updateTelematicsForCombo = (vehicle, trailer, curSettings, forceAuto = telematicsAuto) => {
    if (!forceAuto) return;
    const telDef = curSettings?.accessoryParams?.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12, vanMonthly: 12 };
    let totalTel = 0;
    if (vehicle) {
      const cat = (vehicle.category || '').toLowerCase();
      if (cat === 'trattore') totalTel += Number(telDef.tractorMonthly ?? 14);
      else if (cat === 'motrice') totalTel += Number(telDef.rigidMonthly ?? 12);
      else totalTel += Number(telDef.vanMonthly ?? 12);
    }
    if (trailer) {
      totalTel += Number(telDef.trailerMonthly ?? 13);
    }
    setTelematicsMonthly(+totalTel.toFixed(2));
  };

  const handleVehicleChange = (vId) => {
    hasUserTouchedVehicleRef.current = true;
    selectedVehicleIdRef.current = vId;
    setSelectedVehicleId(vId);
    const vehicle = fleet.find(v => v.id === vId);
    const trailer = trailers.find(t => t.id === selectedTrailerId);
    if (vehicle && settings) {
      updateFuelForVehicle(vehicle, settings);
      updateTireForCombo(vehicle, trailer, settings);
      setTelematicsAuto(true);
      updateTelematicsForCombo(vehicle, trailer, settings, true);
      setLeasePaymentTiming(vehicle.leasePaymentTiming || normalizeLeaseTiming(vehicle));
    }
  };

  const handleTrailerChange = (tId) => {
    setSelectedTrailerId(tId);
    const vehicle = fleet.find(v => v.id === selectedVehicleId);
    const trailer = trailers.find(t => t.id === tId);
    if (settings) {
      if (vehicle) {
        updateTireForCombo(vehicle, trailer, settings);
      }
      setTelematicsAuto(true);
      updateTelematicsForCombo(vehicle, trailer, settings, true);
      setTrailerLeasePaymentTiming(trailer ? normalizeLeaseTiming(trailer) : leasePaymentTiming);

      const isFrigo = Boolean(trailer && trailer.fridgeTech !== 'nessuno' && isRefrigeratedTrailer(trailer));
      setRefrigerationEnabled(isFrigo);
      if (isFrigo) {
        let tech = 'gasolio';
        if (trailer?.fridgeTech && trailer.fridgeTech !== 'nessuno') {
          tech = trailer.fridgeTech;
        } else if (trailer?.category === 'refrigerato_azoto' || (trailer?.tractionType || '').toLowerCase().includes('azoto')) {
          tech = 'azoto';
        } else if (trailer?.fuelTypeId === 'elettrico' || (trailer?.categoryLabel || '').toLowerCase().includes('elettric')) {
          tech = 'elettrico';
        }
        const defaultsMap = {
          azoto: { unitCost: 0.13, hourlyConsumption: 30 },
          gasolio: { unitCost: 1.80, hourlyConsumption: 3.0 },
          elettrico: { unitCost: 0.35, hourlyConsumption: 8.0 }
        };
        const techDef = settings?.refrigerationParams?.[tech] || defaultsMap[tech];
        setRefrigerationTech(tech);
        setRefrigerationUnitCost(techDef.unitCost);
        setRefrigerationHourlyConsumption(trailer?.fridgeHourlyConsumption > 0 ? Number(trailer.fridgeHourlyConsumption) : techDef.hourlyConsumption);
        if (!refrigerationHoursDaily) setRefrigerationHoursDaily(8);
      }
    }
  };

  const handleRefrigerationTechSwitch = (tech) => {
    setRefrigerationTech(tech);
    const defaultsMap = {
      azoto: { unitCost: 0.13, hourlyConsumption: 30 },
      gasolio: { unitCost: 1.80, hourlyConsumption: 3.0 },
      elettrico: { unitCost: 0.35, hourlyConsumption: 8.0 }
    };
    const techDef = settings?.refrigerationParams?.[tech] || defaultsMap[tech] || defaultsMap.gasolio;
    setRefrigerationUnitCost(techDef.unitCost);
    setRefrigerationHourlyConsumption(techDef.hourlyConsumption);
  };

  const currentShiftType = doubleDrivers ? '2_turni' : (isNightShift ? '1_notturno' : '1_diurno');

  // Helper puro per calcolare i risultati da parametri correnti o ricaricati
  const buildSimulationResult = (params = {}) => {
    const curFleet = params.fleetList || fleet;
    const curTrailers = params.trailersList || trailers;
    const curSettings = params.settingsObj || settings || {};

    const vehId = params.vehicleId ?? selectedVehicleId;
    const trlId = params.trailerId ?? selectedTrailerId;
    const vehicle = curFleet.find(v => v.id === vehId);
    const trailer = curTrailers.find(t => t.id === trlId) || null;
    if (!vehicle) return null;

    const km = toFiniteNumber(params.kmTotal ?? kmTotal, 0);
    const hPct = toFiniteNumber(params.kmHighwayPercent ?? kmHighwayPercent, 0);
    const highwayKm = (km * hPct) / 100;
    const urbanKm = km - highwayKm;
    const workingDays = Math.max(1, toFiniteNumber(params.workingDaysMonth ?? workingDaysMonth, 22));
    const opMonths = Math.max(1, toFiniteNumber(params.operatingMonths ?? operatingMonths, 36));
    const dblDrivers = params.doubleDrivers !== undefined ? params.doubleDrivers : doubleDrivers;
    const nightShift = params.isNightShift !== undefined ? params.isNightShift : isNightShift;
    const shiftType = dblDrivers ? '2_turni' : (nightShift ? '1_notturno' : '1_diurno');
    const ePayer = params.energyPayer ?? energyPayer;
    const fPrice = toFiniteNumber(params.fuelPrice ?? fuelPrice, 0.38);
    const tRate = toFiniteNumber(params.tollRate ?? tollRate, 0.12);
    const tiRate = toFiniteNumber(params.tireRate ?? tireRate, 0.04);
    const oroMult = toFiniteNumber(params.orographicMultiplier ?? orographicMultiplier, 1.0);
    const safeOroMultiplier = oroMult > 0 ? oroMult : 1.0;

    let baseFuelDaily = 0;
    if (ePayer !== 'client') {
      if (vehicle.fuelTypeId === 'elettrico') {
        baseFuelDaily = toFiniteNumber(vehicle.avgConsumption, 1.2) * km * fPrice;
      } else if (vehicle.fuelTypeId === 'biolng') {
        if (vehicle.yieldKmPerUnit && vehicle.yieldKmPerUnit > 0) {
          baseFuelDaily = (km / vehicle.yieldKmPerUnit) * fPrice;
        } else {
          baseFuelDaily = (toFiniteNumber(vehicle.avgConsumption, 30) / 100) * km * fPrice;
        }
      } else {
        baseFuelDaily = (toFiniteNumber(vehicle.avgConsumption, 32) / 100) * km * fPrice;
      }
    }
    const fuelDaily = +(baseFuelDaily * safeOroMultiplier).toFixed(2);
    const tollsDaily = highwayKm * tRate;
    const tiresDaily = km * tiRate;
    const driverDaily = calculateDriverDailyCost(vehicle, shiftType, curSettings);

    const insCalc = calculateSpecificInsuranceCost(vehicle, trailer, workingDays, curSettings);
    const vehicleLeaseDaily = workingDays > 0
      ? ((Number(vehicle.monthlyLease) || 0) + insCalc.vehicleInsuranceMonthly) / workingDays
      : 0;
    const trailerLeaseDaily = (trailer && workingDays > 0)
      ? ((Number(trailer.monthlyLease) || 0) + insCalc.trailerInsuranceMonthly) / workingDays
      : 0;

    const refEn = params.refrigerationEnabled !== undefined ? params.refrigerationEnabled : refrigerationEnabled;
    const refT = params.refrigerationTech ?? refrigerationTech;
    const refUnit = params.refrigerationUnitCost ?? refrigerationUnitCost;
    const refHourly = params.refrigerationHourlyConsumption ?? refrigerationHourlyConsumption;
    const refHoursD = params.refrigerationHoursDaily ?? refrigerationHoursDaily;

    const refCalc = calculateRefrigerationDailyCost({
      refrigerationEnabled: refEn,
      refrigerationTech: refT,
      refrigerationUnitCost: refUnit,
      refrigerationHourlyConsumption: refHourly,
      refrigerationHoursDaily: refHoursD
    }, trailer, curSettings);
    const refrigerationCostDaily = refCalc.dailyCost;

    const telEn = params.telematicsEnabled !== undefined ? params.telematicsEnabled : telematicsEnabled;
    const telAu = params.telematicsAuto !== undefined ? params.telematicsAuto : telematicsAuto;
    const telMo = params.telematicsMonthly ?? telematicsMonthly;
    const washEn = params.washingEnabled !== undefined ? params.washingEnabled : washingEnabled;
    const washUnit = params.washingUnitCost ?? washingUnitCost;
    const washCount = params.washingCountPerMonth ?? washingCountPerMonth;
    const exDesc = params.extraCostDescription ?? extraCostDescription;
    const exAmt = params.extraCostAmount ?? extraCostAmount;
    const exFreq = params.extraCostFrequency ?? extraCostFrequency;

    const accCalc = calculateAccessoriesDailyCost({
      workingDaysMonth: workingDays,
      operatingMonths: opMonths,
      managementType: 'D',
      telematicsEnabled: telEn,
      telematicsAuto: telAu,
      telematicsMonthly: telMo,
      washingEnabled: washEn,
      washingUnitCost: washUnit,
      washingCountPerMonth: washCount,
      extraCostDescription: exDesc,
      extraCostAmount: exAmt,
      extraCostFrequency: exFreq
    }, vehicle, trailer, curSettings);

    const telematicsCostDaily = accCalc.telematicsDaily;
    const washingCostDaily = accCalc.washingDaily;
    const extraCostDaily = accCalc.extraDaily;

    const pFee = toFiniteNumber(params.partnerFeePerTrip ?? partnerFeePerTrip, 0);
    const tPerDay = Math.max(1, toFiniteNumber(params.tripsPerDay ?? tripsPerDay, 1));
    const partnerFeeDaily = pFee * tPerDay;

    const totalCostDaily = fuelDaily + tollsDaily + tiresDaily + driverDaily +
      vehicleLeaseDaily + trailerLeaseDaily +
      refrigerationCostDaily + telematicsCostDaily + washingCostDaily + extraCostDaily +
      partnerFeeDaily;

    const cCount = params.clientCount ?? clientCount;
    const allocMode = params.costAllocationMode ?? costAllocationMode;
    const bEntities = params.billingEntities ?? billingEntities;
    const tMargin = params.targetMarginPercent ?? targetMarginPercent;
    const isMulti = cCount > 1;
    const activeBillingEntities = bEntities.slice(0, cCount);
    const multiAlloc = isMulti
      ? computeMultiClientAllocation(totalCostDaily, workingDays, activeBillingEntities, allocMode)
      : null;

    const marginPct = isMulti
      ? multiAlloc.totalMolPercent
      : toFiniteNumber(tMargin, 20);
    const revenueDailyTarget = isMulti
      ? multiAlloc.totalRevenueDaily
      : (marginPct < 100 ? totalCostDaily / (1 - (marginPct / 100)) : totalCostDaily * 1.2);
    const molDailyTarget = revenueDailyTarget - totalCostDaily;

    const pClient = params.paymentTermsClient ?? paymentTermsClient;
    const pSuppliers = params.paymentTermsSuppliers ?? paymentTermsSuppliers;
    const lTiming = params.leasePaymentTiming ?? leasePaymentTiming;
    const tTiming = params.trailerLeasePaymentTiming ?? trailerLeasePaymentTiming;
    const pDriver = params.paymentTermsDriver ?? paymentTermsDriver;
    const pFuel = params.paymentTermsFuel ?? paymentTermsFuel;
    const pTolls = params.paymentTermsTolls ?? paymentTermsTolls;
    const pTires = params.paymentTermsTires ?? paymentTermsTires;
    const pRef = params.paymentTermsRefrigeration ?? paymentTermsRefrigeration;
    const pTel = params.paymentTermsTelematics ?? paymentTermsTelematics;
    const pWash = params.paymentTermsWashing ?? paymentTermsWashing;
    const pExtra = params.paymentTermsExtra ?? paymentTermsExtra;

    const simulatedProjectObj = {
      workingDaysMonth: workingDays,
      operatingMonths: opMonths,
      driverCostDaily: driverDaily,
      energyPayer: ePayer,
      fuelCostDaily: fuelDaily,
      tollsDaily,
      tiresDaily,
      partnerMarginDaily: partnerFeeDaily,
      refrigerationCostDaily,
      telematicsCostDaily,
      washingCostDaily,
      extraCostDaily,
      vehicleLeaseDaily,
      trailerLeaseDaily,
      revenueDaily: revenueDailyTarget,
      isMultiClient: isMulti,
      costAllocationMode: allocMode,
      billingEntities: isMulti ? multiAlloc.entities : [],
      leasePaymentTiming: lTiming,
      trailerLeasePaymentTiming: tTiming,
      paymentTermsClient: isMulti ? multiAlloc.weightedClientDso : pClient,
      paymentTermsSuppliers: pSuppliers,
      paymentTermsDriver: pDriver,
      paymentTermsFuel: pFuel,
      paymentTermsTolls: pTolls,
      paymentTermsTires: pTires,
      paymentTermsRefrigeration: pRef,
      paymentTermsTelematics: pTel,
      paymentTermsWashing: pWash,
      paymentTermsExtra: pExtra,
      depositAmount: 0
    };
    const financialMetrics = calculateSingleProjectMetrics(simulatedProjectObj);

    return {
      vehicle,
      trailer,
      kmTotal: km,
      highwayKm,
      urbanKm,
      workingDays,
      operatingMonths: opMonths,
      driverShiftType: shiftType,
      energyPayer: ePayer,
      baseFuelDaily: +baseFuelDaily.toFixed(2),
      orographicMultiplier: safeOroMultiplier,
      routeStops: params.routeStops ?? routeStops,
      isRoundTrip: params.isRoundTrip !== undefined ? params.isRoundTrip : isRoundTrip,
      routeAnalysis: params.routeAnalysis ?? routeAnalysis,
      tollRate: tRate,
      tireRate: tiRate,
      fuelPrice: fPrice,
      fuelDaily,
      tollsDaily,
      tiresDaily,
      driverDaily,
      vehicleLeaseDaily,
      trailerLeaseDaily,
      refrigerationEnabled: refEn,
      refrigerationTech: refT,
      refrigerationHourlyCost: refCalc.hourlyCost,
      refrigerationHoursDaily: refHoursD,
      refrigerationCostDaily,
      telematicsEnabled: telEn,
      telematicsMonthly: accCalc.telematicsMonthly,
      telematicsCostDaily,
      washingEnabled: washEn,
      washingMonthly: accCalc.washingMonthly,
      washingCostDaily,
      extraCostDescription: exDesc,
      extraCostAmount: exAmt,
      extraCostFrequency: exFreq,
      extraCostDaily,
      partnerFeePerTrip: pFee,
      tripsPerDay: tPerDay,
      partnerMarginDaily: partnerFeeDaily,
      isMultiClient: isMulti,
      clientCount: cCount,
      costAllocationMode: allocMode,
      multiAllocation: multiAlloc,
      billingEntities: isMulti ? multiAlloc.entities : [],
      totalCostDaily: financialMetrics.totalCostDaily,
      revenueDailyTarget,
      molDailyTarget,
      molPercent: +marginPct.toFixed(2),
      monthlyCost: financialMetrics.monthlyCost,
      monthlyRevenue: financialMetrics.monthlyRevenue,
      monthlyMol: financialMetrics.monthlyMol,
      costPerKm: km > 0 ? financialMetrics.totalCostDaily / km : 0,
      revenuePerKm: km > 0 ? revenueDailyTarget / km : 0,
      gapDays: financialMetrics.gapDays,
      weightedDpoDays: financialMetrics.weightedDpoDays,
      workingCapitalNeed: financialMetrics.estimatedWorkingCapitalGap,
      workingCapitalBreakdown: financialMetrics.workingCapitalBreakdown
    };
  };

  const currentFormSignature = useMemo(() => JSON.stringify({
    selectedVehicleId, selectedTrailerId, clientName, routeName, clientCount, costAllocationMode,
    billingEntities: billingEntities.slice(0, clientCount),
    kmTotal, kmHighwayPercent, workingDaysMonth, doubleDrivers, isNightShift, energyPayer,
    fuelPrice, tollRate, tireRate, targetMarginPercent, operatingMonths,
    refrigerationEnabled, refrigerationTech, refrigerationUnitCost, refrigerationHourlyConsumption, refrigerationHoursDaily,
    telematicsEnabled, telematicsAuto, telematicsMonthly, washingEnabled, washingUnitCost, washingCountPerMonth,
    extraCostDescription, extraCostAmount, extraCostFrequency, partnerFeePerTrip, tripsPerDay,
    paymentTermsClient, paymentTermsSuppliers, leasePaymentTiming, trailerLeasePaymentTiming,
    paymentTermsDriver, paymentTermsFuel, paymentTermsTolls, paymentTermsTires,
    paymentTermsRefrigeration, paymentTermsTelematics, paymentTermsWashing, paymentTermsExtra,
    orographicMultiplier
  }), [
    selectedVehicleId, selectedTrailerId, clientName, routeName, clientCount, costAllocationMode,
    billingEntities, kmTotal, kmHighwayPercent, workingDaysMonth, doubleDrivers, isNightShift, energyPayer,
    fuelPrice, tollRate, tireRate, targetMarginPercent, operatingMonths,
    refrigerationEnabled, refrigerationTech, refrigerationUnitCost, refrigerationHourlyConsumption, refrigerationHoursDaily,
    telematicsEnabled, telematicsAuto, telematicsMonthly, washingEnabled, washingUnitCost, washingCountPerMonth,
    extraCostDescription, extraCostAmount, extraCostFrequency, partnerFeePerTrip, tripsPerDay,
    paymentTermsClient, paymentTermsSuppliers, leasePaymentTiming, trailerLeasePaymentTiming,
    paymentTermsDriver, paymentTermsFuel, paymentTermsTolls, paymentTermsTires,
    paymentTermsRefrigeration, paymentTermsTelematics, paymentTermsWashing, paymentTermsExtra,
    orographicMultiplier
  ]);

  const isResultStale = Boolean(simulationResult && lastComputedSignature && currentFormSignature !== lastComputedSignature);

  // Calcola Anteprima Preventivo (NON sovrascrive l'archivio finché l'utente non clicca Salva in Archivio)
  const handleCalculate = (e) => {
    if (e) e.preventDefault();
    const computedResult = buildSimulationResult();
    if (computedResult) {
      setSimulationResult(computedResult);
      setLastComputedSignature(currentFormSignature);
    }
  };

  // Registra o aggiorna esplicitamente la simulazione nell'Archivio Preventivi
  const handleSaveToRegistry = () => {
    const computed = buildSimulationResult();
    if (!computed) return;
    setSimulationResult(computed);
    setLastComputedSignature(currentFormSignature);

    const existingSim = activeSimulationId
      ? savedSimulations.find(s => s.id === activeSimulationId)
      : null;
    const simCode = activeSimulationCode || ('PREV-' + Math.floor(100 + Math.random() * 900));
    const displayClient = computed.isMultiClient
      ? computed.multiAllocation.combinedClientLabel
      : (clientName || 'Trattativa Commerciale');
    const displayRoute = routeName || (routeAnalysis?.generatedRouteName) || `${computed.kmTotal} km/gg`;
    const activeRouteAnalysis = computed.routeAnalysis || routeAnalysis;
    const routeAnalysisSummary = activeRouteAnalysis ? {
      orography: activeRouteAnalysis.orography || null,
      highwayPercent: activeRouteAnalysis.highwayPercent,
      totalDailyKm: activeRouteAnalysis.totalDailyKm,
      estimatedTollsDaily: activeRouteAnalysis.estimatedTollsDaily,
      tollEstimation: activeRouteAnalysis.tollEstimation || null,
      legSummaries: activeRouteAnalysis.legSummaries || [],
      generatedRouteName: activeRouteAnalysis.generatedRouteName || displayRoute
    } : null;

    const savedSim = storageService.saveSimulation({
      id: activeSimulationId || undefined,
      code: simCode,
      status: existingSim?.status || 'pending',
      convertedProjectId: existingSim?.convertedProjectId,
      convertedProjectCode: existingSim?.convertedProjectCode,
      convertedAt: existingSim?.convertedAt,
      clientName: displayClient,
      rawClientName: clientName,
      routeName: displayRoute,
      vehicleId: computed.vehicle.id,
      vehicleName: computed.vehicle.name,
      trailerId: computed.trailer ? computed.trailer.id : '',
      trailerName: computed.trailer ? computed.trailer.name : '',
      kmTotal: computed.kmTotal,
      kmHighwayPercent: toFiniteNumber(kmHighwayPercent, 0),
      workingDaysMonth: computed.workingDays,
      operatingMonths: computed.operatingMonths,
      doubleDrivers,
      isNightShift,
      energyPayer: computed.energyPayer,
      fuelPrice: computed.fuelPrice,
      tollRate: computed.tollRate,
      tireRate: computed.tireRate,
      targetMarginPercent: computed.molPercent,
      refrigerationEnabled: computed.refrigerationEnabled,
      refrigerationTech: computed.refrigerationTech,
      refrigerationUnitCost,
      refrigerationHourlyConsumption,
      refrigerationHoursDaily: computed.refrigerationHoursDaily,
      telematicsEnabled: computed.telematicsEnabled,
      telematicsAuto,
      telematicsMonthly: computed.telematicsMonthly,
      washingEnabled: computed.washingEnabled,
      washingUnitCost,
      washingCountPerMonth,
      extraCostDescription,
      extraCostAmount,
      extraCostFrequency,
      partnerFeePerTrip: computed.partnerFeePerTrip,
      tripsPerDay: computed.tripsPerDay,
      paymentTermsClient,
      paymentTermsSuppliers,
      leasePaymentTiming,
      trailerLeasePaymentTiming,
      paymentTermsDriver,
      paymentTermsFuel,
      paymentTermsTolls,
      paymentTermsTires,
      paymentTermsRefrigeration,
      paymentTermsTelematics,
      paymentTermsWashing,
      paymentTermsExtra,
      isMultiClient: computed.isMultiClient,
      clientCount: computed.clientCount,
      costAllocationMode: computed.costAllocationMode,
      billingEntities: computed.isMultiClient ? computed.multiAllocation.entities : billingEntities,
      routeStops,
      isRoundTrip,
      orographicMultiplier: computed.orographicMultiplier,
      orographyProfile: activeRouteAnalysis?.orography || null,
      routeAnalysisSummary,
      resultSnapshot: {
        totalCostDaily: computed.totalCostDaily,
        revenueDailyTarget: computed.revenueDailyTarget,
        molDailyTarget: computed.molDailyTarget,
        molPercent: computed.molPercent,
        monthlyCost: computed.monthlyCost,
        monthlyRevenue: computed.monthlyRevenue,
        monthlyMol: computed.monthlyMol,
        workingCapitalNeed: computed.workingCapitalNeed
      }
    });

    setActiveSimulationId(savedSim.id);
    setActiveSimulationCode(savedSim.code);
    setSavedSimulations(storageService.getSimulations());
    setRegSaveBanner(`Preventivo ${savedSim.code} salvato nell'Archivio Simulazioni.`);
    setTimeout(() => setRegSaveBanner(''), 4000);
  };

  // Crea una nuova simulazione pulita (per non sovrascrivere quella precedente in archivio)
  const handleNewBlankSimulation = () => {
    hasUserTouchedVehicleRef.current = false;
    setActiveSimulationId(null);
    setActiveSimulationCode('');
    setSimulationResult(null);
    setLastComputedSignature('');
    setClientName('');
    setRouteName('');
    setClientCount(1);
    setCostAllocationMode('equal');
    setBillingEntities(DEFAULT_BILLING_ENTITIES.map(e => ({ ...e })));
    setSelectedTrailerId('');
    setKmTotal(250);
    setKmHighwayPercent(60);
    setWorkingDaysMonth(22);
    setOperatingMonths(36);
    setDoubleDrivers(false);
    setIsNightShift(false);
    setEnergyPayer('four');
    setTollRate(0.12);
    setTargetMarginPercent(21);
    setRefrigerationEnabled(false);
    setRefrigerationTech('gasolio');
    setRefrigerationHoursDaily(8);
    setExtraCostDescription('');
    setExtraCostAmount(0);
    setExtraCostFrequency('monthly');
    setPartnerFeePerTrip(0);
    setTripsPerDay(1);
    setPaymentTermsClient(60);
    setPaymentTermsSuppliers(30);
    setPaymentTermsDriver(16);
    setPaymentTermsFuel(30);
    setPaymentTermsTolls(15);
    setPaymentTermsTires(30);
    setPaymentTermsRefrigeration(30);
    setPaymentTermsTelematics(30);
    setPaymentTermsWashing(30);
    setPaymentTermsExtra(30);
    setRouteStops(DEFAULT_ROUTE_STOPS.map(s => ({ ...s })));
    setIsRoundTrip(true);
    setRouteAnalysis(null);
    setRouteError('');
    setOrographicMultiplier(1.0);
    if (fleet.length > 0) {
      const firstVeh = fleet[0];
      setSelectedVehicleId(firstVeh.id);
      selectedVehicleIdRef.current = firstVeh.id;
      setLeasePaymentTiming(firstVeh.leasePaymentTiming || normalizeLeaseTiming(firstVeh));
      updateFuelForVehicle(firstVeh, settings);
      updateTireForCombo(firstVeh, null, settings);
      setTelematicsAuto(true);
      updateTelematicsForCombo(firstVeh, null, settings, true);
    }
    const washDef = settings?.accessoryParams?.washing;
    setWashingEnabled(true);
    setWashingUnitCost(washDef?.costPerWash ?? 80);
    setWashingCountPerMonth(washDef?.washesPerMonth ?? 2);
    setRegSaveBanner('Pronto per una nuova simulazione (verrà registrata con un nuovo codice).');
    setTimeout(() => setRegSaveBanner(''), 3000);
  };

  // Ricarica una simulazione salvata nel configuratore e calcola subito i risultati
  const handleLoadSavedSimulation = (sim) => {
    if (!sim) return;
    hasUserTouchedVehicleRef.current = true;
    setActiveSimulationId(sim.id);
    setActiveSimulationCode(sim.code || '');
    setClientName(sim.rawClientName !== undefined ? sim.rawClientName : (sim.clientName || ''));
    setRouteName(sim.routeName || '');
    if (sim.vehicleId) {
      setSelectedVehicleId(sim.vehicleId);
      selectedVehicleIdRef.current = sim.vehicleId;
    }
    setSelectedTrailerId(sim.trailerId || '');
    setKmTotal(sim.kmTotal ?? 250);
    setKmHighwayPercent(sim.kmHighwayPercent ?? 60);
    setWorkingDaysMonth(sim.workingDaysMonth ?? 22);
    setOperatingMonths(sim.operatingMonths ?? 36);
    setDoubleDrivers(Boolean(sim.doubleDrivers));
    setIsNightShift(Boolean(sim.isNightShift));
    setEnergyPayer(sim.energyPayer || 'four');
    if (sim.fuelPrice !== undefined) setFuelPrice(sim.fuelPrice);
    if (sim.tollRate !== undefined) setTollRate(sim.tollRate);
    if (sim.tireRate !== undefined) setTireRate(sim.tireRate);
    if (sim.targetMarginPercent !== undefined) setTargetMarginPercent(sim.targetMarginPercent);
    setRefrigerationEnabled(Boolean(sim.refrigerationEnabled));
    if (sim.refrigerationTech) setRefrigerationTech(sim.refrigerationTech);
    if (sim.refrigerationUnitCost !== undefined) setRefrigerationUnitCost(sim.refrigerationUnitCost);
    if (sim.refrigerationHourlyConsumption !== undefined) setRefrigerationHourlyConsumption(sim.refrigerationHourlyConsumption);
    if (sim.refrigerationHoursDaily !== undefined) setRefrigerationHoursDaily(sim.refrigerationHoursDaily);
    setTelematicsEnabled(sim.telematicsEnabled !== undefined ? sim.telematicsEnabled : true);
    setTelematicsAuto(sim.telematicsAuto !== undefined ? sim.telematicsAuto : true);
    if (sim.telematicsMonthly !== undefined) setTelematicsMonthly(sim.telematicsMonthly);
    setWashingEnabled(sim.washingEnabled !== undefined ? sim.washingEnabled : true);
    if (sim.washingUnitCost !== undefined) setWashingUnitCost(sim.washingUnitCost);
    if (sim.washingCountPerMonth !== undefined) setWashingCountPerMonth(sim.washingCountPerMonth);
    setExtraCostDescription(sim.extraCostDescription || '');
    setExtraCostAmount(sim.extraCostAmount || 0);
    setExtraCostFrequency(sim.extraCostFrequency || 'monthly');
    setPartnerFeePerTrip(sim.partnerFeePerTrip || 0);
    setTripsPerDay(sim.tripsPerDay || 1);
    setPaymentTermsClient(sim.paymentTermsClient ?? 60);
    setPaymentTermsSuppliers(sim.paymentTermsSuppliers ?? 30);
    setPaymentTermsDriver(sim.paymentTermsDriver ?? 16);
    setPaymentTermsFuel(sim.paymentTermsFuel ?? 30);
    setPaymentTermsTolls(sim.paymentTermsTolls ?? 15);
    setPaymentTermsTires(sim.paymentTermsTires ?? 30);
    setPaymentTermsRefrigeration(sim.paymentTermsRefrigeration ?? 30);
    setPaymentTermsTelematics(sim.paymentTermsTelematics ?? 30);
    setPaymentTermsWashing(sim.paymentTermsWashing ?? 30);
    setPaymentTermsExtra(sim.paymentTermsExtra ?? 30);
    if (sim.leasePaymentTiming) setLeasePaymentTiming(sim.leasePaymentTiming);
    if (sim.trailerLeasePaymentTiming) setTrailerLeasePaymentTiming(sim.trailerLeasePaymentTiming);
    setClientCount(sim.clientCount || 1);
    setCostAllocationMode(sim.costAllocationMode || 'equal');
    const mergedEntities = Array.isArray(sim.billingEntities) && sim.billingEntities.length > 0
      ? DEFAULT_BILLING_ENTITIES.map((def, i) => (sim.billingEntities[i] ? { ...def, ...sim.billingEntities[i] } : { ...def }))
      : DEFAULT_BILLING_ENTITIES.map(def => ({ ...def }));
    setBillingEntities(mergedEntities);
    setRouteStops(
      Array.isArray(sim.routeStops) && sim.routeStops.length >= 2
        ? sim.routeStops
        : DEFAULT_ROUTE_STOPS.map(s => ({ ...s }))
    );
    setRouteError('');
    if (sim.isRoundTrip !== undefined) setIsRoundTrip(Boolean(sim.isRoundTrip));
    setOrographicMultiplier(sim.orographicMultiplier ?? 1.0);
    if (sim.routeAnalysisSummary) {
      setRouteAnalysis(sim.routeAnalysisSummary);
    } else if (sim.orographyProfile) {
      setRouteAnalysis({
        orography: sim.orographyProfile,
        generatedRouteName: sim.routeName,
        totalDailyKm: sim.kmTotal ?? 250,
        highwayPercent: sim.kmHighwayPercent ?? 60,
        estimatedTollsDaily: +((((sim.kmTotal ?? 250) * (sim.kmHighwayPercent ?? 60)) / 100) * (sim.tollRate ?? 0.12)).toFixed(2),
        tollEstimation: { suggestedRate: sim.tollRate ?? 0.12 }
      });
    } else {
      setRouteAnalysis(null);
    }

    const restoredRouteAnalysis = sim.routeAnalysisSummary || (sim.orographyProfile ? {
      orography: sim.orographyProfile,
      generatedRouteName: sim.routeName
    } : null);

    const immediateResult = buildSimulationResult({
      vehicleId: sim.vehicleId,
      trailerId: sim.trailerId || '',
      kmTotal: sim.kmTotal ?? 250,
      kmHighwayPercent: sim.kmHighwayPercent ?? 60,
      workingDaysMonth: sim.workingDaysMonth ?? 22,
      operatingMonths: sim.operatingMonths ?? 36,
      doubleDrivers: Boolean(sim.doubleDrivers),
      isNightShift: Boolean(sim.isNightShift),
      energyPayer: sim.energyPayer || 'four',
      fuelPrice: sim.fuelPrice,
      tollRate: sim.tollRate,
      tireRate: sim.tireRate,
      targetMarginPercent: sim.targetMarginPercent,
      refrigerationEnabled: Boolean(sim.refrigerationEnabled),
      refrigerationTech: sim.refrigerationTech,
      refrigerationUnitCost: sim.refrigerationUnitCost,
      refrigerationHourlyConsumption: sim.refrigerationHourlyConsumption,
      refrigerationHoursDaily: sim.refrigerationHoursDaily,
      telematicsEnabled: sim.telematicsEnabled !== undefined ? sim.telematicsEnabled : true,
      telematicsAuto: sim.telematicsAuto !== undefined ? sim.telematicsAuto : true,
      telematicsMonthly: sim.telematicsMonthly,
      washingEnabled: sim.washingEnabled !== undefined ? sim.washingEnabled : true,
      washingUnitCost: sim.washingUnitCost,
      washingCountPerMonth: sim.washingCountPerMonth,
      extraCostDescription: sim.extraCostDescription || '',
      extraCostAmount: sim.extraCostAmount || 0,
      extraCostFrequency: sim.extraCostFrequency || 'monthly',
      partnerFeePerTrip: sim.partnerFeePerTrip || 0,
      tripsPerDay: sim.tripsPerDay || 1,
      paymentTermsClient: sim.paymentTermsClient ?? 60,
      paymentTermsSuppliers: sim.paymentTermsSuppliers ?? 30,
      paymentTermsDriver: sim.paymentTermsDriver ?? 16,
      paymentTermsFuel: sim.paymentTermsFuel ?? 30,
      paymentTermsTolls: sim.paymentTermsTolls ?? 15,
      paymentTermsTires: sim.paymentTermsTires ?? 30,
      paymentTermsRefrigeration: sim.paymentTermsRefrigeration ?? 30,
      paymentTermsTelematics: sim.paymentTermsTelematics ?? 30,
      paymentTermsWashing: sim.paymentTermsWashing ?? 30,
      paymentTermsExtra: sim.paymentTermsExtra ?? 30,
      leasePaymentTiming: sim.leasePaymentTiming,
      trailerLeasePaymentTiming: sim.trailerLeasePaymentTiming,
      clientCount: sim.clientCount || 1,
      costAllocationMode: sim.costAllocationMode || 'equal',
      billingEntities: mergedEntities,
      routeStops: sim.routeStops,
      isRoundTrip: sim.isRoundTrip,
      routeAnalysis: restoredRouteAnalysis,
      orographicMultiplier: sim.orographicMultiplier ?? 1.0
    });
    if (immediateResult) {
      setSimulationResult(immediateResult);
      setLastComputedSignature('');
      setRegSaveBanner(`Simulazione ${sim.code} ricaricata con anteprima aggiornata.`);
    } else {
      setSimulationResult(null);
      setLastComputedSignature('');
      setRegSaveBanner(`Attenzione: mezzo originale (${sim.vehicleName || sim.vehicleId}) non più in flotta. Seleziona un nuovo mezzo e ricalcola.`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSavedSimulation = (id) => {
    if (!window.confirm('Sei sicuro di voler eliminare questa simulazione dall\'archivio?')) return;
    storageService.deleteSimulation(id);
    if (activeSimulationId === id) {
      setActiveSimulationId(null);
      setActiveSimulationCode('');
    }
    setSavedSimulations(storageService.getSimulations());
  };

  // Converte direttamente una simulazione registrata nell'archivio in una Commessa Attiva o Trattativa in ProjectsPage
  const handleConvertSavedSimToProject = (sim, statusType = 'active') => {
    if (!sim) return;
    const isPotential = statusType === 'potential';
    const veh = fleet.find(v => v.id === sim.vehicleId) || fleet[0];
    const trl = trailers.find(t => t.id === sim.trailerId) || null;
    const curSettings = settings || {};
    const snap = sim.resultSnapshot || {};
    const workingDays = sim.workingDaysMonth || 22;
    const opMonths = Number(sim.operatingMonths) || 36;
    const leaseTiming = sim.leasePaymentTiming || 'M1_D10';
    const leaseTerms = leaseTiming === 'M1_D10' ? 0 : leaseTiming === 'M1_D30' ? 30 : 60;
    const isMulti = Boolean(sim.isMultiClient) && Array.isArray(sim.billingEntities) && sim.billingEntities.length > 1;
    const multiAllocForConvert = isMulti
      ? computeMultiClientAllocation(
          snap.totalCostDaily || 0,
          workingDays,
          sim.billingEntities,
          sim.costAllocationMode || 'equal'
        )
      : null;
    const shiftType = sim.doubleDrivers ? '2_turni' : (sim.isNightShift ? '1_notturno' : '1_diurno');
    const mgmtType = veh?.ownershipType === 'terzi' ? 'T' : 'D';
    const driverDaily = calculateDriverDailyCost(veh, shiftType, curSettings);

    // Fix Bug 1: include assicurazione specifica su mezzo e semirimorchio
    const insCalc = calculateSpecificInsuranceCost(veh, trl, workingDays, curSettings);
    const vLeaseDaily = workingDays > 0
      ? ((Number(veh?.monthlyLease) || 0) + insCalc.vehicleInsuranceMonthly) / workingDays
      : 0;
    const tLeaseDaily = (trl && workingDays > 0)
      ? ((Number(trl.monthlyLease) || 0) + insCalc.trailerInsuranceMonthly) / workingDays
      : 0;

    const highwayKm = (toFiniteNumber(sim.kmTotal, 0) * toFiniteNumber(sim.kmHighwayPercent, 60)) / 100;
    const tollsDaily = +(highwayKm * toFiniteNumber(sim.tollRate, 0.12)).toFixed(2);
    const tiresDaily = +(toFiniteNumber(sim.kmTotal, 0) * toFiniteNumber(sim.tireRate, 0.04)).toFixed(2);
    const partnerDaily = +(toFiniteNumber(sim.partnerFeePerTrip, 0) * toFiniteNumber(sim.tripsPerDay, 1)).toFixed(2);

    let fuelDaily = 0;
    if (sim.energyPayer !== 'client' && veh) {
      const fPrice = toFiniteNumber(sim.fuelPrice, 0.38);
      const km = toFiniteNumber(sim.kmTotal, 0);
      const oro = toFiniteNumber(sim.orographicMultiplier, 1.0);
      if (veh.fuelTypeId === 'elettrico') fuelDaily = +(toFiniteNumber(veh.avgConsumption, 1.2) * km * fPrice * oro).toFixed(2);
      else if (veh.fuelTypeId === 'biolng') {
        const base = veh.yieldKmPerUnit > 0 ? (km / veh.yieldKmPerUnit) * fPrice : (toFiniteNumber(veh.avgConsumption, 30) / 100) * km * fPrice;
        fuelDaily = +(base * oro).toFixed(2);
      } else {
        fuelDaily = +((toFiniteNumber(veh.avgConsumption, 32) / 100) * km * fPrice * oro).toFixed(2);
      }
    }

    // Fix Bug 2: calcola realmente gruppo frigo ed accessori/extra
    const refCalc = calculateRefrigerationDailyCost({
      refrigerationEnabled: Boolean(sim.refrigerationEnabled),
      refrigerationTech: sim.refrigerationTech || 'gasolio',
      refrigerationUnitCost: sim.refrigerationUnitCost,
      refrigerationHourlyConsumption: sim.refrigerationHourlyConsumption,
      refrigerationHoursDaily: sim.refrigerationHoursDaily
    }, trl, curSettings);

    const accCalc = calculateAccessoriesDailyCost({
      workingDaysMonth: workingDays,
      operatingMonths: opMonths,
      managementType: mgmtType,
      telematicsEnabled: sim.telematicsEnabled !== false,
      telematicsAuto: sim.telematicsAuto !== false,
      telematicsMonthly: sim.telematicsMonthly,
      washingEnabled: sim.washingEnabled !== false,
      washingUnitCost: sim.washingUnitCost,
      washingCountPerMonth: sim.washingCountPerMonth,
      extraCostDescription: sim.extraCostDescription,
      extraCostAmount: sim.extraCostAmount,
      extraCostFrequency: sim.extraCostFrequency
    }, veh, trl, curSettings);

    const draftProject = {
      code: (isPotential ? 'SIM-' : 'PRJ-') + Math.floor(100 + Math.random() * 900),
      sourceSimulationId: sim.id,
      sourceSimulationCode: sim.code,
      name: isMulti
        ? `Multi-Commessa (${sim.clientCount} Clienti): ${sim.routeName || sim.clientName}`
        : `${sim.clientName || 'Cliente'} - ${sim.routeName || `${sim.kmTotal} km/gg`}`,
      client: sim.clientName || 'Cliente',
      route: sim.routeName || `${sim.kmTotal} km giornalieri`,
      routeStops: sim.routeStops || [],
      isRoundTrip: sim.isRoundTrip !== undefined ? sim.isRoundTrip : true,
      orographicMultiplier: sim.orographicMultiplier ?? 1.0,
      orographyProfile: sim.orographyProfile || null,
      tollRate: toFiniteNumber(sim.tollRate, 0.12),
      isMultiClient: isMulti,
      costAllocationMode: sim.costAllocationMode || 'equal',
      billingEntities: isMulti ? (multiAllocForConvert?.entities || sim.billingEntities) : [],
      startDate: new Date().toISOString().slice(0, 10),
      operatingMonths: opMonths,
      workingDaysMonth: workingDays,
      kmDaily: toFiniteNumber(sim.kmTotal, 250),
      highwayPercent: toFiniteNumber(sim.kmHighwayPercent, 65),
      managementType: mgmtType,
      vehicleId: veh?.id || '',
      trailerId: trl ? trl.id : '',
      driverShiftType: shiftType,
      driverManualOverride: false,
      driverCostDaily: +driverDaily.toFixed(2),
      energyPayer: sim.energyPayer || 'four',
      fuelCostDaily: fuelDaily,
      tollsDaily,
      tiresDaily,
      refrigerationEnabled: Boolean(sim.refrigerationEnabled),
      refrigerationTech: refCalc.tech,
      refrigerationUnitCost: refCalc.unitCost,
      refrigerationHourlyConsumption: refCalc.hourlyConsumption,
      refrigerationHoursDaily: refCalc.hoursPerDay,
      refrigerationCostDaily: refCalc.dailyCost,
      telematicsEnabled: accCalc.telematicsEnabled,
      telematicsAuto: sim.telematicsAuto !== false,
      telematicsMonthly: accCalc.telematicsMonthly,
      telematicsCostDaily: accCalc.telematicsDaily,
      washingEnabled: accCalc.washingEnabled,
      washingUnitCost: accCalc.washUnitCost,
      washingCountPerMonth: accCalc.washesPerMonth,
      washingCostDaily: accCalc.washingDaily,
      extraCostDescription: sim.extraCostDescription || '',
      extraCostAmount: Number(sim.extraCostAmount) || 0,
      extraCostFrequency: sim.extraCostFrequency || 'monthly',
      extraCostDaily: accCalc.extraDaily,
      otherCostsDaily: 0,
      partnerMarginDaily: partnerDaily,
      porterageDaily: 0,
      vehicleLeaseDaily: +vLeaseDaily.toFixed(2),
      trailerLeaseDaily: +tLeaseDaily.toFixed(2),
      revenueDaily: +(snap.revenueDailyTarget || 750).toFixed(2),
      contractStatus: isPotential ? 'potential' : 'active',
      isPipelineFuture: isPotential,
      paymentTermsClient: isMulti
        ? (multiAllocForConvert?.weightedClientDso ?? (sim.paymentTermsClient ?? 60))
        : (sim.paymentTermsClient ?? 60),
      paymentTermsSuppliers: sim.paymentTermsSuppliers ?? 30,
      paymentTermsLease: leaseTerms,
      leasePaymentTiming: leaseTiming,
      trailerLeasePaymentTiming: sim.trailerLeasePaymentTiming || 'M1_D30',
      paymentTermsDriver: sim.paymentTermsDriver ?? 16,
      paymentTermsFuel: sim.paymentTermsFuel ?? 30,
      paymentTermsTolls: sim.paymentTermsTolls ?? 15,
      paymentTermsTires: sim.paymentTermsTires ?? 30,
      paymentTermsRefrigeration: sim.paymentTermsRefrigeration ?? 30,
      paymentTermsTelematics: sim.paymentTermsTelematics ?? 30,
      paymentTermsWashing: sim.paymentTermsWashing ?? 30,
      paymentTermsExtra: sim.paymentTermsExtra ?? 30,
      acciseRecoveryEligible: false,
      depositAmount: 0,
      notes: `Convertita da Simulazione registrata ${sim.code}${sim.orographyProfile ? ` | Orografia: ${sim.orographyProfile.terrainLabel} (D+ ${sim.orographyProfile.elevationGainM}m, fattore consumi ${sim.orographicMultiplier}x)` : ''}`
    };

    const calcMetrics = calculateSingleProjectMetrics(draftProject);
    const newProject = {
      ...draftProject,
      revenueDaily: +calcMetrics.revenueDaily.toFixed(2),
      totalCostDaily: +calcMetrics.totalCostDaily.toFixed(2),
      molDaily: +calcMetrics.molDaily.toFixed(2),
      monthlyCost: +calcMetrics.monthlyCost.toFixed(2),
      monthlyRevenue: +calcMetrics.monthlyRevenue.toFixed(2),
      monthlyMol: +calcMetrics.monthlyMol.toFixed(2),
      molPercent: +calcMetrics.molPercent.toFixed(2),
      targetMarginPercent: +calcMetrics.molPercent.toFixed(2),
      cashAdvanceRequired: +calcMetrics.estimatedWorkingCapitalGap.toFixed(2)
    };

    const createdProj = storageService.addProject(newProject);
    storageService.updateSimulation(sim.id, {
      status: isPotential ? 'in_negotiation' : 'accepted',
      convertedProjectId: createdProj.id,
      convertedProjectCode: createdProj.code,
      convertedAt: new Date().toISOString()
    });
    setSavedSimulations(storageService.getSimulations());
    navigate(`/projects?edit=${createdProj.id}`);
  };

  // Salva direttamente nel Budget Commesse FOUR passando TUTTI i parametri e le nuove voci
  const [saveMode, setSaveMode] = useState(null); // 'potential' | 'active'

  const handleSaveAsProject = (statusType = 'potential', splitIntoSeparateRows = false) => {
    const computed = buildSimulationResult();
    if (!computed) return;
    setSimulationResult(computed);
    setLastComputedSignature(currentFormSignature);
    const isPotential = statusType === 'potential';

    const leaseTiming = leasePaymentTiming;
    const leaseTerms = leaseTiming === 'M1_D10' ? 0 : leaseTiming === 'M1_D30' ? 30 : 60;
    const isMulti = Boolean(computed.isMultiClient) && Array.isArray(computed.billingEntities) && computed.billingEntities.length > 1;
    const safeHighwayPct = toFiniteNumber(kmHighwayPercent, 0);
    const safeOpMonths = computed.operatingMonths || 36;
    const safeOroProfile = computed.routeAnalysis?.orography || routeAnalysis?.orography || null;

    // Opzione B: Salva come N commesse distinte con costi già ribaltati secondo la % di ciascun cliente
    if (isMulti && splitIntoSeparateRows) {
      const groupCode = (isPotential ? 'SIM-MC' : 'PRJ-MC') + Math.floor(100 + Math.random() * 900);
      let firstCreatedProj = null;
      computed.billingEntities.forEach((entity, idx) => {
        const ratio = (toFiniteNumber(entity.costSharePercent, 0)) / 100;
        const cName = (entity.clientName || '').trim() || `Cliente ${idx + 1}`;
        const cRoute = (entity.route || '').trim() || routeName || `${computed.kmTotal} km giornalieri`;
        const splitDraft = {
          code: `${groupCode}-${idx + 1}`,
          multiGroupCode: groupCode,
          name: `${cName} - ${cRoute} (Quota ${entity.costSharePercent}% Multi-Commessa)`,
          client: cName,
          route: cRoute,
          routeStops: computed.routeStops || routeStops || [],
          isRoundTrip: computed.isRoundTrip !== undefined ? computed.isRoundTrip : isRoundTrip,
          orographicMultiplier: computed.orographicMultiplier || 1.0,
          orographyProfile: safeOroProfile,
          tollRate: computed.tollRate,
          startDate: new Date().toISOString().slice(0, 10),
          operatingMonths: safeOpMonths,
          workingDaysMonth: computed.workingDays,
          kmDaily: Math.round(computed.kmTotal * ratio),
          highwayPercent: safeHighwayPct,
          managementType: computed.vehicle.ownershipType === 'terzi' ? 'T' : 'D',
          vehicleId: computed.vehicle.id,
          trailerId: computed.trailer ? computed.trailer.id : '',
          driverShiftType: computed.driverShiftType,
          driverManualOverride: true,
          driverCostDaily: +(computed.driverDaily * ratio).toFixed(2),
          energyPayer: computed.energyPayer,
          fuelCostDaily: +(computed.fuelDaily * ratio).toFixed(2),
          tollsDaily: +(computed.tollsDaily * ratio).toFixed(2),
          tiresDaily: +(computed.tiresDaily * ratio).toFixed(2),
          refrigerationEnabled: computed.refrigerationEnabled,
          refrigerationTech: computed.refrigerationTech,
          refrigerationUnitCost: toFiniteNumber(refrigerationUnitCost, 0),
          refrigerationHourlyConsumption: toFiniteNumber(refrigerationHourlyConsumption, 0),
          refrigerationHoursDaily: +(toFiniteNumber(refrigerationHoursDaily, 0) * ratio).toFixed(2),
          refrigerationCostDaily: +(computed.refrigerationCostDaily * ratio).toFixed(2),
          telematicsEnabled: computed.telematicsEnabled,
          telematicsAuto: false,
          telematicsMonthly: +(computed.telematicsMonthly * ratio).toFixed(2),
          telematicsCostDaily: +(computed.telematicsCostDaily * ratio).toFixed(2),
          washingEnabled: computed.washingEnabled,
          washingUnitCost: +(toFiniteNumber(washingUnitCost, 0) * ratio).toFixed(2),
          washingCountPerMonth: toFiniteNumber(washingCountPerMonth, 0),
          washingCostDaily: +(computed.washingCostDaily * ratio).toFixed(2),
          extraCostDescription,
          extraCostAmount: +(toFiniteNumber(extraCostAmount, 0) * ratio).toFixed(2),
          extraCostFrequency,
          extraCostDaily: +(computed.extraCostDaily * ratio).toFixed(2),
          otherCostsDaily: 0,
          partnerMarginDaily: +((computed.partnerMarginDaily || 0) * ratio).toFixed(2),
          porterageDaily: 0,
          vehicleLeaseDaily: +(computed.vehicleLeaseDaily * ratio).toFixed(2),
          trailerLeaseDaily: +(computed.trailerLeaseDaily * ratio).toFixed(2),
          revenueDaily: +entity.revenueDaily.toFixed(2),
          totalCostDaily: +entity.allocatedCostDaily.toFixed(2),
          molDaily: +entity.molDaily.toFixed(2),
          monthlyCost: +entity.allocatedCostMonthly.toFixed(2),
          monthlyRevenue: +entity.revenueMonthly.toFixed(2),
          monthlyMol: +entity.molMonthly.toFixed(2),
          molPercent: entity.molPercent,
          targetMarginPercent: entity.molPercent,
          contractStatus: isPotential ? 'potential' : 'active',
          isPipelineFuture: isPotential,
          paymentTermsClient: entity.paymentTermsClient ?? paymentTermsClient,
          paymentTermsSuppliers,
          paymentTermsLease: leaseTerms,
          leasePaymentTiming: leaseTiming,
          trailerLeasePaymentTiming,
          paymentTermsDriver,
          paymentTermsFuel,
          paymentTermsTolls,
          paymentTermsTires,
          paymentTermsRefrigeration,
          paymentTermsTelematics,
          paymentTermsWashing,
          paymentTermsExtra,
          acciseRecoveryEligible: false,
          depositAmount: 0,
          sourceSimulationId: activeSimulationId || null,
          sourceSimulationCode: activeSimulationCode || null,
          notes: `Quota ${entity.costSharePercent}% di Multi-Commessa (${groupCode}) • Modello riparto: ${COST_ALLOCATION_MODES[computed.costAllocationMode]?.shortLabel || 'Condiviso'}`
        };
        const splitMetrics = calculateSingleProjectMetrics(splitDraft);
        const createdSplit = storageService.addProject({
          ...splitDraft,
          cashAdvanceRequired: +splitMetrics.estimatedWorkingCapitalGap.toFixed(2)
        });
        if (!firstCreatedProj) firstCreatedProj = createdSplit;
      });
      if (activeSimulationId && firstCreatedProj) {
        storageService.updateSimulation(activeSimulationId, {
          status: isPotential ? 'in_negotiation' : 'accepted',
          convertedProjectId: firstCreatedProj.id,
          convertedProjectCode: groupCode,
          convertedAt: new Date().toISOString()
        });
      }
      setSaveMode(statusType);
      setSaveSuccess(true);
      setTimeout(() => {
        navigate('/projects');
      }, 1200);
      return;
    }

    // Opzione Standard / Multi-Commessa Unificata (Costi e Mezzo a fattor comune con entità di fatturazione separate)
    const combinedClient = isMulti
      ? computed.multiAllocation.combinedClientLabel
      : (clientName || (isPotential ? 'Trattativa Commerciale' : 'Nuovo Committente'));

    const newProject = {
      code: (isPotential ? 'SIM-' : 'PRJ-') + Math.floor(100 + Math.random() * 900),
      name: isMulti
        ? (routeName ? `Multi-Commessa (${computed.clientCount} Clienti): ${routeName}` : `Multi-Commessa ${combinedClient}`)
        : (clientName && routeName ? `${clientName} - ${routeName}` : `Linea con ${computed.vehicle.name}`),
      client: combinedClient,
      route: routeName || `${computed.kmTotal} km giornalieri`,
      isMultiClient: isMulti,
      costAllocationMode: computed.costAllocationMode || 'equal',
      billingEntities: isMulti ? computed.billingEntities : [],
      startDate: new Date().toISOString().slice(0, 10),
      operatingMonths: safeOpMonths,
      workingDaysMonth: computed.workingDays,
      kmDaily: computed.kmTotal,
      highwayPercent: safeHighwayPct,
      managementType: computed.vehicle.ownershipType === 'terzi' ? 'T' : 'D',
      vehicleId: computed.vehicle.id,
      trailerId: computed.trailer ? computed.trailer.id : '',
      driverShiftType: computed.driverShiftType,
      driverManualOverride: false,
      driverCostDaily: +computed.driverDaily.toFixed(2),
      energyPayer: computed.energyPayer,
      fuelCostDaily: +computed.fuelDaily.toFixed(2),
      tollsDaily: +computed.tollsDaily.toFixed(2),
      tiresDaily: +computed.tiresDaily.toFixed(2),
      refrigerationEnabled: computed.refrigerationEnabled,
      refrigerationTech: computed.refrigerationTech,
      refrigerationUnitCost: toFiniteNumber(refrigerationUnitCost, 0),
      refrigerationHourlyConsumption: toFiniteNumber(refrigerationHourlyConsumption, 0),
      refrigerationHoursDaily: toFiniteNumber(refrigerationHoursDaily, 0),
      refrigerationCostDaily: +computed.refrigerationCostDaily.toFixed(2),
      telematicsEnabled: computed.telematicsEnabled,
      telematicsAuto,
      telematicsMonthly: computed.telematicsMonthly,
      telematicsCostDaily: +computed.telematicsCostDaily.toFixed(2),
      washingEnabled: computed.washingEnabled,
      washingUnitCost: toFiniteNumber(washingUnitCost, 0),
      washingCountPerMonth: toFiniteNumber(washingCountPerMonth, 0),
      washingCostDaily: +computed.washingCostDaily.toFixed(2),
      extraCostDescription,
      extraCostAmount: toFiniteNumber(extraCostAmount, 0),
      extraCostFrequency,
      extraCostDaily: +computed.extraCostDaily.toFixed(2),
      otherCostsDaily: 0,
      partnerMarginDaily: +(computed.partnerMarginDaily || 0).toFixed(2),
      porterageDaily: 0,
      vehicleLeaseDaily: +computed.vehicleLeaseDaily.toFixed(2),
      trailerLeaseDaily: +computed.trailerLeaseDaily.toFixed(2),
      revenueDaily: +computed.revenueDailyTarget.toFixed(2),
      totalCostDaily: +computed.totalCostDaily.toFixed(2),
      molDaily: +computed.molDailyTarget.toFixed(2),
      monthlyCost: +computed.monthlyCost.toFixed(2),
      monthlyRevenue: +computed.monthlyRevenue.toFixed(2),
      monthlyMol: +computed.monthlyMol.toFixed(2),
      molPercent: computed.molPercent,
      targetMarginPercent: computed.molPercent,
      contractStatus: isPotential ? 'potential' : 'active',
      isPipelineFuture: isPotential,
      paymentTermsClient: isMulti ? computed.multiAllocation.weightedClientDso : paymentTermsClient,
      paymentTermsSuppliers,
      paymentTermsLease: leaseTerms,
      leasePaymentTiming: leaseTiming,
      trailerLeasePaymentTiming,
      paymentTermsDriver,
      paymentTermsFuel,
      paymentTermsTolls,
      paymentTermsTires,
      paymentTermsRefrigeration,
      paymentTermsTelematics,
      paymentTermsWashing,
      paymentTermsExtra,
      acciseRecoveryEligible: false,
      depositAmount: 0,
      sourceSimulationId: activeSimulationId || null,
      sourceSimulationCode: activeSimulationCode || null,
      routeStops: computed.routeStops || routeStops || [],
      isRoundTrip: computed.isRoundTrip !== undefined ? computed.isRoundTrip : isRoundTrip,
      orographicMultiplier: computed.orographicMultiplier || 1.0,
      orographyProfile: safeOroProfile,
      tollRate: computed.tollRate,
      cashAdvanceRequired: +computed.workingCapitalNeed.toFixed(2),
      notes: `${isPotential ? 'Trattativa / Simulazione potenziale' : 'Contratto operativo attivo'}${isMulti ? ` Multi-Commessa (${computed.clientCount} clienti • Riparto: ${COST_ALLOCATION_MODES[computed.costAllocationMode]?.shortLabel})` : ''}${safeOroProfile ? ` | Orografia: ${safeOroProfile.terrainLabel} (D+ ${safeOroProfile.elevationGainM}m, fattore consumi ${computed.orographicMultiplier || 1}x)` : ''} generato dal simulatore con margine ${computed.molPercent}%${extraCostDescription ? ` | Extra: ${extraCostDescription}` : ''}`
    };

    const createdProj = storageService.addProject(newProject);
    if (activeSimulationId) {
      storageService.updateSimulation(activeSimulationId, {
        status: isPotential ? 'in_negotiation' : 'accepted',
        convertedProjectId: createdProj.id,
        convertedProjectCode: createdProj.code,
        convertedAt: new Date().toISOString()
      });
    }
    setSaveMode(statusType);
    setSaveSuccess(true);
    setTimeout(() => {
      navigate('/projects');
    }, 1200);
  };

  // Esporta PDF Preventivo con layout istituzionale FOUR e righe differenziate cromaticamente (incluso riparto Multi-Commessa)
  const handleExportPDF = () => {
    const computed = buildSimulationResult();
    if (!computed) return;
    setSimulationResult(computed);
    setLastComputedSignature(currentFormSignature);
    const doc = new jsPDF();

    // Fascia superiore blu istituzionale FOUR (#164e87)
    doc.setFillColor(22, 78, 135);
    doc.rect(0, 0, 210, 24, 'F');

    // Titolo aziendale in testata
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('FOUR SUSTAINABLE LOGISTICS', 14, 15);

    doc.setFontSize(10);
    doc.setTextColor(186, 230, 253); // sky-200
    doc.text(
      computed.isMultiClient
        ? `PREVENTIVO MULTI-COMMESSA (${computed.clientCount} CLIENTI)`
        : 'PREVENTIVO ECONOMICO TRATTA & MARGINALITÀ',
      105,
      15
    );

    // Box Metadati Tratta, Cliente e Mezzo con wrap automatico
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const clientTxt = computed.isMultiClient
      ? `Clienti (${computed.clientCount}): ${computed.multiAllocation.combinedClientLabel}`
      : (clientName ? `Cliente: ${clientName}` : 'Cliente: Trattativa Commerciale');
    const routeTxt = routeName ? `Tratta: ${routeName}` : `Percorso: ${computed.kmTotal} km/gg`;
    const durationTxt = `Durata Contratto: ${computed.operatingMonths || 36} Mesi`;
    const vehInfo = `Mezzo: ${computed.vehicle.name}${computed.trailer ? ` + ${computed.trailer.name}` : ''}`;

    const metaLine1 = doc.splitTextToSize(`${clientTxt}  |  ${routeTxt}  |  ${durationTxt}`, 182);
    const metaLine2 = doc.splitTextToSize(`Data: ${new Date().toLocaleDateString('it-IT')}  |  ${vehInfo}  |  Giorni Lav.: ${computed.workingDays} gg/m`, 182);
    doc.text(metaLine1, 14, 31);
    const y2 = 31 + metaLine1.length * 4.5 + 1.5;
    doc.text(metaLine2, 14, y2);
    const dynamicStartY = Math.max(44, y2 + metaLine2.length * 4.5 + 3);

    // Calcolo ricarico (markup) sui costi operativi
    const markupPct = computed.totalCostDaily > 0
      ? ((computed.molDailyTarget / computed.totalCostDaily) * 100).toFixed(1)
      : '0.0';

    const taggedRows = [];
    taggedRows.push({ type: 'normal', row: ['Distanza Giornaliera Totale', `${computed.kmTotal} km (${computed.highwayKm.toFixed(0)} km Autostrada • ${computed.urbanKm.toFixed(0)} km Urbano)`] });
    taggedRows.push({ type: 'normal', row: [`Autista (${computed.driverShiftType === '2_turni' ? 'Doppio Autista D+N' : computed.driverShiftType === '1_notturno' ? 'Notturno' : 'Diurno'})`, formatEUR(computed.driverDaily)] });
    taggedRows.push({ type: 'normal', row: [`Energia / Carburante (${computed.energyPayer === 'client' ? 'A carico Cliente (0 €)' : 'A carico FOUR'})`, formatEUR(computed.fuelDaily)] });
    if (computed.orographicMultiplier && computed.orographicMultiplier !== 1) {
      const deltaOro = Math.round((computed.orographicMultiplier - 1) * 100);
      taggedRows.push({
        type: 'normal',
        row: [
          `Correzione Orografica Altimetrica (${computed.routeAnalysis?.orography?.terrainLabel || 'Profilo Stradale'})`,
          `${computed.orographicMultiplier}x (${deltaOro >= 0 ? `+${deltaOro}%` : `${deltaOro}%`} sui consumi)`
        ]
      });
    }
    taggedRows.push({ type: 'normal', row: ['Pedaggio Autostradale Telepass', formatEUR(computed.tollsDaily)] });
    taggedRows.push({ type: 'normal', row: ['Pneumatici e Manutenzione Programmata', formatEUR(computed.tiresDaily)] });
    taggedRows.push({ type: 'normal', row: ['Quota Noleggio Trattore / Motrice', formatEUR(computed.vehicleLeaseDaily)] });
    taggedRows.push({ type: 'normal', row: ['Quota Noleggio Semirimorchio FOUR', formatEUR(computed.trailerLeaseDaily)] });
    if (computed.refrigerationCostDaily > 0) {
      taggedRows.push({ type: 'normal', row: [`Gruppo Frigo (${computed.refrigerationTech === 'azoto' ? 'Azoto Liquido' : computed.refrigerationTech === 'elettrico' ? 'Frigo Elettrico' : 'Gasolio'} • ${computed.refrigerationHoursDaily}h/gg)`, formatEUR(computed.refrigerationCostDaily)] });
    }
    if (computed.telematicsCostDaily > 0) {
      taggedRows.push({ type: 'normal', row: [`Telematica GPS & Controllo Flotta (${formatEUR(computed.telematicsMonthly)}/m)`, formatEUR(computed.telematicsCostDaily)] });
    }
    if (computed.washingCostDaily > 0) {
      taggedRows.push({ type: 'normal', row: [`Lavaggi Automezzi (${formatEUR(computed.washingMonthly)}/m)`, formatEUR(computed.washingCostDaily)] });
    }
    if (computed.extraCostDaily > 0) {
      taggedRows.push({ type: 'normal', row: [`Costi Accessori Extra (${computed.extraCostDescription || computed.extraCostFrequency})`, formatEUR(computed.extraCostDaily)] });
    }
    if (computed.partnerMarginDaily > 0) {
      taggedRows.push({ type: 'normal', row: [`Compenso Partner Coordinamento (${formatEUR(computed.partnerFeePerTrip)}/vg × ${computed.tripsPerDay} vg/gg)`, formatEUR(computed.partnerMarginDaily)] });
    }
    taggedRows.push({ type: 'cost', row: ['TOTALE COSTO OPERATIVO GIORNALIERO (A FATTOR COMUNE)', formatEUR(computed.totalCostDaily)] });
    if (computed.isMultiClient && Array.isArray(computed.billingEntities)) {
      computed.billingEntities.forEach((be, idx) => {
        taggedRows.push({
          type: 'client',
          row: [
            `FATTURAZIONE CLIENTE ${idx + 1}: ${be.clientName || `Cliente ${idx + 1}`}${be.route ? ` (${be.route})` : ''} [Quota Costo ${be.costSharePercent}% = ${formatEUR(be.allocatedCostDaily)}/gg]`,
            `Tariffa: ${formatEUR(be.revenueDaily)}/gg (${formatEUR(be.revenueMonthly)}/m) • M.O.L.: ${formatEUR(be.molDaily)}/gg (${be.molPercent}%)`
          ]
        });
      });
    }
    taggedRows.push({ type: 'revenue', row: ['TARIFFA GIORNALIERA COMPLESSIVA FATTURATA', formatEUR(computed.revenueDailyTarget)] });
    taggedRows.push({ type: 'mol', row: ['M.O.L. GIORNALIERO COMPLESSIVO (MARGINE SUL RICAVO)', `${formatEUR(computed.molDailyTarget)} (${computed.molPercent}%)`] });
    taggedRows.push({ type: 'mol', row: ['RICARICO APPLICATO SUI COSTI (MARKUP)', `+${markupPct}% sui costi operativi`] });
    taggedRows.push({ type: 'cost', row: [`COSTO MENSILE STIMATO (${computed.workingDays} gg)`, formatEUR(computed.monthlyCost)] });
    taggedRows.push({ type: 'revenue', row: [`RICAVO MENSILE STIMATO (${computed.workingDays} gg)`, formatEUR(computed.monthlyRevenue)] });
    taggedRows.push({ type: 'mol', row: ['M.O.L. MENSILE STIMATO (MARGINE)', `${formatEUR(computed.monthlyMol)} (${computed.molPercent}%)`] });
    taggedRows.push({ type: 'revenue', row: [`FATTURATO INTERO CONTRATTO (${computed.operatingMonths || 36} Mesi)`, formatEUR(computed.monthlyRevenue * (computed.operatingMonths || 36))] });
    taggedRows.push({ type: 'wc', row: [`FABBISOGNO CIRCOLANTE PONDERATO (Gap ${computed.gapDays} gg)`, formatEUR(computed.workingCapitalNeed)] });

    const rowTypesByIndex = taggedRows.map(item => item.type);
    const tableData = taggedRows.map(item => item.row);

    autoTable(doc, {
      startY: dynamicStartY,
      head: [['Voce di Costo / Parametro Operativo ed Economico', 'Valore / Importo']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 78, 135], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rowType = rowTypesByIndex[data.row.index];
          if (rowType === 'cost') {
            data.cell.styles.fillColor = [254, 242, 242];
            data.cell.styles.textColor = [153, 27, 27];
            data.cell.styles.fontStyle = 'bold';
          } else if (rowType === 'client') {
            data.cell.styles.fillColor = [240, 249, 255];
            data.cell.styles.textColor = [22, 78, 135];
            data.cell.styles.fontStyle = 'bold';
          } else if (rowType === 'revenue') {
            data.cell.styles.fillColor = [239, 246, 255];
            data.cell.styles.textColor = [30, 58, 138];
            data.cell.styles.fontStyle = 'bold';
          } else if (rowType === 'mol') {
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.textColor = [6, 95, 70];
            data.cell.styles.fontStyle = 'bold';
          } else if (rowType === 'wc') {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [146, 64, 14];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    const sanitizedClient = clientName ? clientName.replace(/[^a-zA-Z0-9_-]+/g, '_') : '';
    const clientPart = computed.isMultiClient
      ? `_MultiCommessa_${computed.clientCount}Clienti`
      : (sanitizedClient ? `_${sanitizedClient}` : '');
    doc.save(`FOUR_Preventivo${clientPart}_${computed.vehicle.id}.pdf`);
  };

  // Esporta Preventivo completo in Excel (.xlsx)
  const handleExportExcel = () => {
    const computed = buildSimulationResult();
    if (!computed) return;
    setSimulationResult(computed);
    setLastComputedSignature(currentFormSignature);
    const displayClient = computed.isMultiClient
      ? computed.multiAllocation.combinedClientLabel
      : (clientName || 'Trattativa Commerciale');
    const displayRoute = routeName || (computed.routeAnalysis?.generatedRouteName) || `${computed.kmTotal} km/gg`;

    const summaryRows = [
      ...(activeSimulationCode ? [{ Voce: 'Codice Preventivo', Valore: activeSimulationCode }] : []),
      { Voce: 'Cliente/i', Valore: displayClient },
      { Voce: 'Tratta / Percorso', Valore: displayRoute },
      { Voce: 'Veicolo Assegnato', Valore: computed.vehicle.name },
      { Voce: 'Semirimorchio', Valore: computed.trailer?.name || 'Nessuno' },
      { Voce: 'Distanza Giornaliera (km)', Valore: computed.kmTotal },
      { Voce: 'Fattore Orografico Consumi', Valore: computed.orographicMultiplier },
      { Voce: 'Giorni Lavorativi / Mese', Valore: computed.workingDays },
      { Voce: 'Durata Contratto (Mesi)', Valore: computed.operatingMonths },
      { Voce: 'Autista (€/gg)', Valore: +computed.driverDaily.toFixed(2) },
      { Voce: 'Energia / Carburante (€/gg)', Valore: +computed.fuelDaily.toFixed(2) },
      { Voce: 'Pedaggi Telepass (€/gg)', Valore: +computed.tollsDaily.toFixed(2) },
      { Voce: 'Pneumatici (€/gg)', Valore: +computed.tiresDaily.toFixed(2) },
      { Voce: 'Noleggio Mezzo (€/gg)', Valore: +computed.vehicleLeaseDaily.toFixed(2) },
      { Voce: 'Noleggio Semirimorchio (€/gg)', Valore: +computed.trailerLeaseDaily.toFixed(2) },
      { Voce: 'Refrigerazione Frigo (€/gg)', Valore: +computed.refrigerationCostDaily.toFixed(2) },
      { Voce: 'Accessori / Telematica / Lavaggi / Extra (€/gg)', Valore: +(computed.telematicsCostDaily + computed.washingCostDaily + computed.extraCostDaily).toFixed(2) },
      { Voce: 'Compenso Partner (€/gg)', Valore: +computed.partnerMarginDaily.toFixed(2) },
      { Voce: 'TOTALE COSTO GIORNALIERO (€/gg)', Valore: +computed.totalCostDaily.toFixed(2) },
      { Voce: 'TARIFFA GIORNALIERA PROPOSTA (€/gg)', Valore: +computed.revenueDailyTarget.toFixed(2) },
      { Voce: 'M.O.L. GIORNALIERO (€/gg)', Valore: +computed.molDailyTarget.toFixed(2) },
      { Voce: 'M.O.L. % SU RICAVO', Valore: +(computed.molPercent / 100).toFixed(4) },
      { Voce: 'COSTO MENSILE (€/m)', Valore: +computed.monthlyCost.toFixed(2) },
      { Voce: 'RICAVO MENSILE (€/m)', Valore: +computed.monthlyRevenue.toFixed(2) },
      { Voce: 'M.O.L. MENSILE (€/m)', Valore: +computed.monthlyMol.toFixed(2) },
      { Voce: 'FABBISOGNO CIRCOLANTE (€)', Valore: +computed.workingCapitalNeed.toFixed(2) }
    ];

    const wb = XLSX.utils.book_new();
    const wsMain = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsMain, 'Preventivo Tratta');

    if (computed.isMultiClient && Array.isArray(computed.billingEntities)) {
      const multiRows = computed.billingEntities.map((be, idx) => ({
        Cliente: be.clientName || `Cliente ${idx + 1}`,
        Tratta: be.route || '',
        'Quota % Costo': +(be.costSharePercent / 100).toFixed(4),
        'Costo Ribaltato (€/gg)': +be.allocatedCostDaily.toFixed(2),
        'Tariffa Attiva (€/gg)': +be.revenueDaily.toFixed(2),
        'Ricavo Mensile (€/m)': +be.revenueMonthly.toFixed(2),
        'M.O.L. (€/m)': +be.molMonthly.toFixed(2),
        'M.O.L. %': +(be.molPercent / 100).toFixed(4),
        'Incasso DSO (gg)': be.paymentTermsClient
      }));
      const wsMulti = XLSX.utils.json_to_sheet(multiRows);
      XLSX.utils.book_append_sheet(wb, wsMulti, 'Riparto Multi-Commessa');
    }

    const sanitizedClient = clientName ? clientName.replace(/[^a-zA-Z0-9_-]+/g, '_') : '';
    const clientPart = computed.isMultiClient
      ? `_MultiCommessa_${computed.clientCount}Clienti`
      : (sanitizedClient ? `_${sanitizedClient}` : '');
    XLSX.writeFile(wb, `FOUR_Preventivo${clientPart}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <Calculator className="w-6 h-6" />
              </span>
              <div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">Simulatore Costi Tratta &amp; Preventivi (1-4 Clienti)</h1>
                  {activeSimulationCode && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-[#164e87] border border-blue-300">
                      Preventivo attivo: {activeSimulationCode}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Calcolo automatico Km, pedaggi e consumi orografici da indirizzi tappe • Costi a fattor comune (1-4 clienti) • Registro preventivi convertibili
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeSimulationId && (
              <button
                type="button"
                onClick={handleNewBlankSimulation}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition border border-slate-300"
              >
                <Plus className="w-4 h-4 text-emerald-700" />
                <span>Nuova Simulazione</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSavedRegistry(!showSavedRegistry)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-[#164e87] hover:bg-[#0e3a6c] text-white rounded-xl font-bold text-xs shadow-sm transition"
            >
              <FolderOpen className="w-4 h-4 text-cyan-300" />
              <span>Registro Simulazioni ({savedSimulations.length})</span>
              {showSavedRegistry ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Banner conferma / avviso registrazione preventivo */}
        {regSaveBanner && (
          <div className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm border ${
            regSaveBanner.startsWith('Attenzione')
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}>
            <div className="flex items-center space-x-2">
              {regSaveBanner.startsWith('Attenzione')
                ? <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
              <span>{regSaveBanner}</span>
            </div>
            <span className="text-[10px] opacity-80">Tutte le simulazioni restano salvate e pronte per essere convertite in commessa</span>
          </div>
        )}

        {/* REGISTRO SIMULAZIONI & PREVENTIVI SALVATI (CONVERTIBILI IN COMMESSA SE ACCETTATI DAL CLIENTE) */}
        {showSavedRegistry && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5">
                <span className="p-2 bg-blue-100 text-[#164e87] rounded-xl">
                  <FolderOpen className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Registro Simulazioni &amp; Preventivi Registrati ({savedSimulations.length})
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Le simulazioni salvate in archivio restano disponibili qui: puoi ricaricarle per modifiche o <strong>convertirle in Commessa Attiva</strong> appena accettate dal cliente.
                  </p>
                </div>
              </div>
            </div>

            {savedSimulations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nessuna simulazione registrata in archivio. Compila i parametri sotto e clicca <strong>&quot;Salva in Archivio&quot;</strong> per registrarla qui.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left divide-y divide-slate-200">
                  <thead className="bg-[#f0f4f9] text-[#164e87] font-extrabold uppercase text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Cod. &amp; Stato</th>
                      <th className="py-2.5 px-3">Cliente/i &amp; Tratta (Tappe / Orografia)</th>
                      <th className="py-2.5 px-3">Mezzo &amp; Km</th>
                      <th className="py-2.5 px-3 text-right">Costo / Tariffa gg</th>
                      <th className="py-2.5 px-3 text-right">Ricavo &amp; M.O.L. / Mese</th>
                      <th className="py-2.5 px-3 text-center">Azioni &amp; Conversione in Commessa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {savedSimulations.map(sim => {
                      const snap = sim.resultSnapshot || {};
                      const isAccepted = sim.status === 'accepted';
                      const isNegotiation = sim.status === 'in_negotiation';
                      const isCurrent = activeSimulationId === sim.id;

                      return (
                        <tr
                          key={sim.id}
                          className={`transition ${
                            isCurrent
                              ? 'bg-blue-50/70'
                              : isAccepted
                                ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                                : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                                {sim.code || 'PREV'}
                              </span>
                              {sim.isMultiClient && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                                  {sim.clientCount} Clienti
                                </span>
                              )}
                            </div>
                            <div className="mt-1">
                              {isAccepted ? (
                                <button
                                  type="button"
                                  onClick={() => sim.convertedProjectId && navigate(`/projects?edit=${sim.convertedProjectId}`)}
                                  className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 transition"
                                  title="Apri la commessa generata in Commesse & Budget"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Accettata ({sim.convertedProjectCode || 'Attiva'})
                                </button>
                              ) : isNegotiation ? (
                                <button
                                  type="button"
                                  onClick={() => sim.convertedProjectId && navigate(`/projects?edit=${sim.convertedProjectId}`)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition"
                                  title="Apri la trattativa in Commesse & Budget"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  In Trattativa ({sim.convertedProjectCode || 'What-If'})
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  <Clock className="w-2.5 h-2.5" />
                                  Registrata • In Valutazione
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="font-black text-slate-900">{sim.clientName || 'Trattativa Commerciale'}</div>
                            <div className="text-[11px] text-slate-600">{sim.routeName || `${sim.kmTotal} km/gg`}</div>
                            {sim.orographyProfile && (
                              <div className="text-[10px] text-emerald-800 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span className="bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  ⛰️ {sim.orographyProfile.terrainLabel} (D+ {sim.orographyProfile.elevationGainM}m)
                                </span>
                                {sim.orographicMultiplier && sim.orographicMultiplier !== 1 && (
                                  <span className={`px-1.5 py-0.5 rounded border ${
                                    sim.orographicMultiplier > 1
                                      ? 'text-amber-800 bg-amber-50 border-amber-200'
                                      : 'text-emerald-800 bg-emerald-50 border-emerald-200'
                                  }`}>
                                    Consumi {sim.orographicMultiplier > 1 ? `+${Math.round((sim.orographicMultiplier - 1) * 100)}%` : `${Math.round((sim.orographicMultiplier - 1) * 100)}%`}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-800">{sim.vehicleName || 'Mezzo'}</div>
                            <div className="text-[10px] text-slate-500">
                              {sim.kmTotal} km/gg ({sim.kmHighwayPercent}% Autostr.) • {sim.workingDaysMonth || 22} gg/m
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="text-[11px] text-slate-500">Costo: <strong className="text-slate-800">{formatEUR(snap.totalCostDaily || 0)}/gg</strong></div>
                            <div className="text-xs font-black text-[#164e87]">Tariffa: {formatEUR(snap.revenueDailyTarget || 0)}/gg</div>
                          </td>

                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="font-black text-slate-900">{formatEUR(snap.monthlyRevenue || 0)}/m</div>
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <span className="text-emerald-700 font-bold text-[11px]">M.O.L. {formatEUR(snap.monthlyMol || 0)}</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">
                                {formatPercent(snap.molPercent || sim.targetMarginPercent || 21)}
                              </span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleLoadSavedSimulation(sim)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-[#164e87] border border-slate-300 rounded-lg font-bold text-[11px] transition"
                                title="Ricarica tutti i parametri di questa simulazione nel configuratore sotto"
                              >
                                🔄 Ricarica
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConvertSavedSimToProject(sim, 'active')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[11px] shadow-sm transition flex items-center gap-1"
                                title="Il cliente ha accettato il preventivo: convertilo immediatamente in Commessa Attiva a budget"
                              >
                                <Check className="w-3 h-3" />
                                <span>Converti in Attiva</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConvertSavedSimToProject(sim, 'potential')}
                                className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg font-bold text-[10px] transition"
                                title="Invia a Commesse & Budget come Trattativa / What-If"
                              >
                                ⚡ In Trattativa
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedSimulation(sim.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                title="Elimina simulazione dall'archivio"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Layout a 2 colonne: Input a Sinistra, Risultati a Destra */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Colonna Sinistra: Input Form */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center justify-between">
              <span className="flex items-center">
                <Truck className="w-4 h-4 mr-2 text-emerald-600" />
                Parametri Tratta, Risorse Condivise & Clienti
              </span>
              {clientCount > 1 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-[#164e87] border border-blue-300">
                  Multi-Commessa ({clientCount} Clienti)
                </span>
              )}
            </h2>

            <form onSubmit={handleCalculate} className="space-y-4 text-xs">
              {/* SELETTORE SISTEMA MULTI-COMMESSA: DA 1 A 4 CLIENTI */}
              <div className="p-3.5 bg-gradient-to-br from-blue-50/90 to-indigo-50/50 rounded-xl border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Users className="w-4 h-4 text-[#164e87]" />
                    <span className="font-extrabold text-[#164e87] text-xs uppercase tracking-wider">
                      Configurazione Clienti & Fatturazione (1 - 4)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    Costi a fattor comune
                  </span>
                </div>

                {/* Bottoni 1, 2, 3, 4 Clienti */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleClientCountChange(n)}
                      className={`py-2 px-2 rounded-lg font-black text-xs transition border ${
                        clientCount === n
                          ? 'bg-[#164e87] text-white border-[#164e87] shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50'
                      }`}
                    >
                      {n === 1 ? '1 Cliente' : `${n} Clienti`}
                    </button>
                  ))}
                </div>

                {clientCount === 1 ? (
                  /* Singolo Cliente Standard */
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Cliente (Opzionale)</label>
                      <input
                        type="text"
                        placeholder="Es. Decathlon, Conad"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nome Tratta</label>
                      <input
                        type="text"
                        placeholder="Es. Bologna - Modena A/R"
                        value={routeName}
                        onChange={(e) => setRouteName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                ) : (
                  /* Multi-Commessa (2, 3 o 4 Clienti) con Modello di Ribaltamento Costi e Marginalità Separate */
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nome Giro / Tratta Condivisa</label>
                      <input
                        type="text"
                        placeholder="Es. Giro Distribuzione Hub Bologna / Milano Multi-Cliente"
                        value={routeName}
                        onChange={(e) => setRouteName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-blue-300 rounded-xl bg-white font-semibold"
                      />
                    </div>

                    {/* Scelta Modello di Ribaltamento Costi (Automatico o Manuale) */}
                    <div>
                      <label className="block font-bold text-[#164e87] mb-1">
                        Modello di Ribaltamento Costi Comuni (Mezzo, Autista, Energia, Accessori)
                      </label>
                      <select
                        value={costAllocationMode}
                        onChange={(e) => handleCostAllocationModeChange(e.target.value)}
                        className="w-full px-3 py-2 border border-blue-300 rounded-xl bg-white font-bold text-slate-800 text-xs"
                      >
                        {Object.values(COST_ALLOCATION_MODES).map(mode => (
                          <option key={mode.id} value={mode.id}>{mode.label}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-600 mt-1">
                        {COST_ALLOCATION_MODES[costAllocationMode]?.description}
                      </p>
                    </div>

                    {/* Schede Singole Entità di Fatturazione (da 2 a 4 Clienti) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-slate-800">
                          Entità di Fatturazione ({clientCount} Clienti) • Tariffe & Marginalità Separate
                        </span>
                        {costAllocationMode === 'manual_percent' && (
                          <button
                            type="button"
                            onClick={handleNormalizeManualShares}
                            className="text-[10px] font-bold text-[#164e87] hover:underline bg-blue-100 px-2 py-0.5 rounded"
                          >
                            Normalizza Quote a 100%
                          </button>
                        )}
                      </div>

                      {billingEntities.slice(0, clientCount).map((entity, idx) => (
                        <div key={entity.id || idx} className="p-2.5 bg-white rounded-xl border border-blue-200 shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-[#164e87] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              Cliente #{idx + 1}
                            </span>
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] text-slate-500">Incasso DSO:</span>
                              <select
                                value={entity.paymentTermsClient ?? 60}
                                onChange={(e) => handleUpdateBillingEntity(idx, { paymentTermsClient: parseInt(e.target.value) || 60 })}
                                className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px] font-bold bg-slate-50"
                              >
                                <option value="30">30 gg</option>
                                <option value="60">60 gg</option>
                                <option value="90">90 gg</option>
                                <option value="120">120 gg</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Ragione Sociale / Cliente *</label>
                              <input
                                type="text"
                                placeholder={`Nome Cliente ${idx + 1}`}
                                value={entity.clientName}
                                onChange={(e) => handleUpdateBillingEntity(idx, { clientName: e.target.value })}
                                className="w-full px-2 py-1 border border-slate-300 rounded-lg font-bold text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Sub-Tratta / Servizio</label>
                              <input
                                type="text"
                                placeholder="Es. Scarico Hub / Pallets"
                                value={entity.route}
                                onChange={(e) => handleUpdateBillingEntity(idx, { route: e.target.value })}
                                className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                            {costAllocationMode === 'proportional_metric' ? (
                              <div>
                                <label className="block text-[10px] font-bold text-blue-800 mb-0.5">Km / Pallets / Quota</label>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={entity.driverMetric}
                                  onChange={(e) => handleUpdateBillingEntity(idx, { driverMetric: parseFloat(e.target.value) || 0 })}
                                  className="w-full px-2 py-1 border border-blue-400 bg-blue-50/40 rounded-lg font-black text-xs text-blue-950"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5 flex items-center justify-between">
                                  <span>% Costo Ribaltato</span>
                                  {costAllocationMode === 'manual_percent' && (
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
                                    disabled={costAllocationMode !== 'manual_percent'}
                                    value={
                                      costAllocationMode === 'equal'
                                        ? +(100 / clientCount).toFixed(1)
                                        : entity.costSharePercent
                                    }
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '') {
                                        handleUpdateBillingEntity(idx, { costSharePercent: '' });
                                      } else {
                                        const raw = parseFloat(val);
                                        if (!isNaN(raw)) {
                                          handleUpdateBillingEntity(idx, { costSharePercent: Math.min(100, Math.max(0, raw)) });
                                        }
                                      }
                                    }}
                                    onBlur={() => handleBillingShareBlur(idx)}
                                    className={`w-full px-2 py-1 border rounded-lg font-black text-xs ${
                                      costAllocationMode === 'manual_percent'
                                        ? 'border-blue-400 bg-white text-slate-900'
                                        : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                                    }`}
                                  />
                                  <span className="text-[10px] font-bold text-slate-500">%</span>
                                </div>
                              </div>
                            )}

                            <div>
                              <label className="block text-[10px] font-bold text-emerald-800 mb-0.5">Margine Target (%)</label>
                              <div className="flex items-center space-x-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={entity.targetMarginPercent}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                    handleUpdateBillingEntity(idx, {
                                      pricingMode: 'margin',
                                      targetMarginPercent: isNaN(val) ? 0 : val
                                    });
                                  }}
                                  className="w-full px-2 py-1 border border-emerald-400 bg-emerald-50/50 rounded-lg font-black text-emerald-900 text-xs"
                                />
                                <span className="text-[10px] font-bold text-emerald-700">%</span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                Tariffa Attiva (€/gg)
                              </label>
                              <input
                                type="number"
                                step="any"
                                placeholder="Auto da Margine"
                                value={entity.pricingMode === 'revenue' ? entity.revenueDaily : ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    handleUpdateBillingEntity(idx, { pricingMode: 'margin' });
                                  } else {
                                    handleUpdateBillingEntity(idx, {
                                      pricingMode: 'revenue',
                                      revenueDaily: parseFloat(raw) || 0
                                    });
                                  }
                                }}
                                className="w-full px-2 py-1 border border-slate-300 rounded-lg font-bold text-xs placeholder:text-[10px] placeholder:font-normal"
                                title="Lascia vuoto per calcolare la tariffa dal Margine Target %, oppure inserisci una tariffa fissa in €/gg"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Seleziona Mezzo dalla Flotta */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  1. Seleziona Mezzo dalla Flotta Disponibile *
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => handleVehicleChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  {fleet.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.plate ? `[${v.plate}]` : ''} ({formatEUR(v.monthlyLease)}/m - {v.fuelTypeId})
                    </option>
                  ))}
                </select>
                {fleet.find(v => v.id === selectedVehicleId)?.ownershipType === 'terzi' && (
                  <p className="mt-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    Mezzo registrato come Trazione Terzi: il simulatore stima i costi industriali standard; alla conversione in Commessa verrà impostata la gestione &quot;T&quot;.
                  </p>
                )}
              </div>

              {/* Seleziona Rimorchio */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  2. Semirimorchio / Allestimento (Opzionale)
                </label>
                <select
                  value={selectedTrailerId}
                  onChange={(e) => handleTrailerChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Nessun Semirimorchio --</option>
                  {trailers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.plate ? `[${t.plate}]` : ''} ({formatEUR(t.monthlyLease)}/m)
                    </option>
                  ))}
                </select>
              </div>

              {/* CALCOLATORE AUTOMATICO KM, AUTOSTRADA, PEDAGGI & OROGRAFIA CONSUMI DA INDIRIZZI TAPPE (API PUBBLICHE) */}
              <div className="p-3.5 bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-cyan-50/40 rounded-xl border border-emerald-300 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Navigation className="w-4 h-4 text-emerald-700" />
                    <span className="font-extrabold text-emerald-950 text-xs uppercase tracking-wider">
                      Calcolo Automatico Km, Autostrada &amp; Orografia da Tappe
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200">
                    API OSM • OSRM • Open-Meteo DEM
                  </span>
                </div>

                {/* Lista Indirizzi / Tappe (Partenza, Tappe Intermedie, Arrivo) */}
                <div className="space-y-2">
                  <datalist id="four-known-hubs-list">
                    {KNOWN_LOGISTICS_HUBS.map(h => (
                      <option key={h.name} value={h.name} />
                    ))}
                  </datalist>

                  {routeStops.map((stop, idx) => (
                    <div key={stop.id || idx} className="flex items-center space-x-1.5">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] flex-shrink-0 ${
                        idx === 0
                          ? 'bg-emerald-600 text-white'
                          : idx === routeStops.length - 1
                            ? 'bg-[#164e87] text-white'
                            : 'bg-amber-500 text-slate-950'
                      }`}>
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        list="four-known-hubs-list"
                        placeholder={idx === 0 ? 'Indirizzo o Polo di Partenza (es. Bologna Interporto, Via...)' : `Indirizzo Tappa / Scarico #${idx} (es. Firenze, Via...)`}
                        value={stop.address}
                        onChange={(e) => handleUpdateRouteStop(idx, e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-emerald-300 rounded-lg bg-white font-semibold text-xs text-slate-800"
                      />
                      {routeStops.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRouteStop(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Rimuovi tappa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleAddRouteStop}
                      disabled={routeStops.length >= 8}
                      className="inline-flex items-center space-x-1 text-[11px] font-bold text-[#164e87] hover:underline disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Aggiungi Tappa Intermedia / Cliente (fino a 8)</span>
                    </button>

                    <label className="inline-flex items-center space-x-1.5 cursor-pointer font-bold text-emerald-950 text-[11px]">
                      <input
                        type="checkbox"
                        checked={isRoundTrip}
                        onChange={(e) => setIsRoundTrip(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      <span>Andata e Ritorno (A/R • Chiudi anello su Tappa 1)</span>
                    </label>
                  </div>
                </div>

                {/* Pulsante Calcola Percorso, Autostrada e Profilo Orografico */}
                <button
                  type="button"
                  onClick={handleCalculateRouteFromApi}
                  disabled={routeCalculating}
                  className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white rounded-xl font-black text-xs shadow-sm transition flex items-center justify-center space-x-2"
                >
                  {routeCalculating ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Interrogazione API Stradali &amp; Altimetriche in corso...</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4 text-emerald-200" />
                      <span>Calcola Km Reali, % Autostrada, Pedaggi &amp; Orografia Consumi</span>
                    </>
                  )}
                </button>

                {routeError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-700 font-semibold">
                    ⚠️ {routeError}
                  </div>
                )}

                {/* Box Risultato Analisi Stradale & Orografica */}
                {routeAnalysis && (
                  <div className="p-2.5 bg-white/95 rounded-xl border border-emerald-200 space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 pb-1.5">
                      <span className="font-black text-slate-900 flex items-center gap-1">
                        <Mountain className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Orografia: {routeAnalysis.orography.terrainLabel}</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {routeAnalysis.totalDailyKm} km/gg ({routeAnalysis.highwayPercent}% Autostrada)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                      <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                        <span className="text-slate-500 block">Dislivello &amp; Quote:</span>
                        <strong className="text-slate-800">
                          D+ {routeAnalysis.orography.elevationGainM}m ({routeAnalysis.orography.minElevationM}–{routeAnalysis.orography.maxElevationM}m s.l.m.)
                        </strong>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                        <span className="text-slate-500 block">Fattore Orografico Consumi:</span>
                        <strong className={routeAnalysis.orography.consumptionDeltaPercent > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                          {routeAnalysis.orography.consumptionMultiplier}x ({routeAnalysis.orography.consumptionDeltaPercent >= 0 ? `+${routeAnalysis.orography.consumptionDeltaPercent}%` : `${routeAnalysis.orography.consumptionDeltaPercent}%`})
                        </strong>
                        {routeAnalysis.orography.regenerativeRecoveryPercent > 0 && (
                          <span className="block text-[9px] text-emerald-600 font-bold">
                            ⚡ Rec. rigenerativo BEV -{routeAnalysis.orography.regenerativeRecoveryPercent}%
                          </span>
                        )}
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded border border-slate-200 col-span-2 sm:col-span-1">
                        <span className="text-slate-500 block">Stima Pedaggio ({routeAnalysis.tollEstimation?.vehicleTollClass?.split(' ')[0] || 'Pesante'}):</span>
                        <strong className="text-[#164e87]">
                          {formatEUR(routeAnalysis.estimatedTollsDaily)}/gg ({routeAnalysis.tollEstimation?.suggestedRate} €/km)
                        </strong>
                      </div>
                    </div>

                    {routeAnalysis.legSummaries?.length > 1 && (
                      <div className="pt-1 border-t border-slate-100 space-y-0.5 text-[10px] text-slate-600">
                        <span className="font-bold text-slate-700 block">Dettaglio Tappe calcolate:</span>
                        {routeAnalysis.legSummaries.map(leg => (
                          <div key={leg.legIndex} className="flex justify-between">
                            <span>Tappa {leg.legIndex}: {leg.from.split(',')[0]} → {leg.to.split(',')[0]}</span>
                            <strong className="text-slate-800">{leg.km} km (~{leg.durationMin} min)</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Distanza, % Autostrada, Tariffa Pedaggio e Fattore Orografico Consumi */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Km Totali / Giorno *</label>
                  <input
                    type="number"
                    required
                    value={kmTotal}
                    onChange={(e) => setKmTotal(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">% Autostrada</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={kmHighwayPercent}
                    onChange={(e) => setKmHighwayPercent(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1" title="Tariffa pedaggio autostradale €/km (calibrata su assi e orografia)">
                    Pedaggio (€/km)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tollRate}
                    onChange={(e) => setTollRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 border border-blue-300 bg-blue-50/40 rounded-xl font-bold text-[#164e87]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1" title="Moltiplicatore orografico consumi (1.00 = Pianura, >1.00 = Collina/Appennino)">
                    Fattore Orografia
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.7"
                    max="2.5"
                    value={orographicMultiplier}
                    onChange={(e) => setOrographicMultiplier(parseFloat(e.target.value) || 1.0)}
                    className="w-full px-2.5 py-1.5 border border-emerald-300 bg-emerald-50/40 rounded-xl font-bold text-emerald-900"
                  />
                </div>
              </div>

              {/* Fornitura Energia (NOTA 1.2) */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
                <span className="font-bold text-emerald-950 block">Fornitura Energia / Carburante</span>
                <select
                  value={energyPayer}
                  onChange={(e) => setEnergyPayer(e.target.value)}
                  className={`w-full px-3 py-1.5 border rounded-xl font-bold ${
                    energyPayer === 'client'
                      ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                      : 'border-slate-300 bg-white text-slate-800'
                  }`}
                >
                  <option value="four">A carico di FOUR (Calcolo automatico su km e consumi)</option>
                  <option value="client">A carico del Cliente / Ricarica in Hub (0,00 € per FOUR)</option>
                </select>
              </div>

              {/* Prezzo Energia / Carburante */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Costo Energia / Carburante Unitario
                  </label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      step="0.01"
                      disabled={energyPayer === 'client'}
                      value={energyPayer === 'client' ? 0 : fuelPrice}
                      onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0)}
                      className={`w-full px-3 py-1.5 border rounded-xl font-bold ${
                        energyPayer === 'client' ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' : 'border-slate-300'
                      }`}
                    />
                    <span className="text-slate-500 font-bold">€</span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giorni Lavorativi / Mese</label>
                  <input
                    type="number"
                    value={workingDaysMonth}
                    onChange={(e) => setWorkingDaysMonth(parseInt(e.target.value) || 22)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              {/* Turni Autista (NOTA 1.3 & NOTA 3.2.D) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Configurazione Autista</span>
                  <span className="text-[11px] font-black text-emerald-700">
                    Tariffa applicata: {formatEUR(calculateDriverDailyCost(fleet.find(v => v.id === selectedVehicleId), currentShiftType, settings || {}))}/gg
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={doubleDrivers}
                      onChange={(e) => setDoubleDrivers(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold">Doppio Autista H24 (1 Diurno + 1 Notturno)</span>
                  </label>
                  {!doubleDrivers && (
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isNightShift}
                        onChange={(e) => setIsNightShift(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Turno Notturno</span>
                    </label>
                  )}
                </div>
                {doubleDrivers && (
                  <p className="text-[10px] text-indigo-700 font-medium">
                    Include automaticamente la maggiorazione notturna sul secondo autista (Trattore: 220€ + 260€ = 480 €/gg; Motrice: 180€ + 220€ = 400 €/gg).
                  </p>
                )}
              </div>

              {/* Refrigerazione Semirimorchio Frigo (NOTA 3.1) */}
              <div className="p-3 bg-cyan-50/70 rounded-xl border border-cyan-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer font-bold text-cyan-950">
                    <input
                      type="checkbox"
                      checked={refrigerationEnabled}
                      onChange={(e) => setRefrigerationEnabled(e.target.checked)}
                      className="rounded text-cyan-600 focus:ring-cyan-500"
                    />
                    <Snowflake className="w-4 h-4 text-cyan-700" />
                    <span>Gruppo Frigorifero Attivo</span>
                  </label>
                  {refrigerationEnabled && (
                    <span className="text-[11px] font-black text-cyan-900">
                      {formatEUR((Number(refrigerationUnitCost) || 0) * (Number(refrigerationHourlyConsumption) || 0))}/h • {formatEUR((Number(refrigerationUnitCost) || 0) * (Number(refrigerationHourlyConsumption) || 0) * (Number(refrigerationHoursDaily) || 0))}/gg
                    </span>
                  )}
                </div>
                {refrigerationEnabled && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">Tecnologia Frigo</label>
                      <select
                        value={refrigerationTech}
                        onChange={(e) => handleRefrigerationTechSwitch(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-cyan-300 rounded-lg bg-white font-bold text-xs"
                      >
                        <option value="elettrico">
                          Frigo Elettrico ({settings?.refrigerationParams?.elettrico?.unitCost ?? 0.35} €/kWh • {settings?.refrigerationParams?.elettrico?.hourlyConsumption ?? 8} kWh/h)
                        </option>
                        <option value="azoto">
                          Azoto Liquido ({settings?.refrigerationParams?.azoto?.unitCost ?? 0.13} €/kg • {settings?.refrigerationParams?.azoto?.hourlyConsumption ?? 30} kg/h)
                        </option>
                        <option value="gasolio">
                          Gasolio Gruppo Frigo ({settings?.refrigerationParams?.gasolio?.unitCost ?? 1.8} €/L • {settings?.refrigerationParams?.gasolio?.hourlyConsumption ?? 3} L/h)
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">
                        Costo Unitario (€/{refrigerationTech === 'azoto' ? 'kg' : refrigerationTech === 'elettrico' ? 'kWh' : 'L'})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={refrigerationUnitCost}
                        onChange={(e) => setRefrigerationUnitCost(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1 border border-cyan-300 rounded-lg bg-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">
                        Consumo ({refrigerationTech === 'azoto' ? 'kg/h' : refrigerationTech === 'elettrico' ? 'kWh/h' : 'L/h'})
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={refrigerationHourlyConsumption}
                        onChange={(e) => setRefrigerationHourlyConsumption(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1 border border-cyan-300 rounded-lg bg-white font-bold"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">
                        Ore funzionamento gruppo frigo / singolo viaggio
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={refrigerationHoursDaily}
                        onChange={(e) => setRefrigerationHoursDaily(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1 border border-cyan-400 rounded-lg bg-white font-black text-cyan-950"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Costi Accessori: Telematica, Lavaggio, Extra (NOTA 3.2) */}
              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-2.5">
                <span className="font-bold text-indigo-950 flex items-center text-xs">
                  <Wifi className="w-3.5 h-3.5 mr-1.5 text-indigo-700" />
                  Costi Accessori (Telematica, Lavaggio, Extra)
                </span>

                {/* Telematica & Lavaggio */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-white rounded-lg border border-indigo-200/80 space-y-1">
                    <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-slate-800 text-[11px]">
                      <input
                        type="checkbox"
                        checked={telematicsEnabled}
                        onChange={(e) => setTelematicsEnabled(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>Telematica (€/m)</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      disabled={!telematicsEnabled}
                      value={telematicsMonthly}
                      onChange={(e) => {
                        setTelematicsAuto(false);
                        setTelematicsMonthly(parseFloat(e.target.value) || 0);
                      }}
                      className="w-full px-2 py-1 border border-slate-300 rounded font-bold text-xs"
                    />
                    <span className="block text-[9px] text-slate-500">
                      Trattore {settings?.accessoryParams?.telematics?.tractorMonthly ?? 14}€ • Trailer {settings?.accessoryParams?.telematics?.trailerMonthly ?? 13}€ • Motrice {settings?.accessoryParams?.telematics?.rigidMonthly ?? 12}€
                    </span>
                  </div>

                  <div className="p-2 bg-white rounded-lg border border-indigo-200/80 space-y-1">
                    <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-slate-800 text-[11px]">
                      <input
                        type="checkbox"
                        checked={washingEnabled}
                        onChange={(e) => setWashingEnabled(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <Droplets className="w-3 h-3 text-blue-600" />
                      <span>Lavaggi ({washingUnitCost}€ x {washingCountPerMonth}/m)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="number"
                        step="5"
                        disabled={!washingEnabled}
                        value={washingUnitCost}
                        onChange={(e) => setWashingUnitCost(parseFloat(e.target.value) || 0)}
                        className="w-full px-1.5 py-1 border border-slate-300 rounded font-bold text-xs"
                        title="Costo singolo lavaggio (€)"
                      />
                      <input
                        type="number"
                        step="1"
                        min="0"
                        disabled={!washingEnabled}
                        value={washingCountPerMonth}
                        onChange={(e) => setWashingCountPerMonth(parseInt(e.target.value) || 0)}
                        className="w-full px-1.5 py-1 border border-slate-300 rounded font-bold text-xs"
                        title="Frequenza lavaggi/mese"
                      />
                    </div>
                    <span className="block text-[9px] text-slate-500">
                      Tot: {washingEnabled ? formatEUR(washingUnitCost * washingCountPerMonth) : '0 €'}/mese
                    </span>
                  </div>
                </div>

                {/* Costi Extra */}
                <div className="p-2 bg-white rounded-lg border border-indigo-200/80 space-y-1.5">
                  <span className="font-bold text-slate-800 block text-[11px]">Costi Extra (Campo libero)</span>
                  <input
                    type="text"
                    placeholder="Descrizione spesa extra (es. ZTL, Sosta, Pedana...)"
                    value={extraCostDescription}
                    onChange={(e) => setExtraCostDescription(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-[11px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="5"
                      min="0"
                      placeholder="Importo €"
                      value={extraCostAmount}
                      onChange={(e) => setExtraCostAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-slate-300 rounded font-bold text-xs"
                    />
                    <select
                      value={extraCostFrequency}
                      onChange={(e) => setExtraCostFrequency(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-[11px] font-semibold"
                    >
                      <option value="daily">Al viaggio / giorno</option>
                      <option value="monthly">Mensile</option>
                      <option value="one_time">Una tantum (12m)</option>
                    </select>
                  </div>
                </div>

                {/* Compenso Partner Coordinamento Operativo */}
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Briefcase className="w-4 h-4 text-[#164e87]" />
                      <label className="font-bold text-slate-900 text-xs">
                        Compenso Partner (Coordinamento Operativo)
                      </label>
                    </div>
                    <span className="text-[10px] text-blue-800 font-bold bg-blue-100/70 px-2 py-0.5 rounded-full">
                      € / viaggio
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Compenso Partner (€/viaggio):
                      </label>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0.00"
                          value={partnerFeePerTrip}
                          onChange={(e) => setPartnerFeePerTrip(parseFloat(e.target.value) || 0)}
                          className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg font-bold text-xs bg-white text-slate-900"
                        />
                        <span className="text-slate-500 font-bold text-xs">€/vg</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Numero Viaggi al giorno:
                      </label>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={tripsPerDay}
                          onChange={(e) => setTripsPerDay(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg font-bold text-xs bg-white text-slate-900"
                        />
                        <span className="text-slate-500 font-bold text-xs">vg/gg</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-slate-600 pt-1.5 border-t border-blue-200/60">
                    <span>Totale giornaliero compenso partner:</span>
                    <strong className="text-[#164e87]">
                      {formatEUR((Number(partnerFeePerTrip) || 0) * (Number(tripsPerDay) || 1))}/gg
                      <span className="text-[10px] font-medium text-slate-500 ml-1">
                        ({formatEUR((Number(partnerFeePerTrip) || 0) * (Number(tripsPerDay) || 1) * workingDaysMonth)}/m)
                      </span>
                    </strong>
                  </div>
                </div>
              </div>

              {/* Usura Pneumatici con Costi a Gomma Differenziati per Tipo di Mezzo FOUR */}
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-amber-950 text-xs">
                    Costo Pneumatici Differenziato per Mezzo (€/km):
                  </label>
                  <span className="text-[10px] text-amber-800 font-semibold">
                    Costo a gomma &amp; durata specifici per mezzo
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="0.005"
                    value={tireRate}
                    onChange={(e) => setTireRate(parseFloat(e.target.value) || 0.04)}
                    className="w-full px-3 py-1.5 border border-amber-300 rounded-lg font-black text-amber-950 bg-white text-xs"
                  />
                  <span className="text-amber-900 font-bold text-xs">€/km</span>
                </div>
                <p className="text-[10px] text-amber-700 leading-tight">
                  Trattore BEV: 520€/gomma (50k km) | Trattore Bio-LNG: 460€/gomma (85k km) | Motrice: 420€/gomma (80k km) | Semirimorchio: 380€/gomma (80k km) | Daily 72: 240€/gomma (65k km).
                </p>
              </div>

              {/* Durata Contratto, Margine Target & Termini di Pagamento */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>Durata Contratto (Mesi)</span>
                      <span className="text-[10px] text-blue-700 font-bold">Standard: 36m</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={operatingMonths}
                      onChange={(e) => setOperatingMonths(parseInt(e.target.value) || 36)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold bg-white text-xs"
                    />
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {[12, 24, 36, 48, 60].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setOperatingMonths(m)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                            operatingMonths === m
                              ? 'bg-[#164e87] text-white shadow-sm'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                        >
                          {m}m{m === 36 ? ' (FOUR)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>Margine Target (%)</span>
                      <span className="text-[10px] text-emerald-700 font-bold">M.O.L. sul Ricavo</span>
                    </label>
                    <div className="flex items-center space-x-1">
                      <input
                        type="number"
                        step="any"
                        disabled={clientCount > 1}
                        value={targetMarginPercent}
                        onChange={(e) => setTargetMarginPercent(parseFloat(e.target.value) || 0)}
                        className={`w-full px-3 py-1.5 border rounded-xl font-extrabold text-xs ${
                          clientCount > 1
                            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'border-emerald-400 text-emerald-800 bg-emerald-50'
                        }`}
                      />
                      <span className="text-emerald-800 font-bold text-xs">%</span>
                    </div>
                    {clientCount > 1 ? (
                      <p className="text-[9px] text-[#164e87] font-bold mt-1">
                        In modalità Multi-Commessa le marginalità sono differenziate sopra per ciascuno dei {clientCount} clienti.
                      </p>
                    ) : (
                      <>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {[15, 18, 21, 25].map(pct => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setTargetMarginPercent(pct)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                                targetMarginPercent === pct
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              }`}
                            >
                              {pct}%{pct === 21 ? ' (Std)' : ''}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          Ricarico sui costi: <strong className="text-slate-800">+{targetMarginPercent < 100 ? ((targetMarginPercent / (100 - targetMarginPercent)) * 100).toFixed(1) : 0}%</strong>
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Incasso Cliente (DSO)</label>
                    <select
                      value={paymentTermsClient}
                      onChange={(e) => setPaymentTermsClient(parseInt(e.target.value))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-xs"
                    >
                      <option value="30">30 gg d.f.f.m.</option>
                      <option value="60">60 gg d.f.f.m. (Standard)</option>
                      <option value="90">90 gg d.f.f.m.</option>
                      <option value="120">120 gg d.f.f.m.</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Nolo Mezzo Motore</label>
                    <select
                      value={leasePaymentTiming}
                      onChange={(e) => setLeasePaymentTiming(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-xs"
                    >
                      <option value="M1_D10">10 M1 (Anticipato)</option>
                      <option value="M1_D30">30 M1 (Fine Mese)</option>
                      <option value="M2_D20">20 M2 (Posticipato)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Nolo Semirimorchio</label>
                    <select
                      value={trailerLeasePaymentTiming}
                      onChange={(e) => setTrailerLeasePaymentTiming(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-xs"
                    >
                      <option value="M1_D10">10 M1 (Anticipato)</option>
                      <option value="M1_D30">30 M1 (Fine Mese)</option>
                      <option value="M2_D20">20 M2 (Posticipato)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Personalizzazione termini per singola voce */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPerItemTerms(!showPerItemTerms)}
                  className="inline-flex items-center space-x-1 text-[11px] font-bold text-amber-800 hover:text-amber-950"
                >
                  {showPerItemTerms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>Termini di pagamento per singola voce (default 30 gg, Autisti 16 M+1)</span>
                </button>

                {showPerItemTerms && (
                  <div className="grid grid-cols-2 gap-2 mt-2 p-2.5 bg-amber-50/70 rounded-xl border border-amber-200 text-[11px]">
                    <div>
                      <label className="block font-semibold text-slate-600">Personale (gg M+1)</label>
                      <select value={paymentTermsDriver} onChange={(e) => setPaymentTermsDriver(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="10">Giorno 10 M+1</option>
                        <option value="16">Giorno 16 M+1</option>
                        <option value="30">30 gg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600">Energia / Bio-LNG</label>
                      <select value={paymentTermsFuel} onChange={(e) => setPaymentTermsFuel(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="0">0 gg</option>
                        <option value="15">15 gg</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600">Refrigerazione Frigo</label>
                      <select value={paymentTermsRefrigeration} onChange={(e) => setPaymentTermsRefrigeration(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="0">0 gg</option>
                        <option value="15">15 gg</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600">Telematica GPS</label>
                      <select value={paymentTermsTelematics} onChange={(e) => setPaymentTermsTelematics(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="0">0 gg</option>
                        <option value="15">15 gg</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600">Lavaggio Mezzi</label>
                      <select value={paymentTermsWashing} onChange={(e) => setPaymentTermsWashing(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="0">0 gg</option>
                        <option value="15">15 gg</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600">Costi Extra</label>
                      <select value={paymentTermsExtra} onChange={(e) => setPaymentTermsExtra(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="0">0 gg</option>
                        <option value="15">15 gg</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600">Pedaggi / Telepass</label>
                      <select value={paymentTermsTolls} onChange={(e) => setPaymentTermsTolls(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="0">0 gg</option>
                        <option value="15">15 gg (Quindicinale)</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600">Pneumatici</label>
                      <select value={paymentTermsTires} onChange={(e) => setPaymentTermsTires(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="15">15 gg</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block font-semibold text-slate-600">Altri Fornitori / Terzisti</label>
                      <select value={paymentTermsSuppliers} onChange={(e) => setPaymentTermsSuppliers(parseInt(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-bold">
                        <option value="15">15 gg</option>
                        <option value="30">30 gg</option>
                        <option value="60">60 gg</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition flex items-center justify-center space-x-2 text-xs"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Calcola Anteprima</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveToRegistry}
                  className="w-full py-2.5 bg-[#164e87] hover:bg-[#0e3a6c] text-white rounded-xl font-bold shadow-sm transition flex items-center justify-center space-x-2 text-xs"
                >
                  <Save className="w-4 h-4 text-cyan-300" />
                  <span>{activeSimulationId ? 'Aggiorna in Archivio' : 'Salva in Archivio'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Colonna Destra: Risultati Preventivo */}
          <div className="lg:col-span-7 space-y-5 lg:sticky lg:top-6 self-start">
            {simulationResult ? (
              <div className="space-y-5">
                {/* Scheda Sintesi Risultato */}
                <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                          Preventivo Calcolato
                        </span>
                        {isResultStale && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40">
                            Parametri modificati — clicca Calcola Anteprima per aggiornare
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-black text-white">{simulationResult.vehicle.name}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveToRegistry}
                        className="px-3 py-1.5 bg-[#164e87] hover:bg-[#1e60a3] text-white rounded-lg text-xs font-bold flex items-center space-x-1 border border-cyan-400/40 transition"
                      >
                        <Save className="w-3.5 h-3.5 text-cyan-300" />
                        <span>{activeSimulationId ? 'Aggiorna Archivio' : 'Salva in Archivio'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Excel</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportPDF}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-300" />
                        <span>PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Tariffe Giornaliere & Mensili */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div className="bg-slate-800/80 p-3 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Costo Giornaliero</span>
                      <div className="text-lg font-black text-slate-200 mt-1">
                        {formatEUR(simulationResult.totalCostDaily)}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {formatEUR(simulationResult.costPerKm)}/km
                      </span>
                    </div>

                    <div className="bg-emerald-950/70 border border-emerald-500/30 p-3 rounded-xl">
                      <span className="text-emerald-300 text-[10px] uppercase font-bold">Tariffa Giornaliera</span>
                      <div className="text-lg font-black text-emerald-400 mt-1">
                        {formatEUR(simulationResult.revenueDailyTarget)}
                      </div>
                      <span className="text-[10px] text-emerald-300">
                        {formatEUR(simulationResult.revenuePerKm)}/km
                      </span>
                    </div>

                    <div className="bg-slate-800/80 p-3 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">M.O.L. Giornaliero</span>
                      <div className="text-lg font-black text-emerald-300 mt-1">
                        {formatEUR(simulationResult.molDailyTarget)}
                      </div>
                      <div className="flex items-center justify-center gap-1 text-[10px]">
                        <span className="text-emerald-400 font-bold">{formatPercent(simulationResult.molPercent)} MOL</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-cyan-300 font-medium">+{simulationResult.totalCostDaily > 0 ? ((simulationResult.molDailyTarget / simulationResult.totalCostDaily) * 100).toFixed(1) : 0}% Ricarico</span>
                      </div>
                    </div>

                    <div className="bg-slate-800/80 p-3 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">M.O.L. Mensile</span>
                      <div className="text-lg font-black text-white mt-1">
                        {formatEUR(simulationResult.monthlyMol)}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        su {simulationResult.workingDays} gg • {formatPercent(simulationResult.molPercent)}
                      </span>
                    </div>
                  </div>

                  {/* Riepilogo Pluriennale Contratto */}
                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span className="text-slate-300 font-semibold">
                        Durata Contratto: <strong className="text-white">{simulationResult.operatingMonths || 36} Mesi</strong>
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Fatturato Intero Periodo:</span>
                        <strong className="text-emerald-400 font-black text-sm">
                          {formatEUR(simulationResult.monthlyRevenue * (simulationResult.operatingMonths || 36))}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">M.O.L. Totale Periodo:</span>
                        <strong className="text-cyan-300 font-black text-sm">
                          {formatEUR(simulationResult.monthlyMol * (simulationResult.operatingMonths || 36))}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PROSPETTO MULTI-COMMESSA: RIBALTAMENTO COSTI E ENTITÀ DI FATTURAZIONE SEPARATE (1-4 CLIENTI) */}
                {simulationResult.isMultiClient && Array.isArray(simulationResult.billingEntities) && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-blue-200 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex items-center space-x-2">
                        <span className="p-1.5 bg-blue-100 text-[#164e87] rounded-lg">
                          <Users className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-black text-slate-900">
                            Prospetto Multi-Commessa ({simulationResult.clientCount} Entità di Fatturazione)
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Modello di ribaltamento costi: <strong className="text-[#164e87]">{COST_ALLOCATION_MODES[simulationResult.costAllocationMode]?.label}</strong>
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Costo Condiviso: {formatEUR(simulationResult.totalCostDaily)}/gg ({formatEUR(simulationResult.monthlyCost)}/m)
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left divide-y divide-slate-200">
                        <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-2">Entità Fatturazione / Cliente</th>
                            <th className="py-2.5 px-2 text-right">Quota % Costo</th>
                            <th className="py-2.5 px-2 text-right">Costo Ribaltato</th>
                            <th className="py-2.5 px-2 text-right">Tariffa Attiva</th>
                            <th className="py-2.5 px-2 text-right">M.O.L. Cliente</th>
                            <th className="py-2.5 px-2 text-center">Margine %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {simulationResult.billingEntities.map((be, idx) => (
                            <tr key={be.id || idx} className="hover:bg-blue-50/40">
                              <td className="py-2.5 px-2">
                                <div className="font-black text-slate-900">{be.clientName || `Cliente ${idx + 1}`}</div>
                                <div className="text-[10px] text-slate-500">
                                  {be.route || 'Servizio condiviso'} • Incasso {be.paymentTermsClient} gg
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-bold text-[#164e87]">
                                {formatPercent(be.costSharePercent)}
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <div className="font-bold text-slate-800">{formatEUR(be.allocatedCostDaily)}/gg</div>
                                <div className="text-[10px] text-slate-500">{formatEUR(be.allocatedCostMonthly)}/m</div>
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <div className="font-black text-[#164e87]">{formatEUR(be.revenueDaily)}/gg</div>
                                <div className="text-[10px] text-slate-600 font-semibold">{formatEUR(be.revenueMonthly)}/m</div>
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <div className={`font-black ${be.molDaily >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                  {formatEUR(be.molDaily)}/gg
                                </div>
                                <div className="text-[10px] text-slate-500">{formatEUR(be.molMonthly)}/m</div>
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                  be.molPercent < 0
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : be.molPercent < 15
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                }`}>
                                  {formatPercent(be.molPercent)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-900 text-white font-bold text-xs">
                          <tr>
                            <td className="py-2.5 px-2 rounded-bl-xl">TOTALE CONSOLIDATO ({simulationResult.clientCount} Clienti)</td>
                            <td className="py-2.5 px-2 text-right font-mono text-cyan-300">
                              {formatPercent(simulationResult.multiAllocation?.totalSharePercent || 100)}
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <div>{formatEUR(simulationResult.totalCostDaily)}/gg</div>
                              <div className="text-[10px] text-slate-300">{formatEUR(simulationResult.monthlyCost)}/m</div>
                            </td>
                            <td className="py-2.5 px-2 text-right text-emerald-300">
                              <div>{formatEUR(simulationResult.revenueDailyTarget)}/gg</div>
                              <div className="text-[10px] text-emerald-200">{formatEUR(simulationResult.monthlyRevenue)}/m</div>
                            </td>
                            <td className="py-2.5 px-2 text-right text-emerald-400">
                              <div>{formatEUR(simulationResult.molDailyTarget)}/gg</div>
                              <div className="text-[10px] text-emerald-200">{formatEUR(simulationResult.monthlyMol)}/m</div>
                            </td>
                            <td className="py-2.5 px-2 text-center rounded-br-xl">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                                {formatPercent(simulationResult.molPercent)}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dettaglio Costi Operativi */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                    Scomposizione Dettagliata Costi Giornalieri (€)
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600">
                        Autista ({simulationResult.driverShiftType === '2_turni' ? 'Doppio Autista Diurno + Notturno' : simulationResult.driverShiftType === '1_notturno' ? 'Notturno' : 'Diurno'}):
                      </span>
                      <span className="font-bold text-slate-900">{formatEUR(simulationResult.driverDaily)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600">
                        Energia / Carburante {simulationResult.energyPayer === 'client' ? '(A carico Cliente)' : '(A carico FOUR)'}:
                      </span>
                      <span className={`font-bold ${simulationResult.energyPayer === 'client' ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {formatEUR(simulationResult.fuelDaily)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600">Autostrada / Telepass:</span>
                      <span className="font-bold text-slate-900">{formatEUR(simulationResult.tollsDaily)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600">Gomme & Manutenzione:</span>
                      <span className="font-bold text-slate-900">{formatEUR(simulationResult.tiresDaily)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600">Quota Quotidiana Noleggio Mezzo ({formatEUR(simulationResult.vehicle.monthlyLease)}/m):</span>
                      <span className="font-bold text-purple-700">{formatEUR(simulationResult.vehicleLeaseDaily)}</span>
                    </div>

                    {simulationResult.trailer && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-600">Quota Noleggio Semirimorchio ({formatEUR(simulationResult.trailer.monthlyLease)}/m):</span>
                        <span className="font-bold text-purple-700">{formatEUR(simulationResult.trailerLeaseDaily)}</span>
                      </div>
                    )}

                    {simulationResult.refrigerationCostDaily > 0 && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-cyan-800 font-medium">
                          Refrigerazione Frigo ({simulationResult.refrigerationTech === 'azoto' ? 'Azoto Liquido' : simulationResult.refrigerationTech === 'elettrico' ? 'Frigo Elettrico' : 'Gasolio'} • {simulationResult.refrigerationHoursDaily}h × {formatEUR(simulationResult.refrigerationHourlyCost)}/h):
                        </span>
                        <span className="font-bold text-cyan-800">{formatEUR(simulationResult.refrigerationCostDaily)}</span>
                      </div>
                    )}

                    {simulationResult.telematicsCostDaily > 0 && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-600">Telematica GPS ({formatEUR(simulationResult.telematicsMonthly)}/m):</span>
                        <span className="font-bold text-indigo-700">{formatEUR(simulationResult.telematicsCostDaily)}</span>
                      </div>
                    )}

                    {simulationResult.washingCostDaily > 0 && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-600">Lavaggio Mezzi ({formatEUR(simulationResult.washingMonthly)}/m):</span>
                        <span className="font-bold text-indigo-700">{formatEUR(simulationResult.washingCostDaily)}</span>
                      </div>
                    )}

                    {simulationResult.extraCostDaily > 0 && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-600">
                          Costi Extra {simulationResult.extraCostDescription ? `(${simulationResult.extraCostDescription})` : ''}:
                        </span>
                        <span className="font-bold text-indigo-700">{formatEUR(simulationResult.extraCostDaily)}</span>
                      </div>
                    )}

                    {simulationResult.partnerMarginDaily > 0 && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-[#164e87] font-medium">
                          Compenso Partner Coordinamento ({formatEUR(simulationResult.partnerFeePerTrip)}/vg × {simulationResult.tripsPerDay} vg/gg):
                        </span>
                        <span className="font-bold text-[#164e87]">{formatEUR(simulationResult.partnerMarginDaily)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center py-2 bg-slate-50 px-3 rounded-xl font-bold">
                      <span className="text-slate-900">TOTALE COSTI GIORNALIERI FOUR:</span>
                      <span className="text-slate-900 text-sm">{formatEUR(simulationResult.totalCostDaily)}</span>
                    </div>
                  </div>
                </div>

                {/* Box Impatto Finanziario & Cash Flow Anticipazione Ponderato */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase">
                      <Clock className="w-4 h-4 text-amber-700" />
                      <span>Fabbisogno Finanziario Ponderato (Reali Scadenze)</span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-800">
                      Gap medio: {simulationResult.gapDays} gg
                    </span>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Con incasso cliente a <strong>{paymentTermsClient} gg</strong>, noleggio <strong>{LEASE_PAYMENT_TIMINGS[leasePaymentTiming]?.shortName}</strong>, personale al giorno <strong>{paymentTermsDriver} M+1</strong> ed energia/accessori a <strong>{paymentTermsFuel} gg</strong>:
                  </p>
                  <div className="text-xl font-black text-amber-800">
                    {formatEUR(simulationResult.workingCapitalNeed)}
                  </div>
                  {simulationResult.workingCapitalBreakdown && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-amber-200/70 text-[10px] text-amber-900">
                      <div>
                        <span className="block text-amber-700">Noleggi ({simulationResult.workingCapitalBreakdown.leaseGapDays} gg)</span>
                        <strong>{formatEUR(simulationResult.workingCapitalBreakdown.leases)}</strong>
                      </div>
                      <div>
                        <span className="block text-amber-700">Personale ({simulationResult.workingCapitalBreakdown.driverGapDays} gg)</span>
                        <strong>{formatEUR(simulationResult.workingCapitalBreakdown.personnel)}</strong>
                      </div>
                      <div>
                        <span className="block text-amber-700">Energia & Frigo</span>
                        <strong>{formatEUR(simulationResult.workingCapitalBreakdown.fuelAndFridge)}</strong>
                      </div>
                      <div>
                        <span className="block text-amber-700">Accessori & Pedaggi</span>
                        <strong>{formatEUR(simulationResult.workingCapitalBreakdown.accessoriesAndTolls)}</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottoni Salvataggio nel Portfolio FOUR: Trattativa Potenziale vs Contratto Attivo */}
                <div className="space-y-2">
                  {saveSuccess ? (
                    <div className="py-3 px-4 bg-emerald-600 text-white rounded-xl font-extrabold shadow-md flex items-center justify-center space-x-2 text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                      <span>
                        {saveMode === 'potential'
                          ? 'Salvato come Trattativa Potenziale! Reindirizzamento al Portfolio...'
                          : 'Salvato come Contratto Attivo! Reindirizzamento al Portfolio...'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleSaveAsProject('potential', false)}
                          className="py-3 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black shadow-md transition flex items-center justify-center space-x-2 text-xs"
                          title="Salva questa simulazione come Trattativa/Potenziale per testarne l'impatto sul progetto nella sua interezza"
                        >
                          <Sparkles className="w-4 h-4 text-slate-950" />
                          <span>
                            {simulationResult.isMultiClient
                              ? `Salva Multi-Commessa (${simulationResult.clientCount} Clienti) in Trattativa`
                              : 'Salva come Trattativa / Simulazione'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveAsProject('active', false)}
                          className="py-3 px-4 bg-[#164e87] hover:bg-[#0b2440] text-white rounded-xl font-black shadow-md transition flex items-center justify-center space-x-2 text-xs border border-cyan-400/40"
                          title="Salva direttamente come Contratto Attivo a regime nel budget operativo"
                        >
                          <Save className="w-4 h-4 text-cyan-300" />
                          <span>
                            {simulationResult.isMultiClient
                              ? `Salva Multi-Commessa (${simulationResult.clientCount} Clienti) Attiva`
                              : 'Salva come Contratto Attivo'}
                          </span>
                        </button>
                      </div>

                      {simulationResult.isMultiClient && (
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSaveAsProject('potential', true)}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold text-[11px] transition"
                            title="Genera righe di commessa distinte per ciascun cliente con i costi già ribaltati pro-quota"
                          >
                            ⚡ Oppure esplodi in {simulationResult.clientCount} Trattative Separate (pro-quota)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveAsProject('active', true)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#164e87] border border-blue-200 rounded-lg font-bold text-[11px] transition"
                            title="Genera righe di commessa attive distinte per ciascun cliente con i costi già ribaltati pro-quota"
                          >
                            🏢 Esplodi in {simulationResult.clientCount} Commesse Attive Separate (pro-quota)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 text-center">
                    Salvando come <strong>Trattativa / Simulazione</strong> potrai valutare in tempo reale cosa accade al progetto nella sua interezza prima di promuoverla a contratto definitivo.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
                <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">Nessuna simulazione attiva</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Compila i parametri del viaggio a sinistra e clicca su "Calcola Preventivo & Margine" per visualizzare i costi e il fabbisogno di cassa.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationPage;
