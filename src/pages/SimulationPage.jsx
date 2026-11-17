import { useState, useEffect } from 'react';
import storageService from '../services/storageService';
import { formatEUR, formatPercent } from '../utils/cashFlowCalculations';
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
  FileText
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
  const [fuelPrice, setFuelPrice] = useState(0.38); // €/kWh o €/kg
  const [tollRate, setTollRate] = useState(0.12); // €/km autostrada
  const [tireRate, setTireRate] = useState(0.04); // €/km
  const [targetMarginPercent, setTargetMarginPercent] = useState(20); // 20% margine
  const [paymentTermsClient, setPaymentTermsClient] = useState(60); // DSO 60 gg
  const [paymentTermsSuppliers, setPaymentTermsSuppliers] = useState(30); // DPO 30 gg

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

    if (f.length > 0) {
      setSelectedVehicleId(f[0].id);
      updateFuelForVehicle(f[0], s);
    }
  };

  const updateFuelForVehicle = (vehicle, curSettings) => {
    if (!vehicle || !curSettings) return;
    const fuel = curSettings.fuelTypes.find(ft => ft.id === vehicle.fuelTypeId);
    if (fuel) {
      setFuelPrice(fuel.price);
    }
  };

  const handleVehicleChange = (vId) => {
    setSelectedVehicleId(vId);
    const vehicle = fleet.find(v => v.id === vId);
    if (vehicle && settings) {
      updateFuelForVehicle(vehicle, settings);
    }
  };

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

    // 1. Carburante / Energia
    let fuelDaily = 0;
    if (vehicle.fuelTypeId === 'elettrico') {
      // Consumo kWh/km * km * prezzo €/kWh
      fuelDaily = (vehicle.avgConsumption || 1.2) * km * fuelPrice;
    } else if (vehicle.fuelTypeId === 'biolng') {
      // Consumo kg/100km / 100 * km * prezzo €/kg
      fuelDaily = ((vehicle.avgConsumption || 30) / 100) * km * fuelPrice;
    } else {
      // Litri / 100km
      fuelDaily = ((vehicle.avgConsumption || 32) / 100) * km * fuelPrice;
    }

    // 2. Autostrada
    const tollsDaily = highwayKm * (Number(tollRate) || 0.12);

    // 3. Gomme
    const tiresDaily = km * (Number(tireRate) || 0.04);

    // 4. Autista
    let driverDaily = 220;
    if (doubleDrivers) {
      driverDaily = 440;
    } else if (isNightShift) {
      driverDaily = 260;
    } else if (vehicle.category === 'motrice') {
      driverDaily = 180;
    } else if (vehicle.category === 'furgone') {
      driverDaily = 140;
    }

    // 5. Noleggio Mezzo e Semirimorchio ripartiti sui giorni lavorativi mese
    const vehicleLeaseDaily = workingDays > 0 ? (Number(vehicle.monthlyLease) || 0) / workingDays : 0;
    const trailerLeaseDaily = (trailer && workingDays > 0) ? (Number(trailer.monthlyLease) || 0) / workingDays : 0;

    // Totale Costi Giornalieri Diretti + Noleggi FOUR
    const totalCostDaily = fuelDaily + tollsDaily + tiresDaily + driverDaily + vehicleLeaseDaily + trailerLeaseDaily;

    // Prezzo con margine target
    const marginPct = Number(targetMarginPercent) || 20;
    // Prezzo di vendita = Costo / (1 - Margine%)
    const revenueDailyTarget = marginPct < 100 ? totalCostDaily / (1 - (marginPct / 100)) : totalCostDaily * 1.2;
    const molDailyTarget = revenueDailyTarget - totalCostDaily;

    // Calcoli Mensili
    const monthlyCost = totalCostDaily * workingDays;
    const monthlyRevenue = revenueDailyTarget * workingDays;
    const monthlyMol = molDailyTarget * workingDays;

    // Calcolo Fabbisogno Cassa Circolante
    const gapDays = Math.max(0, paymentTermsClient - paymentTermsSuppliers);
    const gapMonths = gapDays / 30;
    const workingCapitalNeed = monthlyCost * gapMonths;

    setSimulationResult({
      vehicle,
      trailer,
      kmTotal: km,
      highwayKm,
      urbanKm,
      workingDays,
      fuelDaily,
      tollsDaily,
      tiresDaily,
      driverDaily,
      vehicleLeaseDaily,
      trailerLeaseDaily,
      totalCostDaily,
      revenueDailyTarget,
      molDailyTarget,
      molPercent: marginPct,
      monthlyCost,
      monthlyRevenue,
      monthlyMol,
      costPerKm: km > 0 ? totalCostDaily / km : 0,
      revenuePerKm: km > 0 ? revenueDailyTarget / km : 0,
      gapDays,
      workingCapitalNeed
    });
  };

  // Salva direttamente nel Budget Commesse FOUR
  const handleSaveAsProject = () => {
    if (!simulationResult) return;

    const newProject = {
      code: 'PRJ-' + Math.floor(100 + Math.random() * 900),
      name: clientName && routeName ? `${clientName} - ${routeName}` : `Linea con ${simulationResult.vehicle.name}`,
      client: clientName || 'Nuovo Committente',
      route: routeName || `${kmTotal} km giornalieri`,
      startDate: new Date().toISOString().slice(0, 10),
      operatingMonths: 12,
      workingDaysMonth: simulationResult.workingDays,
      kmDaily: simulationResult.kmTotal,
      managementType: simulationResult.vehicle.ownershipType === 'terzi' ? 'T' : 'D',
      vehicleId: simulationResult.vehicle.id,
      trailerId: simulationResult.trailer ? simulationResult.trailer.id : '',
      driverCostDaily: +simulationResult.driverDaily.toFixed(2),
      fuelCostDaily: +simulationResult.fuelDaily.toFixed(2),
      tollsDaily: +simulationResult.tollsDaily.toFixed(2),
      tiresDaily: +simulationResult.tiresDaily.toFixed(2),
      otherCostsDaily: 0,
      partnerMarginDaily: 0,
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
      paymentTermsLease: simulationResult.vehicle.leasePaymentTerms !== undefined ? simulationResult.vehicle.leasePaymentTerms : 0,
      depositAmount: 0,
      cashAdvanceRequired: +simulationResult.workingCapitalNeed.toFixed(2),
      notes: `Preventivo generato dal simulatore con margine target ${simulationResult.molPercent}%`
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
      ['Autista (Guida e Carico)', formatEUR(simulationResult.driverDaily)],
      ['Energia / Carburante', formatEUR(simulationResult.fuelDaily)],
      ['Pedaggio Autostradale', formatEUR(simulationResult.tollsDaily)],
      ['Pneumatici e Manutenzione', formatEUR(simulationResult.tiresDaily)],
      ['Quota Noleggio Trattore/Motrice', formatEUR(simulationResult.vehicleLeaseDaily)],
      ['Quota Noleggio Semirimorchio', formatEUR(simulationResult.trailerLeaseDaily)],
      ['TOTALE COSTO OPERATIVO GIORNALIERO', formatEUR(simulationResult.totalCostDaily)],
      ['TARIFFA GIORNALIERA PROPOSTA', formatEUR(simulationResult.revenueDailyTarget)],
      ['M.O.L. GIORNALIERO (MARGINE)', `${formatEUR(simulationResult.molDailyTarget)} (${simulationResult.molPercent}%)`],
      ['RICAVO MENSILE STIMATO (22 gg)', formatEUR(simulationResult.monthlyRevenue)],
      ['COSTO MENSILE STIMATO (22 gg)', formatEUR(simulationResult.monthlyCost)],
      ['M.O.L. MENSILE STIMATO', formatEUR(simulationResult.monthlyMol)],
      ['Fabbisogno Circolante Stimato (Gap DSO)', formatEUR(simulationResult.workingCapitalNeed)]
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
                      {v.name} ({formatEUR(v.monthlyLease)}/m - {v.fuelTypeId})
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
                  onChange={(e) => setSelectedTrailerId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Nessun Semirimorchio --</option>
                  {trailers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({formatEUR(t.monthlyLease)}/m)
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
                      value={fuelPrice}
                      onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold"
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

              {/* Turni Autista */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-semibold text-slate-700 block">Configurazione Autista</span>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={doubleDrivers}
                      onChange={(e) => setDoubleDrivers(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Doppio Autista / 2 Turni H24</span>
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
              </div>

              {/* Margine Target & Termini di Pagamento */}
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

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600">Autista (Salario e Contributi):</span>
                      <span className="font-bold text-slate-900">{formatEUR(simulationResult.driverDaily)}</span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600">Energia / Carburante:</span>
                      <span className="font-bold text-slate-900">{formatEUR(simulationResult.fuelDaily)}</span>
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

                    <div className="flex justify-between items-center py-2 bg-slate-50 px-3 rounded-xl font-bold">
                      <span className="text-slate-900">TOTALE COSTI GIORNALIERI FOUR:</span>
                      <span className="text-slate-900 text-sm">{formatEUR(simulationResult.totalCostDaily)}</span>
                    </div>
                  </div>
                </div>

                {/* Box Impatto Finanziario & Cash Flow Anticipazione */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>Fabbisogno Circolante & Anticipazione di Cassa</span>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Con incasso cliente a <strong>{paymentTermsClient} giorni</strong> e costi pagati a <strong>{paymentTermsSuppliers} giorni</strong>,
                    per avviare questa commessa FOUR dovrà anticipare:
                  </p>
                  <div className="text-xl font-black text-amber-800">
                    {formatEUR(simulationResult.workingCapitalNeed)}
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Corrispondente a circa {(simulationResult.gapDays / 30).toFixed(1)} mensilità di costi operativi prima dell'incasso della prima fattura.
                  </p>
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
