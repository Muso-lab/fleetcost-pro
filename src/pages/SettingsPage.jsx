import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import storageService from '../services/storageService';
import { formatEUR } from '../utils/cashFlowCalculations';
import { MARKET_VEHICLE_BENCHMARKS } from '../data/initialData';
import {
  Settings,
  Save,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  Zap,
  Flame,
  Fuel,
  Clock,
  Layers,
  Shield,
  CircleDot,
  ArrowRightLeft,
  Calculator,
  HelpCircle,
  Truck,
  Sparkles,
  ExternalLink,
  Snowflake,
  Droplets,
  Wifi,
  Lock,
  ShieldCheck
} from 'lucide-react';

const SettingsPage = () => {
  const { authConfig, updatePassword } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  // Stato per Sicurezza e Modifica Password
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (newPassword !== confirmPassword) {
      setPwdError('La nuova password e la conferma non coincidono.');
      return;
    }

    try {
      await updatePassword(oldPassword, newPassword);
      setPwdSuccess('Password aggiornata con successo! La nuova password è ora attiva.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwdSuccess(''), 5000);
    } catch (err) {
      setPwdError(err.message || 'Errore durante l\'aggiornamento della password.');
    }
  };

  // Stato per il Calcolatore "al contrario" (Resa km/unità <-> Consumo specifico)
  const [calcFuelType, setCalcFuelType] = useState('biolng');
  const [calcInputMode, setCalcInputMode] = useState('yield'); // 'yield' (km/kg) oppure 'consumption' (kg/100km)
  const [calcYieldValue, setCalcYieldValue] = useState(2.7); // 2.7 km con 1 kg (dal file Excel)
  const [calcConsumptionValue, setCalcConsumptionValue] = useState(37.04); // 37.04 kg/100km

  // Stato Calcolatore Gomme con Costi a Gomma & Durate Differenziate per Tipo di Mezzo FOUR
  const [tireCostUnit, setTireCostUnit] = useState(450);
  const [costPerTireTractorElectric, setCostPerTireTractorElectric] = useState(520);
  const [costPerTireTractorBiolng, setCostPerTireTractorBiolng] = useState(460);
  const [costPerTireTrailer, setCostPerTireTrailer] = useState(380);
  const [costPerTireRigid, setCostPerTireRigid] = useState(420);
  const [costPerTireLight, setCostPerTireLight] = useState(240);
  const [tireCount, setTireCount] = useState(12); // 6 trattore + 6 semirimorchio
  const [tireLifeKm, setTireLifeKm] = useState(80000);
  const [lifeKmTrailer, setLifeKmTrailer] = useState(80000); // Semirimorchi: 80.000 km
  const [lifeKmTractorElectric, setLifeKmTractorElectric] = useState(50000); // Trattori elettrici: 50.000 km
  const [lifeKmRigidElectric, setLifeKmRigidElectric] = useState(80000); // Motrici elettriche: 80.000 km
  const [lifeKmTractorBiolng, setLifeKmTractorBiolng] = useState(85000); // Trattori Bio-LNG: 85.000 km
  const [lifeKmLight, setLifeKmLight] = useState(65000); // Daily 72 / Furgoni: 65.000 km
  const [fuelSyncing, setFuelSyncing] = useState(false);

  useEffect(() => {
    loadSettings();
    // Aggiornamento automatico settimanale all'avvio se sono passati >= 7 giorni dall'ultimo sync
    storageService.refreshWeeklyFuelPricesFromOfficialSources({ force: false }).then(res => {
      if (res && res.updated) {
        setSettings(res.settings);
      }
    });
  }, []);

  const loadSettings = () => {
    const s = storageService.getSettings();
    setSettings(s);
    if (s.tireParameters) {
      setTireCostUnit(s.tireParameters.costPerTire || 450);
      setCostPerTireTractorElectric(s.tireParameters.costPerTireTractorElectric || 520);
      setCostPerTireTractorBiolng(s.tireParameters.costPerTireTractorBiolng || 460);
      setCostPerTireTrailer(s.tireParameters.costPerTireTrailer || 380);
      setCostPerTireRigid(s.tireParameters.costPerTireRigid || 420);
      setCostPerTireLight(s.tireParameters.costPerTireLight || 240);
      setTireCount((s.tireParameters.tiresTractor || 6) + (s.tireParameters.tiresTrailer || 6));
      setTireLifeKm(s.tireParameters.tireLifeKm || 80000);
      setLifeKmTrailer(s.tireParameters.lifeKmTrailer || 80000);
      setLifeKmTractorElectric(s.tireParameters.lifeKmTractorElectric || 50000);
      setLifeKmRigidElectric(s.tireParameters.lifeKmRigidElectric || 80000);
      setLifeKmTractorBiolng(s.tireParameters.lifeKmTractorBiolng || 85000);
      setLifeKmLight(s.tireParameters.lifeKmLight || 65000);
    }
  };

  const handleManualFuelWeeklySync = async () => {
    setFuelSyncing(true);
    try {
      const res = await storageService.refreshWeeklyFuelPricesFromOfficialSources({ force: true });
      if (res && res.settings) {
        setSettings(res.settings);
        setSaveMessage(`Prezzi medi settimanali "Alla Pompa" aggiornati (${res.syncMeta?.weekLabel}) e ricalcolati sulle commesse!`);
        setTimeout(() => setSaveMessage(''), 4500);
      }
    } finally {
      setFuelSyncing(false);
    }
  };

  const handleFuelPriceChange = (id, newPrice) => {
    const updatedFuel = settings.fuelTypes.map(f => {
      if (f.id === id) {
        return { ...f, price: parseFloat(newPrice) || 0 };
      }
      return f;
    });
    setSettings({ ...settings, fuelTypes: updatedFuel });
  };

  const handleLicenseCostChange = (id, newDailyCost) => {
    const updatedLicenses = settings.licenseTypes.map(l => {
      if (l.id === id) {
        return { ...l, dailyCost: parseFloat(newDailyCost) || 0 };
      }
      return l;
    });
    setSettings({ ...settings, licenseTypes: updatedLicenses });
  };

  const handleStandardCostChange = (key, value) => {
    setSettings({
      ...settings,
      standardCosts: {
        ...settings.standardCosts,
        [key]: parseFloat(value) || 0
      }
    });
  };

  const handleOwnershipDefaultChange = (key, value) => {
    setSettings({
      ...settings,
      ownershipDefaults: {
        ...settings.ownershipDefaults,
        [key]: parseFloat(value) || 0
      }
    });
  };

  const handleRefParamChange = (tech, field, value) => {
    const num = parseFloat(value) || 0;
    const prevTech = settings.refrigerationParams?.[tech] || (tech === 'azoto' ? { unitCost: 0.13, hourlyConsumption: 30 } : { unitCost: 1.80, hourlyConsumption: 3.0 });
    const nextTech = { ...prevTech, [field]: num };
    nextTech.hourlyCost = +(Number(nextTech.unitCost) * Number(nextTech.hourlyConsumption)).toFixed(2);
    setSettings({
      ...settings,
      refrigerationParams: {
        ...(settings.refrigerationParams || {}),
        [tech]: nextTech
      }
    });
  };

  const handleTelParamChange = (field, value) => {
    const num = parseFloat(value) || 0;
    setSettings({
      ...settings,
      accessoryParams: {
        ...(settings.accessoryParams || {}),
        telematics: {
          ...(settings.accessoryParams?.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12, vanMonthly: 12 }),
          [field]: num
        }
      }
    });
  };

  const handleWashParamChange = (field, value) => {
    const num = parseFloat(value) || 0;
    const prevWash = settings.accessoryParams?.washing || { costPerWash: 80, washesPerMonth: 2 };
    const nextWash = { ...prevWash, [field]: num };
    nextWash.monthlyTotal = +(Number(nextWash.costPerWash) * Number(nextWash.washesPerMonth)).toFixed(2);
    setSettings({
      ...settings,
      accessoryParams: {
        ...(settings.accessoryParams || {}),
        washing: nextWash
      }
    });
  };

  const handleSaveAll = () => {
    // Calcola il costo gomme risultante combinato con costi a gomma differenziati per tipo di mezzo
    const costTractorBEV = (6 * costPerTireTractorElectric) / (lifeKmTractorElectric || 50000);
    const costTrailer = (6 * costPerTireTrailer) / (lifeKmTrailer || 80000);
    const combinedElectricArticulatedKm = +(costTractorBEV + costTrailer).toFixed(4);

    const updatedSettings = {
      ...settings,
      tireParameters: {
        costPerTire: tireCostUnit,
        costPerTireTractorElectric,
        costPerTireTractorBiolng,
        costPerTireTrailer,
        costPerTireRigid,
        costPerTireLight,
        tiresTractor: 6,
        tiresTrailer: 6,
        tiresRigidTruck: 6,
        lifeKmTrailer,
        lifeKmTractorElectric,
        lifeKmRigidElectric,
        lifeKmTractorBiolng,
        lifeKmLight,
        tireLifeKm,
        estimatedTireCostKm: combinedElectricArticulatedKm
      },
      standardCosts: {
        ...settings.standardCosts,
        tireCostKm: combinedElectricArticulatedKm
      }
    };

    storageService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setSaveMessage('Impostazioni, costi a gomma differenziati per mezzo e prezzi carburanti alla pompa salvati!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleResetDefaults = () => {
    if (confirm('Attenzione: Ripristinare i dati e i parametri originali del file Excel di FOUR?')) {
      storageService.resetToDefaults();
      window.location.reload();
    }
  };

  const handleExportBackup = () => {
    const json = storageService.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FOUR_Backup_Dati_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const res = storageService.importBackupJson(event.target.result);
      if (res.success) {
        alert('Dati importati con successo!');
        window.location.reload();
      } else {
        alert('Errore nel formato del file di backup: ' + res.error);
      }
    };
    reader.readAsText(file);
  };

  // Logica Calcolatore "Al Contrario" (Resa <-> Consumo Specifico)
  const currentFuelObj = settings?.fuelTypes?.find(f => f.id === calcFuelType) || { price: 1.10, unit: 'kg' };
  const currentFuelPrice = currentFuelObj.price;

  const handleYieldChange = (val) => {
    const num = parseFloat(val) || 0;
    setCalcYieldValue(num);
    if (num > 0) {
      if (calcFuelType === 'elettrico') {
        // Se resa è es. 0.83 km/kWh -> consumo = 1 / 0.83 = 1.20 kWh/km
        setCalcConsumptionValue(+(1 / num).toFixed(2));
      } else {
        // Se resa è 2.7 km/kg -> consumo = 100 / 2.7 = 37.04 kg/100km
        setCalcConsumptionValue(+(100 / num).toFixed(2));
      }
    }
  };

  const handleConsumptionChange = (val) => {
    const num = parseFloat(val) || 0;
    setCalcConsumptionValue(num);
    if (num > 0) {
      if (calcFuelType === 'elettrico') {
        // Se consumo è 1.20 kWh/km -> resa = 1 / 1.20 = 0.83 km/kWh
        setCalcYieldValue(+(1 / num).toFixed(2));
      } else {
        // Se consumo è 30 kg/100km -> resa = 100 / 30 = 3.33 km/kg
        setCalcYieldValue(+(100 / num).toFixed(2));
      }
    }
  };

  // Costo al km risultante
  const calculatedCostPerKm = calcFuelType === 'elettrico'
    ? calcConsumptionValue * currentFuelPrice
    : (calcConsumptionValue / 100) * currentFuelPrice;

  // Calcolo costo gomme dinamico FOUR differenziando sia il costo unitario a gomma (€/gomma) sia la durata in km per tipo di mezzo
  const tireCostTractorBEV = lifeKmTractorElectric > 0 ? (6 * costPerTireTractorElectric) / lifeKmTractorElectric : 0.0624;
  const tireCostTrailer = lifeKmTrailer > 0 ? (6 * costPerTireTrailer) / lifeKmTrailer : 0.0285;
  const tireCostRigidBEV = lifeKmRigidElectric > 0 ? (6 * costPerTireRigid) / lifeKmRigidElectric : 0.0315;
  const tireCostTractorBio = lifeKmTractorBiolng > 0 ? (6 * costPerTireTractorBiolng) / lifeKmTractorBiolng : 0.0325;
  const tireCostLightDaily = lifeKmLight > 0 ? (6 * costPerTireLight) / lifeKmLight : 0.0222;
  const calculatedTireCostKm = +(tireCostTractorBEV + tireCostTrailer).toFixed(4); // Bilico elettrico completo
  const calculatedBioArticulatedKm = +(tireCostTractorBio + tireCostTrailer).toFixed(4); // Bilico Bio-LNG completo

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-slate-100 text-slate-800 rounded-lg">
                <Settings className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Parametri & Tariffe Operative FOUR</h1>
                <p className="text-xs text-slate-500">
                  Configurazione prezzi consumabili, calcolo resa/consumi "al contrario", parametri mezzi di proprietà e gomme
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {saveMessage && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {saveMessage}
              </span>
            )}
            <button
              onClick={handleSaveAll}
              className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition"
            >
              <Save className="w-4 h-4" />
              <span>Salva Tutte le Modifiche</span>
            </button>
          </div>
        </div>

        {/* 1. SEZIONE SPECIALE: CALCOLATORE "AL CONTRARIO" (RESA KM/KG <-> CONSUMO SPECIFICO) */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 shadow-xl border border-emerald-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-emerald-800/60">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-black text-white">
                  Calcolo "Al Contrario": Resa (Km/kg o Km/L) ↔ Consumo Specifico & Costo/Km
                </h2>
                <p className="text-xs text-emerald-200/80">
                  Consente di ragionare sia in "Quanti km fa con 1 unità" (es. 2,7 km/kg) sia in "Consumo per 100 km"
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              Bidirezionale
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            {/* Vettore */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-emerald-300 block">Vettore Energetico:</label>
              <select
                value={calcFuelType}
                onChange={(e) => {
                  setCalcFuelType(e.target.value);
                  if (e.target.value === 'elettrico') {
                    setCalcYieldValue(0.83);
                    setCalcConsumptionValue(1.20);
                  } else {
                    setCalcYieldValue(2.70);
                    setCalcConsumptionValue(37.04);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-800 border border-emerald-600/50 rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-emerald-400"
              >
                <option value="biolng">Bio-LNG (Biometano Liquido)</option>
                <option value="elettrico">Elettrico 100% BEV</option>
                <option value="hvo">HVO Biodiesel</option>
                <option value="gasolio">Gasolio Tradizionale</option>
              </select>
              <span className="text-[11px] text-slate-400">
                Prezzo attuale: {formatEUR(currentFuelPrice)} / {calcFuelType === 'elettrico' ? 'kWh' : calcFuelType === 'biolng' ? 'kg' : 'Litro'}
              </span>
            </div>

            {/* Input 1: Resa "Al Contrario" (Km per Unità) */}
            <div className="p-3 bg-slate-800/80 rounded-xl border border-emerald-500/30 space-y-1">
              <label className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                <span>Resa Chilometrica:</span>
                <span className="text-[10px] text-emerald-400 font-mono">Km / Unità</span>
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="0.05"
                  value={calcYieldValue}
                  onChange={(e) => handleYieldChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-emerald-500/50 rounded-lg text-lg font-black text-emerald-300 text-right"
                />
                <span className="text-xs font-bold text-slate-300">
                  {calcFuelType === 'elettrico' ? 'km/kWh' : calcFuelType === 'biolng' ? 'km/kg' : 'km/L'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Es. 2.7 km con 1 kg di Bio-LNG</p>
            </div>

            {/* Input 2: Consumo Specifico Tradizionale */}
            <div className="p-3 bg-slate-800/80 rounded-xl border border-emerald-500/30 space-y-1">
              <label className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                <span>Consumo Specifico:</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {calcFuelType === 'elettrico' ? 'kWh/km' : 'Unità / 100km'}
                </span>
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="0.1"
                  value={calcConsumptionValue}
                  onChange={(e) => handleConsumptionChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-emerald-500/50 rounded-lg text-lg font-black text-white text-right"
                />
                <span className="text-xs font-bold text-slate-300">
                  {calcFuelType === 'elettrico' ? 'kWh/km' : calcFuelType === 'biolng' ? 'kg/100km' : 'L/100km'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Convertito all'istante</p>
            </div>

            {/* Risultato Costo al Km */}
            <div className="p-3 bg-emerald-600/30 rounded-xl border border-emerald-400/50 text-center space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-emerald-300">Costo Energetico Diretto</span>
              <div className="text-2xl font-black text-white">
                {formatEUR(calculatedCostPerKm)} <span className="text-xs text-emerald-300 font-semibold">/ km</span>
              </div>
              <span className="text-[10px] text-emerald-200 block font-medium">
                ({formatEUR(calculatedCostPerKm * 100)} ogni 100 km)
              </span>
            </div>
          </div>
        </div>

        {/* 2. SEZIONE BENCHMARK CONSUMI E COSTI DI MERCATO (VEICOLI COMMERCIALI 2024-2026) */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Stime di Consumo Specifico & Canoni Mezzi di Mercato (Benchmark Costruttori)
                </h2>
                <p className="text-xs text-slate-500">
                  Dati reali da test su strada e schede tecniche costruttori (Volvo, Scania, Iveco, Renault, Mercedes)
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
              Riferimento 2025/2026
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MARKET_VEHICLE_BENCHMARKS.map((bench) => {
              const fuelObj = settings.fuelTypes.find(f => f.id === bench.fuelTypeId) || { price: 1.10 };
              const costKm = bench.fuelTypeId === 'elettrico'
                ? bench.avgConsumption * fuelObj.price
                : (bench.avgConsumption / 100) * fuelObj.price;

              return (
                <div
                  key={bench.id}
                  className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-sm transition flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {bench.category}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
                        {bench.capacityPlt} Pallet
                      </span>
                    </div>

                    <h3 className="text-xs font-black text-slate-900">{bench.name}</h3>
                    <p className="text-[11px] text-slate-500 font-medium italic">
                      Modelli: {bench.models}
                    </p>

                    <div className="pt-2 border-t border-slate-200 space-y-1.5 text-xs">
                      {/* Consumo e Resa */}
                      <div className="p-2 bg-white rounded-lg border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Consumo Specifico Medio:</span>
                          <span className="font-extrabold text-slate-900">
                            {bench.avgConsumption} {bench.consumptionUnit}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-700 font-bold block">Resa ("al contrario"):</span>
                          <span className="font-extrabold text-emerald-800">
                            {bench.yieldKmPerUnit} {bench.fuelTypeId === 'elettrico' ? 'km/kWh' : bench.fuelTypeId === 'biolng' ? 'km/kg' : 'km/L'}
                          </span>
                        </div>
                      </div>

                      {/* Costo al Km ai prezzi attuali */}
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Costo Energia/Carburante:</span>
                        <span className="font-bold text-emerald-700">
                          {formatEUR(costKm)} / km
                        </span>
                      </div>

                      {/* Canone NLT indicativo */}
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Canone NLT Indicativo:</span>
                        <span className="font-bold text-purple-700">
                          {formatEUR(bench.indicativeMonthlyLease)} / m
                        </span>
                      </div>

                      {/* Range Reale */}
                      <div className="text-[10px] text-slate-500 pt-1">
                        <span className="font-semibold text-slate-600">Range Reale:</span> {bench.marketConsumptionRange}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCalcFuelType(bench.fuelTypeId);
                      setCalcYieldValue(bench.yieldKmPerUnit);
                      setCalcConsumptionValue(bench.avgConsumption);
                      window.scrollTo({ top: 100, behavior: 'smooth' });
                    }}
                    className="w-full py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold transition flex items-center justify-center space-x-1"
                  >
                    <span>Testa nel Calcolatore</span>
                    <ArrowRightLeft className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. GRIGLIA PRINCIPALE: PROPRIETÀ, PNEUMATICI, CARBURANTI, AUTISTI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* A. MEZZI DI PROPRIETÀ (Assicurazione, Bollo, Ammortamento, Manutenzione) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Parametri Mezzi di Proprietà FOUR</h2>
                  <p className="text-[11px] text-slate-500">Costi fissi per i veicoli acquistati (senza canone NLT)</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Proprietà
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Assicurazione RCA Annuale:</span>
                  <span className="text-[11px] text-slate-500">
                    Quota mensile: ~{formatEUR((settings.ownershipDefaults?.annualInsuranceRCA || 3200) / 12)} / m
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="50"
                    value={settings.ownershipDefaults?.annualInsuranceRCA || 3200}
                    onChange={(e) => handleOwnershipDefaultChange('annualInsuranceRCA', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/anno</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Assicurazione Kasko / Incendio & Furto:</span>
                  <span className="text-[11px] text-slate-500">
                    Quota mensile: ~{formatEUR((settings.ownershipDefaults?.annualInsuranceKasko || 2400) / 12)} / m
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="50"
                    value={settings.ownershipDefaults?.annualInsuranceKasko || 2400}
                    onChange={(e) => handleOwnershipDefaultChange('annualInsuranceKasko', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/anno</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Tassa di Possesso / Bollo Annuale:</span>
                  <span className="text-[11px] text-emerald-600 font-semibold">
                    (Veicoli 100% elettrici BEV: esenzione totale o riduzione 75%)
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="50"
                    value={settings.ownershipDefaults?.annualRoadTax || 1100}
                    onChange={(e) => handleOwnershipDefaultChange('annualRoadTax', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/anno</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Manutenzione Programmata & Tagliandi:</span>
                  <span className="text-[11px] text-slate-500">Tagliandi periodici e manutenzione ordinaria</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="25"
                    value={settings.ownershipDefaults?.monthlyMaintenance || 350}
                    onChange={(e) => handleOwnershipDefaultChange('monthlyMaintenance', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/mese</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Anni di Ammortamento Fiscale / Gestionale:</span>
                  <span className="text-[11px] text-slate-500">Periodo di ripartizione del costo d'acquisto</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="1"
                    min="3"
                    max="10"
                    value={settings.ownershipDefaults?.amortizationYears || 5}
                    onChange={(e) => handleOwnershipDefaultChange('amortizationYears', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">Anni</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-blue-900 flex justify-between items-center font-bold">
                <span>Costo Fisso Mensile Mezzo Proprietà (senza ammortamento):</span>
                <span className="text-sm text-blue-950 font-black">
                  {formatEUR(
                    ((settings.ownershipDefaults?.annualInsuranceRCA || 3200) +
                     (settings.ownershipDefaults?.annualInsuranceKasko || 2400) +
                     (settings.ownershipDefaults?.annualRoadTax || 1100)) / 12 +
                    (settings.ownershipDefaults?.monthlyMaintenance || 350)
                  )} / mese
                </span>
              </div>
            </div>
          </div>

          {/* B. MODELLO CONSUMO PNEUMATICI / GOMME DIFFERENZIATO PER TIPO DI MEZZO */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <CircleDot className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Costi a Gomma (€/gomma) &amp; Durate Differenziate per Tipo di Mezzo</h2>
                  <p className="text-[11px] text-slate-500">Costo unitario pneumatico e chilometraggio specifici per ciascuna categoria di veicolo</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                5 Categorie Mezzo
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {/* Grid 5 Tipologie di Mezzo con Costo a Gomma (€) + Durata (Km) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Trattori Elettrici BEV */}
                <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-rose-950 uppercase text-[10px] tracking-wider">1. Trattori Elettrici (BEV)</span>
                    <span className="px-1.5 py-0.5 bg-rose-200 text-rose-900 rounded font-black text-[10px]">6 Gomme HL</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-rose-900 mb-0.5">Costo / Gomma (€)</label>
                      <input
                        type="number"
                        step="10"
                        value={costPerTireTractorElectric}
                        onChange={(e) => setCostPerTireTractorElectric(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-rose-300 rounded font-black text-rose-950 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-rose-900 mb-0.5">Durata (Km)</label>
                      <input
                        type="number"
                        step="5000"
                        value={lifeKmTractorElectric}
                        onChange={(e) => setLifeKmTractorElectric(parseFloat(e.target.value) || 50000)}
                        className="w-full px-2 py-1 border border-rose-300 rounded font-black text-rose-900 bg-white"
                      />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-rose-200 font-bold text-rose-950 flex justify-between items-center text-[11px]">
                    <span>Treno 6 gomme: {formatEUR(6 * costPerTireTractorElectric)}</span>
                    <strong>{tireCostTractorBEV.toFixed(4)} €/km</strong>
                  </div>
                </div>

                {/* 2. Trattori Bio-LNG / HVO / Diesel */}
                <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-indigo-950 uppercase text-[10px] tracking-wider">2. Trattori Bio-LNG / Termici</span>
                    <span className="px-1.5 py-0.5 bg-indigo-200 text-indigo-900 rounded font-black text-[10px]">6 Gomme</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-0.5">Costo / Gomma (€)</label>
                      <input
                        type="number"
                        step="10"
                        value={costPerTireTractorBiolng}
                        onChange={(e) => setCostPerTireTractorBiolng(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-indigo-300 rounded font-black text-indigo-950 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-0.5">Durata (Km)</label>
                      <input
                        type="number"
                        step="5000"
                        value={lifeKmTractorBiolng}
                        onChange={(e) => setLifeKmTractorBiolng(parseFloat(e.target.value) || 85000)}
                        className="w-full px-2 py-1 border border-indigo-300 rounded font-black text-indigo-900 bg-white"
                      />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-indigo-200 font-bold text-indigo-950 flex justify-between items-center text-[11px]">
                    <span>Treno 6 gomme: {formatEUR(6 * costPerTireTractorBiolng)}</span>
                    <strong>{tireCostTractorBio.toFixed(4)} €/km</strong>
                  </div>
                </div>

                {/* 3. Semirimorchi & Casse */}
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-950 uppercase text-[10px] tracking-wider">3. Semirimorchi (Frigo/Box/DD)</span>
                    <span className="px-1.5 py-0.5 bg-blue-200 text-blue-900 rounded font-black text-[10px]">6 Gomme 385/65</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-blue-900 mb-0.5">Costo / Gomma (€)</label>
                      <input
                        type="number"
                        step="10"
                        value={costPerTireTrailer}
                        onChange={(e) => setCostPerTireTrailer(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-blue-300 rounded font-black text-blue-950 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-blue-900 mb-0.5">Durata (Km)</label>
                      <input
                        type="number"
                        step="5000"
                        value={lifeKmTrailer}
                        onChange={(e) => setLifeKmTrailer(parseFloat(e.target.value) || 80000)}
                        className="w-full px-2 py-1 border border-blue-300 rounded font-black text-blue-900 bg-white"
                      />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-blue-200 font-bold text-blue-950 flex justify-between items-center text-[11px]">
                    <span>Treno 6 gomme: {formatEUR(6 * costPerTireTrailer)}</span>
                    <strong>{tireCostTrailer.toFixed(4)} €/km</strong>
                  </div>
                </div>

                {/* 4. Motrici Pesanti 12-22 Plt */}
                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-emerald-950 uppercase text-[10px] tracking-wider">4. Motrici (12-22 Pallet)</span>
                    <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-900 rounded font-black text-[10px]">6 Gomme</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">Costo / Gomma (€)</label>
                      <input
                        type="number"
                        step="10"
                        value={costPerTireRigid}
                        onChange={(e) => setCostPerTireRigid(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-emerald-300 rounded font-black text-emerald-950 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">Durata (Km)</label>
                      <input
                        type="number"
                        step="5000"
                        value={lifeKmRigidElectric}
                        onChange={(e) => setLifeKmRigidElectric(parseFloat(e.target.value) || 80000)}
                        className="w-full px-2 py-1 border border-emerald-300 rounded font-black text-emerald-900 bg-white"
                      />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-emerald-200 font-bold text-emerald-950 flex justify-between items-center text-[11px]">
                    <span>Treno 6 gomme: {formatEUR(6 * costPerTireRigid)}</span>
                    <strong>{tireCostRigidBEV.toFixed(4)} €/km</strong>
                  </div>
                </div>
              </div>

              {/* 5. Daily 72 / Autocarri Leggeri & Furgoni */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-extrabold text-slate-900 uppercase text-[10px] tracking-wider block">
                    5. Daily 72 (7.2t) / Furgoni &amp; Leggeri (R16C - 6 gomme gemellate)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Treno 6 gomme: {formatEUR(6 * costPerTireLight)} → <strong>{tireCostLightDaily.toFixed(4)} €/km</strong>
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] text-slate-600 font-semibold">€/gomma:</span>
                    <input
                      type="number"
                      step="10"
                      value={costPerTireLight}
                      onChange={(e) => setCostPerTireLight(parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded font-bold bg-white text-right"
                    />
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] text-slate-600 font-semibold">Km:</span>
                    <input
                      type="number"
                      step="5000"
                      value={lifeKmLight}
                      onChange={(e) => setLifeKmLight(parseFloat(e.target.value) || 65000)}
                      className="w-24 px-2 py-1 border border-slate-300 rounded font-bold bg-white text-right"
                    />
                  </div>
                </div>
              </div>

              {/* Riepilogo Combinato Bilico Elettrico vs Bilico Bio-LNG */}
              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 flex flex-col sm:flex-row justify-between sm:items-center gap-2 font-bold">
                <div className="space-y-0.5">
                  <span className="block text-xs">
                    • Bilico Elettrico (Trattore {costPerTireTractorElectric}€ + Rimorchio {costPerTireTrailer}€): <strong>{calculatedTireCostKm.toFixed(4)} €/km</strong>
                  </span>
                  <span className="block text-xs text-indigo-950">
                    • Bilico Bio-LNG (Trattore {costPerTireTractorBiolng}€ + Rimorchio {costPerTireTrailer}€): <strong>{calculatedBioArticulatedKm.toFixed(4)} €/km</strong>
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-amber-900 font-black block">
                    BEV: {formatEUR(calculatedTireCostKm * 250)}/gg
                  </span>
                  <span className="text-xs text-indigo-800 font-bold block">
                    LNG: {formatEUR(calculatedBioArticulatedKm * 250)}/gg (su 250 km)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. ALTRI CONSUMABILI & CANONI OPERATIVI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Altri Consumabili (AdBlue, Azoto, Telepass, Telematica) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Fuel className="w-5 h-5 text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900">Altri Consumabili & Canoni Flotta</h2>
              </div>
              <span className="text-xs text-slate-400">Additivi & Servizi</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">AdBlue (€/Litro):</span>
                  <span className="text-[11px] text-slate-500">Per veicoli HVO/Euro 6 (consumo ~5% su carburante)</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="0.05"
                    value={settings.standardCosts?.adbluePricePerLiter || 0.85}
                    onChange={(e) => handleStandardCostChange('adbluePricePerLiter', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/L</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Azoto Liquido Criogenico Frigo (€/gg):</span>
                  <span className="text-[11px] text-slate-500">Refrigerazione ecologica silenziosa notturna</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="1"
                    value={settings.standardCosts?.azotoFrigoDailyEstimate || 20.00}
                    onChange={(e) => handleStandardCostChange('azotoFrigoDailyEstimate', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/gg</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Canone Telematica GPS / Tachigrafo Remoto:</span>
                  <span className="text-[11px] text-slate-500">Piattaforme Webfleet / Scania Connect / Volvo Connect</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="5"
                    value={settings.standardCosts?.telematicsMonthly || 35.00}
                    onChange={(e) => handleStandardCostChange('telematicsMonthly', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/mese</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Canone Apparato Telepass / Dispositivo Autostrada:</span>
                  <span className="text-[11px] text-slate-500">Costo fisso mensile per dispositivo di bordo</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="1"
                    value={settings.standardCosts?.telepassMonthly || 15.00}
                    onChange={(e) => handleStandardCostChange('telepassMonthly', e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€/mese</span>
                </div>
              </div>
            </div>
          </div>

          {/* Prezzi Ufficiali Vettori Energetici ALLA POMPA (Senza Recupero Accise) + Sync Settimanale Fonti Ufficiali */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-emerald-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Prezzi Carburanti &amp; Energia &ldquo;Alla Pompa&rdquo; (Senza Recupero Accise)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Valori medi aggiornati settimanalmente da fonti ufficiali (MASE Osservatorio Carburanti / GME / Assogasliquidi)
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={fuelSyncing}
                onClick={handleManualFuelWeeklySync}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#164e87] hover:bg-[#0b2440] text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                title="Interroga le fonti ufficiali MASE / GME e ricalcola dinamicamente tutte le commesse"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fuelSyncing ? 'animate-spin' : ''}`} />
                <span>{fuelSyncing ? 'Aggiornamento...' : 'Aggiorna Ora da Fonti Ufficiali'}</span>
              </button>
            </div>

            {/* Banner Stato Aggiornamento Settimanale Automatico */}
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="font-black text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    Modalità Prezzi &ldquo;Alla Pompa&rdquo; (100% Lordo Accise — Nessun Rimborso Accise)
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  {settings.lastFuelSyncMeta?.weekLabel
                    ? `Ultimo rilevamento settimanale: ${settings.lastFuelSyncMeta.weekLabel} • Fonte: ${settings.lastFuelSyncMeta.sourceLabel}`
                    : 'Feed collegato a Osservatorio Prezzi Carburanti MASE / MIMIT, Listini Rete HVO/Bio-LNG e GME PUN'}
                </p>
              </div>
              <label className="flex items-center space-x-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-emerald-300 font-bold text-[11px] text-emerald-900">
                <input
                  type="checkbox"
                  checked={settings.autoWeeklyFuelSync !== false}
                  onChange={(e) => setSettings({ ...settings, autoWeeklyFuelSync: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Sync Settimanale Auto</span>
              </label>
            </div>

            <div className="space-y-3 text-xs">
              {settings.fuelTypes.map((fuel) => (
                <div key={fuel.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{fuel.name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-200">
                        Alla Pompa
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 block">{fuel.notes || fuel.unit}</span>
                    {fuel.marketRange && (
                      <span className="text-[10px] text-emerald-700 font-semibold">Range rilevato: {fuel.marketRange}</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-medium">{fuel.unit}:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={fuel.price}
                      onChange={(e) => handleFuelPriceChange(fuel.id, e.target.value)}
                      className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold text-slate-900 bg-white"
                    />
                    <span className="font-bold text-slate-700">€</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3.5 PARAMETRI REFRIGERAZIONE SEMIRIMORCHI FRIGO & COSTI ACCESSORI STANDARD */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Snowflake className="w-5 h-5 text-cyan-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Parametri Refrigerazione Semirimorchi Frigo &amp; Costi Accessori Standard (Telematica e Lavaggi)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Valori predefiniti modificabili per Preventivi e Commesse FOUR (scadenza pagamento predefinita: 30 gg)
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200">
              Nota 3 Integrazioni
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            {/* Refrigerazione Frigo */}
            <div className="p-4 bg-cyan-50/50 rounded-xl border border-cyan-200 space-y-3">
              <div className="flex items-center space-x-2 font-bold text-cyan-950">
                <Snowflake className="w-4 h-4 text-cyan-700" />
                <span>Gruppi Frigoriferi (Azoto Liquido vs Gasolio)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Azoto Liquido */}
                <div className="p-3 bg-white rounded-xl border border-cyan-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-900">Azoto Liquido</span>
                    <span className="text-[11px] font-black text-cyan-700">
                      {formatEUR((settings.refrigerationParams?.azoto?.unitCost ?? 0.13) * (settings.refrigerationParams?.azoto?.hourlyConsumption ?? 30))}/h
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Costo unitario (€/kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={settings.refrigerationParams?.azoto?.unitCost ?? 0.13}
                        onChange={(e) => handleRefParamChange('azoto', 'unitCost', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Consumo orario (kg/h)</label>
                      <input
                        type="number"
                        step="1"
                        value={settings.refrigerationParams?.azoto?.hourlyConsumption ?? 30}
                        onChange={(e) => handleRefParamChange('azoto', 'hourlyConsumption', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Gasolio Frigo */}
                <div className="p-3 bg-white rounded-xl border border-cyan-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Gasolio Frigo</span>
                    <span className="text-[11px] font-black text-amber-700">
                      {formatEUR((settings.refrigerationParams?.gasolio?.unitCost ?? 1.80) * (settings.refrigerationParams?.gasolio?.hourlyConsumption ?? 3.0))}/h
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Costo unitario (€/L)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={settings.refrigerationParams?.gasolio?.unitCost ?? 1.80}
                        onChange={(e) => handleRefParamChange('gasolio', 'unitCost', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Consumo orario (L/h)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={settings.refrigerationParams?.gasolio?.hourlyConsumption ?? 3.0}
                        onChange={(e) => handleRefParamChange('gasolio', 'hourlyConsumption', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Telematica & Lavaggi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Telematica */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2.5">
                <div className="flex items-center space-x-2 font-bold text-indigo-950">
                  <Wifi className="w-4 h-4 text-indigo-700" />
                  <span>Telematica Mensile (€/mese)</span>
                </div>
                <div className="space-y-1.5 bg-white p-3 rounded-xl border border-indigo-200/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-600">Trattori stradali</label>
                    <input
                      type="number"
                      step="1"
                      value={settings.accessoryParams?.telematics?.tractorMonthly ?? 14}
                      onChange={(e) => handleTelParamChange('tractorMonthly', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-600">Semirimorchi (trailer)</label>
                    <input
                      type="number"
                      step="1"
                      value={settings.accessoryParams?.telematics?.trailerMonthly ?? 13}
                      onChange={(e) => handleTelParamChange('trailerMonthly', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-600">Motrici</label>
                    <input
                      type="number"
                      step="1"
                      value={settings.accessoryParams?.telematics?.rigidMonthly ?? 12}
                      onChange={(e) => handleTelParamChange('rigidMonthly', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                    />
                  </div>
                  <div className="pt-1 border-t border-slate-100 text-[10px] font-bold text-indigo-800 flex justify-between">
                    <span>Trattore + Rimorchio:</span>
                    <span>{formatEUR((settings.accessoryParams?.telematics?.tractorMonthly ?? 14) + (settings.accessoryParams?.telematics?.trailerMonthly ?? 13))}/mese</span>
                  </div>
                </div>
              </div>

              {/* Lavaggi */}
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2.5">
                <div className="flex items-center space-x-2 font-bold text-blue-950">
                  <Droplets className="w-4 h-4 text-blue-700" />
                  <span>Lavaggio Automezzi</span>
                </div>
                <div className="space-y-1.5 bg-white p-3 rounded-xl border border-blue-200/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-600">Costo singolo lavaggio (€)</label>
                    <input
                      type="number"
                      step="5"
                      value={settings.accessoryParams?.washing?.costPerWash ?? 80}
                      onChange={(e) => handleWashParamChange('costPerWash', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-600">Frequenza (lavaggi/mese)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={settings.accessoryParams?.washing?.washesPerMonth ?? 2}
                      onChange={(e) => handleWashParamChange('washesPerMonth', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold"
                    />
                  </div>
                  <div className="pt-1 border-t border-slate-100 text-[10px] font-bold text-blue-900 flex justify-between">
                    <span>Costo mensile totale:</span>
                    <span>{formatEUR((settings.accessoryParams?.washing?.costPerWash ?? 80) * (settings.accessoryParams?.washing?.washesPerMonth ?? 2))}/mese</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. TARIFFE STANDARD AUTISTI CCNL */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Tariffe Standard Autisti di Riferimento (€ / Giorno)</h2>
            </div>
            <span className="text-xs text-slate-400">CCNL Trasporto Merci & Logistica</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {settings.licenseTypes.map((lic) => (
              <div key={lic.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">{lic.name}</span>
                  <span className="text-[10px] text-slate-500">~{formatEUR(lic.dailyCost * 22)} / m</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="5"
                    value={lic.dailyCost}
                    onChange={(e) => handleLicenseCostChange(lic.id, e.target.value)}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-right font-bold text-slate-900 bg-white"
                  />
                  <span className="font-bold text-slate-700">€</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4.5 SEZIONE REGOLE DI TESORERIA & RECUPERO ACCISE */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Regole di Tesoreria, Scadenze Reali Uscite & Recupero Accise</h2>
                <p className="text-[11px] text-slate-500">Configurazione delle date valuta esatte e compensazioni F24 per FOUR</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Cash Flow Reale
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Box Noleggi */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block">
                Noleggi Mezzi (Predefinito)
              </span>
              <p className="text-[11px] text-slate-500">
                Opzione di pagamento applicata ai nuovi veicoli NLT
              </p>
              <select
                value={settings.treasuryRules?.defaultLeaseTiming || 'M1_D10'}
                onChange={(e) => {
                  setSettings({
                    ...settings,
                    treasuryRules: {
                      ...settings.treasuryRules,
                      defaultLeaseTiming: e.target.value
                    }
                  });
                }}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white"
              >
                <option value="M1_D10">Giorno 10 M1 (Anticipato / Inizio Mese)</option>
                <option value="M1_D30">Giorno 30 M1 (Fine Mese)</option>
                <option value="M2_D20">Giorno 20 M2 (Mese Successivo)</option>
              </select>
            </div>

            {/* Box LNG */}
            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
              <span className="text-[11px] font-bold text-blue-950 uppercase tracking-wider block">
                LNG / Carburanti
              </span>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-900">
                30 gg data fattura quindicinale
              </div>
              <p className="text-[11px] text-blue-900 leading-tight">
                1-15 M1 saldato il <strong>15 M2</strong>.<br />
                16-31 M1 saldato il <strong>30 M2</strong>.<br />
                <span className="font-semibold text-blue-950">100% dell'importo esce a Mese 2.</span>
              </p>
            </div>

            {/* Box Telepass */}
            <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
              <span className="text-[11px] font-bold text-amber-950 uppercase tracking-wider block">
                Telepass / Pedaggi
              </span>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900">
                15 gg data fattura quindicinale
              </div>
              <p className="text-[11px] text-amber-900 leading-tight">
                1-15 M1 saldato il <strong>30 M1</strong> (50%).<br />
                16-31 M1 saldato il <strong>15 M2</strong> (50%).<br />
                <span className="font-semibold text-amber-950">50% a Mese 1, 50% a Mese 2.</span>
              </p>
            </div>

            {/* Box Prezzi Alla Pompa (Senza Recupero Accise) */}
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">
                  Carburanti Alla Pompa
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-200 text-emerald-950">
                  Senza Accise
                </span>
              </div>
              <p className="text-[11px] text-emerald-900 leading-tight">
                Tutti i calcoli di simulazione, commessa e cash flow utilizzano il <strong>prezzo pieno alla pompa</strong> senza recupero accise.
              </p>
              <p className="text-[10px] text-emerald-800 leading-tight">
                Aggiornamento medio settimanale da Osservatorio MASE / GME.
              </p>
            </div>
          </div>
        </div>

        {/* 5. GESTIONE SICUREZZA & PASSWORD DI ACCESSO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-[#164e87]" />
              <h2 className="text-sm font-bold text-slate-900">Sicurezza &amp; Credenziali di Accesso alla Piattaforma</h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Utenza: <strong className="text-slate-800">{authConfig?.adminEmail || 'amministrazione@four-logistics.it'}</strong>
            </span>
          </div>

          <p className="text-xs text-slate-600">
            Proteggi i dati sensibili, i contratti con i clienti e i flussi di cassa aziendali modificando la password di accesso alla piattaforma.
          </p>

          {pwdError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center space-x-2">
              <span className="font-bold">Attenzione:</span>
              <span>{pwdError}</span>
            </div>
          )}

          {pwdSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-semibold">{pwdSuccess}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Password Attuale *</label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] outline-none"
                placeholder="Password attuale"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nuova Password *</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] outline-none"
                placeholder="Minimo 6 caratteri"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Conferma Nuova Password *</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] outline-none"
                placeholder="Ripeti nuova password"
              />
            </div>

            <div>
              <button
                type="submit"
                className="w-full py-2 bg-[#164e87] hover:bg-[#0f3b75] text-white font-bold rounded-xl transition shadow-sm flex items-center justify-center space-x-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-cyan-300" />
                <span>Aggiorna Password</span>
              </button>
            </div>
          </form>
        </div>

        {/* 6. GESTIONE BACKUP & RESET DATI */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">Backup, Ripristino & Sincronizzazione Dati</h2>
            </div>
            <span className="text-xs text-emerald-700 font-semibold">Persistenza Locale Offline Attiva</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900">Esporta Backup (.json)</h3>
              <p className="text-slate-500 text-[11px]">
                Scarica un file JSON completo con tutti i dati di flotta, commesse, budget e parametri di costo.
              </p>
              <button
                onClick={handleExportBackup}
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Scarica Backup JSON</span>
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-900">Importa Backup (.json)</h3>
              <p className="text-slate-500 text-[11px]">
                Ripristina un archivio dati precedentemente esportato o importalo su un'altra postazione.
              </p>
              <label className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Carica File Backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
              <h3 className="font-bold text-amber-950">Ripristina Dati Originali Excel</h3>
              <p className="text-amber-800 text-[11px]">
                Ricarica lo stato iniziale del file Excel con tutti i 17 progetti storici e la flotta pre-configurata.
              </p>
              <button
                onClick={handleResetDefaults}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Ripristina Tutto da Excel</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
