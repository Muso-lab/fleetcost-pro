import { useState, useEffect } from 'react';
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
  computeMultiClientAllocation
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
  Check
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

const SimulationPage = () => {
  const navigate = useNavigate();
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [settings, setSettings] = useState(null);

  // Form State
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedTrailerId, setSelectedTrailerId] = useState('');
  const [clientName, setClientName] = useState('');
  const [routeName, setRouteName] = useState('');

  // Sistema Multi-Commessa (da 1 a 4 Clienti con Costi a Fattor Comune)
  const [clientCount, setClientCount] = useState(1); // 1 | 2 | 3 | 4
  const [costAllocationMode, setCostAllocationMode] = useState('equal'); // 'equal' | 'proportional_metric' | 'proportional_revenue' | 'manual_percent'
  const [billingEntities, setBillingEntities] = useState([
    { id: 'c1', clientName: 'Cliente 1', route: '', driverMetric: 125, costSharePercent: 50, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 },
    { id: 'c2', clientName: 'Cliente 2', route: '', driverMetric: 125, costSharePercent: 50, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 },
    { id: 'c3', clientName: 'Cliente 3', route: '', driverMetric: 100, costSharePercent: 0, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 },
    { id: 'c4', clientName: 'Cliente 4', route: '', driverMetric: 100, costSharePercent: 0, pricingMode: 'margin', targetMarginPercent: 21, revenueDaily: 0, paymentTermsClient: 60 }
  ]);

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

  const handleUpdateBillingEntity = (idx, patch) => {
    setBillingEntities(prev => {
      const updated = prev.map((item, i) => (i === idx ? { ...item, ...patch } : item));
      return updated;
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
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedSimulations, setSavedSimulations] = useState([]);
  const [activeSimulationId, setActiveSimulationId] = useState(null);
  const [activeSimulationCode, setActiveSimulationCode] = useState('');
  const [showSavedRegistry, setShowSavedRegistry] = useState(true);
  const [regSaveBanner, setRegSaveBanner] = useState('');

  // Calcolatore Automatico Km, Autostrada & Orografia da Indirizzi Tappe (API Pubbliche OSM/OSRM/Open-Meteo)
  const [routeStops, setRouteStops] = useState([
    { id: 'stop_1', address: 'Bologna Interporto (Bentivoglio)', label: 'Partenza / Carico' },
    { id: 'stop_2', address: 'Firenze', label: 'Destinazione / Scarico 1' }
  ]);
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
      if (!routeName || routeName.includes('→')) {
        setRouteName(res.generatedRouteName);
      }

      // Se in modalità Multi-Commessa proporzionale ai Km, pre-assegna i km delle singole tratte ai clienti
      if (clientCount > 1 && res.legSummaries.length > 0) {
        setBillingEntities(prev => prev.map((be, idx) => {
          if (idx >= clientCount) return be;
          const leg = res.legSummaries[idx];
          return {
            ...be,
            route: be.route || (leg ? `${leg.from.split(',')[0]} → ${leg.to.split(',')[0]}` : be.route),
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
        const curVeh = f.find(item => item.id === (selectedVehicleId || f[0]?.id));
        if (curVeh) updateFuelForVehicle(curVeh, res.settings);
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

      const isFrigo = isRefrigeratedTrailer(trailer);
      setRefrigerationEnabled(isFrigo);
      if (isFrigo) {
        const tech = (trailer?.category === 'refrigerato_azoto' || (trailer?.tractionType || '').toLowerCase().includes('azoto'))
          ? 'azoto'
          : 'gasolio';
        const techDef = settings?.refrigerationParams?.[tech] || (tech === 'azoto' ? { unitCost: 0.13, hourlyConsumption: 30 } : { unitCost: 1.80, hourlyConsumption: 3.0 });
        setRefrigerationTech(tech);
        setRefrigerationUnitCost(techDef.unitCost);
        setRefrigerationHourlyConsumption(techDef.hourlyConsumption);
        if (!refrigerationHoursDaily) setRefrigerationHoursDaily(8);
      }
    }
  };

  const handleRefrigerationTechSwitch = (tech) => {
    setRefrigerationTech(tech);
    const techDef = settings?.refrigerationParams?.[tech] || (tech === 'azoto' ? { unitCost: 0.13, hourlyConsumption: 30 } : { unitCost: 1.80, hourlyConsumption: 3.0 });
    setRefrigerationUnitCost(techDef.unitCost);
    setRefrigerationHourlyConsumption(techDef.hourlyConsumption);
  };

  const currentShiftType = doubleDrivers ? '2_turni' : (isNightShift ? '1_notturno' : '1_diurno');

  // Calcolo Simulazione
  const handleCalculate = (e) => {
    if (e) e.preventDefault();
    const vehicle = fleet.find(v => v.id === selectedVehicleId);
    const trailer = trailers.find(t => t.id === selectedTrailerId);

    if (!vehicle) return;

    const km = Number(kmTotal) || 0;
    const highwayKm = (km * (Number(kmHighwayPercent) || 0)) / 100;
    const urbanKm = km - highwayKm;
    const workingDays = Number(workingDaysMonth) || 22;

    // 1. Carburante / Energia (NOTA 1.2: 0 € se a carico del cliente) + Correzione Orografica Consumi
    let baseFuelDaily = 0;
    const safeOroMultiplier = Number(orographicMultiplier) > 0 ? Number(orographicMultiplier) : 1.0;
    if (energyPayer !== 'client') {
      if (vehicle.fuelTypeId === 'elettrico') {
        baseFuelDaily = (vehicle.avgConsumption || 1.2) * km * fuelPrice;
      } else if (vehicle.fuelTypeId === 'biolng') {
        if (vehicle.yieldKmPerUnit && vehicle.yieldKmPerUnit > 0) {
          baseFuelDaily = (km / vehicle.yieldKmPerUnit) * fuelPrice;
        } else {
          baseFuelDaily = ((vehicle.avgConsumption || 30) / 100) * km * fuelPrice;
        }
      } else {
        baseFuelDaily = ((vehicle.avgConsumption || 32) / 100) * km * fuelPrice;
      }
    }
    const fuelDaily = +(baseFuelDaily * safeOroMultiplier).toFixed(2);

    // 2. Autostrada
    const tollsDaily = highwayKm * (Number(tollRate) || 0.12);

    // 3. Gomme
    const tiresDaily = km * (Number(tireRate) || 0.04);

    // 4. Autista (NOTA 1.3 & NOTA 3.2.D: dinamico per mezzo + doppio turno sempre Diurno + Notturno)
    const driverDaily = calculateDriverDailyCost(vehicle, currentShiftType, settings || {});

    // 5. Noleggio Mezzo e Semirimorchio + Assicurazione Specifica sul singolo mezzo/rimorchio
    // (I mezzi a nolo hanno assicurazione integrata, i semirimorchi hanno un proprio valore specifico)
    const insCalc = calculateSpecificInsuranceCost(vehicle, trailer, workingDays, settings || {});
    const vehicleLeaseDaily = workingDays > 0
      ? ((Number(vehicle.monthlyLease) || 0) + insCalc.vehicleInsuranceMonthly) / workingDays
      : 0;
    const trailerLeaseDaily = (trailer && workingDays > 0)
      ? ((Number(trailer.monthlyLease) || 0) + insCalc.trailerInsuranceMonthly) / workingDays
      : 0;

    // 6. Refrigerazione Gruppo Frigo (NOTA 3.1)
    const refCalc = calculateRefrigerationDailyCost({
      refrigerationEnabled,
      refrigerationTech,
      refrigerationUnitCost,
      refrigerationHourlyConsumption,
      refrigerationHoursDaily
    }, trailer, settings || {});
    const refrigerationCostDaily = refCalc.dailyCost;

    // 7. Costi Accessori (NOTA 3.2: Telematica, Lavaggio, Extra)
    const accCalc = calculateAccessoriesDailyCost({
      workingDaysMonth: workingDays,
      operatingMonths: 12,
      managementType: 'D',
      telematicsEnabled,
      telematicsAuto,
      telematicsMonthly,
      washingEnabled,
      washingUnitCost,
      washingCountPerMonth,
      extraCostDescription,
      extraCostAmount,
      extraCostFrequency
    }, vehicle, trailer, settings || {});

    const telematicsCostDaily = accCalc.telematicsDaily;
    const washingCostDaily = accCalc.washingDaily;
    const extraCostDaily = accCalc.extraDaily;

    // Compenso Partner Coordinamento (€/viaggio * viaggi/giorno)
    const partnerFeeDaily = (Number(partnerFeePerTrip) || 0) * (Number(tripsPerDay) || 1);

    // Totale Costi Giornalieri Diretti + Noleggi + Refrigerazione + Accessori + Compenso Partner
    const totalCostDaily = fuelDaily + tollsDaily + tiresDaily + driverDaily +
      vehicleLeaseDaily + trailerLeaseDaily +
      refrigerationCostDaily + telematicsCostDaily + washingCostDaily + extraCostDaily +
      partnerFeeDaily;

    // Gestione Singolo Cliente vs Multi-Commessa (da 1 a 4 Clienti con costi a fattor comune)
    const isMulti = clientCount > 1;
    const activeBillingEntities = billingEntities.slice(0, clientCount);
    const multiAlloc = isMulti
      ? computeMultiClientAllocation(totalCostDaily, workingDays, activeBillingEntities, costAllocationMode)
      : null;

    // Prezzo con margine target (o somma tariffe attive delle entità di fatturazione)
    const marginPct = isMulti
      ? multiAlloc.totalMolPercent
      : (targetMarginPercent !== '' && targetMarginPercent !== undefined ? Number(targetMarginPercent) : 20);
    const revenueDailyTarget = isMulti
      ? multiAlloc.totalRevenueDaily
      : (marginPct < 100 ? totalCostDaily / (1 - (marginPct / 100)) : totalCostDaily * 1.2);
    const molDailyTarget = revenueDailyTarget - totalCostDaily;

    // Metriche finanziarie ponderate coerenti al 100% con ProjectsPage
    const simulatedProjectObj = {
      workingDaysMonth: workingDays,
      operatingMonths: Number(operatingMonths) || 36,
      driverCostDaily: driverDaily,
      energyPayer,
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
      costAllocationMode,
      billingEntities: isMulti ? multiAlloc.entities : [],
      leasePaymentTiming,
      trailerLeasePaymentTiming,
      paymentTermsClient: isMulti ? multiAlloc.weightedClientDso : paymentTermsClient,
      paymentTermsSuppliers,
      paymentTermsDriver,
      paymentTermsFuel,
      paymentTermsTolls,
      paymentTermsTires,
      paymentTermsRefrigeration,
      paymentTermsTelematics,
      paymentTermsWashing,
      paymentTermsExtra,
      depositAmount: 0
    };
    const financialMetrics = calculateSingleProjectMetrics(simulatedProjectObj);

    const computedResult = {
      vehicle,
      trailer,
      kmTotal: km,
      highwayKm,
      urbanKm,
      workingDays,
      operatingMonths: Number(operatingMonths) || 36,
      driverShiftType: currentShiftType,
      energyPayer,
      baseFuelDaily: +baseFuelDaily.toFixed(2),
      orographicMultiplier: safeOroMultiplier,
      routeStops,
      isRoundTrip,
      routeAnalysis,
      tollRate: Number(tollRate) || 0.12,
      tireRate: Number(tireRate) || 0.04,
      fuelPrice: Number(fuelPrice) || 0.38,
      fuelDaily,
      tollsDaily,
      tiresDaily,
      driverDaily,
      vehicleLeaseDaily,
      trailerLeaseDaily,
      refrigerationEnabled,
      refrigerationTech,
      refrigerationHourlyCost: refCalc.hourlyCost,
      refrigerationHoursDaily,
      refrigerationCostDaily,
      telematicsEnabled,
      telematicsMonthly: accCalc.telematicsMonthly,
      telematicsCostDaily,
      washingEnabled,
      washingMonthly: accCalc.washingMonthly,
      washingCostDaily,
      extraCostDescription,
      extraCostAmount,
      extraCostFrequency,
      extraCostDaily,
      partnerFeePerTrip: Number(partnerFeePerTrip) || 0,
      tripsPerDay: Number(tripsPerDay) || 1,
      partnerMarginDaily: partnerFeeDaily,
      isMultiClient: isMulti,
      clientCount,
      costAllocationMode,
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

    setSimulationResult(computedResult);

    // Registrazione automatica della simulazione nell'Archivio Preventivi per poterla ricaricare o convertire se accettata dal cliente
    const simCode = activeSimulationCode || ('PREV-' + Math.floor(100 + Math.random() * 900));
    const displayClient = isMulti
      ? multiAlloc.combinedClientLabel
      : (clientName || 'Trattativa Commerciale');
    const displayRoute = routeName || (routeAnalysis?.generatedRouteName) || `${km} km/gg`;

    const savedSim = storageService.saveSimulation({
      id: activeSimulationId || undefined,
      code: simCode,
      status: 'pending',
      clientName: displayClient,
      rawClientName: clientName,
      routeName: displayRoute,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      trailerId: trailer ? trailer.id : '',
      trailerName: trailer ? trailer.name : '',
      kmTotal: km,
      kmHighwayPercent: Number(kmHighwayPercent) || 0,
      workingDaysMonth: workingDays,
      operatingMonths: Number(operatingMonths) || 36,
      doubleDrivers,
      isNightShift,
      energyPayer,
      fuelPrice: Number(fuelPrice) || 0.38,
      tollRate: Number(tollRate) || 0.12,
      tireRate: Number(tireRate) || 0.04,
      targetMarginPercent: +marginPct.toFixed(2),
      refrigerationEnabled,
      refrigerationTech,
      refrigerationUnitCost,
      refrigerationHourlyConsumption,
      refrigerationHoursDaily,
      telematicsEnabled,
      telematicsAuto,
      telematicsMonthly,
      washingEnabled,
      washingUnitCost,
      washingCountPerMonth,
      extraCostDescription,
      extraCostAmount,
      extraCostFrequency,
      partnerFeePerTrip: Number(partnerFeePerTrip) || 0,
      tripsPerDay: Number(tripsPerDay) || 1,
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
      isMultiClient: isMulti,
      clientCount,
      costAllocationMode,
      billingEntities: isMulti ? multiAlloc.entities : billingEntities,
      routeStops,
      isRoundTrip,
      orographicMultiplier: safeOroMultiplier,
      orographyProfile: routeAnalysis?.orography || null,
      resultSnapshot: {
        totalCostDaily: financialMetrics.totalCostDaily,
        revenueDailyTarget,
        molDailyTarget,
        molPercent: +marginPct.toFixed(2),
        monthlyCost: financialMetrics.monthlyCost,
        monthlyRevenue: financialMetrics.monthlyRevenue,
        monthlyMol: financialMetrics.monthlyMol,
        workingCapitalNeed: financialMetrics.estimatedWorkingCapitalGap
      }
    });

    setActiveSimulationId(savedSim.id);
    setActiveSimulationCode(savedSim.code);
    setSavedSimulations(storageService.getSimulations());
    setRegSaveBanner(`Simulazione ${savedSim.code} registrata automaticamente nell'archivio preventivi.`);
    setTimeout(() => setRegSaveBanner(''), 4000);
  };

  // Crea una nuova simulazione pulita (per non sovrascrivere quella precedente in archivio)
  const handleNewBlankSimulation = () => {
    setActiveSimulationId(null);
    setActiveSimulationCode('');
    setSimulationResult(null);
    setRegSaveBanner('Pronto per una nuova simulazione (verrà registrata con un nuovo codice).');
    setTimeout(() => setRegSaveBanner(''), 3000);
  };

  // Ricarica una simulazione salvata nel form del Simulatore
  const handleLoadSavedSimulation = (sim) => {
    if (!sim) return;
    setActiveSimulationId(sim.id);
    setActiveSimulationCode(sim.code || '');
    setClientName(sim.rawClientName !== undefined ? sim.rawClientName : (sim.clientName || ''));
    setRouteName(sim.routeName || '');
    if (sim.vehicleId) setSelectedVehicleId(sim.vehicleId);
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
    if (sim.telematicsEnabled !== undefined) setTelematicsEnabled(sim.telematicsEnabled);
    if (sim.telematicsAuto !== undefined) setTelematicsAuto(sim.telematicsAuto);
    if (sim.telematicsMonthly !== undefined) setTelematicsMonthly(sim.telematicsMonthly);
    if (sim.washingEnabled !== undefined) setWashingEnabled(sim.washingEnabled);
    if (sim.washingUnitCost !== undefined) setWashingUnitCost(sim.washingUnitCost);
    if (sim.washingCountPerMonth !== undefined) setWashingCountPerMonth(sim.washingCountPerMonth);
    setExtraCostDescription(sim.extraCostDescription || '');
    setExtraCostAmount(sim.extraCostAmount || 0);
    setExtraCostFrequency(sim.extraCostFrequency || 'monthly');
    setPartnerFeePerTrip(sim.partnerFeePerTrip || 0);
    setTripsPerDay(sim.tripsPerDay || 1);
    setPaymentTermsClient(sim.paymentTermsClient ?? 60);
    setPaymentTermsSuppliers(sim.paymentTermsSuppliers ?? 30);
    if (sim.leasePaymentTiming) setLeasePaymentTiming(sim.leasePaymentTiming);
    if (sim.trailerLeasePaymentTiming) setTrailerLeasePaymentTiming(sim.trailerLeasePaymentTiming);
    setClientCount(sim.clientCount || 1);
    setCostAllocationMode(sim.costAllocationMode || 'equal');
    if (Array.isArray(sim.billingEntities) && sim.billingEntities.length > 0) {
      setBillingEntities(prev => prev.map((def, i) => sim.billingEntities[i] || def));
    }
    if (Array.isArray(sim.routeStops) && sim.routeStops.length >= 2) {
      setRouteStops(sim.routeStops);
    }
    if (sim.isRoundTrip !== undefined) setIsRoundTrip(Boolean(sim.isRoundTrip));
    setOrographicMultiplier(sim.orographicMultiplier || 1.0);
    if (sim.orographyProfile) {
      setRouteAnalysis(prev => ({
        ...(prev || {}),
        orography: sim.orographyProfile,
        generatedRouteName: sim.routeName
      }));
    }
    setRegSaveBanner(`Simulazione ${sim.code} caricata nel configuratore. Clicca "Calcola Preventivo" per aggiornare.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSavedSimulation = (id) => {
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
    const snap = sim.resultSnapshot || {};
    const workingDays = sim.workingDaysMonth || 22;
    const leaseTiming = sim.leasePaymentTiming || 'M1_D10';
    const leaseTerms = leaseTiming === 'M1_D10' ? 0 : leaseTiming === 'M1_D30' ? 30 : 60;
    const isMulti = Boolean(sim.isMultiClient) && Array.isArray(sim.billingEntities) && sim.billingEntities.length > 1;
    const shiftType = sim.doubleDrivers ? '2_turni' : (sim.isNightShift ? '1_notturno' : '1_diurno');
    const driverDaily = calculateDriverDailyCost(veh, shiftType, settings || {});
    const vLeaseDaily = workingDays > 0 ? (Number(veh?.monthlyLease) || 0) / workingDays : 0;
    const tLeaseDaily = (trl && workingDays > 0) ? (Number(trl.monthlyLease) || 0) / workingDays : 0;
    const highwayKm = ((Number(sim.kmTotal) || 0) * (Number(sim.kmHighwayPercent) || 60)) / 100;
    const tollsDaily = +(highwayKm * (Number(sim.tollRate) || 0.12)).toFixed(2);
    const tiresDaily = +((Number(sim.kmTotal) || 0) * (Number(sim.tireRate) || 0.04)).toFixed(2);
    const partnerDaily = +((Number(sim.partnerFeePerTrip) || 0) * (Number(sim.tripsPerDay) || 1)).toFixed(2);

    let fuelDaily = 0;
    if (sim.energyPayer !== 'client' && veh) {
      const fPrice = Number(sim.fuelPrice) || 0.38;
      const km = Number(sim.kmTotal) || 0;
      const oro = Number(sim.orographicMultiplier) || 1.0;
      if (veh.fuelTypeId === 'elettrico') fuelDaily = +((veh.avgConsumption || 1.2) * km * fPrice * oro).toFixed(2);
      else if (veh.fuelTypeId === 'biolng') {
        const base = veh.yieldKmPerUnit > 0 ? (km / veh.yieldKmPerUnit) * fPrice : ((veh.avgConsumption || 30) / 100) * km * fPrice;
        fuelDaily = +(base * oro).toFixed(2);
      } else {
        fuelDaily = +(((veh.avgConsumption || 32) / 100) * km * fPrice * oro).toFixed(2);
      }
    }

    const newProject = {
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
      orographicMultiplier: sim.orographicMultiplier || 1.0,
      orographyProfile: sim.orographyProfile || null,
      tollRate: sim.tollRate || 0.12,
      isMultiClient: isMulti,
      costAllocationMode: sim.costAllocationMode || 'equal',
      billingEntities: isMulti ? sim.billingEntities : [],
      startDate: new Date().toISOString().slice(0, 10),
      operatingMonths: Number(sim.operatingMonths) || 36,
      workingDaysMonth: workingDays,
      kmDaily: Number(sim.kmTotal) || 250,
      highwayPercent: Number(sim.kmHighwayPercent) || 65,
      managementType: veh?.ownershipType === 'terzi' ? 'T' : 'D',
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
      refrigerationTech: sim.refrigerationTech || 'gasolio',
      refrigerationUnitCost: Number(sim.refrigerationUnitCost) || 1.80,
      refrigerationHourlyConsumption: Number(sim.refrigerationHourlyConsumption) || 3.0,
      refrigerationHoursDaily: Number(sim.refrigerationHoursDaily) || 8,
      refrigerationCostDaily: 0,
      telematicsEnabled: sim.telematicsEnabled !== false,
      telematicsAuto: sim.telematicsAuto !== false,
      telematicsMonthly: Number(sim.telematicsMonthly) || 14,
      telematicsCostDaily: +((Number(sim.telematicsMonthly) || 14) / workingDays).toFixed(2),
      washingEnabled: sim.washingEnabled !== false,
      washingUnitCost: Number(sim.washingUnitCost) || 80,
      washingCountPerMonth: Number(sim.washingCountPerMonth) || 2,
      washingCostDaily: +(((Number(sim.washingUnitCost) || 80) * (Number(sim.washingCountPerMonth) || 2)) / workingDays).toFixed(2),
      extraCostDescription: sim.extraCostDescription || '',
      extraCostAmount: Number(sim.extraCostAmount) || 0,
      extraCostFrequency: sim.extraCostFrequency || 'monthly',
      extraCostDaily: 0,
      otherCostsDaily: 0,
      partnerMarginDaily: partnerDaily,
      porterageDaily: 0,
      vehicleLeaseDaily: +vLeaseDaily.toFixed(2),
      trailerLeaseDaily: +tLeaseDaily.toFixed(2),
      revenueDaily: +(snap.revenueDailyTarget || 750).toFixed(2),
      totalCostDaily: +(snap.totalCostDaily || 600).toFixed(2),
      molDaily: +(snap.molDailyTarget || 150).toFixed(2),
      monthlyCost: +(snap.monthlyCost || 13200).toFixed(2),
      monthlyRevenue: +(snap.monthlyRevenue || 16500).toFixed(2),
      monthlyMol: +(snap.monthlyMol || 3300).toFixed(2),
      molPercent: snap.molPercent ?? 21,
      targetMarginPercent: snap.molPercent ?? 21,
      contractStatus: isPotential ? 'potential' : 'active',
      isPipelineFuture: isPotential,
      paymentTermsClient: sim.paymentTermsClient ?? 60,
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
      acciseRecoveryEligible: sim.energyPayer !== 'client',
      depositAmount: 0,
      cashAdvanceRequired: +(snap.workingCapitalNeed || 15000).toFixed(2),
      notes: `Convertita da Simulazione registrata ${sim.code}${sim.orographyProfile ? ` | Orografia: ${sim.orographyProfile.terrainLabel} (D+ ${sim.orographyProfile.elevationGainM}m, fattore consumi ${sim.orographicMultiplier}x)` : ''}`
    };

    const createdProj = storageService.addProject(newProject);
    storageService.updateSimulation(sim.id, {
      status: isPotential ? 'in_negotiation' : 'accepted',
      convertedProjectId: createdProj.id,
      convertedProjectCode: createdProj.code,
      convertedAt: new Date().toISOString()
    });
    setSavedSimulations(storageService.getSimulations());
    navigate('/projects');
  };

  // Salva direttamente nel Budget Commesse FOUR passando TUTTI i parametri e le nuove voci
  const [saveMode, setSaveMode] = useState(null); // 'potential' | 'active'

  const handleSaveAsProject = (statusType = 'potential', splitIntoSeparateRows = false) => {
    if (!simulationResult) return;
    const isPotential = statusType === 'potential';

    const leaseTiming = simulationResult.leasePaymentTiming || leasePaymentTiming;
    const leaseTerms = leaseTiming === 'M1_D10' ? 0 : leaseTiming === 'M1_D30' ? 30 : 60;
    const isMulti = Boolean(simulationResult.isMultiClient) && Array.isArray(simulationResult.billingEntities) && simulationResult.billingEntities.length > 1;

    // Opzione B: Salva come N commesse distinte con costi già ribaltati secondo la % di ciascun cliente
    if (isMulti && splitIntoSeparateRows) {
      const groupCode = (isPotential ? 'SIM-MC' : 'PRJ-MC') + Math.floor(100 + Math.random() * 900);
      simulationResult.billingEntities.forEach((entity, idx) => {
        const ratio = (Number(entity.costSharePercent) || 0) / 100;
        const cName = (entity.clientName || '').trim() || `Cliente ${idx + 1}`;
        const cRoute = (entity.route || '').trim() || routeName || `${kmTotal} km giornalieri`;
        const splitProject = {
          code: `${groupCode}-${idx + 1}`,
          multiGroupCode: groupCode,
          name: `${cName} - ${cRoute} (Quota ${entity.costSharePercent}% Multi-Commessa)`,
          client: cName,
          route: cRoute,
          startDate: new Date().toISOString().slice(0, 10),
          operatingMonths: Number(operatingMonths) || 36,
          workingDaysMonth: simulationResult.workingDays,
          kmDaily: Math.round(simulationResult.kmTotal * ratio) || simulationResult.kmTotal,
          highwayPercent: Number(kmHighwayPercent) || 70,
          managementType: simulationResult.vehicle.ownershipType === 'terzi' ? 'T' : 'D',
          vehicleId: simulationResult.vehicle.id,
          trailerId: simulationResult.trailer ? simulationResult.trailer.id : '',
          driverShiftType: simulationResult.driverShiftType,
          driverManualOverride: true,
          driverCostDaily: +(simulationResult.driverDaily * ratio).toFixed(2),
          energyPayer: simulationResult.energyPayer,
          fuelCostDaily: +(simulationResult.fuelDaily * ratio).toFixed(2),
          tollsDaily: +(simulationResult.tollsDaily * ratio).toFixed(2),
          tiresDaily: +(simulationResult.tiresDaily * ratio).toFixed(2),
          refrigerationEnabled: simulationResult.refrigerationEnabled,
          refrigerationTech: simulationResult.refrigerationTech,
          refrigerationUnitCost: Number(refrigerationUnitCost),
          refrigerationHourlyConsumption: Number(refrigerationHourlyConsumption),
          refrigerationHoursDaily: +(Number(refrigerationHoursDaily) * ratio).toFixed(2),
          refrigerationCostDaily: +(simulationResult.refrigerationCostDaily * ratio).toFixed(2),
          telematicsEnabled: simulationResult.telematicsEnabled,
          telematicsAuto: false,
          telematicsMonthly: +(simulationResult.telematicsMonthly * ratio).toFixed(2),
          telematicsCostDaily: +(simulationResult.telematicsCostDaily * ratio).toFixed(2),
          washingEnabled: simulationResult.washingEnabled,
          washingUnitCost: +(Number(washingUnitCost) * ratio).toFixed(2),
          washingCountPerMonth: Number(washingCountPerMonth),
          washingCostDaily: +(simulationResult.washingCostDaily * ratio).toFixed(2),
          extraCostDescription,
          extraCostAmount: +((Number(extraCostAmount) || 0) * ratio).toFixed(2),
          extraCostFrequency,
          extraCostDaily: +(simulationResult.extraCostDaily * ratio).toFixed(2),
          otherCostsDaily: 0,
          partnerMarginDaily: +((simulationResult.partnerMarginDaily || 0) * ratio).toFixed(2),
          porterageDaily: 0,
          vehicleLeaseDaily: +(simulationResult.vehicleLeaseDaily * ratio).toFixed(2),
          trailerLeaseDaily: +(simulationResult.trailerLeaseDaily * ratio).toFixed(2),
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
          acciseRecoveryEligible: energyPayer !== 'client',
          depositAmount: 0,
          cashAdvanceRequired: +(simulationResult.workingCapitalNeed * ratio).toFixed(2),
          notes: `Quota ${entity.costSharePercent}% di Multi-Commessa (${groupCode}) • Modello riparto: ${COST_ALLOCATION_MODES[simulationResult.costAllocationMode]?.shortLabel || 'Condiviso'}`
        };
        storageService.addProject(splitProject);
      });
      setSaveMode(statusType);
      setSaveSuccess(true);
      setTimeout(() => {
        navigate('/projects');
      }, 1200);
      return;
    }

    // Opzione Standard / Multi-Commessa Unificata (Costi e Mezzo a fattor comune con entità di fatturazione separate)
    const combinedClient = isMulti
      ? simulationResult.multiAllocation.combinedClientLabel
      : (clientName || (isPotential ? 'Trattativa Commerciale' : 'Nuovo Committente'));

    const newProject = {
      code: (isPotential ? 'SIM-' : 'PRJ-') + Math.floor(100 + Math.random() * 900),
      name: isMulti
        ? (routeName ? `Multi-Commessa (${simulationResult.clientCount} Clienti): ${routeName}` : `Multi-Commessa ${combinedClient}`)
        : (clientName && routeName ? `${clientName} - ${routeName}` : `Linea con ${simulationResult.vehicle.name}`),
      client: combinedClient,
      route: routeName || `${kmTotal} km giornalieri`,
      isMultiClient: isMulti,
      costAllocationMode: simulationResult.costAllocationMode || 'equal',
      billingEntities: isMulti ? simulationResult.billingEntities : [],
      startDate: new Date().toISOString().slice(0, 10),
      operatingMonths: Number(operatingMonths) || 36,
      workingDaysMonth: simulationResult.workingDays,
      kmDaily: simulationResult.kmTotal,
      highwayPercent: Number(kmHighwayPercent) || 70,
      managementType: simulationResult.vehicle.ownershipType === 'terzi' ? 'T' : 'D',
      vehicleId: simulationResult.vehicle.id,
      trailerId: simulationResult.trailer ? simulationResult.trailer.id : '',
      driverShiftType: simulationResult.driverShiftType,
      driverManualOverride: false,
      driverCostDaily: +simulationResult.driverDaily.toFixed(2),
      energyPayer: simulationResult.energyPayer,
      fuelCostDaily: +simulationResult.fuelDaily.toFixed(2),
      tollsDaily: +simulationResult.tollsDaily.toFixed(2),
      tiresDaily: +simulationResult.tiresDaily.toFixed(2),
      refrigerationEnabled: simulationResult.refrigerationEnabled,
      refrigerationTech: simulationResult.refrigerationTech,
      refrigerationUnitCost: Number(refrigerationUnitCost),
      refrigerationHourlyConsumption: Number(refrigerationHourlyConsumption),
      refrigerationHoursDaily: Number(refrigerationHoursDaily),
      refrigerationCostDaily: +simulationResult.refrigerationCostDaily.toFixed(2),
      telematicsEnabled: simulationResult.telematicsEnabled,
      telematicsAuto,
      telematicsMonthly: simulationResult.telematicsMonthly,
      telematicsCostDaily: +simulationResult.telematicsCostDaily.toFixed(2),
      washingEnabled: simulationResult.washingEnabled,
      washingUnitCost: Number(washingUnitCost),
      washingCountPerMonth: Number(washingCountPerMonth),
      washingCostDaily: +simulationResult.washingCostDaily.toFixed(2),
      extraCostDescription,
      extraCostAmount: Number(extraCostAmount) || 0,
      extraCostFrequency,
      extraCostDaily: +simulationResult.extraCostDaily.toFixed(2),
      otherCostsDaily: 0,
      partnerMarginDaily: +(simulationResult.partnerMarginDaily || 0).toFixed(2),
      porterageDaily: 0,
      vehicleLeaseDaily: +simulationResult.vehicleLeaseDaily.toFixed(2),
      trailerLeaseDaily: +simulationResult.trailerLeaseDaily.toFixed(2),
      revenueDaily: +simulationResult.revenueDailyTarget.toFixed(2),
      totalCostDaily: +simulationResult.totalCostDaily.toFixed(2),
      molDaily: +simulationResult.molDailyTarget.toFixed(2),
      monthlyCost: +simulationResult.monthlyCost.toFixed(2),
      monthlyRevenue: +simulationResult.monthlyRevenue.toFixed(2),
      monthlyMol: +simulationResult.monthlyMol.toFixed(2),
      molPercent: simulationResult.molPercent,
      targetMarginPercent: simulationResult.molPercent,
      contractStatus: isPotential ? 'potential' : 'active',
      isPipelineFuture: isPotential,
      paymentTermsClient: isMulti ? simulationResult.multiAllocation.weightedClientDso : paymentTermsClient,
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
      acciseRecoveryEligible: energyPayer !== 'client',
      depositAmount: 0,
      sourceSimulationId: activeSimulationId || null,
      sourceSimulationCode: activeSimulationCode || null,
      routeStops: simulationResult.routeStops || routeStops || [],
      isRoundTrip: simulationResult.isRoundTrip !== undefined ? simulationResult.isRoundTrip : isRoundTrip,
      orographicMultiplier: simulationResult.orographicMultiplier || orographicMultiplier || 1.0,
      orographyProfile: simulationResult.routeAnalysis?.orography || routeAnalysis?.orography || null,
      tollRate: simulationResult.tollRate || tollRate || 0.12,
      cashAdvanceRequired: +simulationResult.workingCapitalNeed.toFixed(2),
      notes: `${isPotential ? 'Trattativa / Simulazione potenziale' : 'Contratto operativo attivo'}${isMulti ? ` Multi-Commessa (${simulationResult.clientCount} clienti • Riparto: ${COST_ALLOCATION_MODES[simulationResult.costAllocationMode]?.shortLabel})` : ''}${routeAnalysis?.orography ? ` | Orografia: ${routeAnalysis.orography.terrainLabel} (D+ ${routeAnalysis.orography.elevationGainM}m, fattore consumi ${simulationResult.orographicMultiplier || 1}x)` : ''} generato dal simulatore con margine ${simulationResult.molPercent}%${extraCostDescription ? ` | Extra: ${extraCostDescription}` : ''}`
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
    if (!simulationResult) return;
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
      simulationResult.isMultiClient
        ? `PREVENTIVO MULTI-COMMESSA (${simulationResult.clientCount} CLIENTI)`
        : 'PREVENTIVO ECONOMICO TRATTA & MARGINALITÀ',
      105,
      15
    );

    // Box Metadati Tratta, Cliente e Mezzo
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const clientTxt = simulationResult.isMultiClient
      ? `Clienti (${simulationResult.clientCount}): ${simulationResult.multiAllocation.combinedClientLabel}`
      : (clientName ? `Cliente: ${clientName}` : 'Cliente: Trattativa Commerciale');
    const routeTxt = routeName ? `Tratta: ${routeName}` : `Percorso: ${simulationResult.kmTotal} km/gg`;
    const durationTxt = `Durata Contratto: ${simulationResult.operatingMonths || 36} Mesi`;
    doc.text(`${clientTxt}  |  ${routeTxt}  |  ${durationTxt}`, 14, 32);

    const vehInfo = `Mezzo: ${simulationResult.vehicle.name}${simulationResult.trailer ? ` + ${simulationResult.trailer.name}` : ''}`;
    doc.text(`Data: ${new Date().toLocaleDateString('it-IT')}  |  ${vehInfo}  |  Giorni Lav.: ${simulationResult.workingDays} gg/m`, 14, 37);

    // Calcolo ricarico (markup) sui costi operativi
    const markupPct = simulationResult.totalCostDaily > 0
      ? ((simulationResult.molDailyTarget / simulationResult.totalCostDaily) * 100).toFixed(1)
      : '0.0';

    const multiRows = (simulationResult.isMultiClient && Array.isArray(simulationResult.billingEntities))
      ? simulationResult.billingEntities.map((be, idx) => [
          `FATTURAZIONE CLIENTE ${idx + 1}: ${be.clientName || `Cliente ${idx + 1}`}${be.route ? ` (${be.route})` : ''} [Quota Costo ${be.costSharePercent}% = ${formatEUR(be.allocatedCostDaily)}/gg]`,
          `Tariffa: ${formatEUR(be.revenueDaily)}/gg (${formatEUR(be.revenueMonthly)}/m) • M.O.L.: ${formatEUR(be.molDaily)}/gg (${be.molPercent}%)`
        ])
      : [];

    const tableData = [
      ['Distanza Giornaliera Totale', `${simulationResult.kmTotal} km (${simulationResult.highwayKm.toFixed(0)} km Autostrada • ${simulationResult.urbanKm.toFixed(0)} km Urbano)`],
      [`Autista (${simulationResult.driverShiftType === '2_turni' ? 'Doppio Autista D+N' : simulationResult.driverShiftType === '1_notturno' ? 'Notturno' : 'Diurno'})`, formatEUR(simulationResult.driverDaily)],
      [`Energia / Carburante (${simulationResult.energyPayer === 'client' ? 'A carico Cliente (0 €)' : 'A carico FOUR'})`, formatEUR(simulationResult.fuelDaily)],
      ['Pedaggio Autostradale Telepass', formatEUR(simulationResult.tollsDaily)],
      ['Pneumatici e Manutenzione Programmata', formatEUR(simulationResult.tiresDaily)],
      ['Quota Noleggio Trattore / Motrice', formatEUR(simulationResult.vehicleLeaseDaily)],
      ['Quota Noleggio Semirimorchio FOUR', formatEUR(simulationResult.trailerLeaseDaily)],
      ...(simulationResult.refrigerationCostDaily > 0 ? [[`Gruppo Frigo (${simulationResult.refrigerationTech === 'azoto' ? 'Azoto Liquido' : 'Gasolio'} • ${simulationResult.refrigerationHoursDaily}h/gg)`, formatEUR(simulationResult.refrigerationCostDaily)]] : []),
      ...(simulationResult.telematicsCostDaily > 0 ? [[`Telematica GPS & Controllo Flotta (${formatEUR(simulationResult.telematicsMonthly)}/m)`, formatEUR(simulationResult.telematicsCostDaily)]] : []),
      ...(simulationResult.washingCostDaily > 0 ? [[`Lavaggi Automezzi (${formatEUR(simulationResult.washingMonthly)}/m)`, formatEUR(simulationResult.washingCostDaily)]] : []),
      ...(simulationResult.extraCostDaily > 0 ? [[`Costi Accessori Extra (${simulationResult.extraCostDescription || simulationResult.extraCostFrequency})`, formatEUR(simulationResult.extraCostDaily)]] : []),
      ...(simulationResult.partnerMarginDaily > 0 ? [[`Compenso Partner Coordinamento (${formatEUR(simulationResult.partnerFeePerTrip)}/vg × ${simulationResult.tripsPerDay} vg/gg)`, formatEUR(simulationResult.partnerMarginDaily)]] : []),
      ['TOTALE COSTO OPERATIVO GIORNALIERO (A FATTOR COMUNE)', formatEUR(simulationResult.totalCostDaily)],
      ...multiRows,
      ['TARIFFA GIORNALIERA COMPLESSIVA FATTURATA', formatEUR(simulationResult.revenueDailyTarget)],
      ['M.O.L. GIORNALIERO COMPLESSIVO (MARGINE SUL RICAVO)', `${formatEUR(simulationResult.molDailyTarget)} (${simulationResult.molPercent}%)`],
      ['RICARICO APPLICATO SUI COSTI (MARKUP)', `+${markupPct}% sui costi operativi`],
      [`COSTO MENSILE STIMATO (${simulationResult.workingDays} gg)`, formatEUR(simulationResult.monthlyCost)],
      [`RICAVO MENSILE STIMATO (${simulationResult.workingDays} gg)`, formatEUR(simulationResult.monthlyRevenue)],
      ['M.O.L. MENSILE STIMATO (MARGINE)', `${formatEUR(simulationResult.monthlyMol)} (${simulationResult.molPercent}%)`],
      [`FATTURATO INTERO CONTRATTO (${simulationResult.operatingMonths || 36} Mesi)`, formatEUR(simulationResult.monthlyRevenue * (simulationResult.operatingMonths || 36))],
      [`FABBISOGNO CIRCOLANTE PONDERATO (Gap ${simulationResult.gapDays} gg)`, formatEUR(simulationResult.workingCapitalNeed)]
    ];

    autoTable(doc, {
      startY: 42,
      head: [['Voce di Costo / Parametro Operativo ed Economico', 'Valore / Importo']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [22, 78, 135], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rowText = String(data.row.raw[0] || '').toUpperCase();
          // Costi Totali -> Sfondo rosa/rosso chiaro (#fef2f2), testo rosso scuro
          if (rowText.includes('TOTALE COSTO') || rowText.includes('COSTO MENSILE')) {
            data.cell.styles.fillColor = [254, 242, 242];
            data.cell.styles.textColor = [153, 27, 27];
            data.cell.styles.fontStyle = 'bold';
          }
          // Entità Fatturazione Multi-Commessa
          else if (rowText.includes('FATTURAZIONE CLIENTE')) {
            data.cell.styles.fillColor = [240, 249, 255];
            data.cell.styles.textColor = [22, 78, 135];
            data.cell.styles.fontStyle = 'bold';
          }
          // Ricavi Totali -> Sfondo azzurro/blu chiaro (#eff6ff), testo blu scuro FOUR
          else if (rowText.includes('TARIFFA GIORNALIERA') || rowText.includes('RICAVO MENSILE') || rowText.includes('FATTURATO INTERO')) {
            data.cell.styles.fillColor = [239, 246, 255];
            data.cell.styles.textColor = [30, 58, 138];
            data.cell.styles.fontStyle = 'bold';
          }
          // Margine / M.O.L. -> Sfondo verde smeraldo chiaro (#ecfdf5), testo verde scuro
          else if (rowText.includes('M.O.L.') || rowText.includes('MARGINE') || rowText.includes('RICARICO')) {
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.textColor = [6, 95, 70];
            data.cell.styles.fontStyle = 'bold';
          }
          // Fabbisogno Cassa Circolante -> Sfondo ambra chiaro (#fef3c7), testo ambra scuro
          else if (rowText.includes('FABBISOGNO CIRCOLANTE')) {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [146, 64, 14];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });

    const clientPart = simulationResult.isMultiClient
      ? `_MultiCommessa_${simulationResult.clientCount}Clienti`
      : (clientName ? `_${clientName.replace(/\s+/g, '_')}` : '');
    doc.save(`FOUR_Preventivo${clientPart}_${simulationResult.vehicle.id}.pdf`);
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

        {/* Banner conferma registrazione automatica preventivo */}
        {regSaveBanner && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{regSaveBanner}</span>
            </div>
            <span className="text-[10px] text-emerald-700">Tutte le simulazioni restano salvate e pronte per essere convertite in commessa</span>
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
                    Ogni simulazione calcolata viene registrata automaticamente qui: puoi ricaricarla per modifiche o <strong>convertirla in Commessa Attiva</strong> appena accettata dal cliente.
                  </p>
                </div>
              </div>
            </div>

            {savedSimulations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nessuna simulazione registrata in archivio. Compila i parametri sotto e clicca <strong>&quot;Calcola &amp; Registra Preventivo&quot;</strong> per salvarla automaticamente.
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
                                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Accettata ({sim.convertedProjectCode || 'Attiva'})
                                </span>
                              ) : isNegotiation ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                                  <Sparkles className="w-3 h-3 text-amber-600" />
                                  In Trattativa ({sim.convertedProjectCode || 'What-If'})
                                </span>
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
                                <span className="bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                  ⛰️ {sim.orographyProfile.terrainLabel} (D+ {sim.orographyProfile.elevationGainM}m)
                                </span>
                                {sim.orographicMultiplier && sim.orographicMultiplier !== 1 && (
                                  <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                    Consumi {sim.orographicMultiplier > 1 ? `+${Math.round((sim.orographicMultiplier - 1) * 100)}%` : 'std'}
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
                              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">
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
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[11px] shadow-2xs transition flex items-center gap-1"
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
                        onChange={(e) => setCostAllocationMode(e.target.value)}
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
                        <div key={entity.id || idx} className="p-2.5 bg-white rounded-xl border border-blue-200 shadow-2xs space-y-2">
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
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">% Costo Ribaltato</label>
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
                                    onChange={(e) => handleUpdateBillingEntity(idx, { costSharePercent: parseFloat(e.target.value) || 0 })}
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
                        <option value="azoto">Azoto Liquido (0,13 €/kg • 30 kg/h = 3,90 €/h)</option>
                        <option value="gasolio">Gasolio Gruppo Frigo (1,80 €/L • 3 L/h = 5,40 €/h)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-cyan-900 mb-0.5">
                        Costo Unitario (€/{refrigerationTech === 'azoto' ? 'kg' : 'L'})
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
                        Consumo ({refrigerationTech === 'azoto' ? 'kg/h' : 'L/h'})
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
                      Trattore 14€ • Trailer 13€ • Motrice 12€
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
                      <span>Lavaggi (80€ x 2/m)</span>
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
                              ? 'bg-[#164e87] text-white shadow-xs'
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
                                  ? 'bg-emerald-600 text-white shadow-xs'
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

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition flex items-center justify-center space-x-2 text-sm"
              >
                <Calculator className="w-4 h-4" />
                <span>Calcola Preventivo & Margine</span>
              </button>
            </form>
          </div>

          {/* Colonna Destra: Risultati Preventivo */}
          <div className="lg:col-span-7 space-y-5">
            {simulationResult ? (
              <div className="space-y-5">
                {/* Scheda Sintesi Risultato */}
                <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                        Preventivo Calcolato
                      </span>
                      <h3 className="text-xl font-black text-white">{simulationResult.vehicle.name}</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleExportPDF}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
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
                          Refrigerazione Frigo ({simulationResult.refrigerationTech === 'azoto' ? 'Azoto Liquido' : 'Gasolio'} • {simulationResult.refrigerationHoursDaily}h × {formatEUR(simulationResult.refrigerationHourlyCost)}/h):
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
