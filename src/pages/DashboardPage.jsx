import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import storageService from '../services/storageService';
import {
  calculateAnnualBudgetAndCashFlow,
  calculateSingleProjectMetrics,
  formatEUR,
  formatPercent,
  OPERATING_UNITS,
  getProjectOperatingUnit
} from '../utils/cashFlowCalculations';
import {
  LayoutDashboard,
  Truck,
  Briefcase,
  TrendingUp,
  Calculator,
  Leaf,
  AlertTriangle,
  ArrowRight,
  Plus,
  Zap,
  Flame,
  CheckCircle2,
  Clock,
  DollarSign,
  PieChart as PieIcon,
  BarChart3,
  ShieldAlert,
  Calendar,
  Layers,
  Sparkles,
  Filter,
  Wallet,
  Activity,
  ArrowUpDown,
  GripVertical,
  MapPin
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [fleet, setFleet] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [portfolioScope, setPortfolioScope] = useState('consolidated'); // 'consolidated' | 'activeOnly' | 'potentialOnly'
  const [dashboardSortBy, setDashboardSortBy] = useState(() => localStorage.getItem('four_dashboard_sort_by') || 'custom');
  const [dashboardHubFilter, setDashboardHubFilter] = useState('all');
  const [draggedProjectId, setDraggedProjectId] = useState(null);

  useEffect(() => {
    setFleet(storageService.getFleet());
    setProjects(storageService.getProjects());
  }, []);

  const handleMoveDashboardProject = (projectId, direction) => {
    const currentIndex = projects.findIndex(p => p.id === projectId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= projects.length) return;

    const newProjects = [...projects];
    const [moved] = newProjects.splice(currentIndex, 1);
    newProjects.splice(targetIndex, 0, moved);

    storageService.saveProjects(newProjects);
    setProjects(newProjects);
  };

  const handleDashboardDrop = (e, targetProjectId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedProjectId;
    setDraggedProjectId(null);
    if (!sourceId || sourceId === targetProjectId) return;

    const sourceIndex = projects.findIndex(p => p.id === sourceId);
    const targetIndex = projects.findIndex(p => p.id === targetProjectId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const newProjects = [...projects];
    const [moved] = newProjects.splice(sourceIndex, 1);
    newProjects.splice(targetIndex, 0, moved);

    storageService.saveProjects(newProjects);
    setProjects(newProjects);
  };

  // Riconosce le commesse in trattativa / simulazione / potenziale
  const isPotentialProject = (p) => {
    if (!p) return false;
    if (p.contractStatus) {
      return p.contractStatus === 'potential' || p.contractStatus === 'simulation' || p.contractStatus === 'negotiation';
    }
    if (p.isPipelineFuture !== undefined) return Boolean(p.isPipelineFuture);
    if (p.code && (p.code.startsWith('SIM-') || p.code.startsWith('PRJ-FUT'))) return true;
    if (p.notes && (p.notes.toLowerCase().includes('preventivo') || p.notes.toLowerCase().includes('trattativa') || p.notes.toLowerCase().includes('simulazione'))) return true;
    return false;
  };

  // Suddivisione Status Quo (operative) vs Trattative Pipeline
  const statusQuoProjects = useMemo(() => projects.filter(p => !isPotentialProject(p)), [projects]);
  const potentialProjects = useMemo(() => projects.filter(p => isPotentialProject(p)), [projects]);

  // Commesse effettive in base al perimetro selezionato dall'utente
  const effectiveProjects = useMemo(() => {
    if (portfolioScope === 'activeOnly') {
      return statusQuoProjects;
    }
    if (portfolioScope === 'potentialOnly') {
      return potentialProjects;
    }
    return projects; // 'consolidated' = tutto il portfolio
  }, [projects, statusQuoProjects, potentialProjects, portfolioScope]);

  // Modello Finanziario & Cash Flow dinamico sul perimetro e anno selezionati
  const financialModel = useMemo(() => {
    // Per le sole trattative isolate, calcola il fabbisogno senza il saldo cassa iniziale aziendale per visualizzare il fabbisogno netto
    const initialCash = portfolioScope === 'potentialOnly' ? 0 : 30000;
    return calculateAnnualBudgetAndCashFlow(effectiveProjects, {
      year: selectedYear,
      initialCashBalance: initialCash
    });
  }, [effectiveProjects, selectedYear, portfolioScope]);

  // Modelli pluriennali per confronto strategico (anch'essi dinamici sul perimetro selezionato)
  const model2025 = useMemo(() => calculateAnnualBudgetAndCashFlow(effectiveProjects, { year: 2025, rolloverPreviousYearBudget: false }), [effectiveProjects]);
  const model2026 = useMemo(() => calculateAnnualBudgetAndCashFlow(effectiveProjects, { year: 2026, rolloverPreviousYearBudget: false }), [effectiveProjects]);
  const model2027 = useMemo(() => calculateAnnualBudgetAndCashFlow(effectiveProjects, { year: 2027, rolloverPreviousYearBudget: true }), [effectiveProjects]);

  const {
    annualRevenue,
    annualCost,
    annualMol,
    annualMolPercent,
    peakFinancingRequired,
    peakDeficitMonth,
    co2SavedKg,
    monthlyCashFlow
  } = financialModel;

  // Medie Mensili calcolate sull'anno selezionato:
  const monthlyRevenueAvg = annualRevenue > 0 ? annualRevenue / 12 : 0;
  const monthlyCostAvg = annualCost > 0 ? annualCost / 12 : 0;
  const monthlyMolAvg = annualMol !== 0 ? annualMol / 12 : 0;

  // Valori contrattuali a regime mensile per le commesse visualizzate
  const regimeRevenueMonth = useMemo(() => effectiveProjects.reduce((sum, p) => sum + (Number(p.monthlyRevenue) || 0), 0), [effectiveProjects]);
  const regimeCostMonth = useMemo(() => effectiveProjects.reduce((sum, p) => sum + (Number(p.monthlyCost) || 0), 0), [effectiveProjects]);
  const regimeMolMonth = regimeRevenueMonth - regimeCostMonth;
  const regimeMolPercent = regimeRevenueMonth > 0 ? (regimeMolMonth / regimeRevenueMonth) * 100 : 0;

  // Fabbisogno Capitale Circolante / Gap cassa a regime (coerente con Commesse e Cash Flow)
  const workingCapitalGap = useMemo(() => {
    return effectiveProjects.reduce((sum, p) => {
      const m = calculateSingleProjectMetrics(p);
      return sum + (m.estimatedWorkingCapitalGap || 0);
    }, 0);
  }, [effectiveProjects]);

  // Statistiche di confronto per la Visione Strategica di Portafoglio
  const statusQuoRevenueMonth = useMemo(() => statusQuoProjects.reduce((sum, p) => sum + (Number(p.monthlyRevenue) || 0), 0), [statusQuoProjects]);
  const statusQuoCostMonth = useMemo(() => statusQuoProjects.reduce((sum, p) => sum + (Number(p.monthlyCost) || 0), 0), [statusQuoProjects]);
  const statusQuoMolMonth = statusQuoRevenueMonth - statusQuoCostMonth;
  const statusQuoMolPct = statusQuoRevenueMonth > 0 ? (statusQuoMolMonth / statusQuoRevenueMonth) * 100 : 0;

  const potentialRevenueMonth = useMemo(() => potentialProjects.reduce((sum, p) => sum + (Number(p.monthlyRevenue) || 0), 0), [potentialProjects]);
  const potentialCostMonth = useMemo(() => potentialProjects.reduce((sum, p) => sum + (Number(p.monthlyCost) || 0), 0), [potentialProjects]);
  const potentialMolMonth = potentialRevenueMonth - potentialCostMonth;
  const potentialMolPct = potentialRevenueMonth > 0 ? (potentialMolMonth / potentialRevenueMonth) * 100 : 0;

  const combinedRevenueMonth = statusQuoRevenueMonth + potentialRevenueMonth;
  const combinedCostMonth = statusQuoCostMonth + potentialCostMonth;
  const combinedMolMonth = combinedRevenueMonth - combinedCostMonth;
  const combinedMolPct = combinedRevenueMonth > 0 ? (combinedMolMonth / combinedRevenueMonth) * 100 : 0;

  // Statistiche Flotta dinamiche sul perimetro selezionato
  const totalVehicles = fleet.length;
  const assignedVehicleIdsInScope = useMemo(() => {
    return new Set(effectiveProjects.map(p => p.vehicleId).filter(Boolean));
  }, [effectiveProjects]);
  const assignedVehiclesCount = assignedVehicleIdsInScope.size;
  const utilizationRate = totalVehicles > 0 ? ((assignedVehiclesCount / totalVehicles) * 100).toFixed(0) : 0;

  // Commesse con alert (margine < 10% o negativo) nel perimetro selezionato
  const alertProjects = useMemo(() => {
    return effectiveProjects.filter(p => (p.molPercent || 0) < 10);
  }, [effectiveProjects]);

  // Dati per Grafico Top Commesse per M.O.L. Mensile
  const topProjectsData = useMemo(() => {
    return [...effectiveProjects]
      .sort((a, b) => (b.monthlyMol || 0) - (a.monthlyMol || 0))
      .slice(0, 6)
      .map(p => ({
        name: p.name.length > 22 ? p.name.substring(0, 20) + '...' : p.name,
        fullName: p.name,
        Ricavo: Math.round(p.monthlyRevenue || 0),
        Costo: Math.round(p.monthlyCost || 0),
        MOL: Math.round(p.monthlyMol || 0)
      }));
  }, [effectiveProjects]);

  // Dati per Grafico Breakdown Costi Annuali
  const annualCostBreakdown = useMemo(() => {
    return monthlyCashFlow.reduce((acc, m) => {
      acc.driver += m.costBreakdown.driver;
      acc.fuel += (m.costBreakdown.fuelNet !== undefined ? m.costBreakdown.fuelNet : (m.costBreakdown.fuel || 0));
      acc.tolls += m.costBreakdown.tolls;
      acc.tires += m.costBreakdown.tires;
      acc.leases += (m.costBreakdown.vehicleLease + m.costBreakdown.trailerLease);
      acc.refrigeration += (m.costBreakdown.refrigeration || 0);
      acc.accessories += (m.costBreakdown.telematics || 0) + (m.costBreakdown.washing || 0) + (m.costBreakdown.extraCosts || 0) + (m.costBreakdown.otherCosts || 0);
      acc.partner += m.costBreakdown.partnerMargin;
      acc.porterage += (m.costBreakdown.porterage || 0);
      return acc;
    }, { driver: 0, fuel: 0, tolls: 0, tires: 0, leases: 0, refrigeration: 0, accessories: 0, partner: 0, porterage: 0 });
  }, [monthlyCashFlow]);

  const pieData = [
    { name: 'Autisti & Personale', value: Math.round(annualCostBreakdown.driver), color: '#3b82f6' },
    { name: 'Canoni Noleggio Mezzi', value: Math.round(annualCostBreakdown.leases), color: '#8b5cf6' },
    { name: 'Energia / Carburante', value: Math.round(annualCostBreakdown.fuel), color: '#10b981' },
    { name: 'Refrigerazione Frigo', value: Math.round(annualCostBreakdown.refrigeration), color: '#06b6d4' },
    { name: 'Autostrada & Pedaggi', value: Math.round(annualCostBreakdown.tolls), color: '#f59e0b' },
    { name: 'Gomme & Manutenz.', value: Math.round(annualCostBreakdown.tires), color: '#64748b' },
    { name: 'Telematica, Lavaggi & Extra', value: Math.round(annualCostBreakdown.accessories), color: '#6366f1' },
    { name: 'Facchinaggio', value: Math.round(annualCostBreakdown.porterage), color: '#a855f7' },
    { name: 'Margine Terzisti', value: Math.round(annualCostBreakdown.partner), color: '#ec4899' }
  ].filter(item => item.value > 0);

  // Commesse per la tabella rapida della dashboard con ordinamento e filtro per Unità Operativa
  const displayDashboardProjects = useMemo(() => {
    let list = [...effectiveProjects];

    if (dashboardHubFilter !== 'all') {
      list = list.filter(p => {
        const v = fleet.find(item => item.id === p.vehicleId);
        return getProjectOperatingUnit(p, v) === dashboardHubFilter;
      });
    }

    if (dashboardSortBy === 'operatingUnit') {
      const order = { 'Arborio': 1, 'Buccinasco': 2, 'Landriano': 3, 'Caorso': 4, 'Bologna': 5, 'Altro / Sede': 6 };
      list.sort((a, b) => {
        const vA = fleet.find(item => item.id === a.vehicleId);
        const vB = fleet.find(item => item.id === b.vehicleId);
        const uA = getProjectOperatingUnit(a, vA);
        const uB = getProjectOperatingUnit(b, vB);
        const orderA = order[uA] || 99;
        const orderB = order[uB] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
    } else if (dashboardSortBy === 'client') {
      list.sort((a, b) => (a.client || '').localeCompare(b.client || ''));
    } else if (dashboardSortBy === 'molDesc') {
      list.sort((a, b) => (b.monthlyMol || 0) - (a.monthlyMol || 0));
    } else if (dashboardSortBy === 'revenueDesc') {
      list.sort((a, b) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0));
    }

    return list;
  }, [effectiveProjects, dashboardHubFilter, dashboardSortBy, fleet]);

  const getScopeBadge = () => {
    if (portfolioScope === 'activeOnly') {
      return {
        label: 'Status Quo (Contratti Attivi)',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        count: statusQuoProjects.length
      };
    }
    if (portfolioScope === 'potentialOnly') {
      return {
        label: 'Solo Trattative & Simulazioni',
        color: 'bg-amber-100 text-amber-900 border-amber-300',
        count: potentialProjects.length
      };
    }
    return {
      label: 'Tutto il Portfolio Consolidato',
      color: 'bg-blue-100 text-[#164e87] border-blue-300',
      count: projects.length
    };
  };

  const scopeBadge = getScopeBadge();

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Banner FOUR */}
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl border border-emerald-900/60">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center space-x-2 bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 rounded-full text-emerald-300 text-xs font-bold">
                <Leaf className="w-3.5 h-3.5" />
                <span>Piattaforma Trasporti Sostenibili • FOUR</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                Controllo Costi, Flotta &amp; Forecast Tesoreria
              </h1>
              <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                Gestione completa per budget, forecast e cash flow integrando il parametro dei termini di pagamento
                (incasso 60-90 gg vs fornitori 15-30 gg) e l'anagrafica flotta veicoli elettrici e Bio-LNG.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/projects')}
                className="inline-flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-lg shadow-emerald-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>Nuova Commessa</span>
              </button>

              <button
                onClick={() => navigate('/simulation')}
                className="inline-flex items-center space-x-2 bg-[#164e87] hover:bg-[#0f3b75] text-white px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-lg border border-cyan-400/40"
              >
                <Calculator className="w-4 h-4 text-cyan-300" />
                <span>Simulatore Preventivi</span>
              </button>
            </div>
          </div>
        </div>

        {/* BARRA DI CONTROLLO DINAMICA: SELEZIONE SCENARIO & ANNO BUDGET */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Scenari di Selezione (Totale - Status Quo - Trattative) */}
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-[#164e87]" />
                <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  Filtro Perimetro di Analisi
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  • Ricalcola in tempo reale tutti i valori economici, il M.O.L. e il fabbisogno cassa
                </span>
              </div>

              <div className="inline-flex flex-wrap p-1 bg-slate-100 rounded-xl border border-slate-200 gap-1">
                {/* 1. Totale */}
                <button
                  onClick={() => setPortfolioScope('consolidated')}
                  className={`px-3.5 py-2 rounded-lg font-black text-xs transition flex items-center space-x-2 ${
                    portfolioScope === 'consolidated'
                      ? 'bg-[#164e87] text-white shadow-sm ring-1 ring-blue-900/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  title="Mostra l'intero portafoglio aziendale (commesse attive + trattative simulate)"
                >
                  <span>🌐 Tutto il Portfolio</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    portfolioScope === 'consolidated' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {projects.length}
                  </span>
                </button>

                {/* 2. Status Quo */}
                <button
                  onClick={() => setPortfolioScope('activeOnly')}
                  className={`px-3.5 py-2 rounded-lg font-black text-xs transition flex items-center space-x-2 ${
                    portfolioScope === 'activeOnly'
                      ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-900/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  title="Filtra solo le commesse attive e operative (esclude trattative e simulazioni)"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>🏢 Solo Status Quo</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    portfolioScope === 'activeOnly' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {statusQuoProjects.length}
                  </span>
                </button>

                {/* 3. Trattative */}
                <button
                  onClick={() => setPortfolioScope('potentialOnly')}
                  className={`px-3.5 py-2 rounded-lg font-black text-xs transition flex items-center space-x-2 ${
                    portfolioScope === 'potentialOnly'
                      ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-900/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                  title="Filtra esclusivamente le trattative commerciali e simulazioni in pipeline"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Solo Trattative</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    portfolioScope === 'potentialOnly' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                  }`}>
                    {potentialProjects.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Selettore Anno Budget */}
            <div className="flex items-center space-x-2 self-start lg:self-center">
              <span className="text-xs font-bold text-slate-500 flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Esercizio:
              </span>
              <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  onClick={() => setSelectedYear(2025)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                    selectedYear === 2025 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  2025 Storico
                </button>
                <button
                  onClick={() => setSelectedYear(2026)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                    selectedYear === 2026 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2026 Corrente
                </button>
                <button
                  onClick={() => setSelectedYear(2027)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                    selectedYear === 2027 ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2027 Proiezione
                </button>
              </div>
            </div>
          </div>

          {/* Banner di stato informativo sul perimetro attivo */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Perimetro selezionato:</span>
              <span className={`px-2.5 py-0.5 rounded-md font-bold text-xs border ${scopeBadge.color}`}>
                {scopeBadge.label} ({scopeBadge.count} commesse)
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">
                Esercizio temporale: <strong className="text-slate-900 font-bold">{selectedYear}</strong>
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Tutti gli indicatori sotto sono ricalcolati dinamicamente sul perimetro selezionato.
            </span>
          </div>
        </div>

        {/* I 4 RIQUADRI ECONOMICI PRINCIPALI RICHIESTI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. FATTURATO TOTALE & MEDIA MENSILE */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:border-blue-300 transition">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  Fatturato Totale ({selectedYear})
                </span>
                <DollarSign className="w-4 h-4 text-[#164e87]" />
              </div>

              <div className="text-2xl lg:text-3xl font-black text-slate-900 mt-2">
                {formatEUR(annualRevenue)}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Valore a budget annuo per {effectiveProjects.length} commesse
              </p>
            </div>

            {/* Riquadro Evidente: Media Mensile */}
            <div className="mt-4 p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold text-[#164e87]">Media Mensile:</span>
                <span className="text-sm font-black text-[#164e87]">{formatEUR(monthlyRevenueAvg)} /m</span>
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 border-t border-blue-100">
                <span>A regime contrattuale:</span>
                <span className="font-semibold text-slate-700">{formatEUR(regimeRevenueMonth)}/m</span>
              </div>
            </div>
          </div>

          {/* 2. COSTI TOTALI & MEDIA MENSILE */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:border-slate-400 transition">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  Costi Totali ({selectedYear})
                </span>
                <Wallet className="w-4 h-4 text-slate-600" />
              </div>

              <div className="text-2xl lg:text-3xl font-black text-slate-900 mt-2">
                {formatEUR(annualCost)}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Costi operativi, personale e canoni noleggio
              </p>
            </div>

            {/* Riquadro Evidente: Media Mensile */}
            <div className="mt-4 p-2.5 bg-slate-100/90 border border-slate-200 rounded-xl space-y-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold text-slate-700">Media Mensile:</span>
                <span className="text-sm font-black text-slate-800">{formatEUR(monthlyCostAvg)} /m</span>
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 border-t border-slate-200/70">
                <span>A regime contrattuale:</span>
                <span className="font-semibold text-slate-700">{formatEUR(regimeCostMonth)}/m</span>
              </div>
            </div>
          </div>

          {/* 3. M.O.L. COMPLESSIVO & MEDIA MENSILE */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:border-emerald-300 transition">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  M.O.L. Complessivo (EBITDA)
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>

              <div className={`text-2xl lg:text-3xl font-black mt-2 ${
                annualMol >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {formatEUR(annualMol)}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Margine operativo lordo annuo previsto
              </p>
            </div>

            {/* Riquadro Evidente: Media Mensile */}
            <div className="mt-4 p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold text-emerald-800">Media Mensile:</span>
                <span className={`text-sm font-black ${annualMolAvg >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {formatEUR(monthlyMolAvg)} /m
                </span>
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 border-t border-emerald-100">
                <span>A regime contrattuale:</span>
                <span className="font-semibold text-slate-700">{formatEUR(regimeMolMonth)}/m</span>
              </div>
            </div>
          </div>

          {/* 4. MARGINALITÀ PERCENTUALE COMPLESSIVA */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:border-teal-300 transition">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  Marginalità % Complessiva
                </span>
                <Activity className="w-4 h-4 text-teal-600" />
              </div>

              <div className="flex items-baseline justify-between mt-2">
                <span className={`text-2xl lg:text-3xl font-black ${
                  annualMolPercent >= 20 ? 'text-emerald-600' : annualMolPercent >= 12 ? 'text-teal-600' : 'text-amber-600'
                }`}>
                  {formatPercent(annualMolPercent)}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  annualMolPercent >= 20
                    ? 'bg-emerald-100 text-emerald-800'
                    : annualMolPercent >= 12
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {annualMolPercent >= 20 ? 'Target Ottimo' : annualMolPercent >= 12 ? 'In Target' : 'Sotto Target'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Calcolata sul fatturato delle commesse selezionate
              </p>
            </div>

            {/* Riquadro Evidente: Marginalità a Regime e Dettagli */}
            <div className="mt-4 p-2.5 bg-teal-50/70 border border-teal-200/80 rounded-xl space-y-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold text-teal-800">Margine a Regime:</span>
                <span className="text-sm font-black text-teal-800">{formatPercent(regimeMolPercent)}</span>
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 border-t border-teal-100">
                <span>Rapporto MOL / Ricavi:</span>
                <span className="font-semibold text-slate-700">
                  {annualRevenue > 0 ? (annualMol / annualRevenue * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGA SECONDARIA: FABBISOGNO CASSA, FLOTTA E SOSTENIBILITÀ (RICALCOLATI SUL PERIMETRO) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card A: Fabbisogno Cassa Circolante */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Capitale Circolante (Gap Cassa)
              </span>
              <div className="text-xl font-black text-amber-700">
                {formatEUR(workingCapitalGap)}
              </div>
              <p className="text-[11px] text-slate-500">
                Picco tesoreria: <strong className="text-slate-800">{formatEUR(peakFinancingRequired)}</strong> ({peakDeficitMonth})
              </p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Card B: Flotta Mezzi Impegnata */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Flotta Mezzi Impegnata
              </span>
              <div className="text-xl font-black text-blue-600">
                {assignedVehiclesCount} / {totalVehicles} Mezzi
              </div>
              <p className="text-[11px] text-slate-500">
                Tasso di impiego nel perimetro: <strong className="text-slate-800">{utilizationRate}%</strong>
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-600">
              <Truck className="w-5 h-5" />
            </div>
          </div>

          {/* Card C: Sostenibilità Green & CO2 */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                CO2 Risparmiata Stimata
              </span>
              <div className="text-xl font-black text-emerald-700">
                {(co2SavedKg / 1000).toFixed(1)} t
              </div>
              <p className="text-[11px] text-slate-500">
                Rispetto a motorizzazioni diesel standard
              </p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-600">
              <Leaf className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* SEZIONE CONFRONTO PLURIENNALE DI BUDGET (2025 - 2026 - 2027) */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Proiezione Strategica Pluriennale (2025 Storico • 2026 Corrente • 2027 Anno Successivo)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ricalcolata dinamicamente sul perimetro selezionato (<span className="font-bold text-slate-700">{scopeBadge.label}</span>)
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-slate-500">Esercizio attivo:</span>
              <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300">
                Anno {selectedYear}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* 2025 Storico */}
            <div
              onClick={() => setSelectedYear(2025)}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedYear === 2025
                  ? 'bg-slate-50 border-slate-900 ring-2 ring-slate-900 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500 tracking-wider">2025 Storico</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Consuntivo
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ricavi Totali:</span>
                  <span className="font-bold text-slate-800">{formatEUR(model2025.annualRevenue)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Media Mensile:</span>
                  <span>{formatEUR(model2025.annualRevenue / 12)}/m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Costi Operativi:</span>
                  <span className="font-medium text-slate-600">{formatEUR(model2025.annualCost)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100 font-black">
                  <span className="text-slate-700">M.O.L. Annuo:</span>
                  <span className="text-slate-800">{formatEUR(model2025.annualMol)} ({formatPercent(model2025.annualMolPercent)})</span>
                </div>
              </div>
            </div>

            {/* 2026 Budget Corrente */}
            <div
              onClick={() => setSelectedYear(2026)}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedYear === 2026
                  ? 'bg-emerald-50/50 border-emerald-600 ring-2 ring-emerald-600 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-800 tracking-wider">2026 Budget</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Esercizio Corrente
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ricavi Totali:</span>
                  <span className="font-bold text-slate-900">{formatEUR(model2026.annualRevenue)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Media Mensile:</span>
                  <span>{formatEUR(model2026.annualRevenue / 12)}/m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Costi Operativi:</span>
                  <span className="font-medium text-slate-700">{formatEUR(model2026.annualCost)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100 font-black">
                  <span className="text-emerald-700">M.O.L. Annuo:</span>
                  <span className="text-emerald-700">{formatEUR(model2026.annualMol)} ({formatPercent(model2026.annualMolPercent)})</span>
                </div>
              </div>
            </div>

            {/* 2027 Proiezione Anno Successivo */}
            <div
              onClick={() => setSelectedYear(2027)}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedYear === 2027
                  ? 'bg-teal-50/50 border-teal-600 ring-2 ring-teal-600 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-teal-800 tracking-wider">2027 Proiezione</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                  Anno Successivo
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ricavi Totali:</span>
                  <span className="font-bold text-slate-900">{formatEUR(model2027.annualRevenue)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Media Mensile:</span>
                  <span>{formatEUR(model2027.annualRevenue / 12)}/m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Costi Operativi:</span>
                  <span className="font-medium text-slate-700">{formatEUR(model2027.annualCost)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100 font-black">
                  <span className="text-teal-700">M.O.L. Annuo:</span>
                  <span className="text-teal-700">{formatEUR(model2027.annualMol)} ({formatPercent(model2027.annualMolPercent)})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEZIONE VISIONE STRATEGICA DI PORTAFOGLIO (STATUS QUO VS TRATTATIVE) */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-[#164e87]/10 text-[#164e87] rounded-xl border border-[#164e87]/20">
                  <Layers className="w-5 h-5" />
                </span>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Visione Strategica di Portafoglio (Status Quo vs Trattative Pipeline)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Clicca su uno dei 3 scenari per attivarlo come filtro immediato sulla dashboard
              </p>
            </div>
            <Link
              to="/projects"
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-[#164e87] hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition"
            >
              <span>Gestisci &amp; Simula in Commesse</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* 1. Status Quo */}
            <div
              onClick={() => setPortfolioScope('activeOnly')}
              className={`rounded-xl p-4 border cursor-pointer transition flex flex-col justify-between ${
                portfolioScope === 'activeOnly'
                  ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500 shadow-md'
                  : 'bg-slate-50/70 border-emerald-300 hover:border-emerald-400'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                    <span className="text-xs font-black uppercase text-emerald-800 tracking-wider">Status Quo Operativo</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {portfolioScope === 'activeOnly' && (
                      <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                        Attivo
                      </span>
                    )}
                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                      {statusQuoProjects.length} Commesse
                    </span>
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {formatEUR(statusQuoRevenueMonth)}/m
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Fatturato mensile contratti attivi ({formatEUR(statusQuoRevenueMonth * 12)}/anno)
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Costi Mensili:</span>
                  <span className="font-medium text-slate-700">{formatEUR(statusQuoCostMonth)}/m</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/80 font-black">
                  <span className="text-emerald-700">M.O.L. Mensile:</span>
                  <span className="text-emerald-700">{formatEUR(statusQuoMolMonth)} ({formatPercent(statusQuoMolPct)})</span>
                </div>
              </div>
            </div>

            {/* 2. Pipeline Trattative */}
            <div
              onClick={() => setPortfolioScope('potentialOnly')}
              className={`rounded-xl p-4 border cursor-pointer transition flex flex-col justify-between ${
                portfolioScope === 'potentialOnly'
                  ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500 shadow-md'
                  : 'bg-slate-50/70 border-amber-300 hover:border-amber-400'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-black uppercase text-amber-900 tracking-wider">Nuove Trattative (What-If)</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {portfolioScope === 'potentialOnly' && (
                      <span className="text-[10px] font-black bg-amber-600 text-white px-2 py-0.5 rounded-full">
                        Attivo
                      </span>
                    )}
                    <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                      +{potentialProjects.length} Pipeline
                    </span>
                  </div>
                </div>
                <div className="text-2xl font-black text-[#164e87] mt-1">
                  +{formatEUR(potentialRevenueMonth)}/m
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Potenziale incremento fatturato mensile (+{formatEUR(potentialRevenueMonth * 12)}/anno)
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Costi Addizionali:</span>
                  <span className="font-medium text-slate-700">+{formatEUR(potentialCostMonth)}/m</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/80 font-black">
                  <span className="text-amber-800">Delta M.O.L. Atteso:</span>
                  <span className="text-amber-800">+{formatEUR(potentialMolMonth)} ({formatPercent(potentialMolPct)})</span>
                </div>
              </div>
            </div>

            {/* 3. Proiezione a Regime Totale */}
            <div
              onClick={() => setPortfolioScope('consolidated')}
              className={`rounded-xl p-4 border cursor-pointer transition flex flex-col justify-between ${
                portfolioScope === 'consolidated'
                  ? 'bg-blue-50/80 border-[#164e87] ring-2 ring-[#164e87] shadow-md'
                  : 'bg-gradient-to-br from-blue-50/70 to-slate-50 border-blue-300 hover:border-blue-400'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#164e87]" />
                    <span className="text-xs font-black uppercase text-[#164e87] tracking-wider">Scenario a Regime Totale</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {portfolioScope === 'consolidated' && (
                      <span className="text-[10px] font-black bg-[#164e87] text-white px-2 py-0.5 rounded-full">
                        Attivo
                      </span>
                    )}
                    <span className="text-[10px] font-black bg-[#164e87]/15 text-[#164e87] px-2 py-0.5 rounded-full border border-blue-300">
                      {projects.length} Totali
                    </span>
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {formatEUR(combinedRevenueMonth)}/m
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Fatturato a regime consolidato ({formatEUR(combinedRevenueMonth * 12)}/anno)
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-blue-200/80 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Costi Totali:</span>
                  <span className="font-medium text-slate-800">{formatEUR(combinedCostMonth)}/m</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-blue-200/80 font-black">
                  <span className="text-[#164e87]">M.O.L. Globale:</span>
                  <span className="text-emerald-700">{formatEUR(combinedMolMonth)} ({formatPercent(combinedMolPct)})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEZIONE ALERT & CASH FLOW QUICK WIDGET (RICALCOLATI SUL PERIMETRO) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Fabbisogno Cassa Spotlight */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  Termini di Pagamento &amp; Circolante
                </span>
                <span className="text-xs font-bold text-amber-800">
                  {portfolioScope === 'potentialOnly' ? 'Fabbisogno Trattative' : 'DSO 60 gg / DPO 30 gg'}
                </span>
              </div>

              <div>
                <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Fabbisogno Cassa Circolante Stimato
                </span>
                <div className="text-3xl font-black text-amber-900 mt-1">
                  {formatEUR(workingCapitalGap)}
                </div>
                <p className="text-xs text-amber-800 mt-1">
                  Picco di tesoreria da flussi: <strong>{formatEUR(peakFinancingRequired)}</strong> (mese di <strong>{peakDeficitMonth}</strong>).
                </p>
              </div>

              <div className="p-3 bg-white/80 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1">
                <p className="font-semibold">
                  {portfolioScope === 'potentialOnly'
                    ? 'Liquidità necessaria per le nuove trattative:'
                    : 'Perché serve questa anticipazione?'}
                </p>
                <p className="text-slate-600 text-[11px]">
                  {portfolioScope === 'potentialOnly'
                    ? `L'avvio delle ${potentialProjects.length} commesse simulate richiederà un'anticipazione di cassa per stipendi e fornitori pari a ${formatEUR(workingCapitalGap)} prima dei primi incassi a 60 gg.`
                    : 'FOUR deve anticipare 2 mensilità di salari, energia e noleggi prima che i committenti saldino a 60 gg d.f.f.m.'}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-200/60">
              <Link
                to="/cashflow"
                className="w-full flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-sm"
              >
                <span>Apri Piano di Cassa Completo</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Alert Commesse a Rischio / Margine Basso nello Scope Attivo */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Commesse da Monitorare ({alertProjects.length} Linee sotto target nello scenario)
                  </h3>
                </div>
                <Link to="/projects" className="text-xs text-emerald-700 font-semibold hover:underline">
                  Vedi tutte le commesse
                </Link>
              </div>

              {alertProjects.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-slate-700">Tutte le commesse nel perimetro selezionato sono sopra target!</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Nessuna commessa registra un M.O.L. inferiore al 10%.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {alertProjects.slice(0, 3).map(p => (
                    <div
                      key={p.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        p.monthlyMol < 0
                          ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                          : 'bg-amber-50/70 border-amber-200 text-amber-950'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            p.monthlyMol < 0 ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
                          }`}>
                            MOL {formatPercent(p.molPercent)}
                          </span>
                          {isPotentialProject(p) && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                              Trattativa
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{p.client} • {p.route}</p>
                      </div>

                      <div className="text-right">
                        <div className={`font-black ${p.monthlyMol < 0 ? 'text-rose-600' : 'text-amber-700'}`}>
                          {formatEUR(p.monthlyMol)} / mese
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {p.monthlyMol < 0 ? 'In perdita' : 'Margine stretto'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Suggerimento: rinegoziare tariffa giornaliera o abbinare un secondo viaggio pomeridiano.</span>
            </div>
          </div>
        </div>

        {/* GRAFICI DINAMICI: TOP COMMESSE E BREAKDOWN COSTI SUL PERIMETRO */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Commesse Bar Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Commesse più Profittevoli (M.O.L. Mensile)</h3>
                <p className="text-xs text-slate-500">Margine Operativo Lordo generato al mese (€) nello scenario</p>
              </div>
              <BarChart3 className="w-5 h-5 text-emerald-600" />
            </div>

            <div className="h-64 w-full pt-2">
              {topProjectsData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nessuna commessa presente nello scenario
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProjectsData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" />
                    <YAxis tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(val) => formatEUR(val)}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                    />
                    <Bar dataKey="MOL" name="M.O.L. Mensile" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Breakdown Costi Pie Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ripartizione Costi nello Scenario</h3>
                <p className="text-xs text-slate-500">Composizione delle uscite a budget per categoria</p>
              </div>
              <PieIcon className="w-5 h-5 text-blue-600" />
            </div>

            <div className="h-64 w-full flex items-center justify-center">
              {pieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nessun costo rilevato nello scenario
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => formatEUR(val)}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                    />
                    <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* TABELLA RAPIDA COMMESSE DELLO SCENARIO SELEZIONATO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-[#164e87]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Elenco Commesse nello Scenario ({displayDashboardProjects.length})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Perimetro: <strong className="text-slate-800">{scopeBadge.label}</strong> • Riorganizza liberamente con Drag &amp; Drop o per Unità
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro Unità Operativa */}
              <select
                value={dashboardHubFilter}
                onChange={(e) => setDashboardHubFilter(e.target.value)}
                className="text-xs font-semibold py-1.5 px-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-[#164e87] outline-none cursor-pointer"
              >
                <option value="all">Tutti i Poli / Unità</option>
                {OPERATING_UNITS.map(hub => (
                  <option key={hub} value={hub}>📍 Polo {hub}</option>
                ))}
              </select>

              {/* Selettore Ordinamento */}
              <div className="flex items-center space-x-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#164e87]" />
                <select
                  value={dashboardSortBy}
                  onChange={(e) => {
                    setDashboardSortBy(e.target.value);
                    localStorage.setItem('four_dashboard_sort_by', e.target.value);
                  }}
                  className="text-xs font-bold py-1.5 px-2.5 rounded-xl border border-blue-300 bg-blue-50/60 text-[#164e87] focus:ring-2 focus:ring-[#164e87] outline-none cursor-pointer"
                  title="Ordinamento commesse dashboard"
                >
                  <option value="custom">⇅ Ordine Manuale (Drag &amp; Drop)</option>
                  <option value="operatingUnit">📍 Raggruppa per Unità Operativa</option>
                  <option value="client">🏢 Ordina per Cliente (A-Z)</option>
                  <option value="molDesc">💰 M.O.L. Mensile (dal più alto)</option>
                  <option value="revenueDesc">📈 Fatturato (dal più alto)</option>
                </select>
              </div>

              <Link to="/projects" className="text-xs text-emerald-700 font-bold hover:underline flex items-center ml-1">
                <span>Gestisci tutte in Commesse</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase">
                <tr>
                  <th className="py-2.5 px-2 w-[4%] text-center">Pos.</th>
                  <th className="py-2.5 px-3">Linea / Commessa</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Unità / Polo</th>
                  <th className="py-2.5 px-3">Gestione</th>
                  <th className="py-2.5 px-3 text-right">Ricavo/Mese</th>
                  <th className="py-2.5 px-3 text-right">Costo/Mese</th>
                  <th className="py-2.5 px-3 text-right">M.O.L./Mese</th>
                  <th className="py-2.5 px-3 text-center">Incasso (DSO)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {displayDashboardProjects.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400 text-xs">
                      Nessuna commessa presente nel filtro selezionato.
                    </td>
                  </tr>
                ) : (
                  displayDashboardProjects.slice(0, 12).map((p, idx) => {
                    const isPot = isPotentialProject(p);
                    const veh = fleet.find(item => item.id === p.vehicleId);
                    const hubName = getProjectOperatingUnit(p, veh);

                    return (
                      <tr
                        key={p.id}
                        draggable={dashboardSortBy === 'custom'}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', p.id);
                          setDraggedProjectId(p.id);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDashboardDrop(e, p.id)}
                        className="hover:bg-slate-50 transition group"
                      >
                        {/* Riordino Drag & Drop / Up & Down */}
                        <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {dashboardSortBy === 'custom' ? (
                            <div className="flex items-center justify-center space-x-1">
                              <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 cursor-grab active:cursor-grabbing" title="Trascina riga per riordinare" />
                              <div className="flex flex-col text-[8px] leading-tight text-slate-400">
                                <button
                                  type="button"
                                  onClick={() => handleMoveDashboardProject(p.id, 'up')}
                                  disabled={idx === 0}
                                  className="hover:text-blue-700 hover:bg-slate-200 px-0.5 rounded disabled:opacity-20"
                                  title="Sposta su"
                                >▲</button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveDashboardProject(p.id, 'down')}
                                  disabled={idx === displayDashboardProjects.length - 1}
                                  className="hover:text-blue-700 hover:bg-slate-200 px-0.5 rounded disabled:opacity-20"
                                  title="Sposta giù"
                                >▼</button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono font-bold">
                              {idx + 1}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900">{p.name}</span>
                            {isPot ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                Trattativa
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Attiva
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{p.client}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#164e87] border border-blue-200 flex items-center gap-1 w-fit">
                            <MapPin className="w-2.5 h-2.5 text-blue-600" />
                            <span>{hubName}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.managementType === 'D' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {p.managementType === 'D' ? 'Diretta (D)' : 'Terzi (T)'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatEUR(p.monthlyRevenue)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{formatEUR(p.monthlyCost)}</td>
                        <td className="py-2.5 px-3 text-right font-black">
                          <span className={p.monthlyMol < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {formatEUR(p.monthlyMol)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700 font-semibold">
                          {p.paymentTermsClient || 60} gg
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
