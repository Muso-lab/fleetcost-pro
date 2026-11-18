// Motore di calcolo per Forecast, Budget e Cash Flow con Termini di Pagamento Reali (DSO & DPO)
// Progettato specificamente per le esigenze di FOUR Trasporti Ecologici
// Include regole di tesoreria reali:
// 1. Noleggi: Giorno 10 M1 (Anticipato), Giorno 30 M1 (Fine mese), Giorno 20 M2 (Mese succ.)
// 2. LNG: Fatturazione quindicinale a 30 gg (100% esce a M2: 50% al 15 M2, 50% al 30 M2)
// 3. Telepass: Fatturazione quindicinale a 15 gg (50% esce a fine M1, 50% al 15 M2)
// 4. Recupero Accise: credito d'imposta trimestrale (Q+1) in compensazione F24 (Maggio, Agosto, Novembre, Febbraio)
// 5. Vista Cash Flow Doppia: Mensile (12 Mesi) + Dettaglio Quindicinale (24 Periodi)
// 6. Indici di Bancabilità: DSCR (Debt Service Coverage Ratio) & Fido Castelletto Consigliato

export const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

export const MONTH_SHORT_NAMES = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
];

export const LEASE_PAYMENT_TIMINGS = {
  M1_D10: {
    id: 'M1_D10',
    name: 'Giorno 10 Mese 1 (Anticipato / Inizio Mese)',
    shortName: '10 M1 (Anticipato)',
    monthOffset: 0,
    quindicina: 1, // 1ª quindicina (1-15)
    day: 10,
    description: 'Addebito SDD il giorno 10 dello stesso mese di noleggio'
  },
  M1_D30: {
    id: 'M1_D30',
    name: 'Giorno 30 Mese 1 (Fine Mese)',
    shortName: '30 M1 (Fine Mese)',
    monthOffset: 0,
    quindicina: 2, // 2ª quindicina (16-31)
    day: 30,
    description: 'Addebito SDD il giorno 30 a fine mese del noleggio'
  },
  M2_D20: {
    id: 'M2_D20',
    name: 'Giorno 20 Mese 2 (Mese Successivo / +20 gg d.f.f.m.)',
    shortName: '20 M2 (Posticipato)',
    monthOffset: 1,
    quindicina: 2, // 2ª quindicina (16-31) del mese successivo
    day: 20,
    description: 'Addebito SDD il giorno 20 del mese successivo a quello di noleggio'
  }
};

/**
 * Normalizza il timing di pagamento noleggio per retro-compatibilità
 */
export const normalizeLeaseTiming = (projectOrVehicle) => {
  if (!projectOrVehicle) return 'M1_D10';
  if (projectOrVehicle.leasePaymentTiming && LEASE_PAYMENT_TIMINGS[projectOrVehicle.leasePaymentTiming]) {
    return projectOrVehicle.leasePaymentTiming;
  }
  const terms = Number(projectOrVehicle.leasePaymentTerms ?? projectOrVehicle.paymentTermsLease);
  if (terms === 0 || terms === 10) return 'M1_D10';
  if (terms === 60 || terms === 20) return 'M2_D20';
  return 'M1_D30'; // default 30 gg fine mese
};

/**
 * Calcola se un progetto è attivo in un determinato mese dell'anno
 */
export const isProjectActiveInMonth = (project, monthIndex, targetYear = 2025) => {
  if (!project.startDate) return false;
  const start = new Date(project.startDate);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth(); // 0..11

  const currentMonthDate = new Date(targetYear, monthIndex, 1);
  const projectStartDate = new Date(startYear, startMonth, 1);

  const diffMonths = (currentMonthDate.getFullYear() - projectStartDate.getFullYear()) * 12 +
    (currentMonthDate.getMonth() - projectStartDate.getMonth());

  return diffMonths >= 0 && diffMonths < (project.operatingMonths || 12);
};

/**
 * Motore Principale: Calcola Piano Economico (P&L), Cash Flow Mensile,
 * Cash Flow Quindicinale (24 periodi), Recupero Accise e Indici di Bancabilità (DSCR & Fido)
 */
