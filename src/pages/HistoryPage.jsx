import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatNumber } from '../utils/calculations';
import { History, Trash2, Calendar, Truck } from 'lucide-react';

const HistoryPage = () => {
  const { currentUser } = useAuth();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSimulations();
  }, [currentUser]);

  const loadSimulations = async () => {
    try {
      const q = query(
        collection(db, `users/${currentUser.uid}/simulations`),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const simulationsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSimulations(simulationsData);
    } catch (error) {
      console.error('Errore caricamento storico:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Sei sicuro di voler eliminare questa simulazione?')) return;

    try {
      await deleteDoc(doc(db, `users/${currentUser.uid}/simulations`, id));
      loadSimulations();
    } catch (error) {
      console.error('Errore eliminazione simulazione:', error);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/D';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center">
          <History className="w-8 h-8 mr-3 text-primary-600" />
          Storico Simulazioni
        </h1>
        <p className="text-gray-600">Visualizza tutte le simulazioni effettuate</p>
      </div>

      {simulations.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <History className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">Nessuna simulazione presente</p>
          <p className="text-gray-400 text-sm mt-2">Le simulazioni effettuate appariranno qui</p>
        </div>
      ) : (
        <div className="space-y-4">
          {simulations.map(sim => (
            <div key={sim.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition">
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                  {/* Info Simulazione */}
                  <div className="flex-1 mb-4 lg:mb-0">
                    <div className="flex items-center mb-2">
                      <Truck className="w-5 h-5 text-primary-600 mr-2" />
                      <h3 className="text-lg font-semibold text-gray-800">
                        {sim.vehicleName}
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Km Totali</p>
                        <p className="font-medium text-gray-800">{formatNumber(sim.kmTotal)} km</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Autostrada</p>
                        <p className="font-medium text-gray-800">{sim.kmHighwayPercent}%</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Prezzo Carb.</p>
                        <p className="font-medium text-gray-800">{formatCurrency(sim.fuelPrice)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Ore Guida</p>
                        <p className="font-medium text-gray-800">{sim.results.hours}h</p>
                      </div>
                    </div>

                    <div className="flex items-center mt-3 text-sm text-gray-500">
                      <Calendar className="w-4 h-4 mr-1" />
                      {formatDate(sim.createdAt)}
                    </div>
                  </div>

                  {/* Risultati e Azioni */}
                  <div className="flex flex-col items-end space-y-2">
                    <div className="text-right mb-2">
                      <p className="text-sm text-gray-500">Costo Totale</p>
                      <p className="text-2xl font-bold text-primary-600">
                        {formatCurrency(sim.results.totalCost)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatCurrency(sim.results.costPerKm)}/km
                      </p>
                    </div>

                    <button
                      onClick={() => handleDelete(sim.id)}
                      className="flex items-center space-x-1 text-red-600 hover:text-red-700 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Elimina</span>
                    </button>
                  </div>
                </div>

                {/* Dettaglio Costi (Espandibile) */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-primary-600 hover:text-primary-700 font-medium">
                    Mostra dettaglio costi
                  </summary>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-500 text-xs">Carburante</p>
                      <p className="font-semibold text-gray-800">{formatCurrency(sim.results.fuelCost)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-500 text-xs">Pedaggi</p>
                      <p className="font-semibold text-gray-800">{formatCurrency(sim.results.tollCost)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-500 text-xs">Autista</p>
                      <p className="font-semibold text-gray-800">{formatCurrency(sim.results.driverCost)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-500 text-xs">Gomme</p>
                      <p className="font-semibold text-gray-800">{formatCurrency(sim.results.tireCost)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-gray-500 text-xs">Manutenz.</p>
                      <p className="font-semibold text-gray-800">{formatCurrency(sim.results.maintenanceCost)}</p>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
