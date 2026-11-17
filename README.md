# FOUR Eco-Fleet Cost & Cash Flow Pro 🚛🌱

Piattaforma avanzata e robusta per la gestione dei costi operativi, preventivazione tratte, budget e **forecast di cash flow** con integrazione puntuale dei **termini di pagamento (DSO e DPO)**, specificamente sviluppata per **FOUR Trasporti Ecologici**.

Progetto sviluppato e testato in locale per il successivo rilascio su piattaforma cloud / hosting.

---

## 🌟 Principali Novità e Funzionalità Implementate

### 1. 📊 Modello di Cash Flow con Termini di Pagamento (DSO & DPO)
Nel file Excel originario, il cash flow era stimato con una semplice approssimazione forfettaria ("2 mensilità di costi"). Il nuovo motore di calcolo finanziario modella la reale dinamica monetaria mese per mese:
- **Termini di Incasso Clienti (DSO)**: impostabili per commessa (es. 30 gg, 60 gg d.f.f.m., 90 gg d.f.f.m., 120 gg). L'incasso avviene effettivamente a $M + \lfloor DSO/30 \rfloor$.
- **Termini di Pagamento Fornitori / Terzisti (DPO)**: pagamenti a Mas Logistica o padroncini a 15-30 gg, autisti a fine mese/10 del mese successivo, canoni noleggio all'inizio del mese.
- **Calcolo del Fabbisogno Circolante di Picco (Max Working Capital Hole)**: calcolo istantaneo del massimo deficit di cassa cumulato e identificazione del mese di massima tensione finanziaria.
- **Simulatore Scenari "What-If" di Cassa**:
  - Stress-test ritardo incassi (+15 gg, +30 gg, +60 gg).
  - Simulatore Factoring / Anticipo Fatture (incasso dell'80% a 3 giorni con costo dell'1.5%).
- **Esportazione Excel (.xlsx)**: genera un foglio di calcolo con il Conto Economico (P&L) e il Rendiconto Finanziario (Cash Flow) per ciascun mese.

### 2. 🚛 Pagina "Flotta Disponibile" (Fleet Management)
- Anagrafica completa di tutti i **Trattori Stradali, Motrici (18, 12, 9 pallet), Bighe e Semirimorchi (Frigo Azoto Criogenico, Double Deck 55 plt, Centinati Tradizionali, Casse Mobili)**.
- Gestione costi fissi e variabili: canone noleggio mensile FOUR, quota giornaliera di ammortamento, consumi medi (kWh/km, kg/100km, L/100km).
- Stato di disponibilità in tempo reale:
  - **LIBERO / DISPONIBILE** (con 1 click per assegnarlo a un nuovo progetto).
  - **ASSEGNATO A COMMESSA** (con indicazione della linea attiva).
  - **IN MANUTENZIONE**.
- Tasso di impiego flotta e totale canoni mensili da coprire.

### 3. 📋 Commesse & Budget Progetti
- Pre-caricati tutti i **17+ contratti e linee reali di FOUR** dal file Excel:
  - *Decathlon BO + BRT* (Bilico Elettrico 33 plt)
  - *Camst Granarolo / GranTerre* (Motrice Elettrica 18 plt)
  - *Tigotà - Decathlon* (Motrice Elettrica 9 plt - evidenziata in alert per margine negativo)
  - *Cablog Navette Modena / Reggio* (1 turno e 2 turni H24)
  - *K&N Apple / Starbucks Milano* (Motrice E-Truck 18 plt)
  - *Bilico Bio-LNG 1100 km Double Deck* (2 autisti)
  - *Bio-LNG Night Delivery Cossato / Gravedona / Arborio* (Frigo Azoto)
  - *Bio-LNG Crema - Ucraina* (Double Deck)
  - *Bilico Elettrico Arborio / MI*, *STEF*, ecc.
- Form di inserimento rapido commessa:
  - Assegnazione con 1 click di mezzo e semirimorchio dalla flotta (eredita automaticamente canone e consumi!).
  - Definizione termini incasso cliente (DSO) e pagamento fornitori (DPO).
  - Calcolo live di M.O.L. mensile, M.O.L. % e anticipo cassa necessario.

### 4. 🧮 Preventivatore & Simulatore Costi Tratta Integrato
- Calcolo preventivo tratta con selezione del mezzo e semirimorchio dalla flotta.
- Calcolo automatico carburante/energia, autostrada, gomme, turno autista (diurno, notturno o doppio autista 2 turni).
- Determinazione della tariffa consigliata per raggiungere il margine target desiderato (es. 20%).
- **Pulsante "Salva nel Budget & Cash Flow Annuale"**: trasforma la simulazione direttamente in una commessa attiva a budget con un solo click!
- Esportazione preventivo PDF e XLSX.

### 5. ⚡ Funzionamento Standalone & Offline Locale al 100%
- Implementato `storageService.js` basato su LocalStorage con fallback e ripristino istantaneo dei dati originali.
- Pulsanti dedicati per:
  - **Esporta Backup Dati JSON**: salva l'intero database in un file locale.
  - **Importa Backup JSON**: carica dati salvati.
  - **Ripristina Dati da Excel**: ricarica i dati originari puliti.
- Accesso immediato con un click ("Modalità Locale FOUR") senza blocchi di autenticazione offline.

---

## 🚀 Come Eseguire in Locale

Il progetto è situato in `C:\Sviluppo\fleetcost-pro`.

1. Aprire il terminale nella cartella:
```bash
cd C:\Sviluppo\fleetcost-pro
```

2. Avviare il server di sviluppo Vite:
```bash
npm run dev
```

3. Aprire il browser all'indirizzo indicato (tipicamente `http://localhost:5173`).

---

## 📁 Struttura del Progetto

```
fleetcost-pro/
├── src/
│   ├── components/
│   │   └── Navbar.jsx            # Barra di navigazione FOUR con statistiche e backup
│   ├── contexts/
│   │   └── AuthContext.jsx       # Gestione autenticazione (Locale offline + Firebase)
│   ├── data/
│   │   └── initialData.js        # Dati completi estratti dal file Excel di FOUR
│   ├── pages/
│   │   ├── DashboardPage.jsx     # Executive Dashboard e KPI direzionali
│   │   ├── FleetPage.jsx         # Flotta Disponibile (Trattori, Motrici, Rimorchi)
│   │   ├── ProjectsPage.jsx      # Commesse, Budget e Contratti attivi
│   │   ├── CashFlowPage.jsx      # Piano Finanziario, DSO/DPO, Grafici Cassa ed Export Excel
│   │   ├── SimulationPage.jsx    # Preventivatore e simulatore costi tratta
│   │   └── SettingsPage.jsx      # Tariffe vettori energetici e autisti
│   ├── services/
│   │   └── storageService.js     # Motore di persistenza locale e sincronizzazione
│   ├── utils/
│   │   ├── calculations.js       # Calcoli base viaggio e cost breakdown
│   │   └── cashFlowCalculations.js # Motore matematico P&L e Cash Flow con sfasamenti temporali
│   └── App.jsx                   # Routing applicativo
```