export const calculateAnnualBudgetAndCashFlow = (projects, options = {}) => {
  const {
    year = 2025,
    initialCashBalance = 50000,
    stressTestClientDays = 0, // es. +30 giorni ritardo clienti
    factoringEnabled = false,
    factoringAdvanceRate = 80, // % anticipata
    factoringFeePercent = 1.5,
    acciseRecoveryEnabled = true, // Toggle Recupero Accise Carburante
    acciseRatePerLiter = 0.21418, // Rimborso accise gasolio commerciale art. 24-ter TUA (€/L)
    taxRatePercent = 25 // Stima IRES/IRAP per calcolo DSCR
  } = options;

  // 1. Matrice P&L Competenza (12 Mesi)
  const monthlyPnl = Array(12).fill(0).map(() => ({
    revenue: 0,
    cost: 0,
    mol: 0,
    acciseCredit: 0,
    molNetOfAccise: 0,
    costBreakdown: {
      driver: 0,
      fuelGross: 0,
      fuelNet: 0,
      acciseCredit: 0,
      tolls: 0,
      tires: 0,
      vehicleLease: 0,
      trailerLease: 0,
      partnerMargin: 0,
      otherCosts: 0
    },
    activeProjectsCount: 0
  }));

  // Orizzonte cassa: 12 mesi correnti + 6 mesi di coda per tracciare code DSO (totale 18 mesi)
  const totalMonthsHorizon = 18;
  const cashInflows = Array(totalMonthsHorizon).fill(0);
  const cashOutflows = Array(totalMonthsHorizon).fill(0);
  const cashOutflowBreakdown = Array(totalMonthsHorizon).fill(0).map(() => ({
    drivers: 0,
    lngFuel: 0,
    tollsTelepass: 0,
    leasesM1D10: 0,
    leasesM1D30: 0,
    leasesM2D20: 0,
    leasesTotal: 0,
    suppliersOther: 0,
    deposits: 0
  }));
  const cashInflowBreakdown = Array(totalMonthsHorizon).fill(0).map(() => ({
    clientsRegular: 0,
    factoringAdvance: 0,
    acciseRefunds: 0
  }));

  // 2. Matrice Quindicinale (24 periodi nell'anno corrente + 12 periodi di coda = 36 quindicine)
  // Indice periodo: p = m * 2 + q (q = 0: 1ª quindicina 1-15; q = 1: 2ª quindicina 16-31)
  const totalBiweeklyHorizon = totalMonthsHorizon * 2;
  const biweeklyCashInflows = Array(totalBiweeklyHorizon).fill(0);
  const biweeklyCashOutflows = Array(totalBiweeklyHorizon).fill(0);
  const biweeklyOutflowBreakdown = Array(totalBiweeklyHorizon).fill(0).map(() => ({
    driversNet: 0, // Giorno 10 (1ª quindicina)
    driversInpsF24: 0, // Giorno 16 (2ª quindicina)
    lngFuel: 0,
    tollsTelepass: 0,
    leases: 0,
    otherSuppliers: 0,
    deposits: 0
  }));
  const biweeklyInflowBreakdown = Array(totalBiweeklyHorizon).fill(0).map(() => ({
    clients: 0,
    factoring: 0,
    accise: 0
  }));

  // Calcolo trimestrale accumulo credito accise (Q1: m 0..2, Q2: m 3..5, Q3: m 6..8, Q4: m 9..11)
  const quarterlyAcciseAccrued = [0, 0, 0, 0];

  // Elaborazione progetti
  projects.forEach(project => {
    const pTermsClient = (project.paymentTermsClient || 60) + stressTestClientDays;
    const pTermsSuppliers = project.paymentTermsSuppliers || 30;
    const leaseTimingKey = normalizeLeaseTiming(project);
    const leaseTiming = LEASE_PAYMENT_TIMINGS[leaseTimingKey];

    // DSO mesi clienti (es. 60 gg -> m + 2)
    const clientDelayMonths = Math.max(1, Math.round(pTermsClient / 30));
    // DPO fornitori generici (gomme, ecc.)
    const supplierDelayMonths = Math.max(0, Math.round(pTermsSuppliers / 30));

    // Caparra iniziale start-up
    if (project.depositAmount && project.depositAmount > 0 && project.startDate) {
      const start = new Date(project.startDate);
      if (start.getFullYear() === year) {
        const startM = start.getMonth();
        if (startM >= 0 && startM < 12) {
          cashOutflows[startM] += project.depositAmount;
          cashOutflowBreakdown[startM].deposits += project.depositAmount;

          const startBiweekly = startM * 2; // 1ª quindicina
          biweeklyCashOutflows[startBiweekly] += project.depositAmount;
          biweeklyOutflowBreakdown[startBiweekly].deposits += project.depositAmount;
        }
      }
    }

    // Itera sui 12 mesi dell'anno corrente
    for (let m = 0; m < 12; m++) {
      if (isProjectActiveInMonth(project, m, year)) {
        const rev = Number(project.monthlyRevenue) || 0;
        const workingDays = project.workingDaysMonth || 22;

        const driverC = (Number(project.driverCostDaily) || 0) * workingDays;
        const fuelGrossC = (Number(project.fuelCostDaily) || 0) * workingDays;
        const tollsC = (Number(project.tollsDaily) || 0) * workingDays;
        const tiresC = (Number(project.tiresDaily) || 0) * workingDays;
        const vLeaseC = (Number(project.vehicleLeaseDaily) || 0) * workingDays;
        const tLeaseC = (Number(project.trailerLeaseDaily) || 0) * workingDays;
        const totalLeaseC = vLeaseC + tLeaseC;
        const partC = (Number(project.partnerMarginDaily) || 0) * workingDays;
        const otherC = (Number(project.otherCostsDaily) || 0) * workingDays;

        // Calcolo credito accise per questa commessa
        // Se il veicolo usa gasolio o ha flag accise oppure non è full electric
        let acciseCreditMonthly = 0;
        const isEligibleFuel = project.acciseRecoveryEligible !== false &&
          (project.fuelType === 'gasolio' || project.fuelTypeId === 'gasolio' ||
           (fuelGrossC > 0 && project.vehicleCategory !== 'motrice_bev' && project.fuelTypeId !== 'elettrico'));

        if (acciseRecoveryEnabled && isEligibleFuel) {
          // Stima litri consumati: costo carburante diviso prezzo stimato (~1.42 €/L) o km * consumo
          const kmPerMonth = (Number(project.kmDaily) || 300) * workingDays;
          // Per trattori diesel 44t consumo medio ~32 L/100km
          const estimatedLiters = (kmPerMonth * 32) / 100;
          acciseCreditMonthly = Math.round(estimatedLiters * acciseRatePerLiter * 100) / 100;
        }

        const fuelNetC = Math.max(0, fuelGrossC - acciseCreditMonthly);
        const costPnl = driverC + (acciseRecoveryEnabled ? fuelNetC : fuelGrossC) + tollsC + tiresC + totalLeaseC + partC + otherC;
        const molPnl = rev - costPnl;

        // 1. P&L Competenza Mensile
        monthlyPnl[m].revenue += rev;
        monthlyPnl[m].cost += costPnl;
        monthlyPnl[m].mol += molPnl;
        monthlyPnl[m].acciseCredit += acciseCreditMonthly;
        monthlyPnl[m].molNetOfAccise += (rev - (costPnl - (acciseRecoveryEnabled ? 0 : acciseCreditMonthly)));
        monthlyPnl[m].activeProjectsCount += 1;

        monthlyPnl[m].costBreakdown.driver += driverC;
        monthlyPnl[m].costBreakdown.fuelGross += fuelGrossC;
        monthlyPnl[m].costBreakdown.fuelNet += fuelNetC;
        monthlyPnl[m].costBreakdown.acciseCredit += acciseCreditMonthly;
        monthlyPnl[m].costBreakdown.tolls += tollsC;
        monthlyPnl[m].costBreakdown.tires += tiresC;
        monthlyPnl[m].costBreakdown.vehicleLease += vLeaseC;
        monthlyPnl[m].costBreakdown.trailerLease += tLeaseC;
        monthlyPnl[m].costBreakdown.partnerMargin += partC;
        monthlyPnl[m].costBreakdown.otherCosts += otherC;

        // Accumulo per trimestre per recupero accise F24 (Q1=m0..2, Q2=m3..5, Q3=m6..8, Q4=m9..11)
        const qIndex = Math.floor(m / 3);
        quarterlyAcciseAccrued[qIndex] += acciseCreditMonthly;

        // 2. CASH FLOW ENTRATE (Incassi Clienti)
        if (factoringEnabled) {
          const advanceAmount = rev * (factoringAdvanceRate / 100);
          const fee = rev * (factoringFeePercent / 100);
          const remainingAmount = rev - advanceAmount - fee;

          // Mensile
          cashInflows[m] += (advanceAmount - fee);
          cashInflowBreakdown[m].factoringAdvance += (advanceAmount - fee);
          const collMonth = m + clientDelayMonths;
          if (collMonth < totalMonthsHorizon) {
            cashInflows[collMonth] += remainingAmount;
            cashInflowBreakdown[collMonth].clientsRegular += remainingAmount;
          }

          // Quindicinale
          const biweeklyCurrent = m * 2 + 1; // Fine mese m
          biweeklyCashInflows[biweeklyCurrent] += (advanceAmount - fee);
          biweeklyInflowBreakdown[biweeklyCurrent].factoring += (advanceAmount - fee);
          const biweeklyColl = (m + clientDelayMonths) * 2 + 1; // Fine mese di saldo
          if (biweeklyColl < totalBiweeklyHorizon) {
            biweeklyCashInflows[biweeklyColl] += remainingAmount;
            biweeklyInflowBreakdown[biweeklyColl].clients += remainingAmount;
          }
        } else {
          // Senza factoring: incasso a scadenza naturale
          const collMonth = m + clientDelayMonths;
          if (collMonth < totalMonthsHorizon) {
            cashInflows[collMonth] += rev;
            cashInflowBreakdown[collMonth].clientsRegular += rev;
          }
          // Nel quindicinale l'incasso arriva tipicamente al giorno 30/31 (2ª quindicina)
          const biweeklyColl = (m + clientDelayMonths) * 2 + 1;
          if (biweeklyColl < totalBiweeklyHorizon) {
            biweeklyCashInflows[biweeklyColl] += rev;
            biweeklyInflowBreakdown[biweeklyColl].clients += rev;
          }
        }

        // 3. CASH FLOW USCITE - REGOLE DI TESORERIA REALI FOUR

        // A. AUTISTI: Pagati nel Mese Successivo (M2)
        // Mensile: esce a m + 1
        const driverMonth = m + 1;
        if (driverMonth < totalMonthsHorizon) {
          cashOutflows[driverMonth] += driverC;
          cashOutflowBreakdown[driverMonth].drivers += driverC;
        }
        // Quindicinale:
        // - Stipendio Netto (~65%) pagato il 10 del mese (1ª Quindicina 1-15)
        // - Contributi INPS / F24 (~35%) pagati il 16 del mese (2ª Quindicina 16-31)
        const driverNetSalary = driverC * 0.65;
        const driverInpsF24 = driverC * 0.35;
        const biweeklyDriverNet = (m + 1) * 2 + 0; // 1ª quindicina giorno 10
        const biweeklyDriverF24 = (m + 1) * 2 + 1; // 2ª quindicina giorno 16
        if (biweeklyDriverNet < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyDriverNet] += driverNetSalary;
          biweeklyOutflowBreakdown[biweeklyDriverNet].driversNet += driverNetSalary;
        }
        if (biweeklyDriverF24 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyDriverF24] += driverInpsF24;
          biweeklyOutflowBreakdown[biweeklyDriverF24].driversInpsF24 += driverInpsF24;
        }

        // B. CARBURANTE / LNG: Fatturazione Quindicinale a 30 gg data fattura
        // 1ª Quindicina (1-15 M1) fattura il 15 M1 -> pagata il 15 M2 (1ª Quindicina M2)
        // 2ª Quindicina (16-31 M1) fattura il 30 M1 -> pagata il 30 M2 (2ª Quindicina M2)
        // -> Mensile: il 100% dell'LNG consumato nel mese m esce al mese m + 1!
        const fuelPayMonth = m + 1;
        if (fuelPayMonth < totalMonthsHorizon) {
          cashOutflows[fuelPayMonth] += fuelGrossC;
          cashOutflowBreakdown[fuelPayMonth].lngFuel += fuelGrossC;
        }
        // Quindicinale: 50% esce a giorno 15 M2, 50% a giorno 30 M2
        const halfFuel = fuelGrossC / 2;
        const biweeklyFuelQ1 = (m + 1) * 2 + 0; // 15 M2
        const biweeklyFuelQ2 = (m + 1) * 2 + 1; // 30 M2
        if (biweeklyFuelQ1 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyFuelQ1] += halfFuel;
          biweeklyOutflowBreakdown[biweeklyFuelQ1].lngFuel += halfFuel;
        }
        if (biweeklyFuelQ2 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyFuelQ2] += halfFuel;
          biweeklyOutflowBreakdown[biweeklyFuelQ2].lngFuel += halfFuel;
        }

        // C. TELEPASS / PEDAGGI: Fatturazione Quindicinale a 15 gg data fattura
        // 1ª Quindicina (1-15 M1) fattura il 15 M1 -> pagata a 15 gg = 30 M1 (Fine Mese 1)!
        // 2ª Quindicina (16-31 M1) fattura il 30 M1 -> pagata a 15 gg = 15 M2 (Metà Mese 2)!
        // -> Mensile: 50% esce al mese m, 50% esce al mese m + 1!
        const halfTolls = tollsC / 2;
        if (m < totalMonthsHorizon) {
          cashOutflows[m] += halfTolls;
          cashOutflowBreakdown[m].tollsTelepass += halfTolls;
        }
        if (m + 1 < totalMonthsHorizon) {
          cashOutflows[m + 1] += halfTolls;
          cashOutflowBreakdown[m + 1].tollsTelepass += halfTolls;
        }
        // Quindicinale:
        // - 50% esce nella 2ª Quindicina del mese m (giorno 30)
        // - 50% esce nella 1ª Quindicina del mese m+1 (giorno 15)
        const biweeklyTollsM1Q2 = m * 2 + 1;
        const biweeklyTollsM2Q1 = (m + 1) * 2 + 0;
        if (biweeklyTollsM1Q2 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyTollsM1Q2] += halfTolls;
          biweeklyOutflowBreakdown[biweeklyTollsM1Q2].tollsTelepass += halfTolls;
        }
        if (biweeklyTollsM2Q1 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyTollsM2Q1] += halfTolls;
          biweeklyOutflowBreakdown[biweeklyTollsM2Q1].tollsTelepass += halfTolls;
        }

        // D. NOLEGGI MEZZI & RIMORCHI: 3 Opzioni
        // - M1_D10: 10 M1 (Anticipato / Inizio Mese) -> mese m, 1ª quindicina
        // - M1_D30: 30 M1 (Fine Mese) -> mese m, 2ª quindicina
        // - M2_D20: 20 M2 (Mese Successivo) -> mese m + 1, 2ª quindicina
        const leaseMonth = m + leaseTiming.monthOffset;
        if (leaseMonth < totalMonthsHorizon) {
          cashOutflows[leaseMonth] += totalLeaseC;
          cashOutflowBreakdown[leaseMonth].leasesTotal += totalLeaseC;
          if (leaseTimingKey === 'M1_D10') cashOutflowBreakdown[leaseMonth].leasesM1D10 += totalLeaseC;
          else if (leaseTimingKey === 'M1_D30') cashOutflowBreakdown[leaseMonth].leasesM1D30 += totalLeaseC;
          else cashOutflowBreakdown[leaseMonth].leasesM2D20 += totalLeaseC;
        }
        // Quindicinale:
        // M1_D10: q = 0 (giorno 10)
        // M1_D30: q = 1 (giorno 30)
        // M2_D20: q = 1 (giorno 20)
        const biweeklyLeasePeriod = leaseMonth * 2 + (leaseTiming.quindicina - 1);
        if (biweeklyLeasePeriod < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyLeasePeriod] += totalLeaseC;
          biweeklyOutflowBreakdown[biweeklyLeasePeriod].leases += totalLeaseC;
        }

        // E. ALTRI FORNITORI, GOMME & TERZISTI: Pagati a DPO
        const otherSuppliersC = tiresC + partC + otherC;
        const otherSuppliersMonth = m + supplierDelayMonths;
        if (otherSuppliersMonth < totalMonthsHorizon) {
          cashOutflows[otherSuppliersMonth] += otherSuppliersC;
          cashOutflowBreakdown[otherSuppliersMonth].suppliersOther += otherSuppliersC;
        }
        const biweeklyOtherSuppliersPeriod = otherSuppliersMonth * 2 + 1; // Fine mese
        if (biweeklyOtherSuppliersPeriod < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyOtherSuppliersPeriod] += otherSuppliersC;
          biweeklyOutflowBreakdown[biweeklyOtherSuppliersPeriod].otherSuppliers += otherSuppliersC;
        }
      }
    }
  });

  // 4. ACCREDITO RECUPERO ACCISE TRIMESTRALE (Q+1 in compensazione F24)
  // Q1 (Gen-Feb-Mar) -> Maggio (Mese index 4 / periodo quindicinale 8)
  // Q2 (Apr-Mag-Giu) -> Agosto (Mese index 7 / periodo quindicinale 14)
  // Q3 (Lug-Ago-Set) -> Novembre (Mese index 10 / periodo quindicinale 20)
  // Q4 (Ott-Nov-Dic) -> Febbraio anno succ. (Mese index 13 / periodo quindicinale 26)
  if (acciseRecoveryEnabled) {
    const acciseQuarterMonths = [4, 7, 10, 13];
    quarterlyAcciseAccrued.forEach((acciseCredit, qIdx) => {
      if (acciseCredit > 0) {
        const creditMonth = acciseQuarterMonths[qIdx];
        if (creditMonth < totalMonthsHorizon) {
          cashInflows[creditMonth] += acciseCredit;
          cashInflowBreakdown[creditMonth].acciseRefunds += acciseCredit;
        }
        // In quindicinale entra al giorno 16 (in compensazione F24 con contributi autisti!)
        const biweeklyPeriod = creditMonth * 2 + 1; // 2ª quindicina
        if (biweeklyPeriod < totalBiweeklyHorizon) {
          biweeklyCashInflows[biweeklyPeriod] += acciseCredit;
          biweeklyInflowBreakdown[biweeklyPeriod].accise += acciseCredit;
        }
      }
    });
  }

  // 5. CALCOLO SALDI DI CASSA MENSILI (12 Mesi)
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
      acciseCredit: pnl.acciseCredit,
      activeProjectsCount: pnl.activeProjectsCount,
      costBreakdown: pnl.costBreakdown,
      // Cassa
      openingCash,
      cashIn: inFlow,
      cashOut: outFlow,
      netCashFlow: netCash,
      closingCash: runningCash,
      workingCapitalGap: runningCash < 0 ? Math.abs(runningCash) : 0,
      outflowBreakdown: cashOutflowBreakdown[m],
      inflowBreakdown: cashInflowBreakdown[m]
    });
  }

  // 6. CALCOLO SALDI DI CASSA QUINDICINALI (24 Periodi)
  let biweeklyRunningCash = initialCashBalance;
  let biweeklyMinCashBalance = initialCashBalance;
  let peakDeficitBiweeklyIndex = 0;
  const biweeklyCashFlow = [];

  for (let p = 0; p < 24; p++) {
    const monthIdx = Math.floor(p / 2);
    const quindicinaNum = (p % 2) + 1;
    const label = `${MONTH_SHORT_NAMES[monthIdx]} Q${quindicinaNum} (${quindicinaNum === 1 ? '1-15' : '16-31'})`;
    const shortLabel = `${MONTH_SHORT_NAMES[monthIdx]}-${quindicinaNum}`;

    const inFlow = biweeklyCashInflows[p];
    const outFlow = biweeklyCashOutflows[p];
    const netCash = inFlow - outFlow;

    const openingCash = biweeklyRunningCash;
    biweeklyRunningCash += netCash;

    if (biweeklyRunningCash < biweeklyMinCashBalance) {
      biweeklyMinCashBalance = biweeklyRunningCash;
      peakDeficitBiweeklyIndex = p;
    }

    biweeklyCashFlow.push({
      periodIndex: p,
      monthIndex: monthIdx,
      quindicina: quindicinaNum,
      label,
      shortLabel,
      openingCash,
      cashIn: inFlow,
      cashOut: outFlow,
      netCashFlow: netCash,
      closingCash: biweeklyRunningCash,
      workingCapitalGap: biweeklyRunningCash < 0 ? Math.abs(biweeklyRunningCash) : 0,
      outflowBreakdown: biweeklyOutflowBreakdown[p],
      inflowBreakdown: biweeklyInflowBreakdown[p]
    });
  }

  // 7. TOTALI ANNUALI
  const annualRevenue = monthlyPnl.reduce((sum, m) => sum + m.revenue, 0);
  const annualCost = monthlyPnl.reduce((sum, m) => sum + m.cost, 0);
  const annualMol = monthlyPnl.reduce((sum, m) => sum + m.mol, 0);
  const annualMolPercent = annualRevenue > 0 ? (annualMol / annualRevenue) * 100 : 0;
  const annualAcciseCredit = monthlyPnl.reduce((sum, m) => sum + m.acciseCredit, 0);

  const totalCashIn = monthlyCashFlow.reduce((sum, m) => sum + m.cashIn, 0);
  const totalCashOut = monthlyCashFlow.reduce((sum, m) => sum + m.cashOut, 0);
  const netAnnualCash = totalCashIn - totalCashOut;
  const finalCashBalance = runningCash;

  // 8. INDICI DI BANCABILITÀ & SOSTENIBILITÀ DEL DEBITO (BANK-GRADE METRICS)
  // Canoni di noleggio e leasing totali annui
  const totalAnnualLeases = monthlyPnl.reduce((sum, m) =>
    sum + m.costBreakdown.vehicleLease + m.costBreakdown.trailerLease, 0);

  // Stima imposte (IRES/IRAP ~25% su MOL)
  const estimatedTaxes = annualMol > 0 ? annualMol * (taxRatePercent / 100) : 0;
  const operatingCashFlowPreDebt = Math.max(0, annualMol - estimatedTaxes);

  // DSCR (Debt Service Coverage Ratio): Cash Flow Operativo / Servizio Debito (Canoni NLT)
  const dscr = totalAnnualLeases > 0 ? (operatingCashFlowPreDebt / totalAnnualLeases) : 9.99;
  let dscrRating = 'Ottimo (Bancabile)';
  let dscrColor = 'emerald';
  if (dscr < 1.05) {
    dscrRating = 'Critico (Tensione Debito)';
    dscrColor = 'rose';
  } else if (dscr < 1.25) {
    dscrRating = 'Adeguato (Monitorare)';
    dscrColor = 'amber';
  }

  // Fabbisogno finanziario di picco (Max tra mensile e quindicinale per cogliere i picchi infrasettimanali!)
  const peakFinancingRequired = Math.max(
    minCashBalance < 0 ? Math.abs(minCashBalance) : 0,
    biweeklyMinCashBalance < 0 ? Math.abs(biweeklyMinCashBalance) : 0
  );

  // Fido Bancario / Castelletto SBF Minimo Consigliato (con buffer prudenziale 15% arrotondato a € 5.000)
  const suggestedCreditLine = peakFinancingRequired > 0
    ? Math.ceil((peakFinancingRequired * 1.15) / 5000) * 5000
    : 15000;

  // CO2 Risparmiata stima (0.75 kg CO2/km con Bio-LNG ed Elettrico vs Diesel standard)
  const totalActiveKm = projects.reduce((sum, p) => {
    const days = (p.workingDaysMonth || 22) * (p.operatingMonths || 12);
    return sum + ((p.kmDaily || 250) * days);
  }, 0);
  const co2SavedKg = Math.round(totalActiveKm * 0.75);

  // Template Calendario Scadenze Mensili di Cassa (Cash Schedule)
  const cashScheduleDeadlines = [
    {
      day: 10,
      title: 'Giorno 10: Noleggi M1_D10 & Stipendi Netti Autisti',
      type: 'outflow',
      description: 'Addebito SDD canoni anticipati (Volvo/Scania) e bonifico stipendi netti dipendenti CCNL.'
    },
    {
      day: 15,
      title: 'Giorno 15: 1ª Quindicina LNG & 2ª Quindicina Telepass',
      type: 'outflow',
      description: 'Saldo prima metà LNG mese precedente + saldo seconda metà Telepass mese precedente.'
    },
    {
      day: 16,
      title: 'Giorno 16: Oneri F24 INPS/IRPEF & Compensazione Accise',
      type: 'mixed',
      description: 'Versamento contributi e ritenute dipendenti, compensabile con crediti tributari e Accise Q+1.'
    },
    {
      day: 20,
      title: 'Giorno 20: Noleggi M2_D20 (Mese Successivo)',
      type: 'outflow',
      description: 'Addebito SDD noleggi a lungo termine posticipati a 20 gg d.f.f.m. (Iveco/Lessor terzi).'
    },
    {
      day: 30,
      title: 'Giorno 30/31: 1ª Quindicina Telepass, 2ª Quindicina LNG & Incassi Clienti',
      type: 'mixed',
      description: 'Saldo prima metà pedaggi mese corrente, saldo seconda metà LNG mese precedente e incasso fatture clienti a 60/90 gg.'
    }
  ];

  return {
    year,
    monthlyCashFlow,
    biweeklyCashFlow,
    annualRevenue,
    annualCost,
    annualMol,
    annualMolPercent,
    annualAcciseCredit,
    quarterlyAcciseAccrued,
    totalCashIn,
    totalCashOut,
    netAnnualCash,
    initialCashBalance,
    finalCashBalance,
    peakFinancingRequired,
    suggestedCreditLine,
    peakDeficitMonth: MONTH_NAMES[peakDeficitMonthIndex],
    peakDeficitBiweekly: biweeklyCashFlow[peakDeficitBiweeklyIndex]?.label || '',
    minCashBalance,
    biweeklyMinCashBalance,
    dscr,
    dscrRating,
    dscrColor,
    totalAnnualLeases,
    co2SavedKg,
    totalActiveKm,
    cashScheduleDeadlines
  };
};

