import { useState, useEffect } from 'react';
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
  ExternalLink
} from 'lucide-react';

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  // Stato per il Calcolatore "al contrario" (Resa km/unità <-> Consumo specifico)
  const [calcFuelType, setCalcFuelType] = useState('biolng');
  const [calcInputMode, setCalcInputMode] = useState('yield'); // 'yield' (km/kg) oppure 'consumption' (kg/100km)
  const [calcYieldValue, setCalcYieldValue] = useState(2.7); // 2.7 km con 1 kg (dal file Excel)
  const [calcConsumptionValue, setCalcConsumptionValue] = useState(37.04); // 37.04 kg/100km

  // Stato Calcolatore Gomme
  const [tireCostUnit, setTireCostUnit] = useState(450);
  const [tireCount, setTireCount] = useState(12); // 6 trattore + 6 semirimorchio
  const [tireLifeKm, setTireLifeKm] = useState(90000);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    const s = storageService.getSettings();
    setSettings(s);
    if (s.tireParameters) {
      setTireCostUnit(s.tireParameters.costPerTire || 450);
      setTireCount((s.tireParameters.tiresTractor || 6) + (s.tireParameters.tiresTrailer || 6));
      setTireLifeKm(s.tireParameters.tireLifeKm || 90000);
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

  const handleSaveAll = () => {
    // Calcola il costo gomme risultante
    const estimatedTireCostKm = tireLifeKm > 0 ? (tireCount * tireCostUnit) / tireLifeKm : 0.04;

    const updatedSettings = {
      ...settings,
      tireParameters: {
        costPerTire: tireCostUnit,
        tiresTractor: tireCount === 12 ? 6 : Math.round(tireCount / 2),
        tiresTrailer: tireCount === 12 ? 6 : Math.round(tireCount / 2),
        tireLifeKm,
        estimatedTireCostKm: +estimatedTireCostKm.toFixed(4)
      },
      standardCosts: {
        ...settings.standardCosts,
        tireCostKm: +estimatedTireCostKm.toFixed(4)
      }
    };

    storageService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setSaveMessage('Impostazioni, parametri di proprietà e tariffe salvati!');
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

  // Calcolo costo gomme dinamico
  const calculatedTireCostKm = tireLifeKm > 0 ? (tireCount * tireCostUnit) / tireLifeKm : 0.04;

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

          {/* B. MODELLO CONSUMO PNEUMATICI / GOMME */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <CircleDot className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Modello di Consumo Pneumatici (Gomme)</h2>
                  <p className="text-[11px] text-slate-500">Calcolo scientifico del costo usura gomme al km</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Pneumatici
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Costo Medio per Pneumatico Nuovo:</span>
                  <span className="text-[11px] text-slate-500">Pneumatici di prima fascia (Michelin, Goodyear, Bridgestone)</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="10"
                    value={tireCostUnit}
                    onChange={(e) => setTireCostUnit(parseFloat(e.target.value) || 0)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">€</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Numero Totale Gomme (Trattore + Semirimorchio):</span>
                  <span className="text-[11px] text-slate-500">Es. Bilico 5 assi = 6 trattore + 6 semirimorchio = 12</span>
                </div>
                <div className="flex items-center space-x-1">
                  <select
                    value={tireCount}
                    onChange={(e) => setTireCount(parseInt(e.target.value))}
                    className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  >
                    <option value="6">6 (Motrice/Trattore solo)</option>
                    <option value="10">10 (Autocarro 4 assi)</option>
                    <option value="12">12 (Bilico Completo)</option>
                    <option value="14">14 (Biga/Autotreno)</option>
                  </select>
                  <span className="text-slate-500 font-bold">Gomme</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Durata Chilometrica Stimata del Treno:</span>
                  <span className="text-[11px] text-slate-500">Km medi percorsi prima della sostituzione completa</span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="5000"
                    value={tireLifeKm}
                    onChange={(e) => setTireLifeKm(parseFloat(e.target.value) || 0)}
                    className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white"
                  />
                  <span className="text-slate-500 font-bold">Km</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 flex justify-between items-center font-bold">
                <div>
                  <span className="block">Costo Treno Completo: {formatEUR(tireCount * tireCostUnit)}</span>
                  <span className="text-[11px] text-amber-800 font-normal">
                    Formula: ({tireCount} gomme × {formatEUR(tireCostUnit)}) ÷ {tireLifeKm.toLocaleString('it-IT')} km
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base text-amber-900 font-black">
                    {formatEUR(calculatedTireCostKm)} / km
                  </span>
                  <span className="block text-[10px] text-amber-700">
                    ({formatEUR(calculatedTireCostKm * 250)} / giorno su 250 km)
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

          {/* Prezzi Ufficiali Vettori Energetici */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">Prezzi Base Vettori Energetici (€ / Unità)</h2>
              </div>
              <span className="text-xs text-slate-400">Tariffario FOUR</span>
            </div>

            <div className="space-y-3 text-xs">
              {settings.fuelTypes.map((fuel) => (
                <div key={fuel.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">{fuel.name}</span>
                    <span className="text-[11px] text-slate-500">{fuel.notes || fuel.unit}</span>
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

            {/* Box Accise */}
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">
                  Recupero Accise
                </span>
                <input
                  type="checkbox"
                  checked={settings.treasuryRules?.acciseRecovery?.enabled !== false}
                  onChange={(e) => {
                    setSettings({
                      ...settings,
                      treasuryRules: {
                        ...settings.treasuryRules,
                        acciseRecovery: {
                          ...settings.treasuryRules?.acciseRecovery,
                          enabled: e.target.checked
                        }
                      }
                    });
                  }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[11px] text-emerald-900 font-semibold">Credito:</span>
                <input
                  type="number"
                  step="0.005"
                  value={settings.treasuryRules?.acciseRecovery?.ratePerLiterDiesel || 0.21418}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0.21418;
                    setSettings({
                      ...settings,
                      treasuryRules: {
                        ...settings.treasuryRules,
                        acciseRecovery: {
                          ...settings.treasuryRules?.acciseRecovery,
                          ratePerLiterDiesel: val
                        }
                      }
                    });
                  }}
                  className="w-20 px-1.5 py-1 border border-emerald-300 rounded text-right font-bold text-xs bg-white"
                />
                <span className="text-[11px] text-emerald-900 font-bold">€/L</span>
              </div>
              <p className="text-[10px] text-emerald-800 leading-tight">
                Compensazione F24 a <strong>Q+1</strong> (Maggio, Agosto, Novembre, Febbraio).
              </p>
            </div>
          </div>
        </div>

        {/* 5. GESTIONE BACKUP & RESET DATI */}
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
