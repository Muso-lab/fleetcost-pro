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
 * Normalizza il timing di pagamento del noleggio semirimorchio
 */
export const normalizeTrailerLeaseTiming = (project, trailer = null) => {
  if (project?.trailerLeasePaymentTiming && LEASE_PAYMENT_TIMINGS[project.trailerLeasePaymentTiming]) {
    return project.trailerLeasePaymentTiming;
  }
  if (trailer) {
    return normalizeLeaseTiming(trailer);
  }
  return normalizeLeaseTiming(project);
};

/**
 * Calcola se un progetto è attivo in un determinato mese dell'anno
 */
export const isProjectActiveInMonth = (project, monthIndex, targetYear = 2026, options = {}) => {
  if (!project.startDate) return false;
  const start = new Date(project.startDate);
  const startYear = start.getFullYear();
  const startMonth = start.getMonth(); // 0..11

  const currentMonthDate = new Date(targetYear, monthIndex, 1);
  const projectStartDate = new Date(startYear, startMonth, 1);

  const diffMonths = (currentMonthDate.getFullYear() - projectStartDate.getFullYear()) * 12 +
    (currentMonthDate.getMonth() - projectStartDate.getMonth());

  const opMonths = project.operatingMonths || 12;

  // 1. Periodo contrattuale naturale
  if (diffMonths >= 0 && diffMonths < opMonths) {
    return true;
  }

  // 2. Rollover automatico / Proiezione anno successivo dando per buoni i dati dell'anno precedente
  const isRolloverEnabled = options.rolloverPreviousYearBudget !== undefined
    ? options.rolloverPreviousYearBudget
    : targetYear > 2026;

  if (isRolloverEnabled && targetYear > startYear) {
    const prevYear = targetYear - 1;
    const endMonthIndex = startMonth + opMonths;
    const endYear = startYear + Math.floor((endMonthIndex - 1) / 12);
    // Se era attivo durante o fino alla fine dell'anno precedente, proietta la continuità a regime
    if (endYear >= prevYear) {
      return true;
    }
  }

  // 3. Storico consuntivo anno precedente (es. 2025 quando le commesse sono allineate al budget 2026)
  if (targetYear < startYear) {
    // Mesi di avvio scaglionati storici nel 2025 per la flotta FOUR
    const historicalStartMonths = {
      'CAM-BO-02': 1, // Febbraio 2025
      'CHR-01': 1,    // Febbraio 2025
      'DEC-RM-01': 2, // Marzo 2025
      'KN-03': 2,     // Marzo 2025
      'TIG-03': 4     // Maggio 2025
    };
    const minMonth = historicalStartMonths[project.code] !== undefined ? historicalStartMonths[project.code] : 0;
    if (monthIndex >= minMonth) {
      return true;
    }
  }

  return false;
};

/**
 * Calcola validità, data di scadenza e stato contrattuale di un progetto
 */
export const getContractValidity = (project, referenceDate = new Date()) => {
  const startStr = project?.startDate || '2026-01-01';
  const months = Number(project?.operatingMonths) || 12;
  const parts = startStr.split('-');
  const startYear = parseInt(parts[0], 10) || 2026;
  const startMonth = (parseInt(parts[1], 10) || 1) - 1; // 0..11
  const startDay = parseInt(parts[2], 10) || 1;

  const startDate = new Date(startYear, startMonth, startDay);
  const endDate = new Date(startYear, startMonth + months, 0);

  const MONTH_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const formattedStart = `${startDate.getDate().toString().padStart(2, '0')} ${MONTH_SHORT[startDate.getMonth()]} ${startDate.getFullYear()}`;
  const formattedEnd = `${endDate.getDate().toString().padStart(2, '0')} ${MONTH_SHORT[endDate.getMonth()]} ${endDate.getFullYear()}`;

  const isExpired = endDate < referenceDate;
  const diffDays = Math.ceil((endDate - referenceDate) / (1000 * 60 * 60 * 24));
  const isExpiringSoon = !isExpired && diffDays <= 60;
  const isActive = !isExpired;

  return {
    startDate,
    endDate,
    startStr,
    endStr: endDate.toISOString().split('T')[0],
    formattedStart,
    formattedEnd,
    months,
    diffDays,
    isExpired,
    isExpiringSoon,
    isActive,
    endYear: endDate.getFullYear()
  };
};

/**
 * Motore Principale: Calcola Piano Economico (P&L), Cash Flow Mensile,
 * Cash Flow Quindicinale (24 periodi), Recupero Accise e Indici di Bancabilità (DSCR & Fido)
 */
