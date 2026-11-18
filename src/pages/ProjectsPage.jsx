import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import storageService from '../services/storageService';
import {
  formatEUR,
  formatPercent,
  calculateSingleProjectMetrics,
  LEASE_PAYMENT_TIMINGS,
  normalizeLeaseTiming,
  calculateTireCostPerKm,
  recalculateProjectCost
} from '../utils/cashFlowCalculations';
import {
  Briefcase,
  Plus,
  Edit2,
  Trash2,
  Copy,
  AlertTriangle,
  TrendingUp,
  Clock,
  Truck,
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  X,
  Save,
  DollarSign,
  Calendar,
  AlertCircle
} from 'lucide-react';

const ProjectsPage = () => {
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [managementFilter, setManagementFilter] = useState('all');
  const [marginFilter, setMarginFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  // Form State per Nuovo/Modifica Progetto
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    client: '',
    route: '',
    startDate: '2025-01-01',
    operatingMonths: 12,
    workingDaysMonth: 22,
    kmDaily: 250,
    managementType: 'D', // D = Diretta, T = Terzi
    vehicleId: '',
    trailerId: '',
    driverCostDaily: 220,
    fuelCostDaily: 40,
    tollsDaily: 35,
    tiresDaily: 12,
    otherCostsDaily: 0,
    partnerMarginDaily: 0,
    porterageDaily: 0,
    vehicleLeaseDaily: 200,
    trailerLeaseDaily: 35,
    revenueDaily: 750,
    paymentTermsClient: 60, // DSO: incasso clienti gg
    paymentTermsSuppliers: 30, // DPO: fornitori gg
    paymentTermsLease: 30,
    depositAmount: 0,
    notes: ''
  });

  useEffect(() => {
    loadData();
    const newFromVehicle = searchParams.get('newFromVehicle');
    if (newFromVehicle) {
      handleOpenCreateWithVehicle(newFromVehicle);
    }
  }, [searchParams]);

  const loadData = () => {
    const p = storageService.getProjects();
    const f = storageService.getFleet();
    const t = storageService.getTrailers();
    setProjects(p);
    setFleet(f);
    setTrailers(t);
  };

  const handleOpenCreateWithVehicle = (vehicleId) => {
    const f = storageService.getFleet();
    const v = f.find(item => item.id === vehicleId);
    handleOpenModal(null, v);
  };

  // Funzione unificata di ricalcolo automatico e reattivo
  const applyAutoRecalculation = (partialData) => {
    const merged = { ...formData, ...partialData };
    const settings = storageService.getSettings();
    const recalculated = recalculateProjectCost(merged, fleet, trailers, settings);
    return {
      ...merged,
      driverCostDaily: recalculated.driverCostDaily,
      fuelCostDaily: recalculated.fuelCostDaily,
      tollsDaily: recalculated.tollsDaily,
      tiresDaily: recalculated.tiresDaily,
      vehicleLeaseDaily: recalculated.vehicleLeaseDaily,
      trailerLeaseDaily: recalculated.trailerLeaseDaily,
      partnerMarginDaily: recalculated.partnerMarginDaily,
      porterageDaily: recalculated.porterageDaily,
      otherCostsDaily: recalculated.otherCostsDaily
    };
  };

  const handleOpenModal = (project = null, preselectedVehicle = null) => {
    if (project) {
      setEditingProject(project);
      setFormData({
        code: project.code || '',
        name: project.name || '',
        client: project.client || '',
        route: project.route || '',
        startDate: project.startDate || '2025-01-01',
        operatingMonths: project.operatingMonths || 12,
        workingDaysMonth: project.workingDaysMonth || 22,
        kmDaily: project.kmDaily || 250,
        managementType: project.managementType || 'D',
        vehicleId: project.vehicleId || '',
        trailerId: project.trailerId || '',
        driverCostDaily: project.driverCostDaily || 0,
        fuelCostDaily: project.fuelCostDaily || 0,
        tollsDaily: project.tollsDaily || 0,
        tiresDaily: project.tiresDaily || 0,
        otherCostsDaily: project.otherCostsDaily || 0,
        partnerMarginDaily: project.partnerMarginDaily || 0,
        porterageDaily: project.porterageDaily || 0,
        vehicleLeaseDaily: project.vehicleLeaseDaily || 0,
        trailerLeaseDaily: project.trailerLeaseDaily || 0,
        revenueDaily: project.revenueDaily || 0,
        paymentTermsClient: project.paymentTermsClient || 60,
        paymentTermsSuppliers: project.paymentTermsSuppliers || 30,
        paymentTermsLease: project.paymentTermsLease || 30,
        depositAmount: project.depositAmount || 0,
        notes: project.notes || ''
      });
    } else {
      setEditingProject(null);
      const defaultVeh = preselectedVehicle || fleet[0];
      const workingDays = 22;
      const initialProject = {
        code: 'PRJ-' + Math.floor(100 + Math.random() * 900),
        name: defaultVeh ? `Servizio con ${defaultVeh.name}` : '',
        client: '',
        route: '',
        startDate: '2025-01-01',
        operatingMonths: 12,
        workingDaysMonth: workingDays,
        kmDaily: 250,
        managementType: defaultVeh?.ownershipType === 'terzi' ? 'T' : 'D',
        vehicleId: defaultVeh ? defaultVeh.id : '',
        trailerId: '',
        driverCostDaily: 220,
        fuelCostDaily: 35,
        tollsDaily: 30,
        tiresDaily: 12,
        otherCostsDaily: 0,
        partnerMarginDaily: defaultVeh?.ownershipType === 'terzi' ? 600 : 0,
        porterageDaily: 0,
        vehicleLeaseDaily: defaultVeh && defaultVeh.monthlyLease ? +(defaultVeh.monthlyLease / workingDays).toFixed(2) : 208,
        trailerLeaseDaily: 0,
        revenueDaily: 750,
        paymentTermsClient: 60,
        paymentTermsSuppliers: 30,
        paymentTermsLease: 30,
        depositAmount: 0,
        notes: ''
      };
      const settings = storageService.getSettings();
      const recalculated = recalculateProjectCost(initialProject, fleet, trailers, settings);
      setFormData({
        ...initialProject,
        ...recalculated
      });
    }
    setShowModal(true);
  };

  const handleVehicleChangeInModal = (vId) => {
    const selectedVeh = fleet.find(v => v.id === vId);
    const newTiming = selectedVeh ? (selectedVeh.leasePaymentTiming || normalizeLeaseTiming(selectedVeh)) : formData.leasePaymentTiming;
    const newTerms = selectedVeh && selectedVeh.leasePaymentTerms !== undefined ? selectedVeh.leasePaymentTerms : formData.paymentTermsLease;
    const isTerzi = selectedVeh?.ownershipType === 'terzi';
    const newMgmt = isTerzi ? 'T' : formData.managementType;
    const updated = applyAutoRecalculation({
      vehicleId: vId,
      managementType: newMgmt,
      leasePaymentTiming: newTiming,
      paymentTermsLease: newTerms
    });
    setFormData(updated);
  };

  const handleTrailerChangeInModal = (tId) => {
    const updated = applyAutoRecalculation({ trailerId: tId });
    setFormData(updated);
  };

  const handleKmChange = (km) => {
    const updated = applyAutoRecalculation({ kmDaily: km });
    setFormData(updated);
  };

  const handleWorkingDaysChange = (days) => {
    const updated = applyAutoRecalculation({ workingDaysMonth: days });
    setFormData(updated);
  };

  const handleManagementTypeChange = (type) => {
    const updated = applyAutoRecalculation({ managementType: type });
    setFormData(updated);
  };

  // Assistente di Calcolo Automatico dei costi della commessa da parametri fisici
  const handleAutoCalculateCosts = () => {
    const updated = applyAutoRecalculation({});
    setFormData(updated);
  };

  const handleSaveProject = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.client) return;

    // Ricalcola totali di competenza
    const metrics = calculateSingleProjectMetrics(formData);

    const projectDataToSave = {
      ...formData,
      totalCostDaily: metrics.totalCostDaily,
      molDaily: metrics.molDaily,
      monthlyCost: metrics.monthlyCost,
      monthlyRevenue: metrics.monthlyRevenue,
      monthlyMol: metrics.monthlyMol,
      molPercent: metrics.molPercent,
      cashAdvanceRequired: metrics.estimatedWorkingCapitalGap
    };

    if (editingProject && editingProject.id) {
      storageService.updateProject(editingProject.id, projectDataToSave);
    } else {
      storageService.addProject(projectDataToSave);
    }

    setShowModal(false);
    loadData();
  };

  const handleDeleteProject = (id) => {
    if (confirm('Sei sicuro di voler eliminare questa commessa dal budget?')) {
      storageService.deleteProject(id);
      loadData();
    }
  };

  const handleDuplicateProject = (project) => {
    const duplicated = {
      ...project,
      id: undefined,
      code: 'PRJ-' + Math.floor(100 + Math.random() * 900),
      name: `${project.name} (Copia)`,
      createdAt: undefined
    };
    storageService.addProject(duplicated);
    loadData();
  };

  // Statistiche di Portfolio
  const totalProjectsCount = projects.length;
  const totalMonthlyBudgetRevenue = projects.reduce((sum, p) => sum + (Number(p.monthlyRevenue) || 0), 0);
  const totalMonthlyBudgetCost = projects.reduce((sum, p) => sum + (Number(p.monthlyCost) || 0), 0);
  const totalMonthlyBudgetMol = totalMonthlyBudgetRevenue - totalMonthlyBudgetCost;
  const averageMolPercent = totalMonthlyBudgetRevenue > 0 ? (totalMonthlyBudgetMol / totalMonthlyBudgetRevenue) * 100 : 0;
  const totalWorkingCapitalRequired = projects.reduce((sum, p) => {
    const m = calculateSingleProjectMetrics(p);
    return sum + (m.estimatedWorkingCapitalGap || 0);
  }, 0);

  // Lista clienti unici per filtro
  const uniqueClients = Array.from(new Set(projects.map(p => p.client).filter(Boolean)));

  // Filtro progetti
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.client && p.client.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.route && p.route.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesClient = clientFilter === 'all' || p.client === clientFilter;
    const matchesManagement = managementFilter === 'all' || p.managementType === managementFilter;

    let matchesMargin = true;
    if (marginFilter === 'positive') matchesMargin = (p.molPercent || 0) >= 15;
    if (marginFilter === 'low') matchesMargin = (p.molPercent || 0) > 0 && (p.molPercent || 0) < 15;
    if (marginFilter === 'negative') matchesMargin = (p.molPercent || 0) <= 0;

    return matchesSearch && matchesClient && matchesManagement && matchesMargin;
  });

  // Calcoli live per la modal
  const liveModalMetrics = calculateSingleProjectMetrics(formData);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                <Briefcase className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Commesse & Budget Progetti FOUR</h1>
                <p className="text-xs text-slate-500">
                  Controllo economico di ciascuna linea, M.O.L., termini di pagamento e fabbisogno di anticipazione
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleOpenModal(null)}
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Nuova Commessa</span>
            </button>
          </div>
        </div>

        {/* Portfolio KPI Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Commesse Attive</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-black text-slate-900">{totalProjectsCount}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                Linee
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Servizi inseriti a budget</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ricavi Mensili Totali</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-slate-900">{formatEUR(totalMonthlyBudgetRevenue)}</span>
              <span className="text-[11px] font-medium text-slate-500">/mese</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Fatturato a regime mensile</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Costi Mensili Totali</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-slate-700">{formatEUR(totalMonthlyBudgetCost)}</span>
              <span className="text-[11px] font-medium text-slate-500">/mese</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Operativi + canoni noleggio</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">M.O.L. Mensile (Margine)</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className={`text-2xl font-black ${totalMonthlyBudgetMol >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatEUR(totalMonthlyBudgetMol)}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                averageMolPercent >= 15 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {formatPercent(averageMolPercent)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Margine operativo lordo</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fabbisogno Anticipazione</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-amber-600">{formatEUR(totalWorkingCapitalRequired)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Capitale circolante (gap incassi/pagamenti)</p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cerca per codice, nome linea, cliente o tratta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tutti i Clienti</option>
                {uniqueClients.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={managementFilter}
                onChange={(e) => setManagementFilter(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tutte le Gestioni (D / T)</option>
                <option value="D">Gestione Diretta (D)</option>
                <option value="T">Gestione Terzi / Padroncino (T)</option>
              </select>

              <select
                value={marginFilter}
                onChange={(e) => setMarginFilter(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tutti i Margini</option>
                <option value="positive">Margine Sano (≥ 15%)</option>
                <option value="low">Margine Basso (&lt; 15%)</option>
                <option value="negative">In Perdita (&lt; 0%)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Projects List / Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Cod / Linea</th>
                  <th className="py-3.5 px-4">Cliente & Tratta</th>
                  <th className="py-3.5 px-4">Gest.</th>
                  <th className="py-3.5 px-4">Mezzo & Rimorchio</th>
                  <th className="py-3.5 px-4 text-right">Ricavo / Mese</th>
                  <th className="py-3.5 px-4 text-right">Costi / Mese</th>
                  <th className="py-3.5 px-4 text-right">M.O.L. / Mese</th>
                  <th className="py-3.5 px-4 text-center">Termini Pagam.</th>
                  <th className="py-3.5 px-4 text-right">Anticipo Cassa</th>
                  <th className="py-3.5 px-4 text-center">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map((project) => {
                  const metrics = calculateSingleProjectMetrics(project);
                  const isNegative = metrics.monthlyMol < 0;
                  const isLowMargin = !isNegative && metrics.molPercent < 15;
                  const assignedVeh = fleet.find(v => v.id === project.vehicleId);
                  const assignedTrailer = trailers.find(t => t.id === project.trailerId);

                  return (
                    <tr
                      key={project.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isNegative ? 'bg-rose-50/40' : isLowMargin ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {project.code || 'PRJ'}
                          </span>
                          {isNegative && (
                            <span title="Attenzione: Commessa in perdita!" className="text-rose-600">
                              <AlertTriangle className="w-4 h-4 inline" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-slate-900 mt-1 max-w-xs">{project.name}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{project.client}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs" title={project.route}>
                          {project.route}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-extrabold ${
                            project.managementType === 'D'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                          title={project.managementType === 'D' ? 'Gestione Diretta FOUR' : 'Gestione Terzi / Padroncino'}
                        >
                          {project.managementType || 'D'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-800 font-semibold truncate max-w-[150px]" title={assignedVeh?.name}>
                            {assignedVeh ? assignedVeh.name : 'Mezzo non assegnato'}
                          </span>
                          {assignedVeh?.plate && (
                            <span className="font-mono font-bold text-[10px] bg-slate-900 text-amber-300 px-1.5 py-0.5 rounded shadow-sm border border-slate-700 tracking-wider">
                              {assignedVeh.plate}
                            </span>
                          )}
                        </div>
                        {assignedTrailer && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-600 mt-1">
                            <span className="truncate max-w-[130px] font-medium" title={assignedTrailer.name}>
                              {assignedTrailer.name}
                            </span>
                            {assignedTrailer.plate && (
                              <span className="font-mono text-[9px] bg-slate-100 text-slate-800 font-bold px-1.5 py-0.2 rounded border border-slate-300">
                                {assignedTrailer.plate}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
                          <span>{project.workingDaysMonth || 22} gg/m</span>
                          <span>•</span>
                          <span>{project.kmDaily || 200} km/gg</span>
                          {project.porterageDaily > 0 && (
                            <span className="bg-purple-100 text-purple-800 font-bold px-1.5 py-0.2 rounded">
                              Facchinaggio {formatEUR(project.porterageDaily)}/gg
                            </span>
                          )}
                          {project.managementType === 'T' && (
                            <span className="bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                              Vettore {formatEUR(project.partnerMarginDaily)}/gg
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatEUR(metrics.monthlyRevenue)}
                        <div className="text-[10px] text-slate-400 font-normal">
                          {formatEUR(project.revenueDaily)}/gg
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                        {formatEUR(metrics.monthlyCost)}
                        <div className="text-[10px] text-slate-400 font-normal">
                          {formatEUR(metrics.totalCostDaily)}/gg
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className={`font-extrabold ${isNegative ? 'text-rose-600' : isLowMargin ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {formatEUR(metrics.monthlyMol)}
                        </div>
                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          isNegative ? 'bg-rose-100 text-rose-800' : isLowMargin ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {formatPercent(metrics.molPercent)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-[11px] font-bold text-slate-700">
                            Inc: {project.paymentTermsClient || 60} gg
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Pag: {project.paymentTermsSuppliers || 30} gg
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-amber-700">
                        {formatEUR(metrics.estimatedWorkingCapitalGap)}
                        <div className="text-[10px] text-slate-400 font-normal">
                          gap {metrics.gapDays} gg
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleOpenModal(project)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition"
                            title="Modifica Commessa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDuplicateProject(project)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg transition"
                            title="Duplica Commessa"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProject(project.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                            title="Elimina"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Modifica/Crea Commessa */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Briefcase className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingProject ? 'Modifica Commessa di Budget' : 'Crea Nuova Commessa & Budget'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProject} className="space-y-4 mt-4 text-xs">
                {/* Dati Generali */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Nome / Descrizione Linea *</label>
                    <input
                      type="text"
                      required
                      placeholder="Es. Bilico Elettrico 33 plt x Decathlon BO"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Es. Decathlon Italia"
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tratta / Punti di Carico & Scarico</label>
                  <input
                    type="text"
                    placeholder="Es. Interporto BO - Negozi Decathlon Centro-Nord"
                    value={formData.route}
                    onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Selezione Mezzo dalla Flotta & Tipologia Gestione */}
                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200/60 space-y-3">
                  <span className="text-[11px] font-extrabold text-emerald-900 uppercase tracking-wider flex items-center">
                    <Truck className="w-4 h-4 mr-1.5 text-emerald-700" />
                    Assegna Mezzo & Allestimento dalla Flotta
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Mezzo Motore</label>
                      <select
                        value={formData.vehicleId}
                        onChange={(e) => handleVehicleChangeInModal(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="">-- Seleziona dalla Flotta --</option>
                        {fleet.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} {v.plate ? `[${v.plate}]` : ''} ({formatEUR(v.monthlyLease)}/m)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Semirimorchio / Allestimento</label>
                      <select
                        value={formData.trailerId}
                        onChange={(e) => handleTrailerChangeInModal(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="">-- Nessun Semirimorchio --</option>
                        {trailers.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.plate ? `[${t.plate}]` : ''} ({formatEUR(t.monthlyLease)}/m)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Gestione</label>
                      <select
                        value={formData.managementType}
                        onChange={(e) => handleManagementTypeChange(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white font-bold"
                      >
                        <option value="D">Diretta FOUR (D)</option>
                        <option value="T">Fornitore / Terzi (T)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Parametri Operativi & Calendario */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Data Inizio (Start up)</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Mesi Operativi</label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={formData.operatingMonths}
                      onChange={(e) => setFormData({ ...formData, operatingMonths: parseInt(e.target.value) || 12 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Giorni Lavorativi / Mese</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.workingDaysMonth}
                      onChange={(e) => handleWorkingDaysChange(parseInt(e.target.value) || 22)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Km / Giorno</label>
                    <input
                      type="number"
                      value={formData.kmDaily}
                      onChange={(e) => handleKmChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-emerald-400 bg-emerald-50/40 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>
                </div>

                {/* Dettaglio Costi Giornalieri */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
                        Dettaglio Costi Giornalieri (€ / Giorno)
                      </span>
                      <span className="text-[10px] text-emerald-700 font-medium">
                        ⚡ Ricalcolo dinamico attivo: la variazione dei km aggiorna carburante/Bio-LNG, pedaggi e gomme
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoCalculateCosts}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold transition border border-emerald-300 self-start sm:self-auto"
                      title="Forza ricalcolo di tutti i parametri di costo da anagrafica mezzo e km"
                    >
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Ricalcola da Parametri Fisici</span>
                    </button>
                  </div>

                  {formData.managementType === 'T' ? (
                    /* Modalità Fornitore / Terzista ("T") */
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs space-y-1">
                        <div className="font-bold text-blue-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-blue-700" />
                          <span>Struttura Economica Commessa Fornitore Terzo (Gestione T)</span>
                        </div>
                        <p className="text-[11px] text-blue-800">
                          I costi diretti di autista, trattore, carburante, pedaggi autostradali e pneumatici sono a carico del vettore terzo (inclusi nel corrispettivo). FOUR sostiene solo il corrispettivo riconosciuto al fornitore, l'eventuale quota del semirimorchio FOUR e il facchinaggio.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                          <label className="block font-bold text-slate-800 mb-0.5">
                            Corrispettivo Vettore / Fornitore Terzo (€/gg) *
                          </label>
                          <input
                            type="number"
                            step="5"
                            value={formData.partnerMarginDaily}
                            onChange={(e) => setFormData({ ...formData, partnerMarginDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-2 border border-blue-400 bg-white rounded-lg font-black text-blue-900 text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Es. 620"
                          />
                          <p className="text-[10px] text-slate-500 mt-0.5">Compensi al vettore terzo incaricato</p>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-800 mb-0.5">
                            Quota Semirimorchio FOUR (€/gg)
                          </label>
                          <input
                            type="number"
                            step="1"
                            value={formData.trailerLeaseDaily}
                            onChange={(e) => setFormData({ ...formData, trailerLeaseDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-bold text-slate-800"
                          />
                          <p className="text-[10px] text-slate-500 mt-0.5">Semirimorchio messo a disposizione da FOUR</p>
                        </div>

                        <div>
                          <label className="block font-bold text-purple-900 mb-0.5">
                            Facchinaggio (€/gg)
                          </label>
                          <input
                            type="number"
                            step="5"
                            value={formData.porterageDaily || 0}
                            onChange={(e) => setFormData({ ...formData, porterageDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-2 border border-purple-300 bg-purple-50/50 rounded-lg font-bold text-purple-900"
                            placeholder="0"
                          />
                          <p className="text-[10px] text-slate-500 mt-0.5">Costo facchini per carico/scarico</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                        <div>
                          <label className="block text-slate-500 mb-0.5">Altre Spese FOUR (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.otherCostsDaily || 0}
                            onChange={(e) => setFormData({ ...formData, otherCostsDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-700"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block font-bold text-emerald-900 mb-0.5">Ricavo Giornaliero Riconosciuto da Cliente (€/gg) *</label>
                          <input
                            type="number"
                            step="10"
                            value={formData.revenueDaily}
                            onChange={(e) => setFormData({ ...formData, revenueDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 border border-emerald-500 rounded-lg font-black text-emerald-800 bg-emerald-50 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Modalità Gestione Diretta FOUR ("D") */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Autista (€/gg)</label>
                          <input
                            type="number"
                            step="5"
                            value={formData.driverCostDaily}
                            onChange={(e) => setFormData({ ...formData, driverCostDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Carburante / Bio-LNG / BEV</label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.fuelCostDaily}
                            onChange={(e) => setFormData({ ...formData, fuelCostDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Autostrada / Pedaggi</label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.tollsDaily}
                            onChange={(e) => setFormData({ ...formData, tollsDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Pneumatici (€/gg)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={formData.tiresDaily}
                            onChange={(e) => setFormData({ ...formData, tiresDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Noleggio Mezzo (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.vehicleLeaseDaily}
                            onChange={(e) => setFormData({ ...formData, vehicleLeaseDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-0.5">Noleggio Rimorchio (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.trailerLeaseDaily}
                            onChange={(e) => setFormData({ ...formData, trailerLeaseDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-purple-900 font-bold mb-0.5">Facchinaggio (€/gg)</label>
                          <input
                            type="number"
                            step="5"
                            value={formData.porterageDaily || 0}
                            onChange={(e) => setFormData({ ...formData, porterageDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-purple-300 bg-purple-50/50 rounded-lg font-bold text-purple-900"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-0.5">Partner / Varie (€/gg)</label>
                          <input
                            type="number"
                            step="1"
                            value={formData.partnerMarginDaily}
                            onChange={(e) => setFormData({ ...formData, partnerMarginDaily: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200">
                        <label className="block font-bold text-slate-900 mb-0.5">Ricavo Giornaliero (€/gg) *</label>
                        <input
                          type="number"
                          step="10"
                          value={formData.revenueDaily}
                          onChange={(e) => setFormData({ ...formData, revenueDaily: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-emerald-500 rounded-lg font-black text-emerald-800 bg-emerald-50 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* SEZIONE SPECIALE: TERMINI DI PAGAMENTO (DSO & DPO) */}
                <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider flex items-center">
                      <Clock className="w-4 h-4 mr-1.5 text-amber-700" />
                      Termini di Pagamento & Condizioni Finanziarie (Cash Flow)
                    </span>
                    <span className="text-[10px] text-amber-800 font-semibold">
                      Gap Giorni: {liveModalMetrics.gapDays} gg
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Incasso Cliente (DSO) *
                      </label>
                      <select
                        value={formData.paymentTermsClient}
                        onChange={(e) => setFormData({ ...formData, paymentTermsClient: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold"
                      >
                        <option value="30">30 giorni d.f.f.m.</option>
                        <option value="60">60 giorni d.f.f.m. (Standard)</option>
                        <option value="90">90 giorni d.f.f.m.</option>
                        <option value="120">120 giorni d.f.f.m.</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Pagamento Terzisti/Fornitori
                      </label>
                      <select
                        value={formData.paymentTermsSuppliers}
                        onChange={(e) => setFormData({ ...formData, paymentTermsSuppliers: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold"
                      >
                        <option value="15">15 giorni (Tipico Mas)</option>
                        <option value="30">30 giorni d.f.f.m.</option>
                        <option value="60">60 giorni d.f.f.m.</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Scadenza Addebito Nolo
                      </label>
                      <select
                        value={formData.leasePaymentTiming || normalizeLeaseTiming(formData)}
                        onChange={(e) => {
                          const timingKey = e.target.value;
                          const terms = timingKey === 'M1_D10' ? 0 : timingKey === 'M1_D30' ? 30 : 60;
                          setFormData({ ...formData, leasePaymentTiming: timingKey, paymentTermsLease: terms });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold text-xs"
                      >
                        <option value="M1_D10">Giorno 10 M1 (Anticipato / Inizio Mese)</option>
                        <option value="M1_D30">Giorno 30 M1 (Fine Mese)</option>
                        <option value="M2_D20">Giorno 20 M2 (Mese Successivo / +20 gg dffm)</option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {LEASE_PAYMENT_TIMINGS[formData.leasePaymentTiming || normalizeLeaseTiming(formData)]?.description}
                      </p>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Recupero Accise (€ 0,214/L)
                      </label>
                      <select
                        value={formData.acciseRecoveryEligible !== false ? 'yes' : 'no'}
                        onChange={(e) => setFormData({ ...formData, acciseRecoveryEligible: e.target.value === 'yes' })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white font-bold text-xs"
                      >
                        <option value="yes">Attivo (Trattori & Mezzi &gt; 7.5t)</option>
                        <option value="no">Escluso per questa commessa</option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Credito d'imposta trimestrale art. 24-ter TUA a Q+1
                      </p>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Caparra / Cauzione Iniziale (€)
                      </label>
                      <input
                        type="number"
                        value={formData.depositAmount}
                        onChange={(e) => setFormData({ ...formData, depositAmount: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-bold"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200 text-xs flex justify-between items-center">
                    <span className="text-amber-900 font-medium">
                      Fabbisogno Cassa Circolante Stimato (Rate di anticipo prima dell'incasso):
                    </span>
                    <span className="font-extrabold text-amber-800 text-sm">
                      {formatEUR(liveModalMetrics.estimatedWorkingCapitalGap)}
                    </span>
                  </div>
                </div>

                {/* Box Sintesi Economica Live */}
                <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Ricavo Mensile</span>
                    <div className="text-base font-extrabold">{formatEUR(liveModalMetrics.monthlyRevenue)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Costi Mensili</span>
                    <div className="text-base font-extrabold text-slate-300">{formatEUR(liveModalMetrics.monthlyCost)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">M.O.L. Mensile</span>
                    <div className={`text-base font-extrabold ${liveModalMetrics.monthlyMol >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatEUR(liveModalMetrics.monthlyMol)} ({formatPercent(liveModalMetrics.molPercent)})
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase">Fatturato Intera Commessa</span>
                    <div className="text-base font-extrabold text-emerald-300">{formatEUR(liveModalMetrics.totalProjectRevenue)}</div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Note e Accordi Commerciali</label>
                  <textarea
                    rows="2"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Note su clausole carburante, orari di scarico, penali..."
                  ></textarea>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition flex items-center space-x-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salva Commessa</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsPage;
