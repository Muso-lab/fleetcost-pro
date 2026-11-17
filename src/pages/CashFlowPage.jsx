import { useState, useEffect } from 'react';
import storageService from '../services/storageService';
import {
  calculateAnnualBudgetAndCashFlow,
  formatEUR,
  formatPercent,
  MONTH_NAMES
} from '../utils/cashFlowCalculations';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Calendar,
  Clock,
  Download,
  Sliders,
  CheckCircle2,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  ShieldAlert,
  Percent
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import * as XLSX from 'xlsx';

const CashFlowPage = () => {
  const [projects, setProjects] = useState([]);
  const [selectedYear, setSelectedYear] = useState(2025);
  const [initialCash, setInitialCash] = useState(30000);
  const [stressTestDays, setStressTestDays] = useState(0); // 0, 15, 30, 45 giorni di ritardo
  const [factoringEnabled, setFactoringEnabled] = useState(false);
  const [factoringRate, setFactoringRate] = useState(80); // 80% anticipato
  const [activeTab, setActiveTab] = useState('cashflow'); // 'cashflow' or 'pnl'

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = () => {
    setProjects(storageService.getProjects());
  };

  // Calcolo del budget e cash flow con le opzioni correnti
  const financialModel = calculateAnnualBudgetAndCashFlow(projects, {
    year: selectedYear,
    initialCashBalance: initialCash,
    stressTestClientDays: stressTestDays,
    factoringEnabled,
    factoringAdvanceRate: factoringRate,
    factoringFeePercent: 1.5
  });

  const {
    monthlyCashFlow,
    annualRevenue,
    annualCost,
    annualMol,
    annualMolPercent,
    totalCashIn,
    totalCashOut,
    netAnnualCash,
    finalCashBalance,
    peakFinancingRequired,
    peakDeficitMonth,
    minCashBalance
  } = financialModel;

  // Dati per i grafici
  const chartData = monthlyCashFlow.map(m => ({
    name: m.shortName,
    fullName: m.monthName,
    RicaviPnl: Math.round(m.revenue),
    CostiPnl: Math.round(m.cost),
    MolPnl: Math.round(m.mol),
    IncassiCassa: Math.round(m.cashIn),
    UsciteCassa: Math.round(m.cashOut),
    FlussoNetto: Math.round(m.netCashFlow),
    SaldoCassa: Math.round(m.closingCash),
    Fabbisogno: m.closingCash < 0 ? Math.round(Math.abs(m.closingCash)) : 0
  }));

  // Esporta in Excel (.xlsx) completo
  const handleExportExcel = () => {
    const pnlRows = monthlyCashFlow.map(m => ({
      Mese: m.monthName,
      'Progetti Attivi': m.activeProjectsCount,
      'Ricavi (€)': m.revenue,
      'Costi Totali (€)': m.cost,
      'Autisti (€)': m.costBreakdown.driver,
      'Carburante (€)': m.costBreakdown.fuel,
      'Pedaggi (€)': m.costBreakdown.tolls,
      'Gomme (€)': m.costBreakdown.tires,
      'Noleggi Mezzi (€)': m.costBreakdown.vehicleLease,
      'Noleggi Rimorchi (€)': m.costBreakdown.trailerLease,
      'Margine Partner (€)': m.costBreakdown.partnerMargin,
      'M.O.L. (€)': m.mol,
      'M.O.L. (%)': `${m.molPercent.toFixed(1)}%`
    }));

    const cashFlowRows = monthlyCashFlow.map(m => ({
      Mese: m.monthName,
      'Saldo Iniziale (€)': m.openingCash,
      'Incassi da Clienti (€)': m.cashIn,
      'Uscite Totali (€)': m.cashOut,
      'Uscite Personale (€)': m.outflowBreakdown.drivers,
      'Uscite Fornitori/Carburante (€)': m.outflowBreakdown.suppliers,
      'Uscite Noleggi (€)': m.outflowBreakdown.leases,
      'Caparre (€)': m.outflowBreakdown.deposits,
      'Flusso Netto Mese (€)': m.netCashFlow,
      'Saldo Cassa Finale (€)': m.closingCash,
      'Fabbisogno Cassa (€)': m.workingCapitalGap
    }));

    const wb = XLSX.utils.book_new();
    const wsCashFlow = XLSX.utils.json_to_sheet(cashFlowRows);
    const wsPnl = XLSX.utils.json_to_sheet(pnlRows);

    XLSX.utils.book_append_sheet(wb, wsCashFlow, 'Cash Flow Tesoreria');
    XLSX.utils.book_append_sheet(wb, wsPnl, 'Budget Economico P&L');

    XLSX.writeFile(wb, `FOUR_Piano_Finanziario_${selectedYear}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <TrendingUp className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Forecast, Budget & Cash Flow FOUR
                </h1>
                <p className="text-xs text-slate-500">
                  Pianificazione finanziaria con impatto dei termini di pagamento (DSO 60-90 gg vs DPO 15-30 gg)
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="text-xs font-bold py-2 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
            >
              <option value="2025">Anno Budget 2025</option>
              <option value="2026">Anno Budget 2026</option>
            </select>

            <button
              onClick={handleExportExcel}
              className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl font-semibold text-xs transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Esporta Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Dashboard Financial Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ricavi Annui Previsti</span>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {formatEUR(annualRevenue)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Fatturato totale a budget</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Costi Totali Annui</span>
            <div className="text-2xl font-black text-slate-700 mt-2">
              {formatEUR(annualCost)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Operativi + canoni noleggio</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">M.O.L. Annuo (EBITDA)</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-emerald-600">{formatEUR(annualMol)}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {formatPercent(annualMolPercent)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Margine operativo lordo</p>
          </div>

          <div className={`p-5 rounded-2xl shadow-sm border ${
            peakFinancingRequired > 0
              ? 'bg-amber-50/80 border-amber-300'
              : 'bg-white border-slate-200'
          }`}>
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center">
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" />
              Picco Fabbisogno Cassa
            </span>
            <div className="text-2xl font-black text-amber-700 mt-2">
              {formatEUR(peakFinancingRequired)}
            </div>
            <p className="text-[11px] text-amber-800 mt-1 font-semibold">
              {peakFinancingRequired > 0 ? `Picco a ${peakDeficitMonth}` : 'Nessun deficit di cassa'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Cassa a Dicembre</span>
            <div className={`text-2xl font-black mt-2 ${finalCashBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatEUR(finalCashBalance)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Disponibilità liquida finale</p>
          </div>
        </div>

        {/* Pannello Scenari e Parametri Finanziari (Stress Test & Factoring) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Simulatore Scenari di Cassa & Politiche di Incasso
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              Modifica i parametri per vedere l'impatto in tempo reale sulla tesoreria
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            {/* Cassa Iniziale */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                Disponibilità di Cassa Iniziale (1 Gennaio):
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="5000"
                  value={initialCash}
                  onChange={(e) => setInitialCash(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-900"
                />
                <span className="text-slate-500 font-bold">€</span>
              </div>
              <p className="text-[11px] text-slate-400">Fondo cassa o fido bancario di partenza</p>
            </div>

            {/* Stress Test Ritardo Incassi */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                Stress-Test: Ritardo Incassi Clienti (+gg):
              </label>
              <select
                value={stressTestDays}
                onChange={(e) => setStressTestDays(parseInt(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold"
              >
                <option value="0">Nessun ritardo (Termini contrattuali)</option>
                <option value="15">+15 giorni di ritardo medio</option>
                <option value="30">+30 giorni (Clienti pagano a 90 gg anziché 60)</option>
                <option value="60">+60 giorni (Scenario grave crisi liquidità)</option>
              </select>
              <p className="text-[11px] text-slate-400">Valuta quanto aumenta il fabbisogno se i clienti ritardano</p>
            </div>

            {/* Factoring / Anticipo Fatture */}
            <div className="space-y-1.5 p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/60">
              <div className="flex items-center justify-between">
                <label className="font-bold text-emerald-950">
                  Anticipo Fatture / Factoring:
                </label>
                <input
                  type="checkbox"
                  checked={factoringEnabled}
                  onChange={(e) => setFactoringEnabled(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </div>
              {factoringEnabled ? (
                <div className="flex items-center space-x-2 pt-1">
                  <span className="text-[11px] text-emerald-800">Anticipo:</span>
                  <select
                    value={factoringRate}
                    onChange={(e) => setFactoringRate(parseInt(e.target.value))}
                    className="px-2 py-1 border border-emerald-300 rounded-lg text-xs bg-white font-bold"
                  >
                    <option value="70">70% a 3 giorni</option>
                    <option value="80">80% a 3 giorni (Standard)</option>
                    <option value="90">90% a 3 giorni</option>
                  </select>
                  <span className="text-[10px] text-emerald-700 italic">(Costo 1.5%)</span>
                </div>
              ) : (
                <p className="text-[11px] text-emerald-800">
                  Attiva per simulare l'incasso immediato dell'80% delle fatture tramite anticipo bancario.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Grafico Andamento Cassa & Fabbisogno */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Evoluzione Saldo di Cassa & Fabbisogno Circolante ({selectedYear})
              </h3>
              <p className="text-xs text-slate-500">
                La curva mostra il saldo cumulato di tesoreria: sotto la linea dello zero (rossa) si genera fabbisogno da affidamento.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center text-emerald-700 font-semibold">
                <span className="w-3 h-3 bg-emerald-500 rounded-full mr-1 inline-block"></span>
                Saldo Cassa
              </span>
              <span className="flex items-center text-blue-700 font-semibold">
                <span className="w-3 h-3 bg-blue-500 rounded mr-1 inline-block"></span>
                Incassi
              </span>
              <span className="flex items-center text-rose-700 font-semibold">
                <span className="w-3 h-3 bg-rose-400 rounded mr-1 inline-block"></span>
                Uscite
              </span>
            </div>
          </div>

          <div className="h-80 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value, name) => [formatEUR(value), name]}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" label={{ value: 'Zero Cassa', fill: '#ef4444', fontSize: 10, position: 'insideBottomRight' }} />
                <Bar dataKey="IncassiCassa" name="Incassi Cassa" fill="#3b82f6" opacity={0.6} radius={[4, 4, 0, 0]} />
                <Bar dataKey="UsciteCassa" name="Uscite Cassa" fill="#f43f5e" opacity={0.5} radius={[4, 4, 0, 0]} />
                <Area
                  type="monotone"
                  dataKey="SaldoCassa"
                  name="Saldo Cassa Cumulato"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={0.15}
                  fill="#10b981"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabella Mese per Mese: Switch P&L vs Cash Flow */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex p-1 bg-slate-100 rounded-xl max-w-fit">
              <button
                onClick={() => setActiveTab('cashflow')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'cashflow' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Piano di Cassa / Cash Flow Mensile
              </button>
              <button
                onClick={() => setActiveTab('pnl')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'pnl' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Budget Economico P&L (Competenza)
              </button>
            </div>

            <span className="text-xs text-slate-500 font-medium">
              {activeTab === 'cashflow'
                ? 'Flussi effettivi monetari con date valuta'
                : 'Ricavi e costi imputati al periodo di maturazione'}
            </span>
          </div>

          <div className="overflow-x-auto">
            {activeTab === 'cashflow' ? (
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Mese</th>
                    <th className="py-3 px-4 text-right">Saldo Iniziale</th>
                    <th className="py-3 px-4 text-right text-blue-700">(+) Incassi</th>
                    <th className="py-3 px-4 text-right text-rose-700">(-) Uscite</th>
                    <th className="py-3 px-4 text-right">Autisti/Pers.</th>
                    <th className="py-3 px-4 text-right">Carburante/Forn.</th>
                    <th className="py-3 px-4 text-right">Noleggi</th>
                    <th className="py-3 px-4 text-right">Flusso Netto</th>
                    <th className="py-3 px-4 text-right font-black">Saldo Finale Cassa</th>
                    <th className="py-3 px-4 text-center">Fabbisogno</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {monthlyCashFlow.map((m) => {
                    const isDeficit = m.closingCash < 0;
                    return (
                      <tr
                        key={m.monthIndex}
                        className={`hover:bg-slate-50/80 transition ${isDeficit ? 'bg-amber-50/40' : ''}`}
                      >
                        <td className="py-3.5 px-4 font-bold text-slate-900">{m.monthName}</td>
                        <td className="py-3.5 px-4 text-right text-slate-600">{formatEUR(m.openingCash)}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-blue-600">{formatEUR(m.cashIn)}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-rose-600">{formatEUR(m.cashOut)}</td>
                        <td className="py-3.5 px-4 text-right text-slate-600">{formatEUR(m.outflowBreakdown.drivers)}</td>
                        <td className="py-3.5 px-4 text-right text-slate-600">{formatEUR(m.outflowBreakdown.suppliers)}</td>
                        <td className="py-3.5 px-4 text-right text-slate-600">{formatEUR(m.outflowBreakdown.leases)}</td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`font-bold ${m.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.netCashFlow >= 0 ? '+' : ''}{formatEUR(m.netCashFlow)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`font-black text-sm ${isDeficit ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {formatEUR(m.closingCash)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isDeficit ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                              DEFICIT {formatEUR(Math.abs(m.closingCash))}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-bold">
                  <tr>
                    <td className="py-3.5 px-4">TOTALE ANNUO</td>
                    <td className="py-3.5 px-4 text-right text-slate-400">{formatEUR(initialCash)}</td>
                    <td className="py-3.5 px-4 text-right text-emerald-400">{formatEUR(totalCashIn)}</td>
                    <td className="py-3.5 px-4 text-right text-rose-300">{formatEUR(totalCashOut)}</td>
                    <td colSpan="3" className="py-3.5 px-4 text-center text-slate-400">Riepilogo Finanziario</td>
                    <td className="py-3.5 px-4 text-right text-emerald-300">
                      {netAnnualCash >= 0 ? '+' : ''}{formatEUR(netAnnualCash)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-white font-black text-sm">{formatEUR(finalCashBalance)}</td>
                    <td className="py-3.5 px-4 text-center text-amber-300">
                      {peakFinancingRequired > 0 ? `Max Fabb.: ${formatEUR(peakFinancingRequired)}` : 'Coperto'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Mese</th>
                    <th className="py-3 px-4 text-center">Commesse</th>
                    <th className="py-3 px-4 text-right">Ricavi Budget</th>
                    <th className="py-3 px-4 text-right">Costi Operativi</th>
                    <th className="py-3 px-4 text-right">Canoni Noleggio</th>
                    <th className="py-3 px-4 text-right">Costi Totali</th>
                    <th className="py-3 px-4 text-right">M.O.L. (€)</th>
                    <th className="py-3 px-4 text-right">M.O.L. (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {monthlyCashFlow.map((m) => {
                    const isNegMol = m.mol < 0;
                    const leaseTotal = m.costBreakdown.vehicleLease + m.costBreakdown.trailerLease;
                    const opCost = m.cost - leaseTotal;

                    return (
                      <tr key={m.monthIndex} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-900">{m.monthName}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold">
                            {m.activeProjectsCount}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900">{formatEUR(m.revenue)}</td>
                        <td className="py-3.5 px-4 text-right text-slate-600">{formatEUR(opCost)}</td>
                        <td className="py-3.5 px-4 text-right text-slate-600">{formatEUR(leaseTotal)}</td>
                        <td className="py-3.5 px-4 text-right font-semibold text-slate-800">{formatEUR(m.cost)}</td>
                        <td className="py-3.5 px-4 text-right font-black">
                          <span className={isNegMol ? 'text-rose-600' : 'text-emerald-600'}>
                            {formatEUR(m.mol)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            isNegMol ? 'bg-rose-100 text-rose-800' : m.molPercent < 15 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {formatPercent(m.molPercent)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-bold">
                  <tr>
                    <td className="py-3.5 px-4">TOTALE ANNUO P&L</td>
                    <td className="py-3.5 px-4 text-center">-</td>
                    <td className="py-3.5 px-4 text-right text-emerald-400">{formatEUR(annualRevenue)}</td>
                    <td colSpan="2" className="py-3.5 px-4 text-center text-slate-400">Costi Totali di Esercizio</td>
                    <td className="py-3.5 px-4 text-right text-rose-300">{formatEUR(annualCost)}</td>
                    <td className="py-3.5 px-4 text-right text-emerald-300 text-sm font-black">{formatEUR(annualMol)}</td>
                    <td className="py-3.5 px-4 text-right text-white font-black">{formatPercent(annualMolPercent)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Insight e Note Operative Tesoreria */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-xs text-blue-900 space-y-2">
          <div className="flex items-center space-x-2 font-bold text-sm text-blue-950">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <h4>Perché si crea il Fabbisogno Finanziario (Working Capital Gap) in FOUR:</h4>
          </div>
          <p className="leading-relaxed">
            Nei contratti di logistica e trasporto, i grandi committenti (es. Decathlon, STEF, Camst, BRT) saldano le fatture tipicamente a <strong>60 giorni data fattura fine mese</strong> (DSO = 60-90 gg).
            Al contempo, i costi di FOUR devono essere anticipati: stipendi autisti al 10 del mese successivo, terzisti a 15-30 gg, canoni di noleggio veicoli all'inizio del mese e rifornimenti energia/gasolio a 30 gg (DPO = 15-30 gg).
          </p>
          <p className="leading-relaxed font-semibold">
            Questo disallineamento temporale di 30-45 giorni genera il picco di cassa negativo evidenziato nel grafico.
            Per sostenere l'avvio di nuovi progetti senza tensioni di liquidità, FOUR può:
          </p>
          <ul className="list-disc pl-5 space-y-1 font-medium">
            <li>Attivare linee di credito bancarie o affidamenti su anticipo fatture (castelletto SBF / factoring pro-soluto all'80%).</li>
            <li>Negoziare termini di incasso a 30 gg o acconti periodici con i nuovi clienti.</li>
            <li>Allineare i pagamenti dei padroncini/terzisti a 30-45 gg fine mese invece che a 15 gg.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CashFlowPage;