export const calculateAnnualBudgetAndCashFlow = (projects, options = {}) => {
  const {
    year = 2026,
    initialCashBalance = 50000,
    stressTestClientDays = 0, // es. +30 giorni ritardo clienti
    factoringEnabled = false,
    factoringAdvanceRate = 80, // % anticipata
    factoringFeePercent = 1.5,
    acciseRecoveryEnabled = true, // Toggle Recupero Accise Carburante
    acciseRatePerLiter = 0.21418, // Rimborso accise gasolio commerciale art. 24-ter TUA (€/L)
    taxRatePercent = 25, // Stima IRES/IRAP per calcolo DSCR
    rolloverPreviousYearBudget = options.rolloverPreviousYearBudget !== undefined ? options.rolloverPreviousYearBudget : (year > 2026)
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
      fuel: 0,
      fuelGross: 0,
      fuelNet: 0,
      acciseCredit: 0,
      tolls: 0,
      tires: 0,
      vehicleLease: 0,
      trailerLease: 0,
      refrigeration: 0,
      telematics: 0,
      washing: 0,
      extraCosts: 0,
      partnerMargin: 0,
      porterage: 0,
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
    const pTermsClient = (project.paymentTermsClient !== undefined ? Number(project.paymentTermsClient) : 60) + stressTestClientDays;
    const pTermsSuppliers = project.paymentTermsSuppliers !== undefined ? Number(project.paymentTermsSuppliers) : 30;
    const pTermsDriver = project.paymentTermsDriver !== undefined ? Number(project.paymentTermsDriver) : 16;
    const pTermsFuel = project.paymentTermsFuel !== undefined ? Number(project.paymentTermsFuel) : 30;
    const pTermsTolls = project.paymentTermsTolls !== undefined ? Number(project.paymentTermsTolls) : 15;
    const pTermsTires = project.paymentTermsTires !== undefined ? Number(project.paymentTermsTires) : 30;
    const pTermsFridge = project.paymentTermsRefrigeration !== undefined ? Number(project.paymentTermsRefrigeration) : 30;
    const pTermsTelematics = project.paymentTermsTelematics !== undefined ? Number(project.paymentTermsTelematics) : 30;
    const pTermsWashing = project.paymentTermsWashing !== undefined ? Number(project.paymentTermsWashing) : 30;
    const pTermsExtra = project.paymentTermsExtra !== undefined ? Number(project.paymentTermsExtra) : 30;

    const leaseTimingKey = normalizeLeaseTiming(project);
    const leaseTiming = LEASE_PAYMENT_TIMINGS[leaseTimingKey];
    const trailerLeaseTimingKey = normalizeTrailerLeaseTiming(project);
    const trailerLeaseTiming = LEASE_PAYMENT_TIMINGS[trailerLeaseTimingKey];

    // DSO mesi clienti (es. 60 gg -> m + 2)
    const clientDelayMonths = Math.max(1, Math.round(pTermsClient / 30));
    // DPO ritardi in mesi per singola componente
    const driverDelayMonths = pTermsDriver <= 0 ? 0 : Math.max(1, Math.round(pTermsDriver / 30));
    const fuelDelayMonths = Math.max(0, Math.round(pTermsFuel / 30));
    const supplierDelayMonths = Math.max(0, Math.round(pTermsSuppliers / 30));
    const tiresDelayMonths = Math.max(0, Math.round(pTermsTires / 30));
    const fridgeDelayMonths = Math.max(0, Math.round(pTermsFridge / 30));
    const telematicsDelayMonths = Math.max(0, Math.round(pTermsTelematics / 30));
    const washingDelayMonths = Math.max(0, Math.round(pTermsWashing / 30));
    const extraDelayMonths = Math.max(0, Math.round(pTermsExtra / 30));

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

    // Eventuale costo extra Una Tantum in uscita nell'anno di avvio
    const extraOneTimeAmount = (project.extraCostFrequency === 'one_time' && Number(project.extraCostAmount) > 0)
      ? Number(project.extraCostAmount)
      : 0;
    if (extraOneTimeAmount > 0 && project.startDate) {
      const start = new Date(project.startDate);
      if (start.getFullYear() === year) {
        const payM = start.getMonth() + extraDelayMonths;
        if (payM >= 0 && payM < totalMonthsHorizon) {
          cashOutflows[payM] += extraOneTimeAmount;
          cashOutflowBreakdown[payM].suppliersOther += extraOneTimeAmount;
          const bw = payM * 2 + 1;
          if (bw < totalBiweeklyHorizon) {
            biweeklyCashOutflows[bw] += extraOneTimeAmount;
            biweeklyOutflowBreakdown[bw].otherSuppliers += extraOneTimeAmount;
          }
        }
      }
    }

    // Helper locale per imputare un'uscita con proprio ritardo
    const pushSupplierOutflow = (monthIdx, delayM, amount) => {
      if (!amount || amount <= 0) return;
      const targetM = monthIdx + delayM;
      if (targetM < totalMonthsHorizon) {
        cashOutflows[targetM] += amount;
        cashOutflowBreakdown[targetM].suppliersOther += amount;
      }
      const targetBw = targetM * 2 + 1;
      if (targetBw < totalBiweeklyHorizon) {
        biweeklyCashOutflows[targetBw] += amount;
        biweeklyOutflowBreakdown[targetBw].otherSuppliers += amount;
      }
    };

    // Itera sui 12 mesi dell'anno corrente
    for (let m = 0; m < 12; m++) {
      if (isProjectActiveInMonth(project, m, year, { rolloverPreviousYearBudget })) {
        const rev = Number(project.monthlyRevenue) || 0;
        const workingDays = project.workingDaysMonth || 22;

        const driverC = (Number(project.driverCostDaily) || 0) * workingDays;
        const fuelGrossC = project.energyPayer === 'client' ? 0 : (Number(project.fuelCostDaily) || 0) * workingDays;
        const tollsC = (Number(project.tollsDaily) || 0) * workingDays;
        const tiresC = (Number(project.tiresDaily) || 0) * workingDays;
        const vLeaseC = (Number(project.vehicleLeaseDaily) || 0) * workingDays;
        const tLeaseC = (Number(project.trailerLeaseDaily) || 0) * workingDays;
        const totalLeaseC = vLeaseC + tLeaseC;
        const fridgeC = (Number(project.refrigerationCostDaily) || 0) * workingDays;
        const telematicsC = (Number(project.telematicsCostDaily) || 0) * workingDays;
        const washingC = (Number(project.washingCostDaily) || 0) * workingDays;
        const extraC = (Number(project.extraCostDaily) || 0) * workingDays;
        const partC = (Number(project.partnerMarginDaily) || 0) * workingDays;
        const porterageC = (Number(project.porterageDaily) || 0) * workingDays;
        const otherC = (Number(project.otherCostsDaily) || 0) * workingDays;

        // Calcolo credito accise per questa commessa
        // Se energia a carico del cliente o veicolo full electric, nessun recupero accise
        let acciseCreditMonthly = 0;
        const isEligibleFuel = project.energyPayer !== 'client' &&
          project.acciseRecoveryEligible !== false &&
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
        const costPnl = driverC + (acciseRecoveryEnabled ? fuelNetC : fuelGrossC) + tollsC + tiresC +
          totalLeaseC + fridgeC + telematicsC + washingC + extraC + partC + porterageC + otherC;
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
        monthlyPnl[m].costBreakdown.fuel += fuelNetC;
        monthlyPnl[m].costBreakdown.acciseCredit += acciseCreditMonthly;
        monthlyPnl[m].costBreakdown.tolls += tollsC;
        monthlyPnl[m].costBreakdown.tires += tiresC;
        monthlyPnl[m].costBreakdown.vehicleLease += vLeaseC;
        monthlyPnl[m].costBreakdown.trailerLease += tLeaseC;
        monthlyPnl[m].costBreakdown.refrigeration += fridgeC;
        monthlyPnl[m].costBreakdown.telematics += telematicsC;
        monthlyPnl[m].costBreakdown.washing += washingC;
        monthlyPnl[m].costBreakdown.extraCosts += extraC;
        monthlyPnl[m].costBreakdown.partnerMargin += partC;
        monthlyPnl[m].costBreakdown.porterage += porterageC;
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

        // Continuità dei flussi di cassa per anno a regime (es. 2027 da dati 2026)
        if (rolloverPreviousYearBudget && m === 0) {
          if (clientDelayMonths >= 2) {
            cashInflows[0] += rev;
            cashInflowBreakdown[0].clientsRegular += rev;
            if (biweeklyCashInflows.length > 1) {
              biweeklyCashInflows[1] += rev;
              biweeklyInflowBreakdown[1].clients += rev;
            }
          }
          if (clientDelayMonths >= 1) {
            cashInflows[1] += rev;
            cashInflowBreakdown[1].clientsRegular += rev;
            if (biweeklyCashInflows.length > 3) {
              biweeklyCashInflows[3] += rev;
              biweeklyInflowBreakdown[3].clients += rev;
            }
          }
        }

        // 3. CASH FLOW USCITE - REGOLE DI TESORERIA REALI FOUR

        // A. PERSONALE (Autisti + Facchinaggio): Pagato il giorno 16 del Mese Successivo (T1)
        const personnelCashC = driverC + porterageC;
        const driverMonth = m + driverDelayMonths;
        if (driverMonth < totalMonthsHorizon) {
          cashOutflows[driverMonth] += driverC;
          cashOutflowBreakdown[driverMonth].drivers += driverC;
          if (porterageC > 0) {
            cashOutflows[driverMonth] += porterageC;
            cashOutflowBreakdown[driverMonth].suppliersOther += porterageC;
          }
        }
        // Quindicinale:
        // - Stipendio Netto (~65%) pagato il 10 del mese (1ª Quindicina 1-15)
        // - Contributi INPS / F24 (~35%) pagati il 16 del mese (2ª Quindicina 16-31)
        const driverNetSalary = driverC * 0.65;
        const driverInpsF24 = (driverC * 0.35) + porterageC;
        const biweeklyDriverNet = driverMonth * 2 + 0;
        const biweeklyDriverF24 = driverMonth * 2 + 1;
        if (biweeklyDriverNet < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyDriverNet] += driverNetSalary;
          biweeklyOutflowBreakdown[biweeklyDriverNet].driversNet += driverNetSalary;
        }
        if (biweeklyDriverF24 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyDriverF24] += driverInpsF24;
          biweeklyOutflowBreakdown[biweeklyDriverF24].driversInpsF24 += driverInpsF24;
        }

        // B. CARBURANTE / ENERGIA / LNG: Pagamento secondo termine energia (default 30 gg, quindicinale M+1)
        const fuelPayMonth = m + fuelDelayMonths;
        if (fuelPayMonth < totalMonthsHorizon) {
          cashOutflows[fuelPayMonth] += fuelGrossC;
          cashOutflowBreakdown[fuelPayMonth].lngFuel += fuelGrossC;
        }
        const halfFuel = fuelGrossC / 2;
        const biweeklyFuelQ1 = fuelPayMonth * 2 + 0;
        const biweeklyFuelQ2 = fuelPayMonth * 2 + 1;
        if (biweeklyFuelQ1 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyFuelQ1] += halfFuel;
          biweeklyOutflowBreakdown[biweeklyFuelQ1].lngFuel += halfFuel;
        }
        if (biweeklyFuelQ2 < totalBiweeklyHorizon) {
          biweeklyCashOutflows[biweeklyFuelQ2] += halfFuel;
          biweeklyOutflowBreakdown[biweeklyFuelQ2].lngFuel += halfFuel;
        }

        // C. TELEPASS / PEDAGGI: Se <= 15 gg fatturazione quindicinale a 15 gg (50% M1, 50% M2); altrimenti a termine personalizzato
        if (pTermsTolls <= 15) {
          const halfTolls = tollsC / 2;
          if (m < totalMonthsHorizon) {
            cashOutflows[m] += halfTolls;
            cashOutflowBreakdown[m].tollsTelepass += halfTolls;
          }
          if (m + 1 < totalMonthsHorizon) {
            cashOutflows[m + 1] += halfTolls;
            cashOutflowBreakdown[m + 1].tollsTelepass += halfTolls;
          }
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
        } else {
          const tollsPayM = m + Math.max(0, Math.round(pTermsTolls / 30));
          if (tollsPayM < totalMonthsHorizon) {
            cashOutflows[tollsPayM] += tollsC;
            cashOutflowBreakdown[tollsPayM].tollsTelepass += tollsC;
          }
          const biweeklyTollsP = tollsPayM * 2 + 1;
          if (biweeklyTollsP < totalBiweeklyHorizon) {
            biweeklyCashOutflows[biweeklyTollsP] += tollsC;
            biweeklyOutflowBreakdown[biweeklyTollsP].tollsTelepass += tollsC;
          }
        }

        // D. NOLEGGI MEZZI & RIMORCHI: 3 Opzioni contrattuali differenziate (Mezzo Motore vs Semirimorchio)
        const pushLeaseOutflow = (amount, timingObj, timingId) => {
          if (!amount || amount <= 0) return;
          const targetMonth = m + timingObj.monthOffset;
          if (targetMonth < totalMonthsHorizon) {
            cashOutflows[targetMonth] += amount;
            cashOutflowBreakdown[targetMonth].leasesTotal += amount;
            if (timingId === 'M1_D10') cashOutflowBreakdown[targetMonth].leasesM1D10 += amount;
            else if (timingId === 'M1_D30') cashOutflowBreakdown[targetMonth].leasesM1D30 += amount;
            else cashOutflowBreakdown[targetMonth].leasesM2D20 += amount;
          }
          const targetBiweekly = targetMonth * 2 + (timingObj.quindicina - 1);
          if (targetBiweekly < totalBiweeklyHorizon) {
            biweeklyCashOutflows[targetBiweekly] += amount;
            biweeklyOutflowBreakdown[targetBiweekly].leases += amount;
          }
        };
        pushLeaseOutflow(vLeaseC, leaseTiming, leaseTimingKey);
        pushLeaseOutflow(tLeaseC, trailerLeaseTiming, trailerLeaseTimingKey);
        void totalLeaseC;

        // E. VOCI SPECIFICHE CON SCADENZA PROPRIA (default 30 gg, modificabile per voce)
        pushSupplierOutflow(m, tiresDelayMonths, tiresC);
        pushSupplierOutflow(m, fridgeDelayMonths, fridgeC);
        pushSupplierOutflow(m, telematicsDelayMonths, telematicsC);
        pushSupplierOutflow(m, washingDelayMonths, washingC);
        if (project.extraCostFrequency !== 'one_time') {
          pushSupplierOutflow(m, extraDelayMonths, extraC);
        }
        pushSupplierOutflow(m, supplierDelayMonths, partC + otherC);
        void personnelCashC;
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
 * Verifica se un semirimorchio dispone di gruppo frigorifero
 */
export const isRefrigeratedTrailer = (trailer) => {
  if (!trailer) return false;
  const cat = (trailer.category || '').toLowerCase();
  const label = (trailer.categoryLabel || '').toLowerCase();
  const name = (trailer.name || '').toLowerCase();
  return cat === 'refrigerato' || cat === 'refrigerato_azoto' || cat.includes('frigo') || label.includes('frigo') || name.includes('frigo');
};

/**
 * Calcola il costo giornaliero autista in base alla categoria del mezzo (Patente CE / C / B)
 * e alla configurazione del turno (1_diurno, 1_notturno, 2_turni).
 * NOTA 3.2.D: Nel doppio autista (2_turni), uno viaggia di giorno e uno di notte -> somma diurno + notturno.
 */
export const calculateDriverDailyCost = (vehicle, driverShiftType = '1_diurno', settings = {}) => {
  const licenseTypes = settings?.licenseTypes || [];
  const getLicCost = (id, fallback) => {
    const found = licenseTypes.find(l => l.id === id);
    return found ? Number(found.dailyCost) : fallback;
  };

  const name = (vehicle?.name || '').toLowerCase();
  const model = (vehicle?.model || '').toLowerCase();
  const explicitLicense = (vehicle?.licenseTypeId || '').toLowerCase();
  // Il Daily 72 (7.2 tonnellate) è un autocarro che richiede obbligatoriamente Patente C (o C1)
  const isDaily72 = name.includes('72') || model.includes('72') || name.includes('daily 72');

  const category = isDaily72 ? 'motrice' : ((vehicle?.category || '').toLowerCase() || (
    explicitLicense.startsWith('c') ? 'motrice' :
    explicitLicense.startsWith('b') ? 'furgone' : 'trattore'
  ));

  let dayCost = getLicCost('ce_diurno', 220);
  let nightCost = getLicCost('ce_notturno', 260);

  if (isDaily72 || explicitLicense.startsWith('c_') || explicitLicense === 'c' || category === 'motrice') {
    dayCost = getLicCost('c_diurno', 180);
    nightCost = getLicCost('c_notturno', 220);
  } else if (category === 'furgone' && !isDaily72) {
    dayCost = getLicCost('b', 140);
    nightCost = getLicCost('b_notturno', 170);
  }

  if (driverShiftType === '2_turni') {
    return +(dayCost + nightCost).toFixed(2);
  }
  if (driverShiftType === '1_notturno') {
    return +nightCost.toFixed(2);
  }
  return +dayCost.toFixed(2);
};

/**
 * Calcola il costo giornaliero del gruppo frigorifero (Azoto Liquido vs Gasolio)
 */
export const calculateRefrigerationDailyCost = (project = {}, trailer = null, settings = {}) => {
  const refParams = settings?.refrigerationParams || {};
  const azotoDef = refParams.azoto || { unitCost: 0.13, hourlyConsumption: 30 };
  const gasolioDef = refParams.gasolio || { unitCost: 1.80, hourlyConsumption: 3.0 };

  const isFrigoTrailer = isRefrigeratedTrailer(trailer);
  const enabled = project.refrigerationEnabled !== undefined
    ? Boolean(project.refrigerationEnabled)
    : isFrigoTrailer;

  const defaultTech = trailer?.category === 'refrigerato_azoto' || (trailer?.tractionType || '').toLowerCase().includes('azoto')
    ? 'azoto'
    : 'gasolio';
  const tech = project.refrigerationTech || defaultTech;
  const techDefaults = tech === 'azoto' ? azotoDef : gasolioDef;

  if (!enabled) {
    return {
      enabled: false,
      tech,
      unitCost: Number(techDefaults.unitCost),
      hourlyConsumption: Number(techDefaults.hourlyConsumption),
      hourlyCost: +(Number(techDefaults.unitCost) * Number(techDefaults.hourlyConsumption)).toFixed(2),
      hoursPerDay: Number(project.refrigerationHoursDaily) || 0,
      dailyCost: 0
    };
  }

  const unitCost = project.refrigerationUnitCost !== undefined && project.refrigerationUnitCost !== ''
    ? Number(project.refrigerationUnitCost)
    : Number(techDefaults.unitCost);
  const hourlyConsumption = project.refrigerationHourlyConsumption !== undefined && project.refrigerationHourlyConsumption !== ''
    ? Number(project.refrigerationHourlyConsumption)
    : Number(techDefaults.hourlyConsumption);
  const hoursPerDay = project.refrigerationHoursDaily !== undefined && project.refrigerationHoursDaily !== ''
    ? Number(project.refrigerationHoursDaily)
    : 8;

  const hourlyCost = +(unitCost * hourlyConsumption).toFixed(2);
  const dailyCost = +(hourlyCost * hoursPerDay).toFixed(2);

  return {
    enabled: true,
    tech,
    unitCost,
    hourlyConsumption,
    hourlyCost,
    hoursPerDay,
    dailyCost
  };
};

/**
 * Calcola i costi accessori (Telematica, Lavaggio, Costi Extra) e la loro ripartizione giornaliera/mensile
 */
export const calculateAccessoriesDailyCost = (project = {}, vehicle = null, trailer = null, settings = {}) => {
  const workingDays = Number(project.workingDaysMonth) || 22;
  const operatingMonths = Number(project.operatingMonths) || 12;
  const mgmt = project.managementType || 'D';
  const accParams = settings?.accessoryParams || {};
  const telDef = accParams.telematics || { tractorMonthly: 14, trailerMonthly: 13, rigidMonthly: 12, vanMonthly: 12 };
  const washDef = accParams.washing || { costPerWash: 80, washesPerMonth: 2 };

  // A. Telematica: Trattore 14 €/m, Semirimorchio 13 €/m, Motrice 12 €/m
  const telematicsEnabled = project.telematicsEnabled !== undefined ? Boolean(project.telematicsEnabled) : true;
  let autoTelematicsMonthly = 0;
  if (telematicsEnabled) {
    if (mgmt === 'D' && vehicle) {
      const cat = (vehicle.category || '').toLowerCase();
      if (cat === 'trattore') autoTelematicsMonthly += Number(telDef.tractorMonthly ?? 14);
      else if (cat === 'motrice') autoTelematicsMonthly += Number(telDef.rigidMonthly ?? 12);
      else autoTelematicsMonthly += Number(telDef.vanMonthly ?? 12);
    }
    if (trailer) {
      autoTelematicsMonthly += Number(telDef.trailerMonthly ?? 13);
    }
  }

  const telematicsMonthly = telematicsEnabled
    ? (project.telematicsAuto === false && project.telematicsMonthly !== undefined && project.telematicsMonthly !== ''
        ? Number(project.telematicsMonthly)
        : +autoTelematicsMonthly.toFixed(2))
    : 0;
  const telematicsDaily = workingDays > 0 ? +(telematicsMonthly / workingDays).toFixed(2) : 0;

  // B. Lavaggio: es. 80 € x 2 lavaggi/mese = 160 €/mese
  const washingEnabled = project.washingEnabled !== undefined
    ? Boolean(project.washingEnabled)
    : (mgmt === 'D');
  const washUnitCost = project.washingUnitCost !== undefined && project.washingUnitCost !== ''
    ? Number(project.washingUnitCost)
    : Number(washDef.costPerWash ?? 80);
  const washesPerMonth = project.washingCountPerMonth !== undefined && project.washingCountPerMonth !== ''
    ? Number(project.washingCountPerMonth)
    : Number(washDef.washesPerMonth ?? 2);
  const washingMonthly = washingEnabled ? +(washUnitCost * washesPerMonth).toFixed(2) : 0;
  const washingDaily = (washingEnabled && workingDays > 0) ? +(washingMonthly / workingDays).toFixed(2) : 0;

  // C. Costi Extra (Descrizione, Importo, Frequenza: daily | monthly | one_time)
  const extraAmount = Number(project.extraCostAmount) || 0;
  const extraFreq = project.extraCostFrequency || 'monthly';
  let extraDaily = 0;
  let extraMonthly = 0;
  let extraOneTimeCash = 0;
  if (extraAmount > 0) {
    if (extraFreq === 'daily') {
      extraDaily = +extraAmount.toFixed(2);
      extraMonthly = +(extraDaily * workingDays).toFixed(2);
    } else if (extraFreq === 'one_time') {
      const totalDays = workingDays * operatingMonths;
      extraDaily = totalDays > 0 ? +(extraAmount / totalDays).toFixed(2) : 0;
      extraMonthly = operatingMonths > 0 ? +(extraAmount / operatingMonths).toFixed(2) : 0;
      extraOneTimeCash = extraAmount;
    } else {
      extraMonthly = +extraAmount.toFixed(2);
      extraDaily = workingDays > 0 ? +(extraAmount / workingDays).toFixed(2) : 0;
    }
  }

  return {
    telematicsEnabled,
    telematicsAutoMonthly: +autoTelematicsMonthly.toFixed(2),
    telematicsMonthly,
    telematicsDaily,
    washingEnabled,
    washUnitCost,
    washesPerMonth,
    washingMonthly,
    washingDaily,
    extraAmount,
    extraFreq,
    extraDaily,
    extraMonthly,
    extraOneTimeCash
  };
};

/**
 * Calcola metriche economiche e finanziarie ponderate per una singola commessa
 * (Fabbisogno finanziario reale calcolato per componente e relativa scadenza di pagamento)
 */
export const calculateSingleProjectMetrics = (project) => {
  const workingDays = Number(project.workingDaysMonth) || 22;
  const operatingMonths = Number(project.operatingMonths) || 12;

  const driverCost = Number(project.driverCostDaily) || 0;
  const fuelCost = project.energyPayer === 'client' ? 0 : (Number(project.fuelCostDaily) || 0);
  const tollsCost = Number(project.tollsDaily) || 0;
  const tiresCost = Number(project.tiresDaily) || 0;
  const refrigerationCost = Number(project.refrigerationCostDaily) || 0;
  const telematicsCost = Number(project.telematicsCostDaily) || 0;
  const washingCost = Number(project.washingCostDaily) || 0;
  const extraCost = Number(project.extraCostDaily) || 0;
  const otherCost = Number(project.otherCostsDaily) || 0;
  const partnerMargin = Number(project.partnerMarginDaily) || 0;
  const porterageCost = Number(project.porterageDaily) || 0;
  const vehicleLease = Number(project.vehicleLeaseDaily) || 0;
  const trailerLease = Number(project.trailerLeaseDaily) || 0;

  const totalCostDaily = +(
    driverCost +
    fuelCost +
    tollsCost +
    tiresCost +
    refrigerationCost +
    telematicsCost +
    washingCost +
    extraCost +
    otherCost +
    partnerMargin +
    porterageCost +
    vehicleLease +
    trailerLease
  ).toFixed(2);

  const revenueDaily = Number(project.revenueDaily) || 0;
  const molDaily = +(revenueDaily - totalCostDaily).toFixed(2);
  const molPercent = revenueDaily > 0 ? (molDaily / revenueDaily) * 100 : 0;

  const monthlyCost = +(totalCostDaily * workingDays).toFixed(2);
  const monthlyRevenue = +(revenueDaily * workingDays).toFixed(2);
  const monthlyMol = +(monthlyRevenue - monthlyCost).toFixed(2);

  const totalProjectRevenue = +(monthlyRevenue * operatingMonths).toFixed(2);
  const totalProjectCost = +(monthlyCost * operatingMonths).toFixed(2);
  const totalProjectMol = +(monthlyMol * operatingMonths).toFixed(2);

  // Calcolo Fabbisogno Finanziario Reale Ponderato per Voce di Costo e Scadenza
  const clientDso = project.paymentTermsClient !== undefined ? Number(project.paymentTermsClient) : 60;
  const supplierTerms = project.paymentTermsSuppliers !== undefined ? Number(project.paymentTermsSuppliers) : 30;
  const driverTerms = project.paymentTermsDriver !== undefined ? Number(project.paymentTermsDriver) : 16; // giorno 16 mese successivo T1
  const fuelTerms = project.paymentTermsFuel !== undefined ? Number(project.paymentTermsFuel) : 30;
  const tollsTerms = project.paymentTermsTolls !== undefined ? Number(project.paymentTermsTolls) : 15;
  const tiresTerms = project.paymentTermsTires !== undefined ? Number(project.paymentTermsTires) : 30;
  const fridgeTerms = project.paymentTermsRefrigeration !== undefined ? Number(project.paymentTermsRefrigeration) : 30;
  const telematicsTerms = project.paymentTermsTelematics !== undefined ? Number(project.paymentTermsTelematics) : 30;
  const washingTerms = project.paymentTermsWashing !== undefined ? Number(project.paymentTermsWashing) : 30;
  const extraTerms = project.paymentTermsExtra !== undefined ? Number(project.paymentTermsExtra) : 30;

  const leaseTimingKey = normalizeLeaseTiming(project);
  const trailerLeaseTimingKey = normalizeTrailerLeaseTiming(project);
  // Offset rispetto a fine mese operativo T0:
  // M1_D10 -> giorno 10 di T0 (-20 gg rispetto a fine T0) -> anticipo extra +20 gg
  // M1_D30 -> giorno 30 di T0 (0 gg) -> gap = DSO
  // M2_D20 -> giorno 20 di T1 (+20 gg dopo fine T0) -> gap = DSO - 20 gg
  const getLeaseOffset = (key) => (key === 'M1_D10' ? -20 : key === 'M1_D30' ? 0 : 20);
  const vLeaseGapDays = Math.max(0, clientDso - getLeaseOffset(leaseTimingKey));
  const tLeaseGapDays = Math.max(0, clientDso - getLeaseOffset(trailerLeaseTimingKey));

  // Personale (Autisti + Facchinaggio): Pagato al giorno 16 del mese T1 (o termine impostato)
  // In tesoreria reale, prima dell'incasso del cliente l'azienda deve sborsare l'intera retribuzione mensile.
  // Con incasso standard (DSO >= 30 gg) l'anticipo di cassa deve coprire almeno 1 mensilità intera
  // (tariffa giornaliera * giornate lavorative del mese). Con DSO 60 gg copre 2 mensilità, con DSO 90 gg 3 mensilità.
  const personnelAdvanceMonths = clientDso <= 0 ? 0 : Math.max(1, clientDso / 30);
  const driverGapDays = Math.round(personnelAdvanceMonths * 30);
  const fuelGapDays = Math.max(0, clientDso - fuelTerms);
  const tollsGapDays = Math.max(0, clientDso - tollsTerms);
  const tiresGapDays = Math.max(0, clientDso - tiresTerms);
  const fridgeGapDays = Math.max(0, clientDso - fridgeTerms);
  const telematicsGapDays = Math.max(0, clientDso - telematicsTerms);
  const washingGapDays = Math.max(0, clientDso - washingTerms);
  const extraGapDays = Math.max(0, clientDso - extraTerms);
  const supplierGapDays = Math.max(0, clientDso - supplierTerms);

  const vLeaseMonthly = vehicleLease * workingDays;
  const tLeaseMonthly = trailerLease * workingDays;
  const leaseMonthly = vLeaseMonthly + tLeaseMonthly;
  const personnelMonthly = (driverCost + porterageCost) * workingDays;
  const fuelMonthly = fuelCost * workingDays;
  const tollsMonthly = tollsCost * workingDays;
  const tiresMonthly = tiresCost * workingDays;
  const fridgeMonthly = refrigerationCost * workingDays;
  const telematicsMonthly = telematicsCost * workingDays;
  const washingMonthly = washingCost * workingDays;
  const extraMonthly = extraCost * workingDays;
  const partnerOtherMonthly = (partnerMargin + otherCost) * workingDays;

  const needLease = (vLeaseMonthly * (vLeaseGapDays / 30)) + (tLeaseMonthly * (tLeaseGapDays / 30));
  const leaseGapDays = leaseMonthly > 0 ? Math.round((needLease / leaseMonthly) * 30) : vLeaseGapDays;
  const needPersonnel = +(personnelMonthly * personnelAdvanceMonths).toFixed(2);
  const needFuel = fuelMonthly * (fuelGapDays / 30);
  const needTolls = tollsMonthly * (tollsGapDays / 30);
  const needTires = tiresMonthly * (tiresGapDays / 30);
  const needFridge = fridgeMonthly * (fridgeGapDays / 30);
  const needTelematics = telematicsMonthly * (telematicsGapDays / 30);
  const needWashing = washingMonthly * (washingGapDays / 30);
  const needExtra = extraMonthly * (extraGapDays / 30);
  const needSuppliers = partnerOtherMonthly * (supplierGapDays / 30);

  const recurringWorkingCapitalNeed =
    needLease +
    needPersonnel +
    needFuel +
    needTolls +
    needTires +
    needFridge +
    needTelematics +
    needWashing +
    needExtra +
    needSuppliers;

  const deposit = Number(project.depositAmount) || 0;
  const estimatedWorkingCapitalGap = +(recurringWorkingCapitalNeed + deposit).toFixed(2);
  const gapDays = monthlyCost > 0
    ? Math.round((recurringWorkingCapitalNeed / monthlyCost) * 30)
    : Math.max(0, clientDso - supplierTerms);
  const gapMonths = +(gapDays / 30).toFixed(2);

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
    weightedDpoDays: clientDso - gapDays,
    estimatedWorkingCapitalGap,
    workingCapitalBreakdown: {
      leases: +needLease.toFixed(2),
      leaseGapDays,
      personnel: +needPersonnel.toFixed(2),
      driverGapDays,
      fuelAndFridge: +(needFuel + needFridge).toFixed(2),
      accessoriesAndTolls: +(needTolls + needTires + needTelematics + needWashing + needExtra).toFixed(2),
      suppliers: +needSuppliers.toFixed(2),
      deposit: +deposit.toFixed(2)
    }
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

/**
 * RICALCOLO DINAMICO COMMESSA: Sincronizza tutti i costi operativi e finanziari al variare di:
 * - Canone e tipologia mezzo associato (Patente CE / C / B -> ricalcolo automatico costo autista)
 * - Configurazione turno autista (1 Diurno, 1 Notturno, Doppio Autista Diurno + Notturno)
 * - Fornitura energia (A carico FOUR vs A carico Cliente = 0 €)
 * - Chilometraggio (carburante/Bio-LNG/BEV, pedaggi, pneumatici)
 * - Refrigerazione (Azoto liquido / Gasolio * ore funzionamento)
 * - Costi accessori (Telematica 14/13/12 €/m, Lavaggio, Costi extra)
 * - Fabbisogno finanziario ponderato per scadenze effettive
 */
export const recalculateProjectCost = (project, fleet = [], trailers = [], settings = {}) => {
  const vehicle = fleet.find(v => v.id === project.vehicleId);
  const trailer = trailers.find(t => t.id === project.trailerId);

  const workingDays = Number(project.workingDaysMonth) || 22;
  const km = Number(project.kmDaily) || 0;
  const managementType = project.managementType || 'D';

  const fuelTypes = settings.fuelTypes || [];
  const standardCosts = settings.standardCosts || {};
  const tireParameters = settings.tireParameters || {};

  let driverCostDaily = 0;
  let fuelCostDaily = 0;
  let tollsDaily = 0;
  let tiresDaily = 0;
  let vehicleLeaseDaily = 0;
  let trailerLeaseDaily = 0;
  let refrigerationCostDaily = 0;
  let telematicsCostDaily = 0;
  let washingCostDaily = 0;
  let extraCostDaily = 0;
  let partnerMarginDaily = Number(project.partnerMarginDaily) || 0;
  let porterageDaily = Number(project.porterageDaily) || 0;
  let otherCostsDaily = Number(project.otherCostsDaily) || 0;

  const refCalc = calculateRefrigerationDailyCost(project, trailer, settings);
  const accCalc = calculateAccessoriesDailyCost(project, vehicle, trailer, settings);

  // Refrigerazione e Costi Extra / Telematica rimorchio si applicano anche su T se FOUR fornisce il rimorchio
  refrigerationCostDaily = refCalc.dailyCost;
  telematicsCostDaily = accCalc.telematicsDaily;
  extraCostDaily = accCalc.extraDaily;

  if (managementType === 'T') {
    // MODALITÀ FORNITORE / TERZISTA ("T"):
    driverCostDaily = Number(project.overrideDriverCostDaily || 0);
    fuelCostDaily = Number(project.overrideFuelCostDaily || 0);
    tollsDaily = Number(project.overrideTollsDaily || 0);
    tiresDaily = Number(project.overrideTiresDaily || 0);
    vehicleLeaseDaily = Number(project.overrideVehicleLeaseDaily || 0);
    washingCostDaily = project.washingEnabled === true ? accCalc.washingDaily : 0;

    if (trailer && workingDays > 0) {
      trailerLeaseDaily = +(trailer.monthlyLease / workingDays).toFixed(2);
    } else {
      trailerLeaseDaily = Number(project.trailerLeaseDaily) || 0;
    }
  } else {
    // GESTIONE DIRETTA FOUR ("D"):
    // 1. Quota giornaliera veicolo da canone mensile anagrafica
    if (vehicle && workingDays > 0) {
      vehicleLeaseDaily = +(vehicle.monthlyLease / workingDays).toFixed(2);
    } else {
      vehicleLeaseDaily = Number(project.vehicleLeaseDaily) || 0;
    }

    // 2. Quota giornaliera semirimorchio da canone mensile
    if (trailer && workingDays > 0) {
      trailerLeaseDaily = +(trailer.monthlyLease / workingDays).toFixed(2);
    } else {
      trailerLeaseDaily = Number(project.trailerLeaseDaily) || 0;
    }

    // 3. Carburante / Energia (NOTA 1.2: se a carico del Cliente -> sempre 0 €)
    if (project.energyPayer === 'client') {
      fuelCostDaily = 0;
    } else if (vehicle && km > 0) {
      const fuelType = fuelTypes.find(f => f.id === vehicle.fuelTypeId);
      const fuelPrice = fuelType ? fuelType.price : (vehicle.fuelTypeId === 'biolng' ? 1.18 : 0.36);

      if (vehicle.fuelTypeId === 'elettrico') {
        const consumptionKwhKm = vehicle.avgConsumption || 1.18;
        fuelCostDaily = +(km * consumptionKwhKm * fuelPrice).toFixed(2);
      } else if (vehicle.fuelTypeId === 'biolng') {
        if (vehicle.yieldKmPerUnit && vehicle.yieldKmPerUnit > 0) {
          fuelCostDaily = +((km / vehicle.yieldKmPerUnit) * fuelPrice).toFixed(2);
        } else {
          const consumptionKg100 = vehicle.avgConsumption || 29.5;
          fuelCostDaily = +(((consumptionKg100) / 100) * km * fuelPrice).toFixed(2);
        }
      } else {
        const consumptionL100 = vehicle.avgConsumption || 30.0;
        fuelCostDaily = +(((consumptionL100) / 100) * km * fuelPrice).toFixed(2);
      }
    } else {
      fuelCostDaily = Number(project.fuelCostDaily) || 0;
    }

    // 4. Pedaggi Autostrada al variare dei Km
    if (km > 0) {
      const hPercent = project.highwayPercent !== undefined ? project.highwayPercent : 70;
      const tollRate = standardCosts.tollRateHighwayKm || 0.12;
      tollsDaily = +((km * (hPercent / 100)) * tollRate).toFixed(2);
    } else {
      tollsDaily = Number(project.tollsDaily) || 0;
    }

    // 5. Pneumatici al variare dei Km
    if (km > 0) {
      const tireCalc = calculateTireCostPerKm(vehicle, trailer, tireParameters);
      tiresDaily = +(km * tireCalc.totalRate).toFixed(2);
    } else {
      tiresDaily = Number(project.tiresDaily) || 0;
    }

    // 6. Lavaggio
    washingCostDaily = accCalc.washingDaily;

    // 7. Autista dipendente CCNL (NOTA 1.3 & NOTA 3.2.D)
    const driverShiftType = project.driverShiftType || (
      vehicle?.licenseTypeId === 'ce_doppio' || vehicle?.licenseTypeId === 'c_doppio' ? '2_turni' :
      (vehicle?.licenseTypeId || '').includes('notturno') ? '1_notturno' : '1_diurno'
    );
    if (project.driverManualOverride && project.driverCostDaily !== undefined) {
      driverCostDaily = Number(project.driverCostDaily) || 0;
    } else {
      driverCostDaily = calculateDriverDailyCost(vehicle, driverShiftType, settings);
    }
  }

  const enrichedProject = {
    ...project,
    driverCostDaily,
    fuelCostDaily,
    tollsDaily,
    tiresDaily,
    vehicleLeaseDaily,
    trailerLeaseDaily,
    refrigerationEnabled: refCalc.enabled,
    refrigerationTech: refCalc.tech,
    refrigerationUnitCost: refCalc.unitCost,
    refrigerationHourlyConsumption: refCalc.hourlyConsumption,
    refrigerationHoursDaily: refCalc.hoursPerDay,
    refrigerationCostDaily,
    telematicsEnabled: accCalc.telematicsEnabled,
    telematicsMonthly: accCalc.telematicsMonthly,
    telematicsCostDaily,
    washingEnabled: accCalc.washingEnabled,
    washingUnitCost: accCalc.washUnitCost,
    washingCountPerMonth: accCalc.washesPerMonth,
    washingCostDaily,
    extraCostDaily,
    partnerMarginDaily,
    porterageDaily,
    otherCostsDaily
  };

  const metrics = calculateSingleProjectMetrics(enrichedProject);

  return {
    ...enrichedProject,
    totalCostDaily: metrics.totalCostDaily,
    revenueDaily: metrics.revenueDaily,
    molDaily: metrics.molDaily,
    monthlyCost: metrics.monthlyCost,
    monthlyRevenue: metrics.monthlyRevenue,
    monthlyMol: metrics.monthlyMol,
    molPercent: +metrics.molPercent.toFixed(2),
    cashAdvanceRequired: metrics.estimatedWorkingCapitalGap
  };
};

/**
 * Unità Operative / Poli Logistici ufficiali FOUR
 */
export const OPERATING_UNITS = [
  'Bologna',
  'Buccinasco',
  'Landriano',
  'Caorso',
  'Arborio'
];

/**
 * Risolve l'Unità Operativa (Polo) di una commessa
 */
export const getProjectOperatingUnit = (project, vehicle = null) => {
  if (project?.operatingUnit && project.operatingUnit !== 'auto') {
    return project.operatingUnit;
  }
  if (vehicle?.branch && OPERATING_UNITS.includes(vehicle.branch)) {
    return vehicle.branch;
  }
  const text = `${project?.name || ''} ${project?.route || ''} ${project?.client || ''} ${vehicle?.branch || ''} ${vehicle?.clientSite || ''}`.toLowerCase();
  if (text.includes('arborio')) return 'Arborio';
  if (text.includes('landriano')) return 'Landriano';
  if (text.includes('caorso') || text.includes('piacenza')) return 'Caorso';
  if (text.includes('buccinasco') || text.includes('milano') || text.includes('cossato') || text.includes('gravedona')) return 'Buccinasco';
  if (text.includes('bologna') || text.includes('interporto') || text.includes('granarolo') || text.includes('camst') || text.includes('decathlon')) return 'Bologna';
  return 'Bologna';
};
