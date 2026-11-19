import { useState, useEffect } from 'react';
import storageService from '../services/storageService';
import {
  formatEUR,
  formatPercent,
  calculateTireCostPerKm,
  isRefrigeratedTrailer,
  calculateDriverDailyCost,
  calculateRefrigerationDailyCost,
  calculateAccessoriesDailyCost,
  calculateSingleProjectMetrics,
  LEASE_PAYMENT_TIMINGS,
  normalizeLeaseTiming
} from '../utils/cashFlowCalculations';
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
  ChevronUp
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
  const [kmTotal, setKmTotal] = useState(250);
  const [kmHighwayPercent, setKmHighwayPercent] = useState(60);
  const [workingDaysMonth, setWorkingDaysMonth] = useState(22);
  const [doubleDrivers, setDoubleDrivers] = useState(false);
  const [isNightShift, setIsNightShift] = useState(false);
  const [energyPayer, setEnergyPayer] = useState('four'); // 'four' | 'client'
  const [fuelPrice, setFuelPrice] = useState(0.38); // €/kWh o €/kg
  const [tollRate, setTollRate] = useState(0.12); // €/km autostrada
  const [tireRate, setTireRate] = useState(0.04); // €/km
  const [targetMarginPercent, setTargetMarginPercent] = useState(20); // 20% margine

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

  // Termini di Pagamento & Fabbisogno Ponderato (NOTA 1.1)
  const [paymentTermsClient, setPaymentTermsClient] = useState(60);
  const [paymentTermsSuppliers, setPaymentTermsSuppliers] = useState(30);
  const [leasePaymentTiming, setLeasePaymentTiming] = useState('M1_D10');
  const [paymentTermsDriver, setPaymentTermsDriver] = useState(16);
  const [paymentTermsFuel, setPaymentTermsFuel] = useState(30);
  const [paymentTermsTolls, setPaymentTermsTolls] = useState(15);
  const [paymentTermsTires, setPaymentTermsTires] = useState(30);
  const [paymentTermsRefrigeration, setPaymentTermsRefrigeration] = useState(30);
  const [paymentTermsTelematics, setPaymentTermsTelematics] = useState(30);
  const [paymentTermsWashing, setPaymentTermsWashing] = useState(30);
  const [paymentTermsExtra, setPaymentTermsExtra] = useState(30);
  const [showPerItemTerms, setShowPerItemTerms] = useState(false);

  // Results State
  const [simulationResult, setSimulationResult] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const f = storageService.getFleet();
    const t = storageService.getTrailers();
    const s = storageService.getSettings();
    setFleet(f);
    setTrailers(t);
    setSettings(s);

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
    const calc = calculateTireCostPerKm(vehicle, trailer, {
      costPerTire: curSettings?.tireParameters?.costPerTire || 450,
      lifeTrailer: curSettings?.tireParameters?.lifeKmTrailer || 80000,
      lifeTractorElectric: curSettings?.tireParameters?.lifeKmTractorElectric || 50000,
      lifeRigidElectric: curSettings?.tireParameters?.lifeKmRigidElectric || 80000,
      lifeTractorBiolng: curSettings?.tireParameters?.lifeKmTractorBiolng || 85000
    });
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

    // 1. Carburante / Energia (NOTA 1.2: 0 € se a carico del cliente)
    let fuelDaily = 0;
    if (energyPayer !== 'client') {
      if (vehicle.fuelTypeId === 'elettrico') {
        fuelDaily = (vehicle.avgConsumption || 1.2) * km * fuelPrice;
      } else if (vehicle.fuelTypeId === 'biolng') {
        if (vehicle.yieldKmPerUnit && vehicle.yieldKmPerUnit > 0) {
          fuelDaily = (km / vehicle.yieldKmPerUnit) * fuelPrice;
        } else {
          fuelDaily = ((vehicle.avgConsumption || 30) / 100) * km * fuelPrice;
        }
      } else {
        fuelDaily = ((vehicle.avgConsumption || 32) / 100) * km * fuelPrice;
      }
    }

    // 2. Autostrada
    const tollsDaily = highwayKm * (Number(tollRate) || 0.12);

    // 3. Gomme
    const tiresDaily = km * (Number(tireRate) || 0.04);

    // 4. Autista (NOTA 1.3 & NOTA 3.2.D: dinamico per mezzo + doppio turno sempre Diurno + Notturno)
    const driverDaily = calculateDriverDailyCost(vehicle, currentShiftType, settings || {});

    // 5. Noleggio Mezzo e Semirimorchio ripartiti sui giorni lavorativi mese
    const vehicleLeaseDaily = workingDays > 0 ? (Number(vehicle.monthlyLease) || 0) / workingDays : 0;
    const trailerLeaseDaily = (trailer && workingDays > 0) ? (Number(trailer.monthlyLease) || 0) / workingDays : 0;

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

    // Totale Costi Giornalieri Diretti + Noleggi + Refrigerazione + Accessori
    const totalCostDaily = fuelDaily + tollsDaily + tiresDaily + driverDaily +
      vehicleLeaseDaily + trailerLeaseDaily +
      refrigerationCostDaily + telematicsCostDaily + washingCostDaily + extraCostDaily;

    // Prezzo con margine target
    const marginPct = Number(targetMarginPercent) || 20;
    const revenueDailyTarget = marginPct < 100 ? totalCostDaily / (1 - (marginPct / 100)) : totalCostDaily * 1.2;
    const molDailyTarget = revenueDailyTarget - totalCostDaily;

    // Metriche finanziarie ponderate coerenti al 100% con ProjectsPage
    const simulatedProjectObj = {
      workingDaysMonth: workingDays,
      operatingMonths: 12,
      driverCostDaily: driverDaily,
      energyPayer,
      fuelCostDaily: fuelDaily,
      tollsDaily,
      tiresDaily,
      refrigerationCostDaily,
      telematicsCostDaily,
      washingCostDaily,
      extraCostDaily,
      vehicleLeaseDaily,
      trailerLeaseDaily,
      revenueDaily: revenueDailyTarget,
      leasePaymentTiming,
      paymentTermsClient,
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

    setSimulationResult({
      vehicle,
      trailer,
      kmTotal: km,
      highwayKm,
      urbanKm,
      workingDays,
      driverShiftType: currentShiftType,
      energyPayer,
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
      totalCostDaily: financialMetrics.totalCostDaily,
      revenueDailyTarget,
      molDailyTarget,
      molPercent: marginPct,
      monthlyCost: financialMetrics.monthlyCost,
      monthlyRevenue: financialMetrics.monthlyRevenue,
      monthlyMol: financialMetrics.monthlyMol,
      costPerKm: km > 0 ? financialMetrics.totalCostDaily / km : 0,
      revenuePerKm: km > 0 ? revenueDailyTarget / km : 0,
      gapDays: financialMetrics.gapDays,
      weightedDpoDays: financialMetrics.weightedDpoDays,
      workingCapitalNeed: financialMetrics.estimatedWorkingCapitalGap,
      workingCapitalBreakdown: financialMetrics.workingCapitalBreakdown
    });
  };

  // Salva direttamente nel Budget Commesse FOUR passando TUTTI i parametri e le nuove voci
  const handleSaveAsProject = () => {
    if (!simulationResult) return;

    const leaseTiming = simulationResult.leasePaymentTiming || leasePaymentTiming;
    const leaseTerms = leaseTiming === 'M1_D10' ? 0 : leaseTiming === 'M1_D30' ? 30 : 60;

    const newProject = {
      code: 'PRJ-' + Math.floor(100 + Math.random() * 900),
      name: clientName && routeName ? `${clientName} - ${routeName}` : `Linea con ${simulationResult.vehicle.name}`,
      client: clientName || 'Nuovo Committente',
      route: routeName || `${kmTotal} km giornalieri`,
      startDate: new Date().toISOString().slice(0, 10),
      operatingMonths: 12,
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
      partnerMarginDaily: 0,
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
      paymentTermsClient,
      paymentTermsSuppliers,
      paymentTermsLease: leaseTerms,
      leasePaymentTiming: leaseTiming,
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
      cashAdvanceRequired: +simulationResult.workingCapitalNeed.toFixed(2),
      notes: `Preventivo generato dal simulatore con margine target ${simulationResult.molPercent}%${extraCostDescription ? ` | Extra: ${extraCostDescription}` : ''}`
    };

    storageService.addProject(newProject);
    setSaveSuccess(true);
    setTimeout(() => {
      navigate('/projects');
    }, 1200);
  };

  // Esporta PDF Preventivo
  const handleExportPDF = () => {
    if (!simulationResult) return;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setTextColor(16, 185, 129);
    doc.text('FOUR Trasporti Ecologici', 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Preventivo di Costo Servizio di Trasporto', 14, 28);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Data: ${new Date().toLocaleDateString('it-IT')} | Mezzo: ${simulationResult.vehicle.name}`, 14, 34);

    const tableData = [
      ['Distanza Giornaliera Totale', `${simulationResult.kmTotal} km (${simulationResult.highwayKm.toFixed(0)} km Autostrada)`],
      [`Autista (${simulationResult.driverShiftType === '2_turni' ? 'Doppio Autista D+N' : simulationResult.driverShiftType === '1_notturno' ? 'Notturno' : 'Diurno'})`, formatEUR(simulationResult.driverDaily)],
      [`Energia / Carburante (${simulationResult.energyPayer === 'client' ? 'A carico Cliente' : 'A carico FOUR'})`, formatEUR(simulationResult.fuelDaily)],
      ['Pedaggio Autostradale', formatEUR(simulationResult.tollsDaily)],
      ['Pneumatici e Manutenzione', formatEUR(simulationResult.tiresDaily)],
      ['Quota Noleggio Trattore/Motrice', formatEUR(simulationResult.vehicleLeaseDaily)],
      ['Quota Noleggio Semirimorchio', formatEUR(simulationResult.trailerLeaseDaily)],
      ...(simulationResult.refrigerationCostDaily > 0 ? [[`Gruppo Frigo (${simulationResult.refrigerationTech === 'azoto' ? 'Azoto Liquido' : 'Gasolio'} • ${simulationResult.refrigerationHoursDaily}h)`, formatEUR(simulationResult.refrigerationCostDaily)]] : []),
      ...(simulationResult.telematicsCostDaily > 0 ? [[`Telematica (${formatEUR(simulationResult.telematicsMonthly)}/m)`, formatEUR(simulationResult.telematicsCostDaily)]] : []),
      ...(simulationResult.washingCostDaily > 0 ? [[`Lavaggi (${formatEUR(simulationResult.washingMonthly)}/m)`, formatEUR(simulationResult.washingCostDaily)]] : []),
      ...(simulationResult.extraCostDaily > 0 ? [[`Costi Extra (${simulationResult.extraCostDescription || simulationResult.extraCostFrequency})`, formatEUR(simulationResult.extraCostDaily)]] : []),
      ['TOTALE COSTO OPERATIVO GIORNALIERO', formatEUR(simulationResult.totalCostDaily)],
      ['TARIFFA GIORNALIERA PROPOSTA', formatEUR(simulationResult.revenueDailyTarget)],
      ['M.O.L. GIORNALIERO (MARGINE)', `${formatEUR(simulationResult.molDailyTarget)} (${simulationResult.molPercent}%)`],
      [`RICAVO MENSILE STIMATO (${simulationResult.workingDays} gg)`, formatEUR(simulationResult.monthlyRevenue)],
      [`COSTO MENSILE STIMATO (${simulationResult.workingDays} gg)`, formatEUR(simulationResult.monthlyCost)],
      ['M.O.L. MENSILE STIMATO', formatEUR(simulationResult.monthlyMol)],
      [`Fabbisogno Circolante Ponderato (Gap ${simulationResult.gapDays} gg)`, formatEUR(simulationResult.workingCapitalNeed)]
    ];

    autoTable(doc, {
      startY: 40,
      head: [['Voce di Costo / Parametro', 'Valore']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`FOUR_Preventivo_${simulationResult.vehicle.id}.pdf`);
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
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Simulatore Costi Tratta & Preventivi</h1>
                <p className="text-xs text-slate-500">
                  Calcolo costi operativi, quota noleggi, marginalità e fabbisogno finanziario per nuove linee
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Layout a 2 colonne: Input a Sinistra, Risultati a Destra */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Colonna Sinistra: Input Form */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center">
              <Truck className="w-4 h-4 mr-2 text-emerald-600" />
              Parametri Tratta & Selezione Mezzi
            </h2>

            <form onSubmit={handleCalculate} className="space-y-4 text-xs">
              {/* Cliente & Tratta facoltativi */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cliente (Opzionale)</label>
                  <input
                    type="text"
                    placeholder="Es. Decathlon, Conad"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome Tratta</label>
                  <input
                    type="text"
                    placeholder="Es. Bologna - Modena A/R"
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                  />
                </div>
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

              {/* Distanza & Tipologia percorso */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Km Totali Giornalieri *</label>
                  <input
                    type="number"
                    required
                    value={kmTotal}
                    onChange={(e) => setKmTotal(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">% Percorso Autostrada</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={kmHighwayPercent}
                    onChange={(e) => setKmHighwayPercent(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
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
              </div>

              {/* Usura Pneumatici Differenziata FOUR */}
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-amber-950 text-xs">
                    Costo Pneumatici Differenziato (€/km):
                  </label>
                  <span className="text-[10px] text-amber-800 font-semibold">
                    Calcolato su combinazione Mezzo & Rimorchio
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
                  Trattori BEV: 50.000 km (~0,054 €/km) | Motrici & Semirimorchi: 80.000 km (~0,034 €/km).
                </p>
              </div>

              {/* Margine Target & Termini di Pagamento (NOTA 1.1) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Margine Target (%)</label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={targetMarginPercent}
                      onChange={(e) => setTargetMarginPercent(parseFloat(e.target.value) || 20)}
                      className="w-full px-3 py-1.5 border border-emerald-400 rounded-xl font-extrabold text-emerald-800 bg-emerald-50"
                    />
                    <span className="text-emerald-800 font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Incasso Cliente (DSO)</label>
                  <select
                    value={paymentTermsClient}
                    onChange={(e) => setPaymentTermsClient(parseInt(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold"
                  >
                    <option value="30">30 gg d.f.f.m.</option>
                    <option value="60">60 gg d.f.f.m. (Standard)</option>
                    <option value="90">90 gg d.f.f.m.</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Scadenza Addebito Canoni Noleggio</label>
                  <select
                    value={leasePaymentTiming}
                    onChange={(e) => setLeasePaymentTiming(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-xs"
                  >
                    <option value="M1_D10">Giorno 10 Mese 1 (Anticipato / +20gg anticipo)</option>
                    <option value="M1_D30">Giorno 30 Mese 1 (Fine Mese)</option>
                    <option value="M2_D20">Giorno 20 Mese 2 (Mese Successivo / +20gg dffm)</option>
                  </select>
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
                      <span className="text-[10px] text-emerald-400 font-bold">
                        {formatPercent(simulationResult.molPercent)}
                      </span>
                    </div>

                    <div className="bg-slate-800/80 p-3 rounded-xl">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">M.O.L. Mensile</span>
                      <div className="text-lg font-black text-white mt-1">
                        {formatEUR(simulationResult.monthlyMol)}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        su {simulationResult.workingDays} gg
                      </span>
                    </div>
                  </div>
                </div>

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

                {/* Bottone "Aggiungi al Budget Commesse FOUR" */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleSaveAsProject}
                    disabled={saveSuccess}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold shadow-md transition flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
                  >
                    {saveSuccess ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Commessa Aggiunta al Budget! Reindirizzamento...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>Salva nel Budget & Cash Flow Annuale</span>
                      </>
                    )}
                  </button>
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
