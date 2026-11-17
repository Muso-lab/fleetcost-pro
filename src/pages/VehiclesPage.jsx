import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, Truck, Save, X } from 'lucide-react';

const VehiclesPage = () => {
  const { currentUser } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    fuelTypeId: '',
    avgConsumption: '',
    licenseTypeId: '',
    trailerTypeId: '',
    monthlyLease: 0
  });

  useEffect(() => {
    loadSettings();
    loadVehicles();
  }, [currentUser]);

  const loadSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, `users/${currentUser.uid}/config/settings`));
      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data());
      }
    } catch (error) {
      console.error('Errore caricamento impostazioni:', error);
    }
  };

  const loadVehicles = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, `users/${currentUser.uid}/vehicles`));
      const vehiclesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setVehicles(vehiclesData);
    } catch (error) {
      console.error('Errore caricamento mezzi:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const dataToSave = {
        ...formData,
        avgConsumption: parseFloat(formData.avgConsumption),
        monthlyLease: parseFloat(formData.monthlyLease) || 0
      };

      if (editingId) {
        await updateDoc(doc(db, `users/${currentUser.uid}/vehicles`, editingId), {
          ...dataToSave,
          updatedAt: new Date()
        });
      } else {
        await addDoc(collection(db, `users/${currentUser.uid}/vehicles`), {
          ...dataToSave,
          createdAt: new Date()
        });
      }

      resetForm();
      loadVehicles();
    } catch (error) {
      console.error('Errore salvataggio:', error);
      alert('Errore durante il salvataggio');
    }
  };

  const handleEdit = (vehicle) => {
    setFormData({
      name: vehicle.name,
      fuelTypeId: vehicle.fuelTypeId,
      avgConsumption: vehicle.avgConsumption.toString(),
      licenseTypeId: vehicle.licenseTypeId,
      trailerTypeId: vehicle.trailerTypeId,
      monthlyLease: vehicle.monthlyLease || 0
    });
    setEditingId(vehicle.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminare questo mezzo?')) return;

    try {
      await deleteDoc(doc(db, `users/${currentUser.uid}/vehicles`, id));
      loadVehicles();
    } catch (error) {
      console.error('Errore eliminazione:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      fuelTypeId: '',
      avgConsumption: '',
      licenseTypeId: '',
      trailerTypeId: '',
      monthlyLease: 0
    });
    setEditingId(null);
    setShowForm(false);
  };

  const getFuelType = (id) => settings?.fuelTypes.find(f => f.id === id);
  const getLicenseType = (id) => settings?.licenseTypes.find(l => l.id === id);
  const getTrailerType = (id) => settings?.trailerTypes.find(t => t.id === id);

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
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Gestione Mezzi</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nuovo</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {editingId ? 'Modifica Mezzo' : 'Nuovo Mezzo'}
            </h2>
            <button onClick={resetForm} className="text-gray-500">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nome Mezzo</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="es: Volvo FH16"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tipo Alimentazione</label>
              <select
                value={formData.fuelTypeId}
                onChange={(e) => setFormData({ ...formData, fuelTypeId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Seleziona...</option>
                {settings.fuelTypes.map(ft => (
                  <option key={ft.id} value={ft.id}>{ft.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Consumo Medio ({formData.fuelTypeId ? getFuelType(formData.fuelTypeId)?.unit : ''})
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.avgConsumption}
                onChange={(e) => setFormData({ ...formData, avgConsumption: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="es: 1.2 o 28"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Patente Necessaria</label>
              <select
                value={formData.licenseTypeId}
                onChange={(e) => setFormData({ ...formData, licenseTypeId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Seleziona...</option>
                {settings.licenseTypes.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name} (€{lt.dailyCost}/giorno)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Rimorchio</label>
              <select
                value={formData.trailerTypeId}
                onChange={(e) => setFormData({ ...formData, trailerTypeId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="">Seleziona...</option>
                {settings.trailerTypes.map(tt => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Canone Noleggio Mensile (€)</label>
              <input
                type="number"
                step="0.01"
                value={formData.monthlyLease}
                onChange={(e) => setFormData({ ...formData, monthlyLease: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="0 se non applicabile"
              />
              <p className="text-xs text-gray-500 mt-1">
                Include ammortamento, manutenzione, assicurazione
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="flex items-center space-x-2 bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700"
              >
                <Save className="w-5 h-5" />
                <span>{editingId ? 'Aggiorna' : 'Salva'}</span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 border rounded-lg hover:bg-gray-50"
              >
                Annulla
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vehicles.map(vehicle => {
          const fuelType = getFuelType(vehicle.fuelTypeId);
          const license = getLicenseType(vehicle.licenseTypeId);
          const trailer = getTrailerType(vehicle.trailerTypeId);

          return (
            <div key={vehicle.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-2">
                  <Truck className="w-6 h-6 text-primary-600" />
                  <h3 className="text-lg font-semibold">{vehicle.name}</h3>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => handleEdit(vehicle)} className="text-blue-600">
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(vehicle.id)} className="text-red-600">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Alimentazione:</span>
                  <span className="font-medium">{fuelType?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Consumo:</span>
                  <span className="font-medium">{vehicle.avgConsumption} {fuelType?.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span>Patente:</span>
                  <span className="font-medium">{license?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rimorchio:</span>
                  <span className="font-medium">{trailer?.name}</span>
                </div>
                {vehicle.monthlyLease > 0 && (
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-primary-600">Canone:</span>
                    <span className="font-semibold text-primary-600">
                      €{vehicle.monthlyLease.toLocaleString('it-IT')}/mese
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {vehicles.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-500">
          <Truck className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Nessun mezzo configurato</p>
        </div>
      )}
    </div>
  );
};

export default VehiclesPage;
