import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import storageService from '../services/storageService';
import {
  calculateAnnualBudgetAndCashFlow,
  calculateSingleProjectMetrics,
  isProjectActiveInMonth,
  getProjectStartYear,
  isPotentialProject,
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
  MapPin,
  ChevronDown,
  ChevronUp,
  AlertCircle
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
  Legend,
  ReferenceLine
} from 'recharts';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => {
    const y = parseInt(searchParams.get('year'), 10);
    return y === 2027 ? 2027 : 2026;
  });
  const [portfolioScope, setPortfolioScope] = useState(() => {
    const s = searchParams.get('scope');
    return ['consolidated', 'activeOnly', 'potentialOnly'].includes(s) ? s : 'consolidated';
  }); // 'consolidated' | 'activeOnly' | 'potentialOnly'
  const [dashboardSortBy, setDashboardSortBy] = useState(() => localStorage.getItem('four_dashboard_sort_by') || 'custom');
  const [dashboardHubFilter, setDashboardHubFilter] = useState('all');
  const [draggedProjectId, setDraggedProjectId] = useState(null);
  const [showProjectsTable, setShowProjectsTable] = useState(false);

  useEffect(() => {
    const refreshDashboardData = () => {
      setFleet(storageService.getFleet());
      setTrailers(storageService.getTrailers());
      setProjects(storageService.getProjects());
      setSettings(storageService.getSettings());
    };
    refreshDashboardData();

    const unsubscribe = storageService.subscribe((event) => {
      if (event.type === 'data') {
        refreshDashboardData();
      }
    });

    // Verifica e applica eventuale aggiornamento settimanale prezzi carburanti "Alla Pompa" da fonti ufficiali
    storageService.refreshWeeklyFuelPricesFromOfficialSources({ force: false }).then(res => {
      if (res && res.updated) {
        refreshDashboardData();
      }
    });

    return () => unsubscribe();
  }, []);

  const handleMoveDashboardProject = (projectId, direction) => {
    const visibleIdx = displayDashboardProjects.findIndex(p => p.id === projectId);
    if (visibleIdx === -1) return;
    const neighborIdx = direction === 'up' ? visibleIdx - 1 : visibleIdx + 1;
    if (neighborIdx < 0 || neighborIdx >= displayDashboardProjects.length) return;
    const neighborId = displayDashboardProjects[neighborIdx].id;

    const currentIndex = projects.findIndex(p => p.id === projectId);
    const targetIndex = projects.findIndex(p => p.id === neighborId);
    if (currentIndex === -1 || targetIndex === -1) return;

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

  // Commesse effettivamente attive in almeno un mese dell'esercizio selezionato
  const activeProjectsInYear = useMemo(() => {
    const rollover = selectedYear > 2026;
    return effectiveProjects.filter(p =>
      Array.from({ length: 12 }, (_, m) =>
        isProjectActiveInMonth(p, m, selectedYear, { rolloverPreviousYearBudget: rollover })
      ).some(Boolean)
    );
  }, [effectiveProjects, selectedYear]);

  const { futureStartCount, expiredInYearCount } = useMemo(() => {
    const activeIds = new Set(activeProjectsInYear.map(p => p.id));
    let future = 0;
    let expired = 0;
    effectiveProjects.forEach(p => {
      if (!activeIds.has(p.id)) {
        if (getProjectStartYear(p) > selectedYear) future++;
        else expired++;
      }
    });
    return { futureStartCount: future, expiredInYearCount: expired };
  }, [effectiveProjects, activeProjectsInYear, selectedYear]);

  // Metriche unitarie per singola commessa ricalcolate sull'anno selezionato (recepisce effectiveDate)
  const metricsById = useMemo(() => {
    const map = {};
    projects.forEach(p => {
      map[p.id] = calculateSingleProjectMetrics(p, { year: selectedYear });
    });
    return map;
  }, [projects, selectedYear]);

  // Modello Finanziario & Cash Flow dinamico sul perimetro e anno selezionati
  const financialModel = useMemo(() => {
    // Per le sole trattative isolate, calcola il fabbisogno senza il saldo cassa iniziale aziendale per visualizzare il fabbisogno netto
    const configuredInitialCash = Number(settings?.financialDefaults?.initialCashBalance ?? 50000);
    const initialCash = portfolioScope === 'potentialOnly' ? 0 : configuredInitialCash;
    return calculateAnnualBudgetAndCashFlow(effectiveProjects, {
      year: selectedYear,
      initialCashBalance: initialCash,
      fleet,
      trailers
    });
  }, [effectiveProjects, selectedYear, portfolioScope, settings, fleet, trailers]);

  // Modelli pluriennali per confronto strategico (dinamici sul perimetro selezionato)
  const model2026 = useMemo(() => calculateAnnualBudgetAndCashFlow(effectiveProjects, { year: 2026, rolloverPreviousYearBudget: false, fleet, trailers }), [effectiveProjects, fleet, trailers]);
  const model2027 = useMemo(() => calculateAnnualBudgetAndCashFlow(effectiveProjects, { year: 2027, rolloverPreviousYearBudget: true, fleet, trailers }), [effectiveProjects, fleet, trailers]);

  const {
    annualRevenue,
    annualCost,
    annualMol,
    annualMolPercent,
    peakFinancingRequired,
    peakDeficitPeriod,
    peakDeficitMonth,
    co2SavedKg,
    activeKmInYear,
    monthlyCashFlow
  } = financialModel;

  // Medie Mensili calcolate sull'anno selezionato:
  const monthlyRevenueAvg = annualRevenue > 0 ? annualRevenue / 12 : 0;
  const monthlyCostAvg = annualCost > 0 ? annualCost / 12 : 0;
  const monthlyMolAvg = annualMol !== 0 ? annualMol / 12 : 0;

  // Valori contrattuali a regime mensile per le commesse attive nell'anno selezionato
  const regimeRevenueMonth = useMemo(() => activeProjectsInYear.reduce((sum, p) => sum + (Number(metricsById[p.id]?.monthlyRevenue ?? p.monthlyRevenue) || 0), 0), [activeProjectsInYear, metricsById]);
  const regimeCostMonth = useMemo(() => activeProjectsInYear.reduce((sum, p) => sum + (Number(metricsById[p.id]?.monthlyCost ?? p.monthlyCost) || 0), 0), [activeProjectsInYear, metricsById]);
  const regimeMolMonth = regimeRevenueMonth - regimeCostMonth;
  const regimeMolPercent = regimeRevenueMonth > 0 ? (regimeMolMonth / regimeRevenueMonth) * 100 : 0;

  // Fabbisogno Capitale Circolante / Gap cassa a regime (allineato alle commesse attive nell'anno)
  const workingCapitalGap = useMemo(() => {
    return activeProjectsInYear.reduce((sum, p) => {
      return sum + (metricsById[p.id]?.estimatedWorkingCapitalGap || 0);
    }, 0);
  }, [activeProjectsInYear, metricsById]);

  // Statistiche di confronto per la Visione Strategica di Portafoglio (allineate a selectedYear)
  const statusQuoProjectsInYear = useMemo(() => {
    const rollover = selectedYear > 2026;
    return statusQuoProjects.filter(p =>
      Array.from({ length: 12 }, (_, m) =>
        isProjectActiveInMonth(p, m, selectedYear, { rolloverPreviousYearBudget: rollover })
      ).some(Boolean)
    );
  }, [statusQuoProjects, selectedYear]);
  const potentialProjectsInYear = useMemo(() => {
    const rollover = selectedYear > 2026;
    return potentialProjects.filter(p =>
      Array.from({ length: 12 }, (_, m) =>
        isProjectActiveInMonth(p, m, selectedYear, { rolloverPreviousYearBudget: rollover })
      ).some(Boolean)
    );
  }, [potentialProjects, selectedYear]);

  const statusQuoRevenueMonth = useMemo(() => statusQuoProjectsInYear.reduce((sum, p) => sum + (Number(metricsById[p.id]?.monthlyRevenue ?? p.monthlyRevenue) || 0), 0), [statusQuoProjectsInYear, metricsById]);
  const statusQuoCostMonth = useMemo(() => statusQuoProjectsInYear.reduce((sum, p) => sum + (Number(metricsById[p.id]?.monthlyCost ?? p.monthlyCost) || 0), 0), [statusQuoProjectsInYear, metricsById]);
  const statusQuoMolMonth = statusQuoRevenueMonth - statusQuoCostMonth;
  const statusQuoMolPct = statusQuoRevenueMonth > 0 ? (statusQuoMolMonth / statusQuoRevenueMonth) * 100 : 0;

  const potentialRevenueMonth = useMemo(() => potentialProjectsInYear.reduce((sum, p) => sum + (Number(metricsById[p.id]?.monthlyRevenue ?? p.monthlyRevenue) || 0), 0), [potentialProjectsInYear, metricsById]);
  const potentialCostMonth = useMemo(() => potentialProjectsInYear.reduce((sum, p) => sum + (Number(metricsById[p.id]?.monthlyCost ?? p.monthlyCost) || 0), 0), [potentialProjectsInYear, metricsById]);
  const potentialMolMonth = potentialRevenueMonth - potentialCostMonth;
  const potentialMolPct = potentialRevenueMonth > 0 ? (potentialMolMonth / potentialRevenueMonth) * 100 : 0;

  const combinedRevenueMonth = statusQuoRevenueMonth + potentialRevenueMonth;
  const combinedCostMonth = statusQuoCostMonth + potentialCostMonth;
  const combinedMolMonth = combinedRevenueMonth - combinedCostMonth;
  const combinedMolPct = combinedRevenueMonth > 0 ? (combinedMolMonth / combinedRevenueMonth) * 100 : 0;
  const totalActiveProjectsAllScopesInYear = statusQuoProjectsInYear.length + potentialProjectsInYear.length;

  // Statistiche Flotta, Rimorchi e Sovrapposizioni dinamiche sull'anno e perimetro selezionati (filtrate su anagrafica esistente)
  const totalVehicles = fleet.length;
  const validFleetIds = useMemo(() => new Set(fleet.map(v => v.id)), [fleet]);
  const assignedVehicleIdsInScope = useMemo(() => {
    return new Set(activeProjectsInYear.map(p => p.vehicleId).filter(id => id && validFleetIds.has(id)));
  }, [activeProjectsInYear, validFleetIds]);
  const assignedVehiclesCount = assignedVehicleIdsInScope.size;
  const freeVehiclesCount = Math.max(0, totalVehicles - assignedVehiclesCount);
  const utilizationRate = totalVehicles > 0 ? Math.min(100, Math.round((assignedVehiclesCount / totalVehicles) * 100)) : 0;

  const totalTrailers = trailers.length;
  const validTrailerIds = useMemo(() => new Set(trailers.map(t => t.id)), [trailers]);
  const assignedTrailersCount = useMemo(() => {
    return new Set(activeProjectsInYear.map(p => p.trailerId).filter(id => id && validTrailerIds.has(id))).size;
  }, [activeProjectsInYear, validTrailerIds]);

  const overlappingVehicles = useMemo(() => {
    const overlapIds = new Set();
    const rollover = selectedYear > 2026;
    for (let m = 0; m < 12; m++) {
      const countsByVehicle = {};
      activeProjectsInYear.forEach(p => {
        if (!p.vehicleId || !validFleetIds.has(p.vehicleId)) return;
        if (isProjectActiveInMonth(p, m, selectedYear, { rolloverPreviousYearBudget: rollover })) {
          countsByVehicle[p.vehicleId] = (countsByVehicle[p.vehicleId] || 0) + 1;
          if (countsByVehicle[p.vehicleId] >= 2) {
            overlapIds.add(p.vehicleId);
          }
        }
      });
    }
    return Array.from(overlapIds);
  }, [activeProjectsInYear, selectedYear, validFleetIds]);

  // Commesse con alert (margine < 15% o negativo) attive nell'anno e perimetro selezionato
  const alertProjects = useMemo(() => {
    return activeProjectsInYear
      .filter(p => ((metricsById[p.id]?.molPercent ?? p.molPercent) || 0) < 15)
      .sort((a, b) => ((metricsById[a.id]?.molPercent ?? a.molPercent) || 0) - ((metricsById[b.id]?.molPercent ?? b.molPercent) || 0));
  }, [activeProjectsInYear, metricsById]);
  const lowOrNegativeCount = alertProjects.length;
  const avgMolPerProject = activeProjectsInYear.length > 0 ? (annualMol / activeProjectsInYear.length) : 0;

  // Dati per Grafico Top Commesse per M.O.L. Mensile (solo attive nell'anno)
  const topProjectsData = useMemo(() => {
    return [...activeProjectsInYear]
      .sort((a, b) => ((metricsById[b.id]?.monthlyMol ?? b.monthlyMol) || 0) - ((metricsById[a.id]?.monthlyMol ?? a.monthlyMol) || 0))
      .slice(0, 6)
      .map(p => {
        const m = metricsById[p.id];
        const safeName = p.name || 'Senza nome';
        return {
          name: safeName.length > 22 ? safeName.substring(0, 20) + '...' : safeName,
          fullName: safeName,
          Ricavo: Math.round(m?.monthlyRevenue ?? p.monthlyRevenue ?? 0),
          Costo: Math.round(m?.monthlyCost ?? p.monthlyCost ?? 0),
          MOL: Math.round(m?.monthlyMol ?? p.monthlyMol ?? 0)
        };
      });
  }, [activeProjectsInYear, metricsById]);

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
      list.sort((a, b) => ((metricsById[b.id]?.monthlyMol ?? b.monthlyMol) || 0) - ((metricsById[a.id]?.monthlyMol ?? a.monthlyMol) || 0));
    } else if (dashboardSortBy === 'revenueDesc') {
      list.sort((a, b) => ((metricsById[b.id]?.monthlyRevenue ?? b.monthlyRevenue) || 0) - ((metricsById[a.id]?.monthlyRevenue ?? a.monthlyRevenue) || 0));
    }

    return list;
  }, [effectiveProjects, dashboardHubFilter, dashboardSortBy, fleet, metricsById]);

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
        {/* Welcome Banner FOUR compatto */}
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-2xl px-5 py-4 text-white shadow-lg border border-emerald-900/60">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center space-x-1.5 bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 rounded-full text-emerald-300 text-[11px] font-bold">
                <Leaf className="w-3 h-3" />
                <span>FOUR • Trasporti Sostenibili</span>
              </div>
              <h1 className="text-lg md:text-xl font-black tracking-tight text-white">
                Controllo Costi, Flotta &amp; Forecast Tesoreria
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => navigate('/projects?new=true')}
                className="inline-flex items-center space-x-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3.5 py-2 rounded-xl font-bold text-xs transition shadow-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuova Commessa</span>
              </button>

              <button
                onClick={() => navigate('/simulation')}
                className="inline-flex items-center space-x-1.5 bg-[#164e87] hover:bg-[#0f3b75] text-white px-3.5 py-2 rounded-xl font-bold text-xs transition shadow-md border border-cyan-400/40"
              >
                <Calculator className="w-3.5 h-3.5 text-cyan-300" />
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-700">Perimetro selezionato:</span>
              <span className={`px-2.5 py-0.5 rounded-md font-bold text-xs border ${scopeBadge.color}`}>
                {scopeBadge.label} ({activeProjectsInYear.length} attive in {selectedYear}{futureStartCount > 0 ? ` • +${futureStartCount} avvio ${selectedYear + 1}+` : ''}{expiredInYearCount > 0 ? ` • ${expiredInYearCount} scadute` : ''})
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">
                Esercizio temporale: <strong className="text-slate-900 font-bold">{selectedYear}</strong>
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Indicatori allineati al perimetro ed esercizio selezionati.
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
                Budget annuo su {activeProjectsInYear.length} commesse attive{futureStartCount > 0 ? ` (+${futureStartCount} avvio ${selectedYear + 1}+)` : ''}{expiredInYearCount > 0 ? ` • ${expiredInYearCount} scadute` : ''}
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
                <span className={`text-sm font-black ${monthlyMolAvg >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
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
                  annualRevenue === 0
                    ? 'text-slate-400'
                    : annualMolPercent >= 20
                      ? 'text-emerald-600'
                      : annualMolPercent >= 15
                        ? 'text-teal-600'
                        : annualMolPercent >= 0
                          ? 'text-amber-600'
                          : 'text-rose-600'
                }`}>
                  {annualRevenue === 0 ? 'N/D' : formatPercent(annualMolPercent)}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  annualRevenue === 0
                    ? 'bg-slate-100 text-slate-600'
                    : annualMolPercent >= 20
                      ? 'bg-emerald-100 text-emerald-800'
                      : annualMolPercent >= 15
                        ? 'bg-teal-100 text-teal-800'
                        : annualMolPercent >= 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                }`}>
                  {annualRevenue === 0
                    ? 'Nessun Ricavo'
                    : annualMolPercent >= 20
                      ? 'Target Ottimo'
                      : annualMolPercent >= 15
                        ? 'In Target'
                        : annualMolPercent >= 0
                          ? 'Sotto Target'
                          : 'In Perdita'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Calcolata sul fatturato delle commesse selezionate
              </p>
            </div>

            {/* Riquadro Evidente: Commesse sotto soglia & MOL Medio */}
            <div className="mt-4 p-2.5 bg-teal-50/70 border border-teal-200/80 rounded-xl space-y-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold text-teal-800">Commesse &lt; 15% MOL:</span>
                <span className={`text-sm font-black ${lowOrNegativeCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {lowOrNegativeCount} / {activeProjectsInYear.length}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 border-t border-teal-100">
                <span>M.O.L. medio/commessa ({selectedYear}):</span>
                <span className="font-semibold text-slate-700">
                  {formatEUR(avgMolPerProject)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGA SECONDARIA: FABBISOGNO CASSA, FLOTTA E SOSTENIBILITÀ (RICALCOLATI SUL PERIMETRO) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card A: Fabbisogno Cassa Circolante -> link a /cashflow */}
          <Link
            to={`/cashflow?year=${selectedYear}&scope=${portfolioScope}`}
            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-amber-400 hover:shadow-md transition flex items-center justify-between group"
          >
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span>Capitale Circolante (Gap Cassa)</span>
                <ArrowRight className="w-3 h-3 text-amber-600 opacity-0 group-hover:opacity-100 transition" />
              </span>
              <div className="text-xl font-black text-amber-700">
                {formatEUR(workingCapitalGap)}
              </div>
              <p className="text-[11px] text-slate-500">
                Picco tesoreria {selectedYear}:{' '}
                {peakFinancingRequired > 0 ? (
                  <>
                    <strong className="text-rose-700">{formatEUR(peakFinancingRequired)}</strong> ({peakDeficitPeriod || peakDeficitMonth})
                  </>
                ) : (
                  <strong className="text-emerald-700">Nessun deficit</strong>
                )}
              </p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </Link>

          {/* Card B: Flotta Mezzi, Rimorchi & Alert Sovrapposizioni -> link a /fleet */}
          <Link
            to="/fleet"
            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition flex items-center justify-between group"
          >
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span>Flotta Mezzi Impegnata</span>
                <ArrowRight className="w-3 h-3 text-blue-600 opacity-0 group-hover:opacity-100 transition" />
              </span>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xl font-black text-blue-600">
                  {assignedVehiclesCount} / {totalVehicles} Mezzi
                </span>
                <span className="text-xs font-bold text-slate-500">
                  • {assignedTrailersCount} / {totalTrailers} Rimorchi
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>
                  Impiego: <strong className="text-slate-800">{utilizationRate}%</strong> ({freeVehiclesCount} liberi)
                </span>
                {overlappingVehicles.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10px]">
                    <AlertCircle className="w-3 h-3" />
                    <span>{overlappingVehicles.length} {overlappingVehicles.length === 1 ? 'mezzo su più linee' : 'mezzi su più linee'}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-600">
              <Truck className="w-5 h-5" />
            </div>
          </Link>

          {/* Card C: Sostenibilità Green & CO2 */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                CO2 Risparmiata ({selectedYear})
              </span>
              <div className="text-xl font-black text-emerald-700">
                {(co2SavedKg / 1000).toFixed(1)} t
              </div>
              <p className="text-[11px] text-slate-500">
                Su {(activeKmInYear || 0).toLocaleString('it-IT')} km green/anno effettivi vs diesel
              </p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-600">
              <Leaf className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* SEZIONE CONFRONTO PLURIENNALE DI BUDGET (2026 - 2027) */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Proiezione Strategica Pluriennale (2026 Corrente vs 2027 Anno Successivo)
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
                  <span className={model2026.annualMol >= 0 ? 'text-emerald-700' : 'text-rose-600'}>M.O.L. Annuo:</span>
                  <span className={model2026.annualMol >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                    {formatEUR(model2026.annualMol)} ({formatPercent(model2026.annualMolPercent)})
                  </span>
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
                <div className="flex items-center gap-1.5">
                  {model2026.annualRevenue > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-[#164e87]">
                      Delta {model2027.annualRevenue - model2026.annualRevenue >= 0 ? '+' : ''}
                      {formatEUR(model2027.annualRevenue - model2026.annualRevenue)} ({((model2027.annualRevenue - model2026.annualRevenue) / model2026.annualRevenue * 100).toFixed(1)}%)
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                    Anno Successivo
                  </span>
                </div>
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
                  <span className={model2027.annualMol >= 0 ? 'text-teal-700' : 'text-rose-600'}>M.O.L. Annuo:</span>
                  <span className={model2027.annualMol >= 0 ? 'text-teal-700' : 'text-rose-600'}>
                    {formatEUR(model2027.annualMol)} ({formatPercent(model2027.annualMolPercent)})
                  </span>
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
                      {statusQuoProjectsInYear.length} Attive ({selectedYear})
                    </span>
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {formatEUR(statusQuoRevenueMonth)}/m
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Fatturato mensile contratti attivi {selectedYear} ({formatEUR(statusQuoRevenueMonth * 12)}/anno a regime 12m)
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Costi Mensili:</span>
                  <span className="font-medium text-slate-700">{formatEUR(statusQuoCostMonth)}/m</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/80 font-black">
                  <span className={statusQuoMolMonth >= 0 ? 'text-emerald-700' : 'text-rose-600'}>M.O.L. Mensile:</span>
                  <span className={statusQuoMolMonth >= 0 ? 'text-emerald-700' : 'text-rose-600'}>{formatEUR(statusQuoMolMonth)} ({formatPercent(statusQuoMolPct)})</span>
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
                      +{potentialProjectsInYear.length} in {selectedYear}{potentialProjects.length > potentialProjectsInYear.length ? ` (+${potentialProjects.length - potentialProjectsInYear.length} dal ${selectedYear + 1})` : ''}
                    </span>
                  </div>
                </div>
                <div className="text-2xl font-black text-[#164e87] mt-1">
                  +{formatEUR(potentialRevenueMonth)}/m
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Potenziale incremento mensile {selectedYear} (+{formatEUR(potentialRevenueMonth * 12)}/anno a regime 12m)
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Costi Addizionali:</span>
                  <span className="font-medium text-slate-700">+{formatEUR(potentialCostMonth)}/m</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/80 font-black">
                  <span className={potentialMolMonth >= 0 ? 'text-amber-800' : 'text-rose-600'}>Delta M.O.L. Atteso:</span>
                  <span className={potentialMolMonth >= 0 ? 'text-amber-800' : 'text-rose-600'}>
                    {potentialMolMonth >= 0 ? '+' : ''}{formatEUR(potentialMolMonth)} ({formatPercent(potentialMolPct)})
                  </span>
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
                      {totalActiveProjectsAllScopesInYear} Attive ({selectedYear})
                    </span>
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {formatEUR(combinedRevenueMonth)}/m
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Regime consolidato {selectedYear} ({formatEUR(combinedRevenueMonth * 12)}/anno a regime 12m)
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-blue-200/80 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Costi Totali:</span>
                  <span className="font-medium text-slate-800">{formatEUR(combinedCostMonth)}/m</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-blue-200/80 font-black">
                  <span className="text-[#164e87]">M.O.L. Globale:</span>
                  <span className={combinedMolMonth >= 0 ? 'text-emerald-700' : 'text-rose-600'}>{formatEUR(combinedMolMonth)} ({formatPercent(combinedMolPct)})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEZIONE ALERT COMMESSE DA MONITORARE (FULL-WIDTH, CLICKABLE) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Commesse da Monitorare ({alertProjects.length} Linee sotto target &lt; 15% MOL in {selectedYear})
                </h3>
              </div>
              <Link to="/projects" className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1">
                <span>Vedi tutte le commesse</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {alertProjects.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-slate-700">Tutte le commesse attive nel {selectedYear} sono sopra il 15% di MOL!</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Nessuna linea segnala criticità nel perimetro selezionato.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {alertProjects.slice(0, 6).map(p => {
                  const m = metricsById[p.id];
                  const mMol = m?.monthlyMol ?? p.monthlyMol ?? 0;
                  const mPct = m?.molPercent ?? p.molPercent ?? 0;
                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/projects?edit=${p.id}`)}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition hover:shadow-sm ${
                        mMol < 0
                          ? 'bg-rose-50/70 border-rose-200 hover:border-rose-400 text-rose-950'
                          : 'bg-amber-50/70 border-amber-200 hover:border-amber-400 text-amber-950'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900 truncate">{p.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            mMol < 0 ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
                          }`}>
                            MOL {formatPercent(mPct)}
                          </span>
                          {isPotentialProject(p) && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                              Trattativa
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 truncate">{p.client} • {p.route}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className={`font-black ${mMol < 0 ? 'text-rose-600' : 'text-amber-700'}`}>
                          {formatEUR(mMol)} / mese
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {mMol < 0 ? 'In perdita • Clicca per aprire' : 'Margine < 15% • Clicca per aprire'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Suggerimento: rinegoziare tariffa giornaliera o abbinare un secondo viaggio sullo stesso mezzo.</span>
            {alertProjects.length > 6 && (
              <Link to="/projects" className="text-rose-700 font-bold hover:underline">
                +{alertProjects.length - 6} altre in Commesse &amp; Budget →
              </Link>
            )}
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

            <div className="h-72 w-full pt-2">
              {topProjectsData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nessuna commessa attiva nell'anno/scenario selezionato
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProjectsData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} height={55} angle={-15} textAnchor="end" />
                    <YAxis
                      tickFormatter={(val) => Math.abs(val) >= 1000 ? `€${(val / 1000).toFixed(1)}k` : `€${val}`}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(val) => formatEUR(val)}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', color: '#f8fafc', fontSize: '11px' }}
                      itemStyle={{ color: '#f8fafc' }}
                      labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Bar dataKey="MOL" name="M.O.L. Mensile" radius={[4, 4, 0, 0]}>
                      {topProjectsData.map((entry, idx) => (
                        <Cell key={`bar-${idx}`} fill={entry.MOL < 0 ? '#f43f5e' : '#10b981'} />
                      ))}
                    </Bar>
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

            <div className="h-72 w-full flex items-center justify-center">
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
                      cy="45%"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => formatEUR(val)}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', color: '#f8fafc', fontSize: '11px' }}
                      itemStyle={{ color: '#f8fafc' }}
                      labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                    />
                    <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* TABELLA RAPIDA COMMESSE DELLO SCENARIO SELEZIONATO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-[#164e87]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Elenco Commesse nello Scenario ({displayDashboardProjects.length})
                </h3>
                {!showProjectsTable && dashboardHubFilter !== 'all' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#164e87] border border-blue-200">
                    📍 Polo {dashboardHubFilter}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Perimetro: <strong className="text-slate-800">{scopeBadge.label}</strong> • Clicca su una commessa per aprirla o espandi la lista completa
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showProjectsTable && (
                <>
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
                </>
              )}

              <button
                type="button"
                onClick={() => setShowProjectsTable(prev => !prev)}
                className="inline-flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 transition"
              >
                {showProjectsTable ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Comprimi elenco</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Mostra tutte le {displayDashboardProjects.length} commesse</span>
                  </>
                )}
              </button>

              <Link to="/projects" className="text-xs text-emerald-700 font-bold hover:underline flex items-center ml-1">
                <span>Gestisci tutte in Commesse</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </div>
          </div>

          {showProjectsTable && (
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
                  displayDashboardProjects.map((p, idx) => {
                    const isPot = isPotentialProject(p);
                    const veh = fleet.find(item => item.id === p.vehicleId);
                    const hubName = getProjectOperatingUnit(p, veh);
                    const m = metricsById[p.id];
                    const mRev = m?.monthlyRevenue ?? p.monthlyRevenue ?? 0;
                    const mCost = m?.monthlyCost ?? p.monthlyCost ?? 0;
                    const mMol = m?.monthlyMol ?? p.monthlyMol ?? 0;
                    const startYear = getProjectStartYear(p);

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
                        onClick={() => navigate(`/projects?edit=${p.id}`)}
                        className="hover:bg-slate-50 transition group cursor-pointer"
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 group-hover:text-[#164e87] transition">{p.name}</span>
                            {isPot ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                Trattativa
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Attiva
                              </span>
                            )}
                            {startYear > selectedYear && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                Avvio {startYear}
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
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatEUR(mRev)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{formatEUR(mCost)}</td>
                        <td className="py-2.5 px-3 text-right font-black">
                          <span className={mMol < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {formatEUR(mMol)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700 font-semibold">
                          {m?.clientDso ?? p.paymentTermsClient ?? 60} gg
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
