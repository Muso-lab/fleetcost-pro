import { useState, useEffect } from 'react';
import storageService from '../services/storageService';
import { formatEUR } from '../utils/cashFlowCalculations';
import { MARKET_VEHICLE_BENCHMARKS } from '../data/initialData';
import {
  Truck,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  Flame,
  Fuel,
  Layers,
  Search,
  Filter,
  ArrowRight,
  X,
  Save,
  Check,
  Shield,
  ArrowRightLeft,
  Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FleetPage = () => {
  const navigate = useNavigate();
  const [fleet, setFleet] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [activeTab, setActiveTab] = useState('vehicles'); // 'vehicles' or 'trailers'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'available', 'assigned', 'maintenance'
  const [fuelFilter, setFuelFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'trattore',
    categoryLabel: 'Trattore Stradale 4x2',
    fuelTypeId: 'elettrico',
    avgConsumption: 1.2,
    yieldKmPerUnit: 0.83, // km/kWh o km/kg ("al contrario")
    monthlyLease: 4500,
    ownershipType: 'noleggio', // noleggio, proprieta, terzi
    // Parametri Mezzi di Proprietà
    purchaseCost: 140000,
    amortizationYears: 5,
    insuranceYearly: 5600,
    roadTaxYearly: 0,
    maintenanceMonthly: 350,
    // Parametri Gomme
    tireCostKm: 0.04,
    tireCount: 12,
    // Termini Noleggio
    leasePaymentTerms: 0, // 0 = Anticipato (1° mese), 30 = 30 gg f.m., 60 = 60 gg
    lessorName: '',
    licenseTypeId: 'ce_diurno',
    capacityPlt: 33,
    status: 'available',
    assignedProject: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setFleet(storageService.getFleet());
    setTrailers(storageService.getTrailers());
  };

  const handleOpenModal = (item = null, type = activeTab) => {
    if (item) {
      setEditingItem({ ...item, itemType: type });
      const cons = item.avgConsumption || 1.0;
      const yieldVal = item.fuelTypeId === 'elettrico'
        ? (cons > 0 ? +(1 / cons).toFixed(2) : 0.83)
        : (cons > 0 ? +(100 / cons).toFixed(2) : 2.7);

      setFormData({
        name: item.name || '',
        category: item.category || 'trattore',
        categoryLabel: item.categoryLabel || '',
        fuelTypeId: item.fuelTypeId || 'elettrico',
        avgConsumption: cons,
        yieldKmPerUnit: item.yieldKmPerUnit || yieldVal,
        monthlyLease: item.monthlyLease || 0,
        ownershipType: item.ownershipType || 'noleggio',
        purchaseCost: item.purchaseCost || 140000,
        amortizationYears: item.amortizationYears || 5,
        insuranceYearly: item.insuranceYearly || 5600,
        roadTaxYearly: item.roadTaxYearly || 0,
        maintenanceMonthly: item.maintenanceMonthly || 350,
        tireCostKm: item.tireCostKm || 0.04,
        tireCount: item.tireCount || 12,
        leasePaymentTerms: item.leasePaymentTerms !== undefined ? item.leasePaymentTerms : 0,
        lessorName: item.lessorName || '',
        licenseTypeId: item.licenseTypeId || 'ce_diurno',
        capacityPlt: item.capacityPlt || 33,
        status: item.status || 'available',
        assignedProject: item.assignedProject || '',
        notes: item.notes || ''
      });
    } else {
      setEditingItem(null);
      if (type === 'vehicles') {
        setFormData({
          name: '',
          category: 'trattore',
          categoryLabel: 'Trattore Stradale 4x2',
          fuelTypeId: 'elettrico',
          avgConsumption: 1.2,
          yieldKmPerUnit: 0.83,
          monthlyLease: 4800,
          ownershipType: 'noleggio',
          purchaseCost: 150000,
          amortizationYears: 5,
          insuranceYearly: 5600,
          roadTaxYearly: 0,
          maintenanceMonthly: 350,
          tireCostKm: 0.04,
          tireCount: 12,
          leasePaymentTerms: 0,
          lessorName: 'Volvo / Scania Financial',
          licenseTypeId: 'ce_diurno',
          capacityPlt: 33,
          status: 'available',
          assignedProject: '',
          notes: ''
        });
      } else {
        setFormData({
          name: '',
          category: 'refrigerato',
          categoryLabel: 'Semirimorchio Frigo',
          fuelTypeId: 'azoto',
          avgConsumption: 0,
          yieldKmPerUnit: 0,
          monthlyLease: 1600,
          ownershipType: 'noleggio',
          purchaseCost: 65000,
          amortizationYears: 7,
          insuranceYearly: 2400,
          roadTaxYearly: 400,
          maintenanceMonthly: 150,
          tireCostKm: 0.02,
          tireCount: 6,
          leasePaymentTerms: 30,
          lessorName: 'Lamberet / TIP Services',
          licenseTypeId: 'ce_diurno',
          capacityPlt: 33,
          status: 'available',
          assignedProject: '',
          notes: ''
        });
      }
    }
    setShowModal(true);
  };

  // Calcolo automatico costo mensile per mezzi di proprietà
  const calculateOwnedMonthlyCost = (fData) => {
    const amortMonths = (fData.amortizationYears || 5) * 12;
    const amortMonthly = amortMonths > 0 ? (fData.purchaseCost || 0) / amortMonths : 0;
    const insMonthly = (fData.insuranceYearly || 0) / 12;
    const taxMonthly = (fData.roadTaxYearly || 0) / 12;
    const maintMonthly = Number(fData.maintenanceMonthly) || 0;
    return Math.round(amortMonthly + insMonthly + taxMonthly + maintMonthly);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name) return;

    if (activeTab === 'vehicles') {
      if (editingItem && editingItem.id) {
        storageService.updateVehicle(editingItem.id, formData);
      } else {
        storageService.addVehicle(formData);
      }
    } else {
      if (editingItem && editingItem.id) {
        storageService.updateTrailer(editingItem.id, formData);
      } else {
        storageService.addTrailer(formData);
      }
    }

    setShowModal(false);
    loadData();
  };

  const handleDelete = (id, type) => {
    if (confirm('Sei sicuro di voler eliminare questo mezzo dalla flotta?')) {
      if (type === 'vehicles') {
        storageService.deleteVehicle(id);
      } else {
        storageService.deleteTrailer(id);
      }
      loadData();
    }
  };

  // Statistiche Flotta
  const totalVehiclesCount = fleet.length;
  const availableVehiclesCount = fleet.filter(v => v.status === 'available').length;
  const assignedVehiclesCount = fleet.filter(v => v.status === 'assigned').length;
  const totalMonthlyLeaseVehicles = fleet.reduce((sum, v) => sum + (Number(v.monthlyLease) || 0), 0);
  const totalMonthlyLeaseTrailers = trailers.reduce((sum, t) => sum + (Number(t.monthlyLease) || 0), 0);
  const totalMonthlyLease = totalMonthlyLeaseVehicles + totalMonthlyLeaseTrailers;
  const fleetUtilizationRate = totalVehiclesCount > 0 ? ((assignedVehiclesCount / totalVehiclesCount) * 100).toFixed(0) : 0;

  // Filtri
  const itemsToDisplay = activeTab === 'vehicles' ? fleet : trailers;
  const filteredItems = itemsToDisplay.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.assignedProject && item.assignedProject.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesFuel = fuelFilter === 'all' || item.fuelTypeId === fuelFilter;
    return matchesSearch && matchesStatus && matchesFuel;
  });

  const getFuelBadge = (fuelTypeId) => {
    switch (fuelTypeId) {
      case 'elettrico':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Zap className="w-3 h-3 mr-1 text-emerald-600" />
            100% Elettrico (BEV)
          </span>
        );
      case 'biolng':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Flame className="w-3 h-3 mr-1 text-blue-600" />
            Bio-LNG
          </span>
        );
      case 'hvo':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-300">
            <Leaf className="w-3 h-3 mr-1 text-teal-600" />
            HVO Biodiesel
          </span>
        );
      case 'azoto':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300">
            <Layers className="w-3 h-3 mr-1 text-cyan-600" />
            Frigo Azoto Cryo
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
            <Fuel className="w-3 h-3 mr-1 text-gray-600" />
            {fuelTypeId}
          </span>
        );
    }
  };

  const getStatusBadge = (status, assignedProject) => {
    if (status === 'available') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" />
          LIBERO / DISPONIBILE
        </span>
      );
    }
    if (status === 'assigned') {
      return (
        <div className="flex flex-col items-start">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 mr-1 text-blue-600" />
            ASSEGNATO A COMMESSA
          </span>
          {assignedProject && (
            <span className="text-[11px] text-blue-900 font-semibold mt-1 truncate max-w-xs" title={assignedProject}>
              {assignedProject}
            </span>
          )}
        </div>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
        <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" />
        IN MANUTENZIONE
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <Truck className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Flotta Disponibile FOUR</h1>
                <p className="text-xs text-slate-500">
                  Gestione anagrafica mezzi, canoni noleggio, consumi e recupero rapido per nuovi progetti e gare
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleOpenModal(null, activeTab)}
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>{activeTab === 'vehicles' ? 'Nuovo Mezzo' : 'Nuovo Semirimorchio'}</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Flotta Mezzi Totale</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-black text-slate-900">{totalVehiclesCount}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                +{trailers.length} Rimorchi
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Trattori, motrici e furgoni</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mezzi Disponibili (Liberi)</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-black text-emerald-600">{availableVehiclesCount}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Pronti subito
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Mezzi liberi per nuove commesse</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tasso di Impiego Flotta</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-black text-blue-600">{fleetUtilizationRate}%</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {assignedVehiclesCount} attivi
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Veicoli attualmente a reddito</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Totale Canoni Noleggio / Mese</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-slate-900">{formatEUR(totalMonthlyLease)}</span>
              <span className="text-[11px] font-medium text-slate-500">fisso/m</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Costo fisso mezzi FOUR da ripartire</p>
          </div>
        </div>

        {/* Tabs & Controls */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Switch Mezzi / Rimorchi */}
            <div className="flex p-1 bg-slate-100 rounded-xl max-w-fit">
              <button
                onClick={() => setActiveTab('vehicles')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'vehicles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>Mezzi Motori ({fleet.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('trailers')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'trailers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Semirimorchi & Casse ({trailers.length})</span>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cerca mezzo, allestimento, commessa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 w-52 sm:w-64"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tutti gli stati</option>
                <option value="available">Solo Liberi / Disponibili</option>
                <option value="assigned">Solo Assegnati a Commessa</option>
                <option value="maintenance">In Manutenzione</option>
              </select>

              {activeTab === 'vehicles' && (
                <select
                  value={fuelFilter}
                  onChange={(e) => setFuelFilter(e.target.value)}
                  className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Tutte le alimentazioni</option>
                  <option value="elettrico">Elettrico (BEV)</option>
                  <option value="biolng">Bio-LNG</option>
                  <option value="hvo">HVO</option>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Fleet Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow-md transition p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {item.categoryLabel || item.category}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">{item.name}</h3>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenModal(item, activeTab)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition"
                      title="Modifica"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, activeTab)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                      title="Elimina"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  {getStatusBadge(item.status, item.assignedProject)}
                </div>

                <div className="space-y-2 py-3 border-y border-slate-100 text-xs">
                  {item.fuelTypeId && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Alimentazione:</span>
                      {getFuelBadge(item.fuelTypeId)}
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Possesso:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.ownershipType === 'proprieta'
                        ? 'bg-blue-100 text-blue-900 border border-blue-300'
                        : item.ownershipType === 'terzi'
                        ? 'bg-purple-100 text-purple-900 border border-purple-300'
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      {item.ownershipType === 'proprieta' ? 'Proprietà FOUR' : item.ownershipType === 'terzi' ? 'Padroncino / Terzi' : 'Noleggio NLT'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">
                      {item.ownershipType === 'proprieta' ? 'Costo Fisso Proprietà / Mese:' : 'Canone Noleggio / Mese:'}
                    </span>
                    <span className="font-extrabold text-slate-900">{formatEUR(item.monthlyLease)} / m</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Termini Pagam. Nolo:</span>
                    <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {item.leasePaymentTerms === 0 ? 'Anticipato (1° mese)' : `${item.leasePaymentTerms || 30} gg f.m.`}
                    </span>
                  </div>

                  {item.lessorName && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Fornitore / Noleggiatore:</span>
                      <span className="font-semibold text-slate-700 truncate max-w-[150px]" title={item.lessorName}>
                        {item.lessorName}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Quota Giornaliera (22gg):</span>
                    <span className="font-semibold text-slate-700">
                      {formatEUR(item.monthlyLease ? item.monthlyLease / 22 : 0)} / gg
                    </span>
                  </div>

                  {item.avgConsumption > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Consumo & Resa:</span>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 block">
                          {item.avgConsumption} {item.fuelTypeId === 'elettrico' ? 'kWh/km' : 'kg/100km'}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold">
                          {item.fuelTypeId === 'elettrico'
                            ? `~${(1 / item.avgConsumption).toFixed(2)} km/kWh`
                            : `~${(100 / item.avgConsumption).toFixed(1)} km/kg`}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Capacità di Carico:</span>
                    <span className="font-semibold text-slate-800">{item.capacityPlt || 33} Pallet EPAL</span>
                  </div>
                </div>

                {item.notes && (
                  <p className="text-[11px] text-slate-500 italic mt-3 bg-slate-50 p-2 rounded-lg">
                    "{item.notes}"
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                {item.status === 'available' ? (
                  <button
                    onClick={() => navigate(`/projects?newFromVehicle=${item.id}`)}
                    className="w-full flex items-center justify-center space-x-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 py-2 rounded-xl text-xs font-bold transition border border-emerald-200"
                  >
                    <span>Assegna a Nuovo Progetto</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/projects')}
                    className="w-full flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-medium transition"
                  >
                    <span>Vedi Commessa Assegnata</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">Nessun mezzo trovato</h3>
            <p className="text-xs text-slate-500 mt-1">Prova a cambiare i filtri di ricerca o aggiungi un nuovo mezzo.</p>
          </div>
        )}
      </div>

      {/* Modal Aggiungi / Modifica Mezzo */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem ? 'Modifica Scheda Mezzo' : activeTab === 'vehicles' ? 'Inserisci Nuovo Mezzo' : 'Inserisci Nuovo Semirimorchio'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4 text-xs">
              {/* Benchmark di Mercato Rapido (Solo per Mezzi Motori) */}
              {activeTab === 'vehicles' && (
                <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl space-y-1">
                  <label className="text-[11px] font-extrabold text-emerald-950 uppercase flex items-center justify-between">
                    <span className="flex items-center">
                      <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                      Applica Dati Ufficiali da Benchmark di Mercato
                    </span>
                    <span className="text-[10px] text-emerald-800 font-semibold">Test Costruttori</span>
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const bId = e.target.value;
                      if (!bId) return;
                      const bench = MARKET_VEHICLE_BENCHMARKS.find(b => b.id === bId);
                      if (bench) {
                        setFormData(prev => ({
                          ...prev,
                          name: bench.name,
                          category: bench.category,
                          categoryLabel: bench.name,
                          fuelTypeId: bench.fuelTypeId,
                          avgConsumption: bench.avgConsumption,
                          yieldKmPerUnit: bench.yieldKmPerUnit,
                          monthlyLease: bench.indicativeMonthlyLease,
                          purchaseCost: bench.indicativePurchasePrice,
                          capacityPlt: bench.capacityPlt,
                          notes: `${bench.models}. ${bench.notes}`
                        }));
                      }
                    }}
                    className="w-full px-2.5 py-1.5 border border-emerald-400 rounded-lg text-xs font-bold bg-white text-emerald-950 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Seleziona un mezzo di riferimento per auto-compilare i consumi --</option>
                    {MARKET_VEHICLE_BENCHMARKS.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.avgConsumption} {b.consumptionUnit} • {b.yieldKmPerUnit} km/u • NLT ~{formatEUR(b.indicativeMonthlyLease)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome / Modello Mezzo *</label>
                <input
                  type="text"
                  required
                  placeholder="Es. Trattore E-Truck Scania BEV 4x2"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipologia Mezzo</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      let label = 'Trattore Stradale';
                      if (cat === 'motrice') label = 'Motrice Pallet';
                      if (cat === 'biga') label = 'Autotreno Biga';
                      if (cat === 'furgone') label = 'Furgone B';
                      if (cat === 'refrigerato') label = 'Semirimorchio Frigo';
                      if (cat === 'refrigerato_azoto') label = 'Semirimorchio Frigo Azoto';
                      if (cat === 'double_deck') label = 'Semirimorchio Double Deck';
                      if (cat === 'standard') label = 'Semirimorchio Centinato';
                      if (cat === 'cassa_mobile') label = 'Casse Mobili';
                      setFormData({ ...formData, category: cat, categoryLabel: label });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    {activeTab === 'vehicles' ? (
                      <>
                        <option value="trattore">Trattore Stradale 4x2</option>
                        <option value="motrice">Motrice (18/12/9 plt)</option>
                        <option value="biga">Autotreno / Biga</option>
                        <option value="furgone">Furgone Patente B</option>
                      </>
                    ) : (
                      <>
                        <option value="refrigerato">Semirimorchio Frigo Elettrico</option>
                        <option value="refrigerato_azoto">Semirimorchio Frigo Azoto (Cryo)</option>
                        <option value="double_deck">Semirimorchio Double Deck (55 plt)</option>
                        <option value="standard">Centinato Tradizionale (33 plt)</option>
                        <option value="cassa_mobile">Cassa Mobile Intermodale</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alimentazione</label>
                  <select
                    value={formData.fuelTypeId}
                    onChange={(e) => setFormData({ ...formData, fuelTypeId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="elettrico">Elettrico 100% (BEV)</option>
                    <option value="biolng">Bio-LNG (Biometano)</option>
                    <option value="hvo">HVO Biodiesel</option>
                    <option value="gasolio">Gasolio</option>
                    <option value="azoto">Azoto Liquido Criogenico</option>
                  </select>
                </div>
              </div>

              {/* Tipologia Possesso / Acquisizione */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipologia Possesso *</label>
                  <select
                    value={formData.ownershipType}
                    onChange={(e) => {
                      const own = e.target.value;
                      if (own === 'proprieta') {
                        const calculated = calculateOwnedMonthlyCost(formData);
                        setFormData({ ...formData, ownershipType: own, monthlyLease: calculated });
                      } else {
                        setFormData({ ...formData, ownershipType: own });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold bg-white"
                  >
                    <option value="noleggio">Noleggio a Lungo Termine (NLT)</option>
                    <option value="proprieta">Proprietà FOUR (Ammortamento & Spese)</option>
                    <option value="terzi">Padroncino / Vettore Terzo</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Capacità Pallet</label>
                  <input
                    type="number"
                    value={formData.capacityPlt}
                    onChange={(e) => setFormData({ ...formData, capacityPlt: parseInt(e.target.value) || 33 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* SE PROPRIETÀ: PARAMETRI ASSICURATIVI, BOLLO, AMMORTAMENTO */}
              {formData.ownershipType === 'proprieta' ? (
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                  <span className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wider flex items-center">
                    <Shield className="w-4 h-4 mr-1 text-blue-700" />
                    Parametri Mezzo di Proprietà FOUR (Calcolo Costo Fisso Mensile)
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Costo Acquisto (€)</label>
                      <input
                        type="number"
                        step="1000"
                        value={formData.purchaseCost}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = { ...formData, purchaseCost: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Anni Ammortamento</label>
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={formData.amortizationYears}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 5;
                          const next = { ...formData, amortizationYears: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Assicurazione (RCA+Kasko €/a)</label>
                      <input
                        type="number"
                        step="100"
                        value={formData.insuranceYearly}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = { ...formData, insuranceYearly: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Bollo / Tassa Possesso (€/a)</label>
                      <input
                        type="number"
                        step="50"
                        value={formData.roadTaxYearly}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = { ...formData, roadTaxYearly: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Manutenzione (€/mese)</label>
                      <input
                        type="number"
                        step="25"
                        value={formData.maintenanceMonthly}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = { ...formData, maintenanceMonthly: val };
                          setFormData({ ...next, monthlyLease: calculateOwnedMonthlyCost(next) });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-blue-900 mb-0.5">Costo Fisso Risultante / Mese</label>
                      <div className="px-2.5 py-1.5 bg-blue-100 rounded-lg font-black text-blue-950 text-sm">
                        {formatEUR(formData.monthlyLease)} / m
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* SE NOLEGGIO NLT */
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Canone Noleggio Mensile (€) *</label>
                    <input
                      type="number"
                      step="50"
                      required
                      value={formData.monthlyLease}
                      onChange={(e) => setFormData({ ...formData, monthlyLease: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Termini Pagamento Nolo *</label>
                    <select
                      value={formData.leasePaymentTerms}
                      onChange={(e) => setFormData({ ...formData, leasePaymentTerms: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold bg-white"
                    >
                      <option value="0">Anticipato (1° del mese)</option>
                      <option value="30">30 giorni d.f. fine mese</option>
                      <option value="60">60 giorni d.f. fine mese</option>
                    </select>
                  </div>
                </div>
              )}

              {/* SEZIONE CONSUMO BIDIREZIONALE ("AL CONTRARIO") */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider flex items-center">
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                    Consumo Specifico & Resa "Al Contrario"
                  </span>
                  <span className="text-[10px] text-emerald-800 font-medium">Sincronizzazione Automatica</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Consumo ({formData.fuelTypeId === 'elettrico' ? 'kWh/km' : 'kg o L / 100km'})
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={formData.avgConsumption}
                      onChange={(e) => {
                        const cons = parseFloat(e.target.value) || 0;
                        const y = formData.fuelTypeId === 'elettrico'
                          ? (cons > 0 ? +(1 / cons).toFixed(2) : 0)
                          : (cons > 0 ? +(100 / cons).toFixed(2) : 0);
                        setFormData({ ...formData, avgConsumption: cons, yieldKmPerUnit: y });
                      }}
                      className="w-full px-3 py-1.5 border border-emerald-300 rounded-lg font-bold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-emerald-900 mb-1">
                      Resa "Al Contrario" ({formData.fuelTypeId === 'elettrico' ? 'km/kWh' : 'km con 1 kg o L'})
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={formData.yieldKmPerUnit}
                      onChange={(e) => {
                        const y = parseFloat(e.target.value) || 0;
                        const cons = formData.fuelTypeId === 'elettrico'
                          ? (y > 0 ? +(1 / y).toFixed(2) : 0)
                          : (y > 0 ? +(100 / y).toFixed(2) : 0);
                        setFormData({ ...formData, yieldKmPerUnit: y, avgConsumption: cons });
                      }}
                      className="w-full px-3 py-1.5 border border-emerald-400 rounded-lg font-extrabold text-emerald-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Stato Mezzo */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Stato Mezzo</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold bg-white"
                >
                  <option value="available">Libero / Disponibile</option>
                  <option value="assigned">Assegnato a Commessa</option>
                  <option value="maintenance">In Manutenzione</option>
                </select>
              </div>

              {formData.status === 'assigned' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome Commessa Assegnata</label>
                  <input
                    type="text"
                    placeholder="Es. Bilico Decathlon BO"
                    value={formData.assignedProject}
                    onChange={(e) => setFormData({ ...formData, assignedProject: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Note e Allestimenti</label>
                <textarea
                  rows="2"
                  placeholder="Es. Sponda caricatrice idraulica, ATP scadenza 2028, gruppo frigo Carrier..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
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
                  <span>Salva Mezzo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetPage;
