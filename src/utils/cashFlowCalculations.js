// Motore di calcolo per Forecast, Budget e Cash Flow con Termini di Pagamento (DSO & DPO)
// Progettato specificamente per le esigenze di FOUR Trasporti Ecologici

export const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

export const MONTH_SHORT_NAMES = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
];

/**
 * Calcola se un progetto è attivo in un determinato mese dell'anno
 * @param {Object} project - Oggetto commessa
 * @param {number} monthIndex - Indice mese 0..11 (0 = Gennaio)
 * @param {number} targetYear - Anno di riferimento (es. 2025 o 2026)
 */
export const isProjectActiveInMonth = (project, monthIndex, targetYear = 2025) => {
  if (!project.startDate) return false;
  const start = new Date(project.startDate);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth(); // 0..11

  const currentMonthDate = new Date(targetYear, monthIndex, 1);
  const projectStartDate = new Date(startYear, startMonth, 1);

  // Mesi trascorsi dall'inizio del progetto
  const diffMonths = (currentMonthDate.getFullYear() - projectStartDate.getFullYear()) * 12 +
    (currentMonthDate.getMonth() - projectStartDate.getMonth());

  return diffMonths >= 0 && diffMonths < (project.operatingMonths || 12);
};

/**
 * Calcola il piano economico (P&L) e il piano finanziario (Cash Flow) per l'intera azienda
 * considerando i termini di pagamento (incasso clienti a 30/60/90 gg vs fornitori/terzisti a 15/30 gg)
 */
