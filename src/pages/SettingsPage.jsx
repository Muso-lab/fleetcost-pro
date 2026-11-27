import { useState, useEffect, useRef } from 'react';
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
  Shield,
  CircleDot,
  ArrowRightLeft,
  Sparkles,
  Snowflake,
  Droplets,
  Wifi,
  Lock,
  ShieldCheck,
  Cloud,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Wallet
} from 'lucide-react';

const SETTINGS_TABS = [
  { id: 'fuels', label: 'Carburanti & Autisti', icon: Fuel },
  { id: 'tires_accessories', label: 'Gomme, Frigo & Accessori', icon: CircleDot },
  { id: 'treasury', label: 'Tesoreria & Proprietà', icon: Shield },
  { id: 'backup', label: 'Backup & Cloud', icon: Cloud },
  { id: 'security', label: 'Sicurezza & Password', icon: Lock }
];

const getFuelPriceUnit = (fuelId) => {
  if (fuelId === 'elettrico') return '€/kWh';
  if (fuelId === 'biolng') return '€/kg';
  if (fuelId === 'azoto') return '€/gg';
  return '€/L';
};

const safeNonNeg = (val, fallback = 0) => {
  if (val === '' || val === null || val === undefined) return fallback;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const SettingsPage = () => {
  const { authConfig, updatePassword } = useAuth();
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('fuels');
  const [saveMessage, setSaveMessage] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(() => storageService.getCloudStatus());
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [calcHighlight, setCalcHighlight] = useState(false);
  const calculatorRef = useRef(null);

  // Stato Backup & Ripristino Cloud
  const [backupPreview, setBackupPreview] = useState(null);
  const [backupError, setBackupError] = useState('');
  const [backupRestoring, setBackupRestoring] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState('');

  // Stato per Sicurezza e Modifica Password
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdSaving) return;
    setPwdError('');
    setPwdSuccess('');

    if (!newPassword || newPassword.length < 6) {
      setPwdError('La nuova password deve contenere almeno 6 caratteri.');
      return;
    }
    if (newPassword === oldPassword) {
      setPwdError('La nuova password deve essere diversa da quella attuale.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('La nuova password e la conferma non coincidono.');
      return;
    }

    setPwdSaving(true);
    try {
      await updatePassword(oldPassword, newPassword);
      setPwdSuccess('Password aggiornata con successo! La nuova password è ora attiva e sincronizzata sul Cloud.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwdSuccess(''), 5000);
    } catch (err) {
      setPwdError(err.message || 'Errore durante l\'aggiornamento della password.');
    } finally {
      setPwdSaving(false);
    }
  };

  // Stato per il Calcolatore "al contrario" (Resa km/unità <-> Consumo specifico)
  const [calcFuelType, setCalcFuelType] = useState('biolng');
  const [calcYieldValue, setCalcYieldValue] = useState(2.7);
  const [calcConsumptionValue, setCalcConsumptionValue] = useState(37.04);

  // Stato Gomme con Costi a Gomma & Durate Differenziate per Tipo di Mezzo FOUR
  const [tireCostUnit, setTireCostUnit] = useState(450);
  const [costPerTireTractorElectric, setCostPerTireTractorElectric] = useState(520);
  const [costPerTireTractorBiolng, setCostPerTireTractorBiolng] = useState(460);
  const [costPerTireTrailer, setCostPerTireTrailer] = useState(380);
  const [costPerTireRigid, setCostPerTireRigid] = useState(420);
  const [costPerTireLight, setCostPerTireLight] = useState(240);
  const [tireLifeKm, setTireLifeKm] = useState(80000);
  const [lifeKmTrailer, setLifeKmTrailer] = useState(80000);
  const [lifeKmTractorElectric, setLifeKmTractorElectric] = useState(50000);
  const [lifeKmRigidElectric, setLifeKmRigidElectric] = useState(80000);
  const [lifeKmTractorBiolng, setLifeKmTractorBiolng] = useState(85000);
  const [lifeKmLight, setLifeKmLight] = useState(65000);
  const [fuelSyncing, setFuelSyncing] = useState(false);

  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    loadSettings();
    const unsubscribe = storageService.subscribe((event) => {
      if (event.type === 'data' && event.scopes?.includes('settings')) {
        if (!isDirtyRef.current) {
          loadSettings();
        }
      } else if (event.type === 'status') {
        setCloudStatus(event.cloudStatus);
      }
    });
    // Aggiornamento automatico settimanale all'avvio se sono passati >= 7 giorni dall'ultimo sync
    storageService.refreshWeeklyFuelPricesFromOfficialSources({ force: false }).then(res => {
      if (res && res.updated && !isDirtyRef.current) {
        loadSettings();
      }
    });
    return () => unsubscribe();
  }, []);

  const loadSettings = () => {
    const s = storageService.getSettings();
    setSettings(s);
    setIsDirty(false);
    if (s.tireParameters) {
      setTireCostUnit(s.tireParameters.costPerTire ?? 450);
      setCostPerTireTractorElectric(s.tireParameters.costPerTireTractorElectric ?? 520);
      setCostPerTireTractorBiolng(s.tireParameters.costPerTireTractorBiolng ?? 460);
      setCostPerTireTrailer(s.tireParameters.costPerTireTrailer ?? 380);
      setCostPerTireRigid(s.tireParameters.costPerTireRigid ?? 420);
      setCostPerTireLight(s.tireParameters.costPerTireLight ?? 240);
      setTireLifeKm(s.tireParameters.tireLifeKm ?? 80000);
      setLifeKmTrailer(s.tireParameters.lifeKmTrailer ?? 80000);
      setLifeKmTractorElectric(s.tireParameters.lifeKmTractorElectric ?? 50000);
      setLifeKmRigidElectric(s.tireParameters.lifeKmRigidElectric ?? 80000);
      setLifeKmTractorBiolng(s.tireParameters.lifeKmTractorBiolng ?? 85000);
      setLifeKmLight(s.tireParameters.lifeKmLight ?? 65000);
    }
  };

  const handleManualFuelWeeklySync = async () => {
    setFuelSyncing(true);
    try {
      const res = await storageService.refreshWeeklyFuelPricesFromOfficialSources({ force: true });
      if (res && res.settings) {
        setSettings(prev => ({
          ...(prev || res.settings),
          fuelTypes: res.settings.fuelTypes,
          lastFuelSyncMeta: res.settings.lastFuelSyncMeta,
          standardCosts: {
            ...(prev?.standardCosts || {}),
            adbluePricePerLiter: res.settings.standardCosts?.adbluePricePerLiter ?? prev?.standardCosts?.adbluePricePerLiter
          }
        }));
        setSaveMessage(`Prezzi medi settimanali "Alla Pompa" aggiornati nelle Impostazioni (${res.syncMeta?.weekLabel}).`);
        setTimeout(() => setSaveMessage(''), 4500);
      }
    } finally {
      setFuelSyncing(false);
    }
  };

  const handleFuelPriceChange = (id, newPrice) => {
    const val = newPrice === '' ? '' : safeNonNeg(newPrice, 0);
    const updatedFuel = settings.fuelTypes.map(f => {
      if (f.id === id) {
        return { ...f, price: val };
      }
      return f;
    });
    setSettings({ ...settings, fuelTypes: updatedFuel });
    setIsDirty(true);
  };

  const handleLicenseCostChange = (id, newDailyCost) => {
    const val = newDailyCost === '' ? '' : safeNonNeg(newDailyCost, 0);
    const updatedLicenses = settings.licenseTypes.map(l => {
      if (l.id === id) {
        const num = val === '' ? 0 : val;
        return { ...l, dailyCost: val, monthlyCost: +(num * 22).toFixed(2) };
      }
      return l;
    });
    setSettings({ ...settings, licenseTypes: updatedLicenses });
    setIsDirty(true);
  };

  const handleStandardCostChange = (key, value) => {
    const val = value === '' ? '' : safeNonNeg(value, 0);
    setSettings({
      ...settings,
      standardCosts: {
        ...settings.standardCosts,
        [key]: val
      }
    });
    setIsDirty(true);
  };

  const handleOwnershipDefaultChange = (key, value) => {
    const val = value === '' ? '' : safeNonNeg(value, 0);
    setSettings({
      ...settings,
      ownershipDefaults: {
        ...settings.ownershipDefaults,
        [key]: val
      }
    });
    setIsDirty(true);
  };

  const handleFinancialDefaultChange = (key, value) => {
    const val = value === '' ? '' : safeNonNeg(value, 0);
    setSettings({
      ...settings,
      financialDefaults: {
        ...(settings.financialDefaults || {}),
        [key]: val
      }
    });
    setIsDirty(true);
  };

  const handleRefParamChange = (tech, field, value) => {
    const num = value === '' ? '' : safeNonNeg(value, 0);
    const defaultsByTech = {
      azoto: { unitCost: 0.13, hourlyConsumption: 30 },
      gasolio: { unitCost: 1.80, hourlyConsumption: 3.0 },
      elettrico: { unitCost: 0.35, hourlyConsumption: 8.0 }
    };
    const prevTech = settings.refrigerationParams?.[tech] || defaultsByTech[tech] || defaultsByTech.gasolio;
    const nextTech = { ...prevTech, [field]: num };
    nextTech.hourlyCost = +((Number(nextTech.unitCost) || 0) * (Number(nextTech.hourlyConsumption) || 0)).toFixed(2);
    setSettings({
      ...settings,
      refrigerationParams: {
        ...(settings.refrigerationParams || {}),
        [tech]: nextTech
      }
    });
    setIsDirty(true);
  };

  const handleTelParamChange = (field, value) => {
    const num = value === '' ? '' : safeNonNeg(value, 0);
    setSettings({
      ...settings,
      accessoryParams: {
        ...(settings.accessoryParams || {}),
        telematics: {
          ...(settings.accessoryParams?.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12, vanMonthly: 12 }),
          [field]: num,
          ...(field === 'rigidMonthly' ? { vanMonthly: num } : {})
        }
      }
    });
    setIsDirty(true);
  };

  const handleWashParamChange = (field, value) => {
    const num = value === '' ? '' : safeNonNeg(value, 0);
    const prevWash = settings.accessoryParams?.washing || { costPerWash: 80, washesPerMonth: 2 };
    const nextWash = { ...prevWash, [field]: num };
    nextWash.monthlyTotal = +((Number(nextWash.costPerWash) || 0) * (Number(nextWash.washesPerMonth) || 0)).toFixed(2);
    setSettings({
      ...settings,
      accessoryParams: {
        ...(settings.accessoryParams || {}),
        washing: nextWash
      }
    });
    setIsDirty(true);
  };

  const handleSaveAll = () => {
    const cleanLifeBEV = Number(lifeKmTractorElectric) > 0 ? Number(lifeKmTractorElectric) : 50000;
    const cleanLifeTrl = Number(lifeKmTrailer) > 0 ? Number(lifeKmTrailer) : 80000;
    const cleanLifeBio = Number(lifeKmTractorBiolng) > 0 ? Number(lifeKmTractorBiolng) : 85000;
    const cleanLifeRigid = Number(lifeKmRigidElectric) > 0 ? Number(lifeKmRigidElectric) : 80000;
    const cleanLifeLight = Number(lifeKmLight) > 0 ? Number(lifeKmLight) : 65000;
    const cleanTireLife = Number(tireLifeKm) > 0 ? Number(tireLifeKm) : 80000;

    const cleanCostBEV = Number(costPerTireTractorElectric) || 0;
    const cleanCostTrl = Number(costPerTireTrailer) || 0;
    const costTractorBEV = (6 * cleanCostBEV) / cleanLifeBEV;
    const costTrailer = (6 * cleanCostTrl) / cleanLifeTrl;
    const combinedElectricArticulatedKm = +(costTractorBEV + costTrailer).toFixed(4);

    const sanitizedFuels = (settings.fuelTypes || []).map(f => ({ ...f, price: Number(f.price) || 0 }));
    const sanitizedLicenses = (settings.licenseTypes || []).map(l => {
      const dc = Number(l.dailyCost) || 0;
      return { ...l, dailyCost: dc, monthlyCost: +(dc * 22).toFixed(2) };
    });

    const updatedSettings = {
      ...settings,
      fuelTypes: sanitizedFuels,
      licenseTypes: sanitizedLicenses,
      ownershipDefaults: {
        ...(settings.ownershipDefaults || {}),
        annualInsuranceRCA: Number(settings.ownershipDefaults?.annualInsuranceRCA ?? 3200) || 0,
        annualInsuranceKasko: Number(settings.ownershipDefaults?.annualInsuranceKasko ?? 2400) || 0,
        annualRoadTax: Number(settings.ownershipDefaults?.annualRoadTax ?? 1100) || 0,
        monthlyMaintenance: Number(settings.ownershipDefaults?.monthlyMaintenance ?? 350) || 0,
        amortizationYears: Number(settings.ownershipDefaults?.amortizationYears) > 0 ? Number(settings.ownershipDefaults.amortizationYears) : 5
      },
      financialDefaults: {
        ...(settings.financialDefaults || {}),
        initialCashBalance: Number(settings.financialDefaults?.initialCashBalance ?? 50000) || 0
      },
      tireParameters: {
        costPerTire: Number(tireCostUnit) || 0,
        costPerTireTractorElectric: cleanCostBEV,
        costPerTireTractorBiolng: Number(costPerTireTractorBiolng) || 0,
        costPerTireTrailer: cleanCostTrl,
        costPerTireRigid: Number(costPerTireRigid) || 0,
        costPerTireLight: Number(costPerTireLight) || 0,
        tiresTractor: 6,
        tiresTrailer: 6,
        tiresRigidTruck: 6,
        lifeKmTrailer: cleanLifeTrl,
        lifeKmTractorElectric: cleanLifeBEV,
        lifeKmRigidElectric: cleanLifeRigid,
        lifeKmTractorBiolng: cleanLifeBio,
        lifeKmLight: cleanLifeLight,
        tireLifeKm: cleanTireLife,
        estimatedTireCostKm: combinedElectricArticulatedKm
      },
      standardCosts: {
        ...settings.standardCosts,
        adbluePricePerLiter: Number(settings.standardCosts?.adbluePricePerLiter ?? 0.85) || 0,
        telepassMonthly: Number(settings.standardCosts?.telepassMonthly ?? 15) || 0,
        tireCostKm: combinedElectricArticulatedKm
      }
    };

    storageService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setIsDirty(false);
    setSaveMessage('Impostazioni salvate e sincronizzate sul Cloud!');
    setTimeout(() => setSaveMessage(''), 3500);
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

  const handleSelectBackupFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupError('');
    setBackupSuccess('');
    setBackupPreview(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawJson = String(event.target?.result || '');
      const preview = storageService.parseBackupPreview(rawJson);
      if (!preview.valid) {
        setBackupError(preview.error || 'File JSON non valido.');
        return;
      }
      setBackupPreview({
        fileName: file.name,
        rawJson,
        exportedAt: preview.exportedAt,
        company: preview.company,
        counts: preview.counts
      });
    };
    reader.readAsText(file);
  };

  const handleConfirmRestoreBackup = async () => {
    if (!backupPreview?.rawJson) return;
    setBackupRestoring(true);
    setBackupError('');
    setBackupSuccess('');
    try {
      const res = await storageService.importBackupJson(backupPreview.rawJson);
      if (res.success) {
        loadSettings();
        const cloudInfo = res.cloudSynced
          ? 'e sincronizzato su Cloud'
          : `salvato in locale${res.cloudError ? ` (sync Cloud in attesa: ${res.cloudError})` : ''}`;
        setBackupSuccess(
          `Ripristino completato ${cloudInfo} (${res.counts.fleet} mezzi, ${res.counts.trailers} rimorchi, ${res.counts.projects} commesse, ${res.counts.simulations} simulazioni).`
        );
        setBackupPreview(null);
      } else {
        setBackupError('Errore durante il ripristino: ' + (res.error || 'Formato non valido'));
      }
    } finally {
      setBackupRestoring(false);
    }
  };

  // Logica Calcolatore "Al Contrario" (Resa <-> Consumo Specifico)
  const currentFuelObj = settings?.fuelTypes?.find(f => f.id === calcFuelType) || { price: 1.10, unit: 'kg' };
  const currentFuelPrice = currentFuelObj.price;

  const handleYieldChange = (val) => {
    const num = parseFloat(val) || 0;
    setCalcYieldValue(num);
    if (num > 0) {
      if (calcFuelType === 'elettrico') {
        setCalcConsumptionValue(+(1 / num).toFixed(2));
      } else {
        setCalcConsumptionValue(+(100 / num).toFixed(2));
      }
    }
  };

  const handleConsumptionChange = (val) => {
    const num = parseFloat(val) || 0;
    setCalcConsumptionValue(num);
    if (num > 0) {
      if (calcFuelType === 'elettrico') {
        setCalcYieldValue(+(1 / num).toFixed(2));
      } else {
        setCalcYieldValue(+(100 / num).toFixed(2));
      }
    }
  };

  const calculatedCostPerKm = calcFuelType === 'elettrico'
    ? calcConsumptionValue * currentFuelPrice
    : (calcConsumptionValue / 100) * currentFuelPrice;

  const tireCostTractorBEV = lifeKmTractorElectric > 0 ? (6 * costPerTireTractorElectric) / lifeKmTractorElectric : 0.0624;
  const tireCostTrailer = lifeKmTrailer > 0 ? (6 * costPerTireTrailer) / lifeKmTrailer : 0.0285;
  const tireCostRigidBEV = lifeKmRigidElectric > 0 ? (6 * costPerTireRigid) / lifeKmRigidElectric : 0.0315;
  const tireCostTractorBio = lifeKmTractorBiolng > 0 ? (6 * costPerTireTractorBiolng) / lifeKmTractorBiolng : 0.0325;
  const tireCostLightDaily = lifeKmLight > 0 ? (6 * costPerTireLight) / lifeKmLight : 0.0222;
  const calculatedTireCostKm = +(tireCostTractorBEV + tireCostTrailer).toFixed(4);
  const calculatedBioArticulatedKm = +(tireCostTractorBio + tireCostTrailer).toFixed(4);

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Compatto */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center space-x-3">
            <span className="p-2.5 bg-slate-100 text-slate-800 rounded-xl">
              <Settings className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Parametri &amp; Tariffe Operative FOUR</h1>
              <p className="text-xs text-slate-500">
                Configurazione carburanti alla pompa, tariffe CCNL, pneumatici, gruppi frigo, tesoreria e backup Cloud
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {saveMessage && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-1.5 flex-shrink-0" />
                {saveMessage}
              </span>
            )}
            {['fuels', 'tires_accessories', 'treasury'].includes(activeTab) && (
              <button
                type="button"
                onClick={handleSaveAll}
                className={`inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition whitespace-nowrap ${
                  isDirty
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>Salva Tutte le Modifiche</span>
                {isDirty && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-300 text-slate-900">
                    Modificato
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Navigazione 5 Tab */}
        <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#164e87] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-cyan-300' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: CARBURANTI & AUTISTI */}
        {activeTab === 'fuels' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Prezzi Carburanti Alla Pompa */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Prezzi Carburanti &amp; Energia &ldquo;Alla Pompa&rdquo;
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Valori medi settimanali MASE / GME / Assogasliquidi (senza recupero accise)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={fuelSyncing}
                    onClick={handleManualFuelWeeklySync}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#164e87] hover:bg-[#0b2440] text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${fuelSyncing ? 'animate-spin' : ''}`} />
                    <span>{fuelSyncing ? 'Aggiornamento...' : 'Aggiorna da Fonti'}</span>
                  </button>
                </div>

                <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-black text-emerald-950 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Modalità &ldquo;Alla Pompa&rdquo; (100% Lordo Accise)</span>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      {settings.lastFuelSyncMeta?.weekLabel
                        ? `Ultimo rilevamento: ${settings.lastFuelSyncMeta.weekLabel} • ${settings.lastFuelSyncMeta.sourceLabel}`
                        : 'Feed collegato a Osservatorio Prezzi MASE / MIMIT e GME PUN'}
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
                    <div key={fuel.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{fuel.name}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                            Alla Pompa
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          {fuel.id === 'azoto'
                            ? 'Riferimento giornaliero generico (i parametri orari €/kg e kg/h si configurano in "Gomme, Frigo & Accessori")'
                            : (fuel.notes || fuel.unit)}
                        </span>
                        {fuel.marketRange && (
                          <span className="text-[10px] text-emerald-700 font-semibold">Range rilevato: {fuel.marketRange}</span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <input
                          type="number"
                          step="0.01"
                          value={fuel.price}
                          onChange={(e) => handleFuelPriceChange(fuel.id, e.target.value)}
                          className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold text-slate-900 bg-white"
                        />
                        <span className="font-bold text-slate-700 min-w-[42px]">{getFuelPriceUnit(fuel.id)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tariffe Standard Autisti CCNL */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Tariffe Standard Autisti (€ / Giorno)</h2>
                      <p className="text-[11px] text-slate-500">CCNL Trasporto Merci &amp; Logistica per categoria patente e turno</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {settings.licenseTypes.map((lic) => (
                    <div key={lic.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900 block">{lic.name}</span>
                        <span className="text-[10px] text-slate-500">~{formatEUR(lic.dailyCost * 22)} / mese</span>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
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
            </div>

            {/* Calcolatore "Al Contrario" */}
            <div
              ref={calculatorRef}
              className={`bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 shadow-xl border transition-all duration-500 space-y-4 ${
                calcHighlight ? 'border-cyan-400 ring-4 ring-cyan-400/40' : 'border-emerald-500/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-emerald-800/60">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                    <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white">
                      Calcolo &ldquo;Al Contrario&rdquo;: Resa (Km/kg o Km/L) ↔ Consumo Specifico &amp; Costo/Km
                    </h2>
                    <p className="text-xs text-emerald-200/80">
                      Conversione istantanea tra resa chilometrica per unità e consumo per 100 km
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 w-fit">
                  Bidirezionale
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
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
                    <span className="text-xs font-bold text-slate-300 whitespace-nowrap">
                      {calcFuelType === 'elettrico' ? 'km/kWh' : calcFuelType === 'biolng' ? 'km/kg' : 'km/L'}
                    </span>
                  </div>
                </div>

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
                    <span className="text-xs font-bold text-slate-300 whitespace-nowrap">
                      {calcFuelType === 'elettrico' ? 'kWh/km' : calcFuelType === 'biolng' ? 'kg/100km' : 'L/100km'}
                    </span>
                  </div>
                </div>

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

            {/* Benchmark di Mercato Collassabile */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
              <div
                onClick={() => setShowBenchmarks(prev => !prev)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Benchmark Consumi &amp; Canoni Costruttori ({MARKET_VEHICLE_BENCHMARKS.length} modelli)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Riferimenti reali Volvo, Scania, Iveco, Renault, Mercedes per testare consumi nel calcolatore
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  <span>{showBenchmarks ? 'Nascondi' : 'Mostra Benchmark'}</span>
                  {showBenchmarks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {showBenchmarks && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
                  {MARKET_VEHICLE_BENCHMARKS.map((bench) => {
                    const fuelObj = settings.fuelTypes.find(f => f.id === bench.fuelTypeId) || { price: 1.10 };
                    const costKm = bench.fuelTypeId === 'elettrico'
                      ? bench.avgConsumption * fuelObj.price
                      : (bench.avgConsumption / 100) * fuelObj.price;

                    return (
                      <div
                        key={bench.id}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-emerald-300 transition flex flex-col justify-between space-y-3"
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
                          <p className="text-[11px] text-slate-500 italic">{bench.models}</p>
                          <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Consumo Medio:</span>
                              <span className="font-bold text-slate-900">{bench.avgConsumption} {bench.consumptionUnit}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Costo/km attuale:</span>
                              <span className="font-bold text-emerald-700">{formatEUR(costKm)} / km</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Canone NLT Ind.:</span>
                              <span className="font-bold text-purple-700">{formatEUR(bench.indicativeMonthlyLease)} / m</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCalcFuelType(bench.fuelTypeId);
                            setCalcYieldValue(bench.yieldKmPerUnit);
                            setCalcConsumptionValue(bench.avgConsumption);
                            calculatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setCalcHighlight(true);
                            setTimeout(() => setCalcHighlight(false), 1800);
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
              )}
            </div>
          </div>
        )}

        {/* TAB 2: GOMME, FRIGO & ACCESSORI */}
        {activeTab === 'tires_accessories' && (
          <div className="space-y-6">
            {/* Pneumatici per 5 Categorie */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <CircleDot className="w-5 h-5 text-amber-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Costi a Gomma (€/gomma) &amp; Durate Differenziate per Tipo di Mezzo</h2>
                    <p className="text-[11px] text-slate-500">Parametri default applicati a mezzi e rimorchi senza costo gomma personalizzato</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  5 Categorie Mezzo
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-rose-950 uppercase text-[10px]">1. Trattori Elettrici (BEV)</span>
                    <span className="px-1.5 py-0.5 bg-rose-200 text-rose-900 rounded font-black text-[10px]">6 Gomme HL</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-rose-900 mb-0.5">Costo / Gomma (€)</label>
                      <input type="number" step="10" value={costPerTireTractorElectric} onChange={(e) => { setCostPerTireTractorElectric(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setCostPerTireTractorElectric(prev => Number(prev) || 0)} className="w-full px-2 py-1 border border-rose-300 rounded font-black text-rose-950 bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-rose-900 mb-0.5">Durata (Km)</label>
                      <input type="number" step="5000" value={lifeKmTractorElectric} onChange={(e) => { setLifeKmTractorElectric(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setLifeKmTractorElectric(prev => Number(prev) > 0 ? Number(prev) : 50000)} className="w-full px-2 py-1 border border-rose-300 rounded font-black text-rose-900 bg-white" />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-rose-200 font-bold text-rose-950 flex justify-between text-[11px]">
                    <span>Treno: {formatEUR(6 * (Number(costPerTireTractorElectric) || 0))}</span>
                    <strong>{tireCostTractorBEV.toFixed(4)} €/km</strong>
                  </div>
                </div>

                <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-indigo-950 uppercase text-[10px]">2. Trattori Bio-LNG / Termici</span>
                    <span className="px-1.5 py-0.5 bg-indigo-200 text-indigo-900 rounded font-black text-[10px]">6 Gomme</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-0.5">Costo / Gomma (€)</label>
                      <input type="number" step="10" value={costPerTireTractorBiolng} onChange={(e) => { setCostPerTireTractorBiolng(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setCostPerTireTractorBiolng(prev => Number(prev) || 0)} className="w-full px-2 py-1 border border-indigo-300 rounded font-black text-indigo-950 bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 mb-0.5">Durata (Km)</label>
                      <input type="number" step="5000" value={lifeKmTractorBiolng} onChange={(e) => { setLifeKmTractorBiolng(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setLifeKmTractorBiolng(prev => Number(prev) > 0 ? Number(prev) : 85000)} className="w-full px-2 py-1 border border-indigo-300 rounded font-black text-indigo-900 bg-white" />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-indigo-200 font-bold text-indigo-950 flex justify-between text-[11px]">
                    <span>Treno: {formatEUR(6 * (Number(costPerTireTractorBiolng) || 0))}</span>
                    <strong>{tireCostTractorBio.toFixed(4)} €/km</strong>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-950 uppercase text-[10px]">3. Semirimorchi (Frigo/Box/DD)</span>
                    <span className="px-1.5 py-0.5 bg-blue-200 text-blue-900 rounded font-black text-[10px]">6 Gomme 385/65</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-blue-900 mb-0.5">Costo / Gomma (€)</label>
                      <input type="number" step="10" value={costPerTireTrailer} onChange={(e) => { setCostPerTireTrailer(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setCostPerTireTrailer(prev => Number(prev) || 0)} className="w-full px-2 py-1 border border-blue-300 rounded font-black text-blue-950 bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-blue-900 mb-0.5">Durata (Km)</label>
                      <input type="number" step="5000" value={lifeKmTrailer} onChange={(e) => { setLifeKmTrailer(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setLifeKmTrailer(prev => Number(prev) > 0 ? Number(prev) : 80000)} className="w-full px-2 py-1 border border-blue-300 rounded font-black text-blue-900 bg-white" />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-blue-200 font-bold text-blue-950 flex justify-between text-[11px]">
                    <span>Treno: {formatEUR(6 * (Number(costPerTireTrailer) || 0))}</span>
                    <strong>{tireCostTrailer.toFixed(4)} €/km</strong>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-emerald-950 uppercase text-[10px]">4. Motrici (12-22 Pallet)</span>
                    <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-900 rounded font-black text-[10px]">6 Gomme</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">Costo / Gomma (€)</label>
                      <input type="number" step="10" value={costPerTireRigid} onChange={(e) => { setCostPerTireRigid(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setCostPerTireRigid(prev => Number(prev) || 0)} className="w-full px-2 py-1 border border-emerald-300 rounded font-black text-emerald-950 bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-900 mb-0.5">Durata (Km)</label>
                      <input type="number" step="5000" value={lifeKmRigidElectric} onChange={(e) => { setLifeKmRigidElectric(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setLifeKmRigidElectric(prev => Number(prev) > 0 ? Number(prev) : 80000)} className="w-full px-2 py-1 border border-emerald-300 rounded font-black text-emerald-900 bg-white" />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-emerald-200 font-bold text-emerald-950 flex justify-between text-[11px]">
                    <span>Treno: {formatEUR(6 * (Number(costPerTireRigid) || 0))}</span>
                    <strong>{tireCostRigidBEV.toFixed(4)} €/km</strong>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 uppercase text-[10px]">5. Daily 72 / Furgoni Leggeri</span>
                    <span className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-black text-[10px]">6g Daily 72 / 4g 3.5t</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Costo / Gomma (€)</label>
                      <input type="number" step="10" value={costPerTireLight} onChange={(e) => { setCostPerTireLight(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setCostPerTireLight(prev => Number(prev) || 0)} className="w-full px-2 py-1 border border-slate-300 rounded font-black text-slate-900 bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Durata (Km)</label>
                      <input type="number" step="5000" value={lifeKmLight} onChange={(e) => { setLifeKmLight(e.target.value === '' ? '' : safeNonNeg(e.target.value, 0)); setIsDirty(true); }} onBlur={() => setLifeKmLight(prev => Number(prev) > 0 ? Number(prev) : 65000)} className="w-full px-2 py-1 border border-slate-300 rounded font-black text-slate-800 bg-white" />
                    </div>
                  </div>
                  <div className="pt-1 border-t border-slate-200 font-bold text-slate-800 flex justify-between text-[11px]">
                    <span>Treno 6g/4g: {formatEUR(6 * (Number(costPerTireLight) || 0))} / {formatEUR(4 * (Number(costPerTireLight) || 0))}</span>
                    <strong>{tireCostLightDaily.toFixed(4)} €/km</strong>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 flex flex-col justify-between">
                  <div className="text-[11px] font-extrabold uppercase text-amber-900">Riepilogo Bilici Combinati (su 250 km/gg)</div>
                  <div className="space-y-1 text-xs font-bold">
                    <div className="flex justify-between">
                      <span>Bilico BEV:</span>
                      <span>{calculatedTireCostKm.toFixed(4)} €/km ({formatEUR(calculatedTireCostKm * 250)}/gg)</span>
                    </div>
                    <div className="flex justify-between text-indigo-950">
                      <span>Bilico Bio-LNG:</span>
                      <span>{calculatedBioArticulatedKm.toFixed(4)} €/km ({formatEUR(calculatedBioArticulatedKm * 250)}/gg)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Gruppi Frigoriferi (Azoto / Gasolio / Elettrico) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Snowflake className="w-5 h-5 text-cyan-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Parametri Gruppi Frigoriferi Semirimorchi</h2>
                    <p className="text-[11px] text-slate-500">Costi unitari e consumi orari di default per Azoto Liquido, Gasolio Frigo e Frigo Elettrico</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-cyan-50/50 rounded-xl border border-cyan-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-950">Azoto Liquido (Cryo)</span>
                    <span className="text-xs font-black text-cyan-700">
                      {formatEUR((settings.refrigerationParams?.azoto?.unitCost ?? 0.13) * (settings.refrigerationParams?.azoto?.hourlyConsumption ?? 30))}/h
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Costo unitario (€/kg)</label>
                      <input type="number" step="0.01" value={settings.refrigerationParams?.azoto?.unitCost ?? 0.13} onChange={(e) => handleRefParamChange('azoto', 'unitCost', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold bg-white" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Consumo orario (kg/h)</label>
                      <input type="number" step="1" value={settings.refrigerationParams?.azoto?.hourlyConsumption ?? 30} onChange={(e) => handleRefParamChange('azoto', 'hourlyConsumption', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold bg-white" />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Gruppo Frigo Gasolio</span>
                    <span className="text-xs font-black text-amber-700">
                      {formatEUR((settings.refrigerationParams?.gasolio?.unitCost ?? 1.80) * (settings.refrigerationParams?.gasolio?.hourlyConsumption ?? 3.0))}/h
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Costo unitario (€/L)</label>
                      <input type="number" step="0.05" value={settings.refrigerationParams?.gasolio?.unitCost ?? 1.80} onChange={(e) => handleRefParamChange('gasolio', 'unitCost', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold bg-white" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Consumo orario (L/h)</label>
                      <input type="number" step="0.5" value={settings.refrigerationParams?.gasolio?.hourlyConsumption ?? 3.0} onChange={(e) => handleRefParamChange('gasolio', 'hourlyConsumption', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold bg-white" />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950">Gruppo Frigo Elettrico</span>
                    <span className="text-xs font-black text-emerald-700">
                      {formatEUR((settings.refrigerationParams?.elettrico?.unitCost ?? 0.35) * (settings.refrigerationParams?.elettrico?.hourlyConsumption ?? 8.0))}/h
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Costo energia (€/kWh)</label>
                      <input type="number" step="0.01" value={settings.refrigerationParams?.elettrico?.unitCost ?? 0.35} onChange={(e) => handleRefParamChange('elettrico', 'unitCost', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold bg-white" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600">Consumo orario (kWh/h)</label>
                      <input type="number" step="0.5" value={settings.refrigerationParams?.elettrico?.hourlyConsumption ?? 8.0} onChange={(e) => handleRefParamChange('elettrico', 'hourlyConsumption', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold bg-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Telematica, Lavaggi & Additivi */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <div className="flex items-center space-x-2 font-bold text-indigo-950 pb-2 border-b border-slate-100">
                  <Wifi className="w-4 h-4 text-indigo-700" />
                  <span>Telematica Mensile (€/mese)</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">Trattori stradali</label>
                    <input type="number" step="1" value={settings.accessoryParams?.telematics?.tractorMonthly ?? 14} onChange={(e) => handleTelParamChange('tractorMonthly', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">Semirimorchi (trailer)</label>
                    <input type="number" step="1" value={settings.accessoryParams?.telematics?.trailerMonthly ?? 13} onChange={(e) => handleTelParamChange('trailerMonthly', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">Motrici / Furgoni</label>
                    <input type="number" step="1" value={settings.accessoryParams?.telematics?.rigidMonthly ?? 12} onChange={(e) => handleTelParamChange('rigidMonthly', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold" />
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-[11px] font-bold text-indigo-800 flex justify-between">
                    <span>Combinazione Trattore + Rimorchio:</span>
                    <span>{formatEUR((settings.accessoryParams?.telematics?.tractorMonthly ?? 14) + (settings.accessoryParams?.telematics?.trailerMonthly ?? 13))}/mese</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <div className="flex items-center space-x-2 font-bold text-blue-950 pb-2 border-b border-slate-100">
                  <Droplets className="w-4 h-4 text-blue-700" />
                  <span>Lavaggio Automezzi</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">Costo singolo lavaggio (€)</label>
                    <input type="number" step="5" value={settings.accessoryParams?.washing?.costPerWash ?? 80} onChange={(e) => handleWashParamChange('costPerWash', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">Frequenza (lavaggi/mese)</label>
                    <input type="number" step="1" min="0" value={settings.accessoryParams?.washing?.washesPerMonth ?? 2} onChange={(e) => handleWashParamChange('washesPerMonth', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold" />
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-[11px] font-bold text-blue-900 flex justify-between">
                    <span>Costo mensile totale:</span>
                    <span>{formatEUR((settings.accessoryParams?.washing?.costPerWash ?? 80) * (settings.accessoryParams?.washing?.washesPerMonth ?? 2))}/mese</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                <div className="flex items-center space-x-2 font-bold text-teal-950 pb-2 border-b border-slate-100">
                  <Fuel className="w-4 h-4 text-teal-600" />
                  <span>Additivi &amp; Canone Telepass</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">AdBlue (€/Litro HVO/Diesel)</label>
                    <input type="number" step="0.05" value={settings.standardCosts?.adbluePricePerLiter ?? 0.85} onChange={(e) => handleStandardCostChange('adbluePricePerLiter', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">Canone Apparato Telepass (€/m)</label>
                    <input type="number" step="1" value={settings.standardCosts?.telepassMonthly ?? 15.00} onChange={(e) => handleStandardCostChange('telepassMonthly', e.target.value)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-bold" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TESORERIA & PROPRIETÀ */}
        {activeTab === 'treasury' && (
          <div className="space-y-6">
            {/* Cassa Iniziale & Regole Tesoreria */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Tesoreria Aziendale &amp; Scadenze Cash Flow</h2>
                    <p className="text-[11px] text-slate-500">Saldo iniziale condiviso con Dashboard e Cash Flow + regole valuta uscite</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Cash Flow Reale
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-2">
                  <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider block">
                    Cassa Iniziale (1 Gennaio)
                  </span>
                  <p className="text-[11px] text-emerald-800">
                    Liquidità di partenza usata su Dashboard e Forecast
                  </p>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      step="5000"
                      value={settings.financialDefaults?.initialCashBalance ?? 50000}
                      onChange={(e) => handleFinancialDefaultChange('initialCashBalance', e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-emerald-300 rounded-lg text-sm font-black text-slate-900 bg-white text-right"
                    />
                    <span className="font-bold text-emerald-900">€</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block">
                    Noleggi Mezzi (Default)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Opzione applicata ai nuovi veicoli NLT
                  </p>
                  <select
                    value={settings.treasuryRules?.defaultLeaseTiming || 'M1_D10'}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        treasuryRules: { ...settings.treasuryRules, defaultLeaseTiming: e.target.value }
                      });
                      setIsDirty(true);
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="M1_D10">Giorno 10 M1 (Anticipato)</option>
                    <option value="M1_D30">Giorno 30 M1 (Fine Mese)</option>
                    <option value="M2_D20">Giorno 20 M2 (Mese Succ.)</option>
                  </select>
                </div>

                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
                  <span className="text-[11px] font-bold text-blue-950 uppercase tracking-wider block">
                    Energia / LNG
                  </span>
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-900">
                    30 gg data fattura quindicinale
                  </div>
                  <p className="text-[11px] text-blue-900 leading-tight">
                    1-15 M1 saldato il <strong>15 M2</strong> • 16-31 M1 saldato il <strong>30 M2</strong>.
                  </p>
                </div>

                <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                  <span className="text-[11px] font-bold text-amber-950 uppercase tracking-wider block">
                    Telepass / Pedaggi
                  </span>
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900">
                    15 gg data fattura quindicinale
                  </div>
                  <p className="text-[11px] text-amber-900 leading-tight">
                    1-15 M1 al <strong>30 M1</strong> (50%) • 16-31 M1 al <strong>15 M2</strong> (50%).
                  </p>
                </div>
              </div>
            </div>

            {/* Mezzi di Proprietà FOUR */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Parametri Default Mezzi di Proprietà FOUR</h2>
                    <p className="text-[11px] text-slate-500">Costi fissi annui e ammortamento usati come base per veicoli acquistati</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  Proprietà
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 block">Assicurazione RCA (€/a):</span>
                    <span className="text-[10px] text-slate-500">~{formatEUR((Number(settings.ownershipDefaults?.annualInsuranceRCA ?? 3200) || 0) / 12)}/m</span>
                  </div>
                  <input type="number" step="50" value={settings.ownershipDefaults?.annualInsuranceRCA ?? 3200} onChange={(e) => handleOwnershipDefaultChange('annualInsuranceRCA', e.target.value)} className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white" />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 block">Kasko / Furto (€/a):</span>
                    <span className="text-[10px] text-slate-500">~{formatEUR((Number(settings.ownershipDefaults?.annualInsuranceKasko ?? 2400) || 0) / 12)}/m</span>
                  </div>
                  <input type="number" step="50" value={settings.ownershipDefaults?.annualInsuranceKasko ?? 2400} onChange={(e) => handleOwnershipDefaultChange('annualInsuranceKasko', e.target.value)} className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white" />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 block">Bollo / Tassa Possesso (€/a):</span>
                    <span className="text-[10px] text-emerald-700 font-semibold">BEV spesso esente (0 €)</span>
                  </div>
                  <input type="number" step="50" min="0" value={settings.ownershipDefaults?.annualRoadTax ?? 1100} onChange={(e) => handleOwnershipDefaultChange('annualRoadTax', e.target.value)} className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white" />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 block">Manutenzione Ordinaria (€/m):</span>
                    <span className="text-[10px] text-slate-500">Tagliandi e revisioni</span>
                  </div>
                  <input type="number" step="25" min="0" value={settings.ownershipDefaults?.monthlyMaintenance ?? 350} onChange={(e) => handleOwnershipDefaultChange('monthlyMaintenance', e.target.value)} className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white" />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 block">Anni Ammortamento:</span>
                    <span className="text-[10px] text-slate-500">Ripartizione acquisto</span>
                  </div>
                  <input type="number" step="1" min="2" max="10" value={settings.ownershipDefaults?.amortizationYears ?? 5} onChange={(e) => handleOwnershipDefaultChange('amortizationYears', e.target.value)} className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold bg-white" />
                </div>

                <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-blue-900 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase text-blue-800">Costo Fisso Base / Mese</span>
                  <span className="text-base font-black text-blue-950">
                    {formatEUR(
                      ((Number(settings.ownershipDefaults?.annualInsuranceRCA ?? 3200) || 0) +
                       (Number(settings.ownershipDefaults?.annualInsuranceKasko ?? 2400) || 0) +
                       (Number(settings.ownershipDefaults?.annualRoadTax ?? 1100) || 0)) / 12 +
                      (Number(settings.ownershipDefaults?.monthlyMaintenance ?? 350) || 0)
                    )} / m
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BACKUP & CLOUD */}
        {activeTab === 'backup' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <Cloud className={`w-5 h-5 ${cloudStatus.state === 'synced' ? 'text-emerald-600' : 'text-amber-600'}`} />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Backup, Ripristino &amp; Sincronizzazione Cloud</h2>
                  <p className="text-[11px] text-slate-500">
                    Esporta o ripristina in sicurezza l&apos;intero archivio FOUR con propagazione immediata su Cloud Firestore
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                  cloudStatus.state === 'synced'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : cloudStatus.state === 'syncing' || cloudStatus.state === 'connecting'
                      ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                      : cloudStatus.state === 'error'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {cloudStatus.state === 'synced' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : cloudStatus.state === 'syncing' || cloudStatus.state === 'connecting' ? (
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-600 animate-spin" />
                  ) : (
                    <AlertCircle className={`w-3.5 h-3.5 ${cloudStatus.state === 'error' ? 'text-rose-600' : 'text-amber-600'}`} />
                  )}
                  <span>
                    {cloudStatus.state === 'synced'
                      ? `Cloud Live Sincronizzato${cloudStatus.lastSyncedAt ? ` (${new Date(cloudStatus.lastSyncedAt).toLocaleTimeString('it-IT')})` : ''}`
                      : cloudStatus.state === 'syncing' || cloudStatus.state === 'connecting'
                        ? 'Sincronizzazione in corso...'
                        : cloudStatus.state === 'error'
                          ? `Errore Cloud${cloudStatus.errorMessage ? `: ${cloudStatus.errorMessage}` : ''}`
                          : 'Modalità Locale (Offline)'}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={cloudSyncing}
                  onClick={async () => {
                    setCloudSyncing(true);
                    setBackupError('');
                    setBackupSuccess('');
                    try {
                      const ok = await storageService.forceSyncFromCloud();
                      if (ok) {
                        loadSettings();
                        setBackupSuccess('Dati riallineati da Cloud Firestore con successo.');
                      } else {
                        setBackupError('Impossibile allineare dal Cloud al momento.');
                      }
                    } finally {
                      setCloudSyncing(false);
                    }
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-300 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                  <span>{cloudSyncing ? 'Allineamento...' : 'Allinea da Cloud'}</span>
                </button>
              </div>
            </div>

            {backupError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{backupError}</span>
              </div>
            )}

            {backupSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{backupSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-900">Esporta Backup Completo (.json)</h3>
                  <p className="text-slate-600 leading-relaxed">
                    Scarica un archivio JSON aggiornato con flotta mezzi, semirimorchi, commesse, simulazioni salvate e tariffe operative.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition shadow-sm"
                >
                  <Download className="w-4 h-4 text-cyan-300" />
                  <span>Scarica Backup JSON</span>
                </button>
              </div>

              <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-200 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-900">Ripristina da File Backup (.json)</h3>
                  <p className="text-slate-600 leading-relaxed">
                    Carica un file backup JSON per visualizzarne il contenuto prima di confermare il ripristino e la sincronizzazione sul Cloud.
                  </p>
                </div>
                <label className="w-full py-2.5 bg-[#164e87] hover:bg-[#0e3a6c] text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-sm">
                  <Upload className="w-4 h-4 text-cyan-300" />
                  <span>Seleziona File Backup (.json)</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleSelectBackupFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Box Anteprima & Conferma Ripristino */}
            {backupPreview && (
              <div className="p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black text-amber-950 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    <span>Anteprima Backup Selezionato: {backupPreview.fileName}</span>
                  </div>
                  {backupPreview.exportedAt && (
                    <span className="text-[11px] font-semibold text-amber-900 bg-white px-2.5 py-0.5 rounded-full border border-amber-200">
                      Esportato il {new Date(backupPreview.exportedAt).toLocaleString('it-IT')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Mezzi Motori</span>
                    <strong className="text-base text-slate-900">{backupPreview.counts.fleet}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Semirimorchi</span>
                    <strong className="text-base text-slate-900">{backupPreview.counts.trailers}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Commesse</span>
                    <strong className="text-base text-slate-900">{backupPreview.counts.projects}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">Simulazioni</span>
                    <strong className="text-base text-slate-900">{backupPreview.counts.simulations}</strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={backupRestoring}
                    onClick={() => setBackupPreview(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-50 transition"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={backupRestoring}
                    onClick={handleConfirmRestoreBackup}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${backupRestoring ? 'animate-spin' : ''}`} />
                    <span>{backupRestoring ? 'Sincronizzazione Cloud in corso...' : 'Conferma e Ripristina su Cloud'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SICUREZZA & PASSWORD */}
        {activeTab === 'security' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-[#164e87]" />
                <h2 className="text-sm font-bold text-slate-900">Sicurezza &amp; Credenziali di Accesso</h2>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Utenza: <strong className="text-slate-800">{authConfig?.adminEmail || 'amministrazione@four-logistics.it'}</strong>
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Proteggi i dati sensibili, i contratti con i clienti e i flussi di cassa aziendali aggiornando la password di accesso alla piattaforma.
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

            <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs items-end">
              <div>
                <label htmlFor="pwd-old" className="block font-semibold text-slate-700 mb-1">Password Attuale *</label>
                <input
                  id="pwd-old"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] outline-none"
                  placeholder="Password attuale"
                />
              </div>

              <div>
                <label htmlFor="pwd-new" className="block font-semibold text-slate-700 mb-1">Nuova Password *</label>
                <input
                  id="pwd-new"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] outline-none"
                  placeholder="Minimo 6 caratteri"
                />
              </div>

              <div>
                <label htmlFor="pwd-confirm" className="block font-semibold text-slate-700 mb-1">Conferma Nuova Password *</label>
                <input
                  id="pwd-confirm"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#164e87] outline-none"
                  placeholder="Ripeti nuova password"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="w-full py-2 bg-[#164e87] hover:bg-[#0f3b75] text-white font-bold rounded-xl transition shadow-sm flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5 text-cyan-300" />
                  <span>{pwdSaving ? 'Aggiornamento...' : 'Aggiorna Password'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