/**
 * Calcola metriche economiche e finanziarie per una singola commessa
 */
export const calculateSingleProjectMetrics = (project) => {
  const workingDays = project.workingDaysMonth || 22;
  const operatingMonths = project.operatingMonths || 12;

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

  const monthlyCost = totalCostDaily * workingDays;
  const monthlyRevenue = revenueDaily * workingDays;
  const monthlyMol = molDaily * workingDays;

  const totalProjectRevenue = monthlyRevenue * operatingMonths;
  const totalProjectCost = monthlyCost * operatingMonths;
  const totalProjectMol = monthlyMol * operatingMonths;

  // Working capital gap
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

/**
 * Calcola il costo chilometrico dei pneumatici con durate differenziate FOUR:
 * - Semirimorchi: 80.000 km (6 gomme da rimorchio)
 * - Trattori Elettrici: 50.000 km (6 gomme, coppia istantanea 2400+ Nm e peso batterie)
 * - Motrici Elettriche: 80.000 km (4 o 6 gomme)
 * - Trattori Bio-LNG / Termici: 85.000 km (6 gomme)
 */
export const calculateTireCostPerKm = (vehicle, trailer, options = {}) => {
  const {
    costPerTire = 450,
    lifeTrailer = 80000,
    lifeTractorElectric = 50000,
    lifeRigidElectric = 80000,
    lifeTractorBiolng = 85000
  } = options;

  let vehicleRate = 0;
  let trailerRate = 0;

  if (vehicle) {
    const isElectric = vehicle.fuelTypeId === 'elettrico' || vehicle.fuelType === 'elettrico';
    const isTractor = vehicle.category === 'trattore';
    const isRigid = vehicle.category === 'motrice';

    if (isTractor && isElectric) {
      const tires = vehicle.tireCount || 6;
      vehicleRate = (tires * costPerTire) / lifeTractorElectric; // 6 * 450 / 50000 = 0.0540 €/km
    } else if (isRigid && isElectric) {
      const tires = vehicle.tireCount || (vehicle.capacityPlt && vehicle.capacityPlt <= 12 ? 4 : 6);
      vehicleRate = (tires * costPerTire) / lifeRigidElectric; // 6 * 450 / 80000 = 0.0338 €/km
    } else if (isTractor) {
      const tires = vehicle.tireCount || 6;
      vehicleRate = (tires * costPerTire) / lifeTractorBiolng; // 6 * 450 / 85000 = 0.0318 €/km
    } else {
      const tires = vehicle.tireCount || 4;
      vehicleRate = (tires * costPerTire) / lifeRigidElectric;
    }
  }

  if (trailer) {
    const tires = trailer.tireCount || 6;
    trailerRate = (tires * costPerTire) / lifeTrailer; // 6 * 450 / 80000 = 0.03375 €/km
  }

  const total = vehicleRate + trailerRate;
  return {
    vehicleRate: +vehicleRate.toFixed(4),
    trailerRate: +trailerRate.toFixed(4),
    totalRate: +(total > 0 ? total : 0.04).toFixed(4)
  };
};
