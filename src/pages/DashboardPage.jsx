import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import storageService from '../services/storageService';
import {
  calculateAnnualBudgetAndCashFlow,
  formatEUR,
  formatPercent
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
  ShieldAlert
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
  const [selectedYear, setSelectedYear] = useState(2025);

  useEffect(() => {
    setFleet(storageService.getFleet());
    setProjects(storageService.getProjects());
  }, []);

  const financialModel = calculateAnnualBudgetAndCashFlow(projects, {
    year: selectedYear,
    initialCashBalance: 30000
  });

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

  // Statistiche Flotta
  const totalVehicles = fleet.length;
  const assignedVehicles = fleet.filter(v => v.status === 'assigned').length;
  const utilizationRate = totalVehicles > 0 ? ((assignedVehicles / totalVehicles) * 100).toFixed(0) : 0;

  // Commesse con alert (margine negativo o molto basso < 10%)
  const alertProjects = projects.filter(p => (p.molPercent || 0) < 10);

  // Dati per Grafico Top Commesse per M.O.L.
  const topProjectsData = [...projects]
    .sort((a, b) => (b.monthlyMol || 0) - (a.monthlyMol || 0))
    .slice(0, 6)
    .map(p => ({
      name: p.name.length > 22 ? p.name.substring(0, 20) + '...' : p.name,
      fullName: p.name,
      Ricavo: Math.round(p.monthlyRevenue || 0),
      Costo: Math.round(p.monthlyCost || 0),
      MOL: Math.round(p.monthlyMol || 0)
    }));

  // Dati per Grafico Breakdown Costi Annuali
  const annualCostBreakdown = monthlyCashFlow.reduce((acc, m) => {
    acc.driver += m.costBreakdown.driver;
    acc.fuel += m.costBreakdown.fuel;
    acc.tolls += m.costBreakdown.tolls;
    acc.tires += m.costBreakdown.tires;
    acc.leases += (m.costBreakdown.vehicleLease + m.costBreakdown.trailerLease);
    acc.partner += m.costBreakdown.partnerMargin;
    return acc;
  }, { driver: 0, fuel: 0, tolls: 0, tires: 0, leases: 0, partner: 0 });

  const pieData = [
    { name: 'Autisti & Personale', value: Math.round(annualCostBreakdown.driver), color: '#3b82f6' },
    { name: 'Canoni Noleggio Mezzi', value: Math.round(annualCostBreakdown.leases), color: '#8b5cf6' },
    { name: 'Energia / Carburante', value: Math.round(annualCostBreakdown.fuel), color: '#10b981' },
    { name: 'Autostrada & Pedaggi', value: Math.round(annualCostBreakdown.tolls), color: '#f59e0b' },
    { name: 'Gomme & Manutenz.', value: Math.round(annualCostBreakdown.tires), color: '#64748b' },
    { name: 'Margine Terzisti', value: Math.round(annualCostBreakdown.partner), color: '#ec4899' }
  ].filter(item => item.value > 0);

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
                Controllo Costi, Flotta & Forecast Tesoreria
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
                className="inline-flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-semibold text-xs transition backdrop-blur-sm border border-white/20"
              >
                <Calculator className="w-4 h-4 text-emerald-300" />
                <span>Preventivatore Tratta</span>
              </button>
            </div>
          </div>
        </div>

        {/* Top 4 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Budget Ricavi ({selectedYear})</span>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {formatEUR(annualRevenue)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Fatturato totale commesse attive</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">M.O.L. Annuo (EBITDA)</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-emerald-600">{formatEUR(annualMol)}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {formatPercent(annualMolPercent)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Margine operativo lordo previsto</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Flotta Mezzi Attiva</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-blue-600">{assignedVehicles} / {totalVehicles}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {utilizationRate}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Tasso di impiego veicoli a reddito</p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">CO2 Risparmiata</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-emerald-700">{(co2SavedKg / 1000).toFixed(1)} t</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center">
                <Leaf className="w-3 h-3 mr-1 text-emerald-600" /> Green
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Rispetto al gasolio tradizionale</p>
          </div>
        </div>

        {/* Sezione Alert & Cash Flow Quick Widget */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Fabbisogno Cassa Spotlight */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  Termini di Pagamento & Circolante
                </span>
                <span className="text-xs font-bold text-amber-700">DSO 60 gg / DPO 30 gg</span>
              </div>

              <div>
                <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Fabbisogno Cassa di Picco Stimato
                </span>
                <div className="text-3xl font-black text-amber-900 mt-1">
                  {formatEUR(peakFinancingRequired)}
                </div>
                <p className="text-xs text-amber-800 mt-1">
                  Massima tensione di liquidità nel mese di <strong>{peakDeficitMonth}</strong> causata dal ritardo incassi.
                </p>
              </div>

              <div className="p-3 bg-white/80 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1">
                <p className="font-semibold">Perché serve questa anticipazione?</p>
                <p className="text-slate-600 text-[11px]">
                  FOUR deve anticipare 2-3 mensilità di salari e fornitori prima che i committenti saldino a 60 gg d.f.f.m.
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

          {/* Alert Commesse a Rischio / Margine Basso */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Commesse da Monitorare ({alertProjects.length} Linee sotto target)
                  </h3>
                </div>
                <Link to="/projects" className="text-xs text-emerald-700 font-semibold hover:underline">
                  Vedi tutte le commesse
                </Link>
              </div>

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
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Suggerimento: rinegoziare tariffa giornaliera o abbinare un secondo viaggio pomeridiano.</span>
            </div>
          </div>
        </div>

        {/* Grafici: Top Commesse per M.O.L. e Breakdown Costi */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Commesse Bar Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Commesse più Profittevoli (M.O.L. Mensile)</h3>
                <p className="text-xs text-slate-500">Margine Operativo Lordo generato al mese (€)</p>
              </div>
              <BarChart3 className="w-5 h-5 text-emerald-600" />
            </div>

            <div className="h-64 w-full pt-2">
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
            </div>
          </div>

          {/* Breakdown Costi Pie Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ripartizione Costi Totali Aziendali</h3>
                <p className="text-xs text-slate-500">Composizione delle uscite a budget per categoria</p>
              </div>
              <PieIcon className="w-5 h-5 text-blue-600" />
            </div>

            <div className="h-64 w-full flex items-center justify-center">
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
            </div>
          </div>
        </div>

        {/* Quick Table: Ultimi Progetti */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Elenco Completo Progetti & Linee FOUR</h3>
            <Link to="/projects" className="text-xs text-emerald-700 font-bold hover:underline flex items-center">
              <span>Gestisci tutte ({projects.length})</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase">
                <tr>
                  <th className="py-2.5 px-3">Linea / Commessa</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Gestione</th>
                  <th className="py-2.5 px-3 text-right">Ricavo/Mese</th>
                  <th className="py-2.5 px-3 text-right">Costo/Mese</th>
                  <th className="py-2.5 px-3 text-right">M.O.L./Mese</th>
                  <th className="py-2.5 px-3 text-center">Incasso (DSO)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {projects.slice(0, 8).map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{p.name}</td>
                    <td className="py-2.5 px-3 text-slate-700">{p.client}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