export const calculateAnnualBudgetAndCashFlow = (projects, options = {}) => {
  const {
    year = 2025,
    initialCashBalance = 50000,
    stressTestClientDays = 0, // es. +30 giorni di ritardo incassi clienti
    factoringEnabled = false, // se true, anticipo fatture clienti all'80%
    factoringAdvanceRate = 80, // % anticipata dalla banca/factor
    factoringFeePercent = 1.5 // costo del servizio factoring %
  } = options;

  // Matrici 12 mesi per P&L ed Entrate/Uscite
  const monthlyPnl = Array(12).fill(0).map(() => ({
    revenue: 0,
    cost: 0,
    mol: 0,
    costBreakdown: {
      driver: 0,
      fuel: 0,
      tolls: 0,
      tires: 0,
      vehicleLease: 0,
      trailerLease: 0,
      partnerMargin: 0
    },
    activeProjectsCount: 0
  }));

  // Cash Inflows: possono estendersi anche nei primi mesi dell'anno successivo a causa del DSO
  // Consideriamo 12 mesi dell'anno corrente + 6 mesi di coda per tracciare gli incassi a 60/90 gg
  const totalMonthsHorizon = 18;
  const cashInflows = Array(totalMonthsHorizon).fill(0);
  const cashOutflows = Array(totalMonthsHorizon).fill(0);
  const cashOutflowBreakdown = Array(totalMonthsHorizon).fill(0).map(() => ({
    suppliers: 0,
    drivers: 0,
    leases: 0,
    deposits: 0
  }));

  // Elabora ciascun progetto
  projects.forEach(project => {
    const pTermsClient = (project.paymentTermsClient || 60) + stressTestClientDays;
    const pTermsSuppliers = project.paymentTermsSuppliers || 30;
    const pTermsLease = project.paymentTermsLease || 30;

    // Quanti mesi di ritardo per l'incasso? (es. 60 gg = +2 mesi, 30 gg = +1 mese, 90 gg = +3 mesi)
    const clientDelayMonths = Math.max(1, Math.round(pTermsClient / 30));
    // Quanti mesi di ritardo per i fornitori/terzisti? (es. 15-30 gg = +1 mese)
    const supplierDelayMonths = Math.max(0, Math.round(pTermsSuppliers / 30));
    // Noleggi: se 0 o anticipato = mese corrente (0), altrimenti +1 mese
    const leaseDelayMonths = pTermsLease <= 15 ? 0 : 1;

    // Verifica caparra iniziale: pagata al mese di start-up
    if (project.depositAmount && project.depositAmount > 0 && project.startDate) {
      const start = new Date(project.startDate);
      if (start.getFullYear() === year) {
        const startM = start.getMonth();
        if (startM >= 0 && startM < 12) {
          cashOutflows[startM] += project.depositAmount;
          cashOutflowBreakdown[startM].deposits += project.depositAmount;
        }
      }
    }

    // Itera sui 12 mesi dell'anno
    for (let m = 0; m < 12; m++) {
      if (isProjectActiveInMonth(project, m, year)) {
        const rev = Number(project.monthlyRevenue) || 0;
        const cost = Number(project.monthlyCost) || 0;
        const mol = Number(project.monthlyMol) || (rev - cost);

        // 1. P&L Competenza economica
        monthlyPnl[m].revenue += rev;
        monthlyPnl[m].cost += cost;
        monthlyPnl[m].mol += mol;
        monthlyPnl[m].activeProjectsCount += 1;

        // Dettaglio costi proporzionale
        const workingDays = project.workingDaysMonth || 22;
        const driverC = (Number(project.driverCostDaily) || 0) * workingDays;
        const fuelC = (Number(project.fuelCostDaily) || 0) * workingDays;
        const tollsC = (Number(project.tollsDaily) || 0) * workingDays;
        const tiresC = (Number(project.tiresDaily) || 0) * workingDays;
        const vLeaseC = (Number(project.vehicleLeaseDaily) || 0) * workingDays;
        const tLeaseC = (Number(project.trailerLeaseDaily) || 0) * workingDays;
        const partC = (Number(project.partnerMarginDaily) || 0) * workingDays;

        monthlyPnl[m].costBreakdown.driver += driverC;
        monthlyPnl[m].costBreakdown.fuel += fuelC;
        monthlyPnl[m].costBreakdown.tolls += tollsC;
        monthlyPnl[m].costBreakdown.tires += tiresC;
        monthlyPnl[m].costBreakdown.vehicleLease += vLeaseC;
        monthlyPnl[m].costBreakdown.trailerLease += tLeaseC;
        monthlyPnl[m].costBreakdown.partnerMargin += partC;

        // 2. CASH FLOW: ENTRATE (Incassi Clienti)
        if (factoringEnabled) {
          // Factoring: incasso immediato dell'80% nel mese corrente (meno commissione), saldo al saldo effettivo
          const advanceAmount = rev * (factoringAdvanceRate / 100);
          const fee = rev * (factoringFeePercent / 100);
          const remainingAmount = rev - advanceAmount - fee;

          cashInflows[m] += (advanceAmount - fee);
          const collectionMonth = m + clientDelayMonths;
          if (collectionMonth < totalMonthsHorizon) {
            cashInflows[collectionMonth] += remainingAmount;
          }
        } else {
          // Senza factoring: incasso posticipato in base al termine concordato (es. a 60 gg -> m + 2)
          const collectionMonth = m + clientDelayMonths;
          if (collectionMonth < totalMonthsHorizon) {
            cashInflows[collectionMonth] += rev;
          }
        }

        // 3. CASH FLOW: USCITE (Pagamenti Operativi)
        // Autisti: pagati mese successivo (m + 1)
        const driverPayMonth = m + 1;
        if (driverPayMonth < totalMonthsHorizon) {
          cashOutflows[driverPayMonth] += driverC;
          cashOutflowBreakdown[driverPayMonth].drivers += driverC;
        }

        // Fornitori/Carburante/Terzisti: pagati in base a DPO
        const supplierPayMonth = m + supplierDelayMonths;
        const supplierExpenses = fuelC + tollsC + tiresC + partC;
        if (supplierPayMonth < totalMonthsHorizon) {
          cashOutflows[supplierPayMonth] += supplierExpenses;
          cashOutflowBreakdown[supplierPayMonth].suppliers += supplierExpenses;
        }

        // Noleggi Mezzi e Semirimorchi: pagati secondo accordi noleggiatore
        const leasePayMonth = m + leaseDelayMonths;
        const leaseExpenses = vLeaseC + tLeaseC;
        if (leasePayMonth < totalMonthsHorizon) {
          cashOutflows[leasePayMonth] += leaseExpenses;
          cashOutflowBreakdown[leasePayMonth].leases += leaseExpenses;
        }
      }
    }
  });

  // Calcolo saldo cassa cumulativo e fabbisogno finanziario mese per mese
  let runningCash = initialCashBalance;
  let minCashBalance = initialCashBalance;
  let peakDeficitMonthIndex = 0;

  const monthlyCashFlow = [];

  for (let m = 0; m < 12; m++) {
    const pnl = monthlyPnl[m];
    const inFlow = cashInflows[m];
    const outFlow = cashOutflows[m];
    const netCash = inFlow - outFlow;

    const openingCash = runningCash;
    runningCash += netCash;

    if (runningCash < minCashBalance) {
      minCashBalance = runningCash;
      peakDeficitMonthIndex = m;
    }

    monthlyCashFlow.push({
      monthIndex: m,
      monthName: MONTH_NAMES[m],
      shortName: MONTH_SHORT_NAMES[m],
      // P&L
      revenue: pnl.revenue,
      cost: pnl.cost,
      mol: pnl.mol,
      molPercent: pnl.revenue > 0 ? (pnl.mol / pnl.revenue) * 100 : 0,
      activeProjectsCount: pnl.activeProjectsCount,
      costBreakdown: pnl.costBreakdown,
      // Cassa
      openingCash,
      cashIn: inFlow,
      cashOut: outFlow,
      netCashFlow: netCash,
      closingCash: runningCash,
      workingCapitalGap: runningCash < 0 ? Math.abs(runningCash) : 0,
      outflowBreakdown: cashOutflowBreakdown[m]
    });
  }

  // Totali annuali P&L
  const annualRevenue = monthlyPnl.reduce((sum, m) => sum + m.revenue, 0);
  const annualCost = monthlyPnl.reduce((sum, m) => sum + m.cost, 0);
  const annualMol = monthlyPnl.reduce((sum, m) => sum + m.mol, 0);
  const annualMolPercent = annualRevenue > 0 ? (annualMol / annualRevenue) * 100 : 0;

  // Totali annuali Cassa
  const totalCashIn = monthlyCashFlow.reduce((sum, m) => sum + m.cashIn, 0);
  const totalCashOut = monthlyCashFlow.reduce((sum, m) => sum + m.cashOut, 0);
  const netAnnualCash = totalCashIn - totalCashOut;
  const finalCashBalance = runningCash;

  // Fabbisogno finanziario di picco (Peak Working Capital Requirement)
  const peakFinancingRequired = minCashBalance < 0 ? Math.abs(minCashBalance) : 0;

  // Stima CO2 risparmiata (100% elettrico e biometano vs diesel tradizionale)
  // ~0.75 kg CO2 risparmiata per km
  const totalActiveKm = projects.reduce((sum, p) => {
    const days = (p.workingDaysMonth || 22) * (p.operatingMonths || 12);
    return sum + ((p.kmDaily || 250) * days);
  }, 0);
  const co2SavedKg = Math.round(totalActiveKm * 0.75);

  return {
    year,
    monthlyCashFlow,
    annualRevenue,
    annualCost,
    annualMol,
    annualMolPercent,
    totalCashIn,
    totalCashOut,
    netAnnualCash,
    initialCashBalance,
    finalCashBalance,
    peakFinancingRequired,
    peakDeficitMonth: MONTH_NAMES[peakDeficitMonthIndex],
    minCashBalance,
    co2SavedKg,
    totalActiveKm
  };
};

