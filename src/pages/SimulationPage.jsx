import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { calculateSimulation, formatCurrency, STANDARD_COSTS } from '../utils/calculations';
import { Calculator, TrendingUp, ChevronDown, ChevronUp, Download, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const SimulationPage = () => {
  const { currentUser } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [formData, setFormData] = useState({
    vehicleId: '',
    kmTotal: '',
    kmHighwayPercent: 70,
    monthlyWorkingDays: 22,
    fuelPrice: '',
    doubleDrivers: false,
    useForcedDays: false,
    forcedDays: 1,
    marginType: 'percentage',
    marginValue: 0,
    useTolls: true,
    tollRate: STANDARD_COSTS.tollRateHighway,
    useTires: true,
    tireRate: STANDARD_COSTS.tireCost,
    useTelematics: true,
    telematicsRate: STANDARD_COSTS.telematicsCost,
    useParking: true,
    parkingFee: STANDARD_COSTS.parkingFee,
    useMisc: false,
    miscRate: STANDARD_COSTS.miscellaneous
  });

  const [results, setResults] = useState(null);

  useEffect(() => {
    loadData();
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [currentUser]);

  const checkMobile = () => {
    setIsMobile(window.innerWidth < 768);
  };

  const loadData = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, `users/${currentUser.uid}/config/settings`));
      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data());
      }

      const vehiclesSnap = await getDocs(collection(db, `users/${currentUser.uid}/vehicles`));
      const vehiclesData = vehiclesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setVehicles(vehiclesData);
    } catch (error) {
      console.error('Errore caricamento:', error);
    }
  };

  const handleVehicleChange = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    setSelectedVehicle(vehicle);

    if (vehicle) {
      const fuelType = settings.fuelTypes.find(f => f.id === vehicle.fuelTypeId);
      setFormData({
        ...formData,
        vehicleId,
        fuelPrice: fuelType?.price || 0
      });
    }
    setResults(null);
  };

  const handleCalculate = (e) => {
    e.preventDefault();

    if (!selectedVehicle) return;

    const fuelType = settings.fuelTypes.find(f => f.id === selectedVehicle.fuelTypeId);
    const license = settings.licenseTypes.find(l => l.id === selectedVehicle.licenseTypeId);

    const vehicleData = {
      ...selectedVehicle,
      fuelType,
      licenseType: license
    };

    const params = {
      kmTotal: parseFloat(formData.kmTotal),
      kmHighwayPercent: parseFloat(formData.kmHighwayPercent),
      monthlyWorkingDays: parseInt(formData.monthlyWorkingDays),
      fuelPrice: parseFloat(formData.fuelPrice),
      doubleDrivers: formData.doubleDrivers,
      forcedDays: formData.useForcedDays ? parseInt(formData.forcedDays) : 0,
      marginType: formData.marginType,
      marginValue: parseFloat(formData.marginValue) || 0,
      costs: {
        useTolls: formData.useTolls,
        tollRate: parseFloat(formData.tollRate),
        useTires: formData.useTires,
        tireRate: parseFloat(formData.tireRate),
        useTelematics: formData.useTelematics,
        telematicsRate: parseFloat(formData.telematicsRate),
        useParking: formData.useParking,
        parkingFee: parseFloat(formData.parkingFee),
        useMisc: formData.useMisc,
        miscRate: parseFloat(formData.miscRate)
      }
    };

    const calculatedResults = calculateSimulation(vehicleData, params);
    setResults(calculatedResults);
  };
  const exportPDF = async () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Logo - Caricamento sincrono forzato
    let logoLoaded = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Prova a caricare il logo
    img.onload = function() {
      logoLoaded = true;
    };
    img.src = '/logo-four.png?' + new Date().getTime(); // Cache bust

    // Attendi max 500ms per il logo
    await new Promise(resolve => setTimeout(resolve, 500));

    if (logoLoaded && img.complete) {
      try {
        pdf.addImage(img, 'PNG', pageWidth - 55, 10, 40, 15);
      } catch (e) {
        console.log('Errore inserimento logo');
      }
    }

    // Header FOUR blu
    pdf.setFillColor(0, 90, 156);
    pdf.rect(0, 0, pageWidth, 35, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SIMULAZIONE COSTO SERVIZIO', 15, 15);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, 15, 25);

    pdf.setTextColor(0, 0, 0);

    let yPos = 45;

    // BOX INFO MEZZO
    const fuelType = settings.fuelTypes.find(f => f.id === selectedVehicle.fuelTypeId);

    pdf.setFillColor(240, 240, 240);
    pdf.rect(15, yPos, pageWidth - 30, 32, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('MEZZO SELEZIONATO', 20, yPos + 7);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Nome:', 20, yPos + 15);
    pdf.setFont('helvetica', 'bold');
    pdf.text(selectedVehicle.name, 55, yPos + 15);

    pdf.setFont('helvetica', 'normal');
    pdf.text('Alimentazione:', 20, yPos + 21);
    pdf.setFont('helvetica', 'bold');
    pdf.text(fuelType?.name, 55, yPos + 21);

    pdf.setFont('helvetica', 'normal');
    pdf.text('Consumo medio:', 20, yPos + 27);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${selectedVehicle.avgConsumption} ${fuelType?.unit}`, 55, yPos + 27);

    yPos += 40;

    // BOX PARAMETRI
    pdf.setFillColor(240, 240, 240);
    pdf.rect(15, yPos, pageWidth - 30, 32, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('PARAMETRI SIMULAZIONE', 20, yPos + 7);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Distanza:', 20, yPos + 15);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${formData.kmTotal} km (${formData.kmHighwayPercent}% autostrada)`, 55, yPos + 15);

    pdf.setFont('helvetica', 'normal');
    pdf.text('Durata:', 20, yPos + 21);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${results.serviceDays} giorni • ${results.numDrivers} autista/i`, 55, yPos + 21);

    pdf.setFont('helvetica', 'normal');
    pdf.text('Carburante:', 20, yPos + 27);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`€${parseFloat(formData.fuelPrice).toFixed(3)}`, 55, yPos + 27);

    yPos += 40;

    // TABELLA DETTAGLIO COSTI
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('DETTAGLIO COSTI', 15, yPos);
    yPos += 5;

    const costsData = [];
    costsData.push(['Carburante', formatCurrency(results.fuelCost)]);
    costsData.push([`Autista (${results.serviceDays}gg × ${results.numDrivers})`, formatCurrency(results.driverCost)]);
    if (selectedVehicle.monthlyLease > 0) costsData.push(['Canone Noleggio', formatCurrency(results.leaseCost)]);
    if (parseFloat(results.tollCost) > 0) costsData.push(['Pedaggi Autostrada', formatCurrency(results.tollCost)]);
    if (parseFloat(results.tireCost) > 0) costsData.push(['Consumo Gomme', formatCurrency(results.tireCost)]);
    if (parseFloat(results.telematicsCost) > 0) costsData.push(['Servizi Satellitari', formatCurrency(results.telematicsCost)]);
    if (parseFloat(results.parkingCost) > 0) costsData.push([`Fee Sosta (${results.serviceDays}gg × ${results.numDrivers})`, formatCurrency(results.parkingCost)]);
    if (parseFloat(results.miscCost) > 0) costsData.push(['Costi Vari', formatCurrency(results.miscCost)]);

    autoTable(pdf, {
      startY: yPos,
      head: [['Voce di Costo', 'Importo']],
      body: costsData,
      theme: 'striped',
      headStyles: {
        fillColor: [0, 90, 156],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      styles: {
        fontSize: 9,
        cellPadding: 4
      },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { halign: 'right', fontStyle: 'bold', cellWidth: 'auto' }
      }
    });

    yPos = pdf.lastAutoTable.finalY + 10;

    // BOX TOTALE COSTI - Blu FOUR
    pdf.setFillColor(0, 90, 156);
    pdf.rect(15, yPos, pageWidth - 30, 12, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('TOTALE COSTI:', 20, yPos + 8);
    pdf.setFontSize(14);
    pdf.text(formatCurrency(results.totalCost), pageWidth - 20, yPos + 8, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
    yPos += 17;

    // MARGINE (se presente) - Azzurro chiaro
    if (parseFloat(results.marginAmount) > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('APPLICAZIONE MARGINE', 15, yPos);
      yPos += 5;

      const marginType = formData.marginType === 'percentage'
        ? `${formData.marginValue}% sul prezzo di vendita`
        : 'Importo fisso';

      const marginData = [
        ['Tipo Margine', marginType],
        ['Importo Margine', formatCurrency(results.marginAmount)],
        ['PREZZO DI VENDITA', formatCurrency(results.priceWithMargin)]
      ];

      autoTable(pdf, {
        startY: yPos,
        body: marginData,
        theme: 'plain',
        styles: {
          fontSize: 10,
          cellPadding: 3
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 120 },
          1: { halign: 'right', cellWidth: 'auto' }
        },
        didParseCell: function(data) {
          if (data.row.index === 2) {
            data.cell.styles.fillColor = [224, 242, 254]; // Azzurro chiaro
            data.cell.styles.textColor = [0, 90, 156]; // Blu FOUR
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 12;
          }
        }
      });

      yPos = pdf.lastAutoTable.finalY + 10;
    }

    // PROIEZIONI MENSILI E ANNUALI
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('PROIEZIONI ECONOMICHE', 15, yPos);
    yPos += 5;

    const basePrice = parseFloat(results.marginAmount) > 0 ? parseFloat(results.priceWithMargin) : parseFloat(results.totalCost);
    const baseCost = parseFloat(results.totalCost);
    const baseMargin = parseFloat(results.marginAmount);

    const monthlyPrice = parseFloat(results.monthlyCost);
    const monthlyCost = (baseCost / results.serviceDays) * 22;
    const monthlyMargin = monthlyPrice - monthlyCost;

    const annualPrice = parseFloat(results.annualCost);
    const annualCost = monthlyCost * 12;
    const annualMargin = annualPrice - annualCost;

    const projectionsData = [
      ['', 'Servizio', 'Mensile (22gg)', 'Annuale (264gg)'],
      ['Prezzo Vendita', formatCurrency(basePrice), formatCurrency(monthlyPrice), formatCurrency(annualPrice)],
      ['Costi Totali', formatCurrency(baseCost), formatCurrency(monthlyCost), formatCurrency(annualCost)],
      ['Margine', formatCurrency(baseMargin), formatCurrency(monthlyMargin), formatCurrency(annualMargin)]
    ];

    autoTable(pdf, {
      startY: yPos,
      head: [projectionsData[0]],
      body: projectionsData.slice(1),
      theme: 'grid',
      headStyles: {
        fillColor: [0, 90, 156],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center'
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 45 },
        1: { halign: 'right', cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 'auto' },
        3: { halign: 'right', cellWidth: 'auto' }
      },
      didParseCell: function(data) {
        if (data.row.index === 2 && parseFloat(results.marginAmount) > 0) {
          data.cell.styles.fillColor = [224, 242, 254]; // Azzurro chiaro per margine
        }
      }
    });

    // Footer
    yPos = pageHeight - 15;
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.setFont('helvetica', 'italic');
    pdf.text('FOUR Sustainable Logistics - Fleet Cost Calculator', pageWidth / 2, yPos, { align: 'center' });

    pdf.save(`simulazione-${selectedVehicle.name.replace(/\s/g, '-')}.pdf`);
  };


  const exportExcel = () => {
    const fuelType = settings.fuelTypes.find(f => f.id === selectedVehicle.fuelTypeId);

    // Calcoli proiezioni
    const basePrice = parseFloat(results.marginAmount) > 0 ? parseFloat(results.priceWithMargin) : parseFloat(results.totalCost);
    const baseCost = parseFloat(results.totalCost);
    const baseMargin = parseFloat(results.marginAmount);

    const monthlyPrice = parseFloat(results.monthlyCost);
    const monthlyCost = (baseCost / results.serviceDays) * 22;
    const monthlyMargin = monthlyPrice - monthlyCost;

    const annualPrice = parseFloat(results.annualCost);
    const annualCost = monthlyCost * 12;
    const annualMargin = annualPrice - annualCost;

    const data = [
      ['FOUR SUSTAINABLE LOGISTICS'],
      ['SIMULAZIONE COSTO SERVIZIO'],
      [`Generato il ${new Date().toLocaleDateString('it-IT')}`],
      [],
      ['MEZZO SELEZIONATO'],
      ['Nome', selectedVehicle.name],
      ['Alimentazione', fuelType?.name],
      ['Consumo medio', `${selectedVehicle.avgConsumption} ${fuelType?.unit}`],
      [],
      ['PARAMETRI SIMULAZIONE'],
      ['Distanza totale', `${formData.kmTotal} km`],
      ['Autostrada', `${formData.kmHighwayPercent}%`],
      ['Giorni servizio', results.serviceDays],
      ['Autisti', results.numDrivers],
      ['Prezzo carburante', `€${parseFloat(formData.fuelPrice).toFixed(3)}`],
      [],
      ['DETTAGLIO COSTI'],
      ['Carburante', parseFloat(results.fuelCost)],
      [`Autista (${results.serviceDays}gg × ${results.numDrivers})`, parseFloat(results.driverCost)],
    ];

    if (selectedVehicle.monthlyLease > 0) data.push(['Canone Noleggio', parseFloat(results.leaseCost)]);
    if (parseFloat(results.tollCost) > 0) data.push(['Pedaggi', parseFloat(results.tollCost)]);
    if (parseFloat(results.tireCost) > 0) data.push(['Gomme', parseFloat(results.tireCost)]);
    if (parseFloat(results.telematicsCost) > 0) data.push(['Telematica', parseFloat(results.telematicsCost)]);
    if (parseFloat(results.parkingCost) > 0) data.push(['Sosta', parseFloat(results.parkingCost)]);
    if (parseFloat(results.miscCost) > 0) data.push(['Varie', parseFloat(results.miscCost)]);

    data.push([]);
    data.push(['TOTALE COSTI', parseFloat(results.totalCost)]);

    if (parseFloat(results.marginAmount) > 0) {
      data.push([]);
      data.push(['APPLICAZIONE MARGINE']);
      const marginType = formData.marginType === 'percentage'
        ? `${formData.marginValue}% sul prezzo`
        : 'Importo fisso';
      data.push(['Tipo margine', marginType]);
      data.push(['Importo margine', parseFloat(results.marginAmount)]);
      data.push(['PREZZO VENDITA', parseFloat(results.priceWithMargin)]);
    }

    data.push([]);
    data.push(['PROIEZIONI ECONOMICHE']);
    data.push(['', 'SERVIZIO', 'MENSILE (22gg)', 'ANNUALE (264gg)']);
    data.push(['Prezzo Vendita', basePrice, monthlyPrice, annualPrice]);
    data.push(['Costi Totali', baseCost, monthlyCost, annualCost]);
    data.push(['Margine', baseMargin, monthlyMargin, annualMargin]);

    data.push([]);
    data.push(['INDICATORI']);
    data.push(['Costo per km', parseFloat(results.costPerKm)]);
    data.push(['Costo per giorno', parseFloat(results.costPerDay)]);
    if (parseFloat(results.marginAmount) > 0) {
      data.push(['Margine %', ((baseMargin / basePrice) * 100).toFixed(2) + '%']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Stile header
    ws['A1'].s = { font: { bold: true, sz: 16 } };
    ws['A2'].s = { font: { bold: true, sz: 14 } };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Simulazione');
    XLSX.writeFile(wb, `simulazione-${selectedVehicle.name.replace(/\s/g, '-')}.xlsx`);
  };


  if (!settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6 flex justify-center">
        <img
          src="/logo-four.png"
          alt="FOUR Sustainable Logistics"
          className="h-16 object-contain"
          onError={(e) => e.target.style.display = 'none'}
        />
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center">
          <Calculator className="w-8 h-8 mr-3 text-primary-600" />
          Simulazione Costo
        </h1>
        <p className="text-gray-600 text-center">Calcola il costo del servizio</p>
      </div>

      <form onSubmit={handleCalculate} className="space-y-6">
        {/* Selezione Mezzo */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Seleziona Mezzo
          </label>
          <select
            value={formData.vehicleId}
            onChange={(e) => handleVehicleChange(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            required
          >
            <option value="">-- Scegli un mezzo --</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>

          {selectedVehicle && (
            <div className="mt-4 p-4 bg-primary-50 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Alimentazione:</span>
                <span className="font-semibold">
                  {settings.fuelTypes.find(f => f.id === selectedVehicle.fuelTypeId)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Consumo:</span>
                <span className="font-semibold">
                  {selectedVehicle.avgConsumption} {settings.fuelTypes.find(f => f.id === selectedVehicle.fuelTypeId)?.unit}
                </span>
              </div>
              {selectedVehicle.monthlyLease > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Canone mensile:</span>
                  <span className="font-semibold text-primary-600">
                    €{selectedVehicle.monthlyLease.toLocaleString('it-IT')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Parametri Base */}
        {selectedVehicle && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
              <h3 className="font-semibold text-gray-800 mb-4">Parametri Servizio</h3>

              {/* Km - Slider mobile */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Km Totali: {formData.kmTotal || 0} km
                </label>
                {isMobile ? (
                  <input
                    type="range"
                    min="0"
                    max="2000"
                    step="10"
                    value={formData.kmTotal || 0}
                    onChange={(e) => setFormData({ ...formData, kmTotal: e.target.value })}
                    className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                ) : (
                  <input
                    type="number"
                    value={formData.kmTotal}
                    onChange={(e) => setFormData({ ...formData, kmTotal: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg"
                    placeholder="500"
                    required
                  />
                )}
              </div>

              {/* Doppio Autista */}
              <div className="flex items-center p-3 bg-yellow-50 rounded border border-yellow-200">
                <input
                  type="checkbox"
                  id="doubleDrivers"
                  checked={formData.doubleDrivers}
                  onChange={(e) => setFormData({ ...formData, doubleDrivers: e.target.checked })}
                  className="w-5 h-5 text-primary-600 rounded mr-3"
                />
                <label htmlFor="doubleDrivers" className="flex items-center text-sm font-medium flex-1 cursor-pointer">
                  <Users className="w-5 h-5 mr-2 text-yellow-600" />
                  Doppio Autista (riduce tempi, raddoppia costo)
                </label>
              </div>

              {/* Override Giorni */}
              <div className="border-t pt-3">
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="useForcedDays"
                    checked={formData.useForcedDays}
                    onChange={(e) => setFormData({ ...formData, useForcedDays: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded mr-2"
                  />
                  <label htmlFor="useForcedDays" className="text-sm font-medium text-gray-700">
                    Imposta giorni manualmente
                  </label>
                </div>
                {formData.useForcedDays && (
                  <input
                    type="number"
                    min="1"
                    value={formData.forcedDays}
                    onChange={(e) => setFormData({ ...formData, forcedDays: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="1"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Giorni Mese Lavorati
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={formData.monthlyWorkingDays}
                  onChange={(e) => setFormData({ ...formData, monthlyWorkingDays: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Per calcolare il canone giornaliero
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prezzo Carburante (€)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={formData.fuelPrice}
                  onChange={(e) => setFormData({ ...formData, fuelPrice: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Autostrada: {formData.kmHighwayPercent}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.kmHighwayPercent}
                  onChange={(e) => setFormData({ ...formData, kmHighwayPercent: e.target.value })}
                  className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Margine */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium text-gray-700 mb-3">Margine di Vendita</h4>

                <div className="flex gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, marginType: 'percentage' })}
                    className={`flex-1 py-2 rounded text-sm font-medium ${formData.marginType === 'percentage' ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}
                  >
                    Percentuale (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, marginType: 'fixed' })}
                    className={`flex-1 py-2 rounded text-sm font-medium ${formData.marginType === 'fixed' ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}
                  >
                    Importo (€)
                  </button>
                </div>

                <input
                  type="number"
                  step={formData.marginType === 'percentage' ? '0.1' : '1'}
                  value={formData.marginValue}
                  onChange={(e) => setFormData({ ...formData, marginValue: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg"
                  placeholder={formData.marginType === 'percentage' ? '15' : '500'}
                />
              </div>
            </div>

            {/* Costi Aggiuntivi */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-left font-semibold text-gray-800 mb-4"
              >
                <span>Costi Aggiuntivi</span>
                {showAdvanced ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>

              {showAdvanced && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3 flex-1">
                      <input
                        type="checkbox"
                        id="useTolls"
                        checked={formData.useTolls}
                        onChange={(e) => setFormData({ ...formData, useTolls: e.target.checked })}
                        className="w-5 h-5 text-primary-600 rounded"
                      />
                      <label htmlFor="useTolls" className="text-sm font-medium flex-1">
                        Pedaggi (€/km)
                      </label>
                    </div>
                    {formData.useTolls && (
                      <input
                        type="number"
                        step="0.01"
                        value={formData.tollRate}
                        onChange={(e) => setFormData({ ...formData, tollRate: e.target.value })}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3 flex-1">
                      <input
                        type="checkbox"
                        id="useTires"
                        checked={formData.useTires}
                        onChange={(e) => setFormData({ ...formData, useTires: e.target.checked })}
                        className="w-5 h-5 text-primary-600 rounded"
                      />
                      <label htmlFor="useTires" className="text-sm font-medium flex-1">
                        Gomme (€/km)
                      </label>
                    </div>
                    {formData.useTires && (
                      <input
                        type="number"
                        step="0.001"
                        value={formData.tireRate}
                        onChange={(e) => setFormData({ ...formData, tireRate: e.target.value })}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3 flex-1">
                      <input
                        type="checkbox"
                        id="useTelematics"
                        checked={formData.useTelematics}
                        onChange={(e) => setFormData({ ...formData, useTelematics: e.target.checked })}
                        className="w-5 h-5 text-primary-600 rounded"
                      />
                      <label htmlFor="useTelematics" className="text-sm font-medium flex-1">
                        Telematica (€)
                      </label>
                    </div>
                    {formData.useTelematics && (
                      <input
                        type="number"
                        step="0.1"
                        value={formData.telematicsRate}
                        onChange={(e) => setFormData({ ...formData, telematicsRate: e.target.value })}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3 flex-1">
                      <input
                        type="checkbox"
                        id="useParking"
                        checked={formData.useParking}
                        onChange={(e) => setFormData({ ...formData, useParking: e.target.checked })}
                        className="w-5 h-5 text-primary-600 rounded"
                      />
                      <label htmlFor="useParking" className="text-sm font-medium flex-1">
                        Sosta (€/notte)
                      </label>
                    </div>
                    {formData.useParking && (
                      <input
                        type="number"
                        step="1"
                        value={formData.parkingFee}
                        onChange={(e) => setFormData({ ...formData, parkingFee: e.target.value })}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3 flex-1">
                      <input
                        type="checkbox"
                        id="useMisc"
                        checked={formData.useMisc}
                        onChange={(e) => setFormData({ ...formData, useMisc: e.target.checked })}
                        className="w-5 h-5 text-primary-600 rounded"
                      />
                      <label htmlFor="useMisc" className="text-sm font-medium flex-1">
                        Varie (€)
                      </label>
                    </div>
                    {formData.useMisc && (
                      <input
                        type="number"
                        step="1"
                        value={formData.miscRate}
                        onChange={(e) => setFormData({ ...formData, miscRate: e.target.value })}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-primary-600 text-white py-4 rounded-lg text-lg font-medium hover:bg-primary-700 transition shadow-lg"
            >
              Calcola Costo
            </button>
          </>
        )}
      </form>

      {/* Risultati */}
      {results && (
        <div className="mt-8 space-y-4">
          {/* Card Totale */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-primary-100 text-sm mb-1">Costo Totale Servizio</p>
                <p className="text-4xl font-bold mb-2">{formatCurrency(results.totalCost)}</p>

                {parseFloat(results.marginAmount) > 0 && (
                  <>
                    <div className="border-t border-primary-400 my-3 pt-3">
                      <p className="text-primary-100 text-sm mb-1">+ Margine</p>
                      <p className="text-2xl font-semibold mb-1">{formatCurrency(results.marginAmount)}</p>
                    </div>
                    <div className="bg-green-500 bg-opacity-30 p-3 rounded mt-3">
                      <p className="text-sm mb-1">= Prezzo Vendita</p>
                      <p className="text-3xl font-bold">{formatCurrency(results.priceWithMargin)}</p>
                    </div>
                  </>
                )}

                <div className="text-primary-100 text-sm space-y-1 mt-4">
                  <p>📊 {formatCurrency(results.costPerKm)}/km</p>
                  <p>📅 {formatCurrency(results.costPerDay)}/giorno × {results.serviceDays}gg × {results.numDrivers} autisti</p>
                  <p>💼 Mensile: {formatCurrency(results.monthlyCost)}</p>
                  <p>📆 Annuale: {formatCurrency(results.annualCost)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 ml-3">
                <button
                  type="button"
                  onClick={exportPDF}
                  className="bg-white text-primary-600 p-3 rounded-lg hover:bg-primary-50 transition"
                  title="Esporta PDF"
                >
                  <Download className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={exportExcel}
                  className="bg-white text-primary-600 px-3 py-2 rounded-lg hover:bg-primary-50 transition text-xs font-bold"
                  title="Esporta Excel"
                >
                  XLS
                </button>
              </div>
            </div>
          </div>

          {/* Dettaglio */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-primary-600" />
              Dettaglio Costi
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Carburante</span>
                <span className="font-semibold">{formatCurrency(results.fuelCost)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Autista ({results.serviceDays}gg × {results.numDrivers})</span>
                <span className="font-semibold">{formatCurrency(results.driverCost)}</span>
              </div>
              {selectedVehicle.monthlyLease > 0 && parseFloat(results.leaseCost) > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Canone Noleggio</span>
                  <span className="font-semibold">{formatCurrency(results.leaseCost)}</span>
                </div>
              )}
              {parseFloat(results.tollCost) > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Pedaggi</span>
                  <span className="font-semibold">{formatCurrency(results.tollCost)}</span>
                </div>
              )}
              {parseFloat(results.tireCost) > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Gomme</span>
                  <span className="font-semibold">{formatCurrency(results.tireCost)}</span>
                </div>
              )}
              {parseFloat(results.telematicsCost) > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Telematica</span>
                  <span className="font-semibold">{formatCurrency(results.telematicsCost)}</span>
                </div>
              )}
              {parseFloat(results.parkingCost) > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Fee Sosta</span>
                  <span className="font-semibold">{formatCurrency(results.parkingCost)}</span>
                </div>
              )}
              {parseFloat(results.miscCost) > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Varie</span>
                  <span className="font-semibold">{formatCurrency(results.miscCost)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationPage;
