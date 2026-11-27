import { useState, useEffect, useMemo, useRef } from 'react';
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
  Percent,
  Layers,
  Shield,
  Fuel,
  CreditCard,
  Building2,
  Zap,
  ChevronDown,
  ChevronUp
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
  const [fleet, setFleet] = useState([]);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [initialCash, setInitialCash] = useState(() => Number(storageService.getSettings()?.financialDefaults?.initialCashBalance ?? 50000));
  const initialCashSaveTimerRef = useRef(null);
  const [stressTestDays, setStressTestDays] = useState(0); // 0, 15, 30, 60 gg di ritardo
  const [factoringEnabled, setFactoringEnabled] = useState(false);
  const [factoringRate, setFactoringRate] = useState(80); // 80% anticipato
  const [acciseEnabled, setAcciseEnabled] = useState(false); // Prezzi carburante sempre "Alla Pompa" senza recupero accise
  const [acciseRate, setAcciseRate] = useState(0);
  const [activeTab, setActiveTab] = useState('cashflow'); // 'cashflow' | 'biweekly' | 'pnl'
  const [showExpenseDetails, setShowExpenseDetails] = useState(false); // Toggle colonne di dettaglio uscite
  const [showCashSchedule, setShowCashSchedule] = useState(false); // Calendario Scadenze comprimibile

  useEffect(() => {
    loadProjects();
    const unsubscribe = storageService.subscribe((event) => {
      if (event.type === 'data' && (event.scopes?.includes('projects') || event.scopes?.includes('settings') || event.scopes?.includes('fleet'))) {
        loadProjects();
      }
    });
    return () => {
      unsubscribe();
      if (initialCashSaveTimerRef.current) clearTimeout(initialCashSaveTimerRef.current);
    };
  }, []);

  const loadProjects = () => {
    setProjects(storageService.getProjects());
    setFleet(storageService.getFleet());
    const settings = storageService.getSettings();
    const savedInitialCash = Number(settings?.financialDefaults?.initialCashBalance ?? 50000);
    setInitialCash(savedInitialCash);
  };

  const persistInitialCash = (value) => {
    const cleanVal = Number(value) || 0;
    const curSettings = storageService.getSettings();
    storageService.saveSettings({
      ...curSettings,
      financialDefaults: {
        ...(curSettings.financialDefaults || {}),
        initialCashBalance: cleanVal
      }
    });
  };

  const handleInitialCashChange = (rawValue) => {
    const nextVal = parseFloat(rawValue) || 0;
    setInitialCash(nextVal);
    if (initialCashSaveTimerRef.current) clearTimeout(initialCashSaveTimerRef.current);
    initialCashSaveTimerRef.current = setTimeout(() => {
      persistInitialCash(nextVal);
    }, 400);
  };

  const [portfolioScope, setPortfolioScope] = useState('consolidated'); // 'consolidated' | 'activeOnly' | 'potentialOnly'

  const isPotentialProject = (p) => {
    if (!p) return false;
    if (p.contractStatus) return p.contractStatus === 'potential' || p.contractStatus === 'simulation' || p.contractStatus === 'negotiation';
    if (p.isPipelineFuture !== undefined) return Boolean(p.isPipelineFuture);
    const start = p.startDate ? new Date(p.startDate) : new Date();
    const today = new Date();
    return start > today || (p.notes && (p.notes.toLowerCase().includes('preventivo') || p.notes.toLowerCase().includes('trattativa') || p.notes.toLowerCase().includes('simulazione'))) || (p.code && (p.code.startsWith('PRJ-FUT') || p.code.startsWith('SIM-')));
  };

  const effectiveProjects = useMemo(() => {
    if (portfolioScope === 'activeOnly') {
      return projects.filter(p => !isPotentialProject(p));
    }
    if (portfolioScope === 'potentialOnly') {
      return projects.filter(p => isPotentialProject(p));
    }
    return projects;
  }, [projects, portfolioScope]);

  const effectiveInitialCash = portfolioScope === 'potentialOnly' ? 0 : initialCash;

  // Calcolo del budget e cash flow con il nuovo motore avanzato
  const financialModel = calculateAnnualBudgetAndCashFlow(effectiveProjects, {
    year: selectedYear,
    initialCashBalance: effectiveInitialCash,
    stressTestClientDays: stressTestDays,
    factoringEnabled,
    factoringAdvanceRate: factoringRate,
    factoringFeePercent: 1.5,
    acciseRecoveryEnabled: acciseEnabled,
    acciseRatePerLiter: acciseRate,
    fleet
  });

  const {
    monthlyCashFlow,
    biweeklyCashFlow,
    annualRevenue,
    annualCost,
    annualMol,
    annualMolPercent,
    annualAcciseCredit,
    totalCashIn,
    totalCashOut,
    netAnnualCash,
    finalCashBalance,
    peakFinancingRequired,
    suggestedCreditLine,
    peakDeficitMonth,
    peakDeficitBiweekly,
    minCashBalance,
    biweeklyMinCashBalance,
    dscr,
    dscrRating,
    dscrColor,
    totalAnnualLeases,
    cashScheduleDeadlines
  } = financialModel;

  const showAcciseCol = annualAcciseCredit > 0;

  const annualColumnTotals = useMemo(() => {
    return monthlyCashFlow.reduce(
      (acc, m) => {
        acc.driversOut += m.outflowBreakdown.drivers || 0;
        acc.fuelOut += m.outflowBreakdown.lngFuel || 0;
        acc.tollsOut += m.outflowBreakdown.tollsTelepass || 0;
        acc.leasesOut += m.outflowBreakdown.leasesTotal || 0;
        acc.pnlFuelNet += m.costBreakdown.fuelNet || 0;
        acc.pnlLeases += (m.costBreakdown.vehicleLease || 0) + (m.costBreakdown.trailerLease || 0);
        acc.pnlAccAndFridge += (m.costBreakdown.refrigeration || 0) + (m.costBreakdown.telematics || 0) + (m.costBreakdown.washing || 0) + (m.costBreakdown.extraCosts || 0);
        return acc;
      },
      { driversOut: 0, fuelOut: 0, tollsOut: 0, leasesOut: 0, pnlFuelNet: 0, pnlLeases: 0, pnlAccAndFridge: 0 }
    );
  }, [monthlyCashFlow]);

  // Raggruppamento per Trimestri (Q1, Q2, Q3, Q4) con calcolo dei subtotali
  const quartersData = useMemo(() => {
    if (!monthlyCashFlow || monthlyCashFlow.length === 0) return [];

    const configs = [
      {
        id: 'Q1',
        title: '1° Trimestre (Q1)',
        period: 'Gennaio – Marzo',
        season: 'Inverno • Start-up & Regolarizzazione Flussi',
        badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
        headerClass: 'bg-gradient-to-r from-sky-50 via-blue-50/70 to-slate-50 border-l-4 border-sky-500 text-sky-950',
        subtotalClass: 'bg-sky-50/90 text-sky-950 font-bold border-t border-b border-sky-200',
        startIdx: 0,
        endIdx: 3
      },
      {
        id: 'Q2',
        title: '2° Trimestre (Q2)',
        period: 'Aprile – Giugno',
        season: 'Primavera • Stabilizzazione Operativa & Canoni',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        headerClass: 'bg-gradient-to-r from-emerald-50 via-teal-50/70 to-slate-50 border-l-4 border-emerald-500 text-emerald-950',
        subtotalClass: 'bg-emerald-50/90 text-emerald-950 font-bold border-t border-b border-emerald-200',
        startIdx: 3,
        endIdx: 6
      },
      {
        id: 'Q3',
        title: '3° Trimestre (Q3)',
        period: 'Luglio – Settembre',
        season: 'Estate • Picco Volumi & Flussi Stagionali',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        headerClass: 'bg-gradient-to-r from-amber-50 via-yellow-50/70 to-slate-50 border-l-4 border-amber-500 text-amber-950',
        subtotalClass: 'bg-amber-50/90 text-amber-950 font-bold border-t border-b border-amber-200',
        startIdx: 6,
        endIdx: 9
      },
      {
        id: 'Q4',
        title: '4° Trimestre (Q4)',
        period: 'Ottobre – Dicembre',
        season: 'Autunno • Chiusura Esercizio & Bilancio Cassa',
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        headerClass: 'bg-gradient-to-r from-indigo-50 via-purple-50/70 to-slate-50 border-l-4 border-indigo-500 text-indigo-950',
        subtotalClass: 'bg-indigo-50/90 text-indigo-950 font-bold border-t border-b border-indigo-200',
        startIdx: 9,
        endIdx: 12
      }
    ];

    return configs.map(q => {
      const months = monthlyCashFlow.slice(q.startIdx, q.endIdx);
      const openingCash = months[0]?.openingCash || 0;
      const cashIn = months.reduce((acc, m) => acc + (m.inflowBreakdown.clientsRegular + m.inflowBreakdown.factoringAdvance), 0);
      const acciseRefunds = months.reduce((acc, m) => acc + (m.inflowBreakdown.acciseRefunds || 0), 0);
      const cashOut = months.reduce((acc, m) => acc + m.cashOut, 0);
      const drivers = months.reduce((acc, m) => acc + m.outflowBreakdown.drivers, 0);
      const lngFuel = months.reduce((acc, m) => acc + m.outflowBreakdown.lngFuel, 0);
      const tollsTelepass = months.reduce((acc, m) => acc + m.outflowBreakdown.tollsTelepass, 0);
      const leasesTotal = months.reduce((acc, m) => acc + m.outflowBreakdown.leasesTotal, 0);
      const netCashFlow = months.reduce((acc, m) => acc + m.netCashFlow, 0);
      const closingCash = months[months.length - 1]?.closingCash || 0;
      const isDeficit = closingCash < 0;

      // Metriche P&L per trimestre
      const revenue = months.reduce((acc, m) => acc + (m.revenue || 0), 0);
      const cost = months.reduce((acc, m) => acc + (m.cost || 0), 0);
      const mol = months.reduce((acc, m) => acc + (m.mol || 0), 0);

      return {
        ...q,
        months,
        openingCash,
        cashIn,
        acciseRefunds,
        cashOut,
        drivers,
        lngFuel,
        tollsTelepass,
        leasesTotal,
        netCashFlow,
        closingCash,
        isDeficit,
        revenue,
        cost,
        mol
      };
    });
  }, [monthlyCashFlow]);

  // Dati per il grafico in base al tab selezionato (Mensile vs Quindicinale)
  const isBiweeklyView = activeTab === 'biweekly';
  const chartData = isBiweeklyView
    ? biweeklyCashFlow.map(p => ({
        name: p.shortLabel,
        fullName: p.label,
        IncassiCassa: Math.round(p.cashIn),
        UsciteCassa: Math.round(p.cashOut),
        FlussoNetto: Math.round(p.netCashFlow),
        SaldoCassa: Math.round(p.closingCash),
        Fabbisogno: p.closingCash < 0 ? Math.round(Math.abs(p.closingCash)) : 0
      }))
    : monthlyCashFlow.map(m => ({
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

  // Esporta in Excel (.xlsx) completo multi-foglio
  const handleExportExcel = () => {
    // Foglio 1: Cash Flow Mensile
    const cashFlowRows = monthlyCashFlow.map(m => ({
      Mese: m.monthName,
      'Saldo Iniziale (€)': m.openingCash,
      'Incassi da Clienti (€)': m.inflowBreakdown.clientsRegular,
      'Anticipi Factoring (€)': m.inflowBreakdown.factoringAdvance,
      'Recupero Accise F24 (€)': m.inflowBreakdown.acciseRefunds,
      'Totale Entrate (€)': m.cashIn,
      'Uscite Autisti (€)': m.outflowBreakdown.drivers,
      'Uscite LNG Carburante (€)': m.outflowBreakdown.lngFuel,
      'Uscite Telepass (€)': m.outflowBreakdown.tollsTelepass,
      'Uscite Noleggi M1-D10 (€)': m.outflowBreakdown.leasesM1D10,
      'Uscite Noleggi M1-D30 (€)': m.outflowBreakdown.leasesM1D30,
      'Uscite Noleggi M2-D20 (€)': m.outflowBreakdown.leasesM2D20,
      'Uscite Fornitori Altri (€)': m.outflowBreakdown.suppliersOther,
      'Caparre Start-up (€)': m.outflowBreakdown.deposits,
      'Totale Uscite (€)': m.cashOut,
      'Flusso Netto Mese (€)': m.netCashFlow,
      'Saldo Cassa Finale (€)': m.closingCash,
      'Fabbisogno / Deficit (€)': m.workingCapitalGap
    }));

    // Foglio 2: Cash Flow Quindicinale (24 periodi)
    const biweeklyRows = biweeklyCashFlow.map(p => ({
      Quindicina: p.label,
      'Saldo Iniziale (€)': p.openingCash,
      'Incassi Clienti (€)': p.inflowBreakdown.clients,
      'Anticipi Factoring (€)': p.inflowBreakdown.factoring,
      'Accise F24 (€)': p.inflowBreakdown.accise,
      'Totale Entrate (€)': p.cashIn,
      'Autisti Netti G.10 (€)': p.outflowBreakdown.driversNet,
      'Autisti INPS/F24 G.16 (€)': p.outflowBreakdown.driversInpsF24,
      'LNG Carburante (€)': p.outflowBreakdown.lngFuel,
      'Telepass (€)': p.outflowBreakdown.tollsTelepass,
      'Noleggi (€)': p.outflowBreakdown.leases,
      'Altri Fornitori (€)': p.outflowBreakdown.otherSuppliers,
      'Caparre (€)': p.outflowBreakdown.deposits,
      'Totale Uscite (€)': p.cashOut,
      'Flusso Netto (€)': p.netCashFlow,
      'Saldo Finale (€)': p.closingCash,
      'Fabbisogno (€)': p.workingCapitalGap
    }));

    // Foglio 3: Conto Economico P&L
    const pnlRows = monthlyCashFlow.map(m => ({
      Mese: m.monthName,
      'Progetti Attivi': m.activeProjectsCount,
      'Ricavi (€)': m.revenue,
      'Costi Totali (€)': m.cost,
      'Autisti (€)': m.costBreakdown.driver,
      'Carburante Lordo (€)': m.costBreakdown.fuelGross,
      'Credito Accise (€)': m.costBreakdown.acciseCredit,
      'Carburante Netto (€)': m.costBreakdown.fuelNet,
      'Pedaggi (€)': m.costBreakdown.tolls,
      'Gomme (€)': m.costBreakdown.tires,
      'Noleggi Mezzi (€)': m.costBreakdown.vehicleLease,
      'Noleggi Rimorchi (€)': m.costBreakdown.trailerLease,
      'Refrigerazione Frigo (€)': m.costBreakdown.refrigeration || 0,
      'Telematica GPS (€)': m.costBreakdown.telematics || 0,
      'Lavaggi (€)': m.costBreakdown.washing || 0,
      'Costi Extra (€)': m.costBreakdown.extraCosts || 0,
      'Facchinaggio (€)': m.costBreakdown.porterage || 0,
      'Vettore Terzo / Partner (€)': m.costBreakdown.partnerMargin,
      'M.O.L. (€)': m.mol,
      'M.O.L. (%)': `${m.molPercent.toFixed(1)}%`
    }));

    const wb = XLSX.utils.book_new();
    const wsCashFlow = XLSX.utils.json_to_sheet(cashFlowRows);
    const wsBiweekly = XLSX.utils.json_to_sheet(biweeklyRows);
    const wsPnl = XLSX.utils.json_to_sheet(pnlRows);

    XLSX.utils.book_append_sheet(wb, wsCashFlow, 'Cash Flow Mensile');
    XLSX.utils.book_append_sheet(wb, wsBiweekly, 'Cash Flow Quindicinale (24P)');
    XLSX.utils.book_append_sheet(wb, wsPnl, 'Budget Economico P&L');

    XLSX.writeFile(wb, `FOUR_Piano_Finanziario_Completo_${selectedYear}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Principale */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <TrendingUp className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Forecast, Budget &amp; Cash Flow FOUR
                </h1>
                <p className="text-xs text-slate-500">
                  Modellazione di tesoreria con regole reali (Noleggi G10/G30/G20, Energia/LNG 30gg quindicinale, Telepass 15gg quindicinale e prezzi alla pompa)
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-700 border border-slate-200">
              Esercizio {selectedYear}
            </span>
            <span className="px-3 py-1.5 rounded-xl font-bold bg-[#164e87]/10 text-[#164e87] border border-[#164e87]/20">
              {portfolioScope === 'consolidated' ? 'Portfolio Globale' : portfolioScope === 'activeOnly' ? 'Solo Status Quo' : 'Solo Trattative'}
            </span>
          </div>
        </div>

        {/* BARRA DI CONTROLLO STICKY (Sempre visibile a top-16 durante lo scroll, pulita e senza barre di scorrimento orizzontali) */}
        <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md shadow-md border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Selettore Tab Principali */}
            <div className="inline-flex items-center space-x-1 p-1 bg-slate-100 rounded-xl flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('cashflow')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'cashflow'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cash Flow Mensile
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('biweekly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'biweekly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quindicinale (24P)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pnl')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'pnl'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Budget P&amp;L
              </button>
            </div>

            {/* Controlli Portfolio, Anno, Dettagli ed Export */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={portfolioScope}
                onChange={(e) => setPortfolioScope(e.target.value)}
                className="text-xs font-bold py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-[#164e87] shadow-sm text-slate-800"
                title="Scegli se analizzare tutto il portfolio o solo contratti attivi o solo simulazioni"
              >
                <option value="consolidated">🌐 Tutto il Portfolio ({projects.length})</option>
                <option value="activeOnly">🏢 Solo Status Quo ({projects.filter(p => !isPotentialProject(p)).length})</option>
                <option value="potentialOnly">⚡ Solo Trattative ({projects.filter(p => isPotentialProject(p)).length})</option>
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="text-xs font-bold py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="2027">Budget 2027 (+12m)</option>
                <option value="2026">Budget 2026 (Corrente)</option>
              </select>

              {activeTab === 'cashflow' && (
                <button
                  type="button"
                  onClick={() => setShowExpenseDetails(!showExpenseDetails)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border shadow-xs ${
                    showExpenseDetails
                      ? 'bg-[#164e87] text-white border-[#164e87]'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                  title="Mostra o nascondi le colonne analitiche di spesa (Autisti, LNG, Telepass, Noleggi)"
                >
                  {showExpenseDetails ? '📋 Vista Sintetica' : '🔍 Dettaglio Spese'}
                </button>
              )}

              {/* Indicatori sintetici live nello sticky */}
              <div className="hidden xl:flex items-center space-x-2 text-xs bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                <span className="text-slate-500">Saldo Dic:</span>
                <span className={`font-black ${finalCashBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {formatEUR(finalCashBalance)}
                </span>
                {peakFinancingRequired > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-amber-800 font-bold">Fido: {formatEUR(suggestedCreditLine)}</span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Banner Notifica Proiezione Budget Anno Successivo 2027 */}
        {selectedYear === 2027 && (
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl flex-shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-950">
                  Proiezione Budget & Cash Flow Anno Successivo (2027)
                </p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  I flussi di tesoreria sono calcolati in regime di continuità aziendale dando per confermati i contratti a regime e le condizioni economiche dell'esercizio 2026.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold bg-emerald-200/80 text-emerald-900 px-3 py-1 rounded-full border border-emerald-300 w-fit">
              Continuità Operativa 2026 → 2027
            </span>
          </div>
        )}

        {/* Dashboard Financial Summary Cards (Bancabilità & Tesoreria) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Ricavi */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ricavi Annui Previsti</span>
            <div className="text-xl font-black text-slate-900 mt-1.5">
              {formatEUR(annualRevenue)}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Fatturato a budget</p>
          </div>

          {/* Costi */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Costi Totali Annui</span>
            <div className="text-xl font-black text-slate-700 mt-1.5">
              {formatEUR(annualCost)}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Op. + noleggi mezzi</p>
          </div>

          {/* M.O.L. */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">M.O.L. (EBITDA)</span>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className="text-xl font-black text-emerald-600">{formatEUR(annualMol)}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {formatPercent(annualMolPercent)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Margine lordo operativo</p>
          </div>

          {/* INDICE DSCR (Bancabilità) */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center">
              <Building2 className="w-3 h-3 mr-1 text-slate-500" />
              Indice DSCR
            </span>
            <div className="flex items-baseline justify-between mt-1.5">
              <span className={`text-xl font-black ${
                dscrColor === 'emerald' ? 'text-emerald-600' : dscrColor === 'amber' ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {dscr.toFixed(2)}x
              </span>
              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                dscrColor === 'emerald' ? 'bg-emerald-100 text-emerald-800' : dscrColor === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {dscrRating.split(' ')[0]}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5" title="Copertura canoni da cassa operativa">Copertura debiti/canoni</p>
          </div>

          {/* FIDO BANCARIO CONSIGLIATO */}
          <div className={`p-4 rounded-2xl shadow-sm border ${
            peakFinancingRequired > 0 ? 'bg-amber-50/80 border-amber-300' : 'bg-white border-slate-200'
          }`}>
            <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center">
              <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
              Fido / Fabbisogno
            </span>
            <div className="text-xl font-black text-amber-700 mt-1.5">
              {formatEUR(suggestedCreditLine)}
            </div>
            <p className="text-[10px] text-amber-800 mt-0.5 font-semibold truncate" title={`Picco a ${peakDeficitMonth} (${peakDeficitBiweekly})`}>
              {peakFinancingRequired > 0 ? `Picco: ${peakDeficitBiweekly || peakDeficitMonth}` : 'Nessun deficit'}
            </p>
          </div>

          {/* SALDO CASSA DICEMBRE */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cassa a Dicembre</span>
            <div className={`text-xl font-black mt-1.5 ${finalCashBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatEUR(finalCashBalance)}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Liquidità finale</p>
          </div>
        </div>

        {/* Simulatore Scenari di Cassa, Stress Test & Factoring */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Parametri Tesoreria &amp; Scenari di Stress Test
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              Ricalcolo istantaneo flussi di cassa, scadenze e fabbisogno fido
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            {/* Cassa Iniziale */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                Cassa Iniziale (1 Gennaio):
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="5000"
                  disabled={portfolioScope === 'potentialOnly'}
                  value={portfolioScope === 'potentialOnly' ? 0 : initialCash}
                  onChange={(e) => handleInitialCashChange(e.target.value)}
                  onBlur={(e) => persistInitialCash(e.target.value)}
                  className={`w-full px-3 py-1.5 border rounded-xl font-bold ${
                    portfolioScope === 'potentialOnly'
                      ? 'border-amber-200 bg-amber-50 text-amber-800 cursor-not-allowed'
                      : 'border-slate-300 bg-white text-slate-900'
                  }`}
                />
                <span className="text-slate-500 font-bold">€</span>
              </div>
              <p className="text-[10px] text-slate-400">
                {portfolioScope === 'potentialOnly'
                  ? 'Azzerata su Solo Trattative per evidenziare il fabbisogno netto'
                  : 'Disponibilità liquida di partenza (condivisa con Dashboard)'}
              </p>
            </div>

            {/* Stress Test Ritardo Clienti */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                Stress-Test: Ritardo Incassi (+gg):
              </label>
              <select
                value={stressTestDays}
                onChange={(e) => setStressTestDays(parseInt(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold"
              >
                <option value="0">Nessun ritardo (Termini contrattuali)</option>
                <option value="15">+15 giorni di ritardo</option>
                <option value="30">+30 giorni (Incasso a 90 gg anziché 60)</option>
                <option value="60">+60 giorni (Scenario ritardo grave)</option>
              </select>
              <p className="text-[10px] text-slate-400">Simula l'impatto di clienti lenti a pagare</p>
            </div>

            {/* Factoring / Anticipo Fatture */}
            <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-900 flex items-center">
                  <CreditCard className="w-3.5 h-3.5 mr-1 text-slate-600" />
                  Anticipo Factoring:
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
                  <span className="text-[10px] text-slate-600">Anticipo:</span>
                  <select
                    value={factoringRate}
                    onChange={(e) => setFactoringRate(parseInt(e.target.value))}
                    className="px-2 py-0.5 border border-slate-300 rounded text-xs bg-white font-bold"
                  >
                    <option value="70">70%</option>
                    <option value="80">80% (Std)</option>
                    <option value="90">90%</option>
                  </select>
                  <span className="text-[10px] text-slate-500">(Costo 1.5%)</span>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500">Anticipa l'80% delle fatture emesse</p>
              )}
            </div>

            {/* Modalità Carburanti Alla Pompa (Senza Recupero Accise) */}
            <div className="space-y-1.5 p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/70">
              <div className="flex items-center justify-between">
                <label className="font-bold text-emerald-950 flex items-center">
                  <Fuel className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                  Prezzi Alla Pompa:
                </label>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-200 text-emerald-950">
                  Senza Accise
                </span>
              </div>
              <p className="text-[10px] text-emerald-800 leading-tight">
                Carburanti valorizzati al <strong>prezzo pieno alla pompa</strong> (aggiornamento settimanale MASE/GME), senza recupero accise.
              </p>
            </div>
          </div>
        </div>

        {/* CALENDARIO SCADENZE DI CASSA DEL MESE OPERATIVO (COMPRIMIBILE) */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
          <div
            onClick={() => setShowCashSchedule(prev => !prev)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Calendario Scadenze di Cassa del Mese (Giorni 10, 15, 16, 20, 30)
              </h3>
            </div>
            <button
              type="button"
              className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              <span>{showCashSchedule ? 'Comprimi calendario' : 'Mostra scadenze mese'}</span>
              {showCashSchedule ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showCashSchedule && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs pt-2 border-t border-slate-100">
              {cashScheduleDeadlines.map((dl, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    dl.day === 10
                      ? 'bg-rose-50/70 border-rose-200'
                      : dl.day === 15
                      ? 'bg-amber-50/70 border-amber-200'
                      : dl.day === 16
                      ? 'bg-purple-50/70 border-purple-200'
                      : dl.day === 20
                      ? 'bg-blue-50/70 border-blue-200'
                      : 'bg-emerald-50/70 border-emerald-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-lg font-black text-slate-900">Giorno {dl.day}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        dl.type === 'outflow' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {dl.type === 'outflow' ? 'Uscita Cassa' : 'Misto / Incassi'}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-xs mb-1">{dl.title}</h4>
                    <p className="text-[11px] text-slate-600 leading-snug">{dl.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grafico Andamento Cassa & Fabbisogno */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Evoluzione Saldo di Cassa & Fabbisogno Circolante ({selectedYear}) {isBiweeklyView ? '- Vista Quindicinale (24 Periodi)' : '- Vista Mensile'}
              </h3>
              <p className="text-xs text-slate-500">
                La curva mostra il saldo cumulato: sotto la linea rossa (zero) si attiva il fido bancario necessario.
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
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val) => formatEUR(val)}
                  labelFormatter={(name, payload) => payload?.[0]?.payload?.fullName || name}
                />
                <Legend />
                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" />
                <Bar dataKey="IncassiCassa" name="Incassi Cassa" fill="#3b82f6" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                <Bar dataKey="UsciteCassa" name="Uscite Cassa" fill="#f43f5e" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="SaldoCassa"
                  name="Saldo Cassa Cumulato"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 3, fill: '#10b981' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabella Dati (controllata dalla barra Tab sticky in alto) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
            <h3 className="text-sm font-black text-slate-900">
              {activeTab === 'cashflow'
                ? `Prospetto Cash Flow Mensile (${selectedYear})`
                : activeTab === 'biweekly'
                ? `Dettaglio Tesoreria Quindicinale • 24 Periodi (${selectedYear})`
                : `Conto Economico Previsionale P&L (${selectedYear})`}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {activeTab === 'cashflow'
                ? 'Flussi mensili suddivisi per trimestre con termini contrattuali reali'
                : activeTab === 'biweekly'
                ? 'Evidenzia i picchi intra-mensili (1ª e 2ª quindicina)'
                : 'Ricavi e costi imputati al periodo di maturazione economica'}
            </span>
          </div>

          <div className="overflow-x-auto">
            {activeTab === 'cashflow' && (
              /* TABELLA CASH FLOW MENSILE CON SUDDIVISIONE IN TRIMESTRI (Q1-Q4) */
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-[#0b2440] text-white font-extrabold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 w-[20%]">Mese &amp; Periodo</th>
                    <th className="py-3 px-3 text-right">Saldo Iniz.</th>
                    <th className="py-3 px-3 text-right text-cyan-300">(+) Incassi</th>
                    {showAcciseCol && <th className="py-3 px-3 text-right text-emerald-300">(+) Accise F24</th>}
                    <th className="py-3 px-3 text-right text-rose-300">(-) Uscite</th>
                    {showExpenseDetails && (
                      <>
                        <th className="py-3 px-3 text-right text-slate-300 bg-slate-800/80">Autisti</th>
                        <th className="py-3 px-3 text-right text-slate-300 bg-slate-800/80">Energia &amp; Carb.</th>
                        <th className="py-3 px-3 text-right text-slate-300 bg-slate-800/80">Telepass</th>
                        <th className="py-3 px-3 text-right text-slate-300 bg-slate-800/80">Noleggi</th>
                      </>
                    )}
                    <th className="py-3 px-3 text-right">Flusso Netto</th>
                    <th className="py-3 px-3 text-right font-black">Saldo Finale</th>
                    <th className="py-3 px-3 text-center">Stato Cassa</th>
                  </tr>
                </thead>
                {quartersData.map((q) => (
                  <tbody key={q.id} className="divide-y divide-slate-100 font-medium">
                    {/* Header del Trimestre */}
                    <tr className={q.headerClass}>
                      <td
                        colSpan={(showExpenseDetails ? 11 : 7) + (showAcciseCol ? 1 : 0)}
                        className="py-2 px-4 font-black text-xs uppercase tracking-wider"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${q.badgeClass}`}>
                              {q.id}
                            </span>
                            <span className="font-extrabold text-slate-900">{q.title} • {q.period}</span>
                            <span className="text-[11px] font-medium text-slate-600 hidden sm:inline">— {q.season}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-[11px]">
                            <span className="font-semibold text-slate-600">Flusso Trimestrale:</span>
                            <span className={`font-black ${q.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {q.netCashFlow >= 0 ? '+' : ''}{formatEUR(q.netCashFlow)}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Mesi del Trimestre */}
                    {q.months.map((m) => {
                      const isDeficit = m.closingCash < 0;
                      const monthNum = String(m.monthIndex + 1).padStart(2, '0');
                      return (
                        <tr
                          key={m.monthIndex}
                          className={`hover:bg-slate-100/80 transition ${
                            isDeficit ? 'bg-amber-50/30' : m.monthIndex % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                          }`}
                        >
                          <td className="py-2.5 px-4">
                            <div className="flex items-center space-x-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${q.badgeClass}`}>
                                M{monthNum}
                              </span>
                              <span className="font-bold text-slate-900">{m.monthName}</span>
                              {m.inflowBreakdown.acciseRefunds > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                                  💰 Accise F24
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600 font-medium">{formatEUR(m.openingCash)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-blue-700 bg-blue-50/20">
                            {formatEUR(m.inflowBreakdown.clientsRegular + m.inflowBreakdown.factoringAdvance)}
                          </td>
                          {showAcciseCol && (
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700 bg-emerald-50/20">
                              {m.inflowBreakdown.acciseRefunds > 0 ? `+${formatEUR(m.inflowBreakdown.acciseRefunds)}` : '-'}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-right font-bold text-rose-700 bg-rose-50/20">
                            {formatEUR(m.cashOut)}
                          </td>

                          {showExpenseDetails && (
                            <>
                              <td className="py-2.5 px-3 text-right text-slate-600 bg-slate-50/70">{formatEUR(m.outflowBreakdown.drivers)}</td>
                              <td className="py-2.5 px-3 text-right text-slate-600 bg-slate-50/70">{formatEUR(m.outflowBreakdown.lngFuel)}</td>
                              <td className="py-2.5 px-3 text-right text-slate-600 bg-slate-50/70">{formatEUR(m.outflowBreakdown.tollsTelepass)}</td>
                              <td className="py-2.5 px-3 text-right text-slate-600 bg-slate-50/70">{formatEUR(m.outflowBreakdown.leasesTotal)}</td>
                            </>
                          )}

                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-bold ${m.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {m.netCashFlow >= 0 ? '+' : ''}{formatEUR(m.netCashFlow)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-black text-xs ${isDeficit ? 'text-rose-600' : 'text-emerald-700'}`}>
                              {formatEUR(m.closingCash)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isDeficit ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">
                                DEFICIT {formatEUR(Math.abs(m.closingCash))}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-800 border border-green-200">
                                LIQUIDITÀ OK
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Riga Subtotale Trimestrale */}
                    <tr className={q.subtotalClass}>
                      <td className="py-2 px-4 font-black text-xs">
                        SUBTOTALE {q.id} ({q.period})
                      </td>
                      <td className="py-2 px-3 text-right text-slate-700 font-semibold">{formatEUR(q.openingCash)}</td>
                      <td className="py-2 px-3 text-right text-blue-800 font-black">{formatEUR(q.cashIn)}</td>
                      {showAcciseCol && (
                        <td className="py-2 px-3 text-right text-emerald-800 font-black">
                          {q.acciseRefunds > 0 ? `+${formatEUR(q.acciseRefunds)}` : '-'}
                        </td>
                      )}
                      <td className="py-2 px-3 text-right text-rose-800 font-black">{formatEUR(q.cashOut)}</td>

                      {showExpenseDetails && (
                        <>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">{formatEUR(q.drivers)}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">{formatEUR(q.lngFuel)}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">{formatEUR(q.tollsTelepass)}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">{formatEUR(q.leasesTotal)}</td>
                        </>
                      )}

                      <td className="py-2 px-3 text-right font-black">
                        <span className={q.netCashFlow >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
                          {q.netCashFlow >= 0 ? '+' : ''}{formatEUR(q.netCashFlow)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-black">
                        <span className={q.isDeficit ? 'text-rose-700' : 'text-emerald-800'}>
                          {formatEUR(q.closingCash)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {q.isDeficit ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-200 text-rose-900 border border-rose-300">
                            DEFICIT {q.id}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-200 text-emerald-900 border border-emerald-300">
                            ATTIVO {q.id}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                ))}
                <tfoot className="bg-[#0b2440] text-white font-bold border-t-2 border-cyan-400">
                  <tr>
                    <td className="py-3 px-4 font-black">TOTALE ANNUO ({selectedYear})</td>
                    <td className="py-3 px-3 text-right text-slate-300">{formatEUR(effectiveInitialCash)}</td>
                    <td className="py-3 px-3 text-right text-cyan-300 font-black">{formatEUR(totalCashIn - annualAcciseCredit)}</td>
                    {showAcciseCol && <td className="py-3 px-3 text-right text-emerald-300 font-black">{formatEUR(annualAcciseCredit)}</td>}
                    <td className="py-3 px-3 text-right text-rose-300 font-black">{formatEUR(totalCashOut)}</td>
                    {showExpenseDetails && (
                      <>
                        <td className="py-3 px-3 text-right text-slate-200 font-bold">{formatEUR(annualColumnTotals.driversOut)}</td>
                        <td className="py-3 px-3 text-right text-slate-200 font-bold">{formatEUR(annualColumnTotals.fuelOut)}</td>
                        <td className="py-3 px-3 text-right text-slate-200 font-bold">{formatEUR(annualColumnTotals.tollsOut)}</td>
                        <td className="py-3 px-3 text-right text-slate-200 font-bold">{formatEUR(annualColumnTotals.leasesOut)}</td>
                      </>
                    )}
                    <td className="py-3 px-3 text-right text-emerald-300 font-black">
                      {netAnnualCash >= 0 ? '+' : ''}{formatEUR(netAnnualCash)}
                    </td>
                    <td className="py-3 px-3 text-right text-white font-black text-sm">{formatEUR(finalCashBalance)}</td>
                    <td className="py-3 px-3 text-center text-amber-300 font-extrabold text-[10px]">
                      {peakFinancingRequired > 0 ? `Picco Deficit: ${formatEUR(peakFinancingRequired)}` : 'Coperto'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {activeTab === 'biweekly' && (
              /* TABELLA CASH FLOW QUINDICINALE (24 PERIODI) */
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Periodo</th>
                    <th className="py-3 px-4 text-right">Saldo Iniziale</th>
                    <th className="py-3 px-4 text-right text-blue-700">(+) Incassi</th>
                    {showAcciseCol && <th className="py-3 px-4 text-right text-emerald-700">(+) Accise</th>}
                    <th className="py-3 px-4 text-right text-rose-700">(-) Uscite</th>
                    <th className="py-3 px-4 text-right">Autisti Netto (G10)</th>
                    <th className="py-3 px-4 text-right">Autisti INPS (G16)</th>
                    <th className="py-3 px-4 text-right">Energia/LNG (G15/30)</th>
                    <th className="py-3 px-4 text-right">Telepass</th>
                    <th className="py-3 px-4 text-right">Noleggi</th>
                    <th className="py-3 px-4 text-right font-black">Saldo Cassa</th>
                    <th className="py-3 px-4 text-center">Allerta Cassa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {biweeklyCashFlow.map((p) => {
                    const isDeficit = p.closingCash < 0;
                    return (
                      <tr
                        key={p.periodIndex}
                        className={`hover:bg-slate-50 transition ${isDeficit ? 'bg-rose-50/50' : p.quindicina === 1 ? 'bg-slate-50/30' : ''}`}
                      >
                        <td className="py-2.5 px-4 font-bold text-slate-900">{p.label}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">{formatEUR(p.openingCash)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-blue-600">
                          {p.inflowBreakdown.clients + p.inflowBreakdown.factoring > 0
                            ? formatEUR(p.inflowBreakdown.clients + p.inflowBreakdown.factoring)
                            : '-'}
                        </td>
                        {showAcciseCol && (
                          <td className="py-2.5 px-4 text-right font-bold text-emerald-600">
                            {p.inflowBreakdown.accise > 0 ? `+${formatEUR(p.inflowBreakdown.accise)}` : '-'}
                          </td>
                        )}
                        <td className="py-2.5 px-4 text-right font-bold text-rose-600">{formatEUR(p.cashOut)}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600">
                          {p.outflowBreakdown.driversNet > 0 ? formatEUR(p.outflowBreakdown.driversNet) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600">
                          {p.outflowBreakdown.driversInpsF24 > 0 ? formatEUR(p.outflowBreakdown.driversInpsF24) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600">
                          {p.outflowBreakdown.lngFuel > 0 ? formatEUR(p.outflowBreakdown.lngFuel) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600">
                          {p.outflowBreakdown.tollsTelepass > 0 ? formatEUR(p.outflowBreakdown.tollsTelepass) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600">
                          {p.outflowBreakdown.leases > 0 ? formatEUR(p.outflowBreakdown.leases) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className={`font-black text-xs ${isDeficit ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {formatEUR(p.closingCash)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {isDeficit ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800">
                              SCOPERTO {formatEUR(Math.abs(p.closingCash))}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {activeTab === 'pnl' && (
              /* TABELLA P&L ECONOMICO */
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Mese</th>
                    <th className="py-3 px-4 text-center">Commesse</th>
                    <th className="py-3 px-4 text-right">Ricavi Budget</th>
                    <th className="py-3 px-4 text-right">Energia / Carb.</th>
                    {showAcciseCol && <th className="py-3 px-4 text-right">Credito Accise</th>}
                    <th className="py-3 px-4 text-right">Canoni Noleggio</th>
                    <th className="py-3 px-4 text-right">Frigo &amp; Accessori</th>
                    <th className="py-3 px-4 text-right">Costi Totali</th>
                    <th className="py-3 px-4 text-right">M.O.L. (€)</th>
                    <th className="py-3 px-4 text-right">M.O.L. (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {monthlyCashFlow.map((m) => {
                    const isNegMol = m.mol < 0;
                    const leaseTotal = m.costBreakdown.vehicleLease + m.costBreakdown.trailerLease;
                    const accessoriesAndFridge = (m.costBreakdown.refrigeration || 0) + (m.costBreakdown.telematics || 0) + (m.costBreakdown.washing || 0) + (m.costBreakdown.extraCosts || 0);

                    return (
                      <tr key={m.monthIndex} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.monthName}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold">
                            {m.activeProjectsCount}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{formatEUR(m.revenue)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatEUR(m.costBreakdown.fuelNet)}</td>
                        {showAcciseCol && (
                          <td className="py-3 px-4 text-right text-emerald-600 font-bold">
                            {m.acciseCredit > 0 ? `-${formatEUR(m.acciseCredit)}` : '-'}
                          </td>
                        )}
                        <td className="py-3 px-4 text-right text-slate-600">{formatEUR(leaseTotal)}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{accessoriesAndFridge > 0 ? formatEUR(accessoriesAndFridge) : '-'}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-800">{formatEUR(m.cost)}</td>
                        <td className="py-3 px-4 text-right font-black">
                          <span className={isNegMol ? 'text-rose-600' : 'text-emerald-600'}>
                            {formatEUR(m.mol)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
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
                    <td className="py-3.5 px-4">TOTALE ANNUO P&amp;L</td>
                    <td className="py-3.5 px-4 text-center">-</td>
                    <td className="py-3.5 px-4 text-right text-emerald-400">{formatEUR(annualRevenue)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-200">{formatEUR(annualColumnTotals.pnlFuelNet)}</td>
                    {showAcciseCol && (
                      <td className="py-3.5 px-4 text-right text-emerald-300">-{formatEUR(annualAcciseCredit)}</td>
                    )}
                    <td className="py-3.5 px-4 text-right text-slate-200">{formatEUR(annualColumnTotals.pnlLeases)}</td>
                    <td className="py-3.5 px-4 text-right text-slate-200">{formatEUR(annualColumnTotals.pnlAccAndFridge)}</td>
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
            <h4>Come interpretare i disallineamenti di cassa in FOUR:</h4>
          </div>
          <p className="leading-relaxed">
            I grandi clienti (Decathlon, Camst, BRT, K&N) pagano a <strong>60-90 giorni</strong> (DSO), mentre i noleggi escono il <strong>10 o 30 del mese</strong>, il carburante LNG a <strong>30 gg quindicinale</strong> (15 e 30 del mese succ.) e il Telepass a <strong>15 gg quindicinale</strong> (30 del mese e 15 del mese succ.).
          </p>
          <p className="leading-relaxed font-semibold">
            La vista quindicinale permette di vedere esattamente in quale giorno del mese il conto rischia di andare in rosso, permettendo alla direzione di FOUR di calibrare il fido bancario o anticipare le fatture prima del giorno 10 o 15.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CashFlowPage;