/**
 * Calcola l'impatto economico e finanziario di una singola commessa
 */
export const calculateSingleProjectMetrics = (project) => {
  const workingDays = project.workingDaysMonth || 22;
  const operatingMonths = project.operatingMonths || 12;

  // Costi giornalieri
  const driverCost = Number(project.driverCostDaily) || 0;
  const fuelCost = Number(project.fuelCostDaily) || 0;
  const tollsCost = Number(project.tollsDaily) || 0;
  const tiresCost = Number(project.tiresDaily) || 0;
  const otherCost = Number(project.otherCostsDaily) || 0;
  const partnerMargin = Number(project.partnerMarginDaily) || 0;
  const vehicleLease = Number(project.vehicleLeaseDaily) || 0;
  const trailerLease = Number(project.trailerLeaseDaily) || 0;

  const totalCostDaily = driverCost + fuelCost + tollsCost + tiresCost + otherCost +
    partnerMargin + vehicleLease + trailerLease;

  const revenueDaily = Number(project.revenueDaily) || 0;
  const molDaily = revenueDaily - totalCostDaily;
  const molPercent = revenueDaily > 0 ? (molDaily / revenueDaily) * 100 : 0;

  // Costi e ricavi mensili
  const monthlyCost = totalCostDaily * workingDays;
  const monthlyRevenue = revenueDaily * workingDays;
  const monthlyMol = molDaily * workingDays;

  // Costi e ricavi sull'intera commessa
  const totalProjectRevenue = monthlyRevenue * operatingMonths;
  const totalProjectCost = monthlyCost * operatingMonths;
  const totalProjectMol = monthlyMol * operatingMonths;

  // Fabbisogno finanziario circolante (Anticipazione richiesta)
  // Formula: se incasso a 60 gg e pago a 15-30 gg -> fabbisogno = circa 2 mensilità di costi
  const clientTerms = project.paymentTermsClient || 60;
  const supplierTerms = project.paymentTermsSuppliers || 30;
  const gapDays = Math.max(0, clientTerms - supplierTerms);
  const gapMonths = gapDays / 30;
  const estimatedWorkingCapitalGap = (monthlyCost * gapMonths) + (Number(project.depositAmount) || 0);

  return {
    totalCostDaily,
    revenueDaily,
    molDaily,
    molPercent,
    monthlyCost,
    monthlyRevenue,
    monthlyMol,
    totalProjectRevenue,
    totalProjectCost,
    totalProjectMol,
    gapDays,
    gapMonths,
    estimatedWorkingCapitalGap
  };
};

/**
 * Format valuta in standard italiano (€ 1.250,50)
 */
export const formatEUR = (value) => {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

export const formatPercent = (value) => {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  return `${num.toFixed(1)}%`;
};
