// Costanti standard
export const STANDARD_COSTS = {
  tireCost: 0.03,
  tollRateHighway: 0.12,
  telematicsCost: 2.50,
  parkingFee: 100,  // €100/autista/giorno
  miscellaneous: 10
};

// Parametri guida differenziati per patente e tipo veicolo
const DRIVING_PARAMS = {
  // Patente B (furgoni)
  B: {
    maxHoursPerDay: 12,  // Nessun limite cronotachigrafo
    speedHighway: 110,   // Furgoni più veloci
    speedUrban: 55
  },
  // Patente C (motrice fino a 12t)
  C: {
    maxHoursPerDay: 9,   // Regolamento CE 561/2006
    speedHighway: 90,    // Autocarri medi
    speedUrban: 50
  },
  // Patente CE (autotreni > 12t)
  CE: {
    maxHoursPerDay: 9,   // Regolamento CE 561/2006
    speedHighway: 75,    // Autotreni più lenti
    speedUrban: 45
  }
};

// Funzione per calcolare il costo carburante
const calculateFuelCost = (fuelType, avgConsumption, kmTotal, fuelPrice) => {
  const unit = fuelType.unit;

  if (unit === 'kWh/km') {
    return avgConsumption * kmTotal * fuelPrice;
  } else if (unit.includes('/100km')) {
    return (avgConsumption / 100) * kmTotal * fuelPrice;
  } else {
    return (avgConsumption / 100) * kmTotal * fuelPrice;
  }
};

// Calcola giorni necessari per il servizio
const calculateServiceDays = (kmTotal, kmHighwayPercent, doubleDrivers, licenseType) => {
  const kmHighway = (kmTotal * kmHighwayPercent) / 100;
  const kmUrban = kmTotal - kmHighway;

  // Ottieni parametri in base alla patente
  const params = DRIVING_PARAMS[licenseType] || DRIVING_PARAMS.C;

  const hoursHighway = kmHighway / params.speedHighway;
  const hoursUrban = kmUrban / params.speedUrban;
  const totalHours = hoursHighway + hoursUrban;

  // Con doppio autista: H24 (max 16h/giorno indipendente da patente)
  const maxHoursPerDay = doubleDrivers ? 16 : params.maxHoursPerDay;

  const serviceDays = Math.max(1, Math.ceil(totalHours / maxHoursPerDay));

  return serviceDays;
};

export const calculateSimulation = (vehicle, params) => {
  const {
    kmTotal,
    kmHighwayPercent,
    monthlyWorkingDays,
    fuelPrice,
    costs,
    doubleDrivers,
    forcedDays,
    marginType,
    marginValue
  } = params;

  const kmHighway = (kmTotal * kmHighwayPercent) / 100;
  const kmUrban = kmTotal - kmHighway;

  // Estrai la patente (B, C, CE) dall'ID (es: 'b' -> 'B')
  const licenseTypeCode = vehicle.licenseType.id.toUpperCase();

  // Calcola giorni automaticamente o usa valore forzato
  const serviceDays = forcedDays > 0
    ? forcedDays
    : calculateServiceDays(kmTotal, kmHighwayPercent, doubleDrivers, licenseTypeCode);

  const numDrivers = doubleDrivers ? 2 : 1;

  // 1. Carburante
  const fuelCost = calculateFuelCost(vehicle.fuelType, vehicle.avgConsumption, kmTotal, fuelPrice);

  // 2. Pedaggi autostrada
  const tollCost = costs.useTolls ? kmHighway * costs.tollRate : 0;

  // 3. Gomme
  const tireCost = costs.useTires ? kmTotal * costs.tireRate : 0;

  // 4. Autista (raddoppia se doppio autista)
  const driverCost = serviceDays * vehicle.licenseType.dailyCost * numDrivers;

  // 5. Noleggio mensile ripartito
  let leaseCost = 0;
  if (vehicle.monthlyLease && monthlyWorkingDays > 0) {
    const dailyLeaseCost = vehicle.monthlyLease / monthlyWorkingDays;
    leaseCost = dailyLeaseCost * serviceDays;
  }

  // 6. Servizi telematici
  const telematicsCost = costs.useTelematics ? costs.telematicsRate : 0;

  // 7. Fee parcheggio/sosta (per autista per giorno)
  const parkingCost = costs.useParking ? costs.parkingFee * serviceDays * numDrivers : 0;

  // 8. Vari
  const miscCost = costs.useMisc ? costs.miscRate : 0;

  const totalCost = fuelCost + tollCost + tireCost + driverCost + leaseCost + telematicsCost + parkingCost + miscCost;

  // Calcolo margine sul prezzo di vendita
  let marginAmount = 0;
  let priceWithMargin = totalCost;

  if (marginType === 'percentage' && marginValue > 0) {
    priceWithMargin = totalCost / (1 - (marginValue / 100));
    marginAmount = priceWithMargin - totalCost;
  } else if (marginType === 'fixed' && marginValue > 0) {
    marginAmount = marginValue;
    priceWithMargin = totalCost + marginAmount;
  }

  // Costi mensili e annuali
  const monthlyCost = serviceDays > 0 ? (priceWithMargin / serviceDays) * 22 : 0;
  const annualCost = monthlyCost * 12;

  return {
    fuelCost: fuelCost.toFixed(2),
    tollCost: tollCost.toFixed(2),
    tireCost: tireCost.toFixed(2),
    driverCost: driverCost.toFixed(2),
    leaseCost: leaseCost.toFixed(2),
    telematicsCost: telematicsCost.toFixed(2),
    parkingCost: parkingCost.toFixed(2),
    miscCost: miscCost.toFixed(2),
    totalCost: totalCost.toFixed(2),
    marginAmount: marginAmount.toFixed(2),
    priceWithMargin: priceWithMargin.toFixed(2),
    monthlyCost: monthlyCost.toFixed(2),
    annualCost: annualCost.toFixed(2),
    costPerKm: (totalCost / kmTotal).toFixed(2),
    costPerDay: serviceDays > 0 ? (totalCost / serviceDays).toFixed(2) : '0,00',
    pricePerKm: (priceWithMargin / kmTotal).toFixed(2),
    pricePerDay: serviceDays > 0 ? (priceWithMargin / serviceDays).toFixed(2) : '0,00',
    serviceDays: serviceDays,
    numDrivers: numDrivers,
    parkingNights: serviceDays,
    dailyLeaseCost: vehicle.monthlyLease && monthlyWorkingDays > 0
      ? (vehicle.monthlyLease / monthlyWorkingDays).toFixed(2)
      : '0,00'
  };
};

// Formato italiano con virgola e simbolo €
export const formatCurrency = (value) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};
