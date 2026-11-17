import { useState, useEffect } from 'react';
import storageService from '../services/storageService';
import { formatEUR } from '../utils/cashFlowCalculations';
import {
  Settings,
  Plus,
  Edit2,
  Trash2,
  Save,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  Zap,
  Flame,
  Fuel,
  DollarSign,
  Clock,
  Layers
} from 'lucide-react';

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    setSettings(storageService.getSettings());
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

  const handleSaveAll = () => {
    storageService.saveSettings(settings);
    setSaveMessage('Impostazioni e tariffe salvate con successo!');
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
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Impostazioni & Tariffe di Riferimento</h1>
                <p className="text-xs text-slate-500">
                  Gestione prezzi vettori energetici, tariffe autisti e parametri standard di calcolo
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
              <span>Salva Modifiche</span>
            </button>
          </div>
        </div>

        {/* Griglia Sezioni Impostazioni */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prezzi Vettori Energetici */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">Prezzi Vettori Energetici (€ / Unità)</h2>
              </div>
              <span className="text-xs text-slate-400">Aggiornati da Excel</span>
            </div>

            <div className="space-y-3">
              {settings.fuelTypes.map((fuel) => (
                <div key={fuel.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
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

          {/* Tariffe Autisti di Riferimento */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Tariffe Autisti di Riferimento (€ / Giorno)</h2>
              </div>
              <span className="text-xs text-slate-400">Standard CCNL Logistica</span>
            </div>

            <div className="space-y-3">
              {settings.licenseTypes.map((lic) => (
                <div key={lic.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">{lic.name}</span>
                    <span className="text-[11px] text-slate-500">
                      Stima mensile: ~{formatEUR(lic.dailyCost * 22)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-medium">Costo / gg:</span>
                    <input
                      type="number"
                      step="5"
                      value={lic.dailyCost}
                      onChange={(e) => handleLicenseCostChange(lic.id, e.target.value)}
                      className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-right font-bold text-slate-900 bg-white"
                    />
                    <span className="font-bold text-slate-700">€</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gestione Backup & Reset Dati */}
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
