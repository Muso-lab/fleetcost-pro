import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Plus, Edit2, Trash2, Save, X } from 'lucide-react';

const SettingsPage = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    fuelTypes: [],
    vehicleTypes: [],
    chargeTypes: [],
    trailerTypes: [],
    licenseTypes: []
  });
  const [editingSection, setEditingSection] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadSettings();
  }, [currentUser]);

  const loadSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, `users/${currentUser.uid}/config/settings`));

      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data());
      } else {
        const defaultSettings = {
          fuelTypes: [
            { id: 'elettrico', name: 'Elettrico', unit: 'kWh/km', price: 0.70 },
            { id: 'gasolio', name: 'Gasolio', unit: 'L/100km', price: 1.64 },
            { id: 'biolng', name: 'BIO LNG', unit: 'kg/100km', price: 1.35 }
          ],
          licenseTypes: [
            { id: 'b', name: 'Patente B', dailyCost: 100 },
            { id: 'c', name: 'Patente C', dailyCost: 116 },
            { id: 'ce', name: 'Patente CE', dailyCost: 134.40 }
          ],
          vehicleTypes: [
            { id: 'furgone', name: 'Furgone', licenseId: 'b' },
            { id: 'motrice', name: 'Motrice', licenseId: 'c' },
            { id: 'bilico', name: 'Bilico', licenseId: 'ce' }
          ],
          chargeTypes: [
            { id: 'domestico', name: 'Domestica', unit: '€/kWh', price: 0.25 },
            { id: 'pubblico', name: 'Pubblica', unit: '€/kWh', price: 0.70 },
            { id: 'hpc', name: 'HPC Autostrada', unit: '€/kWh', price: 0.85 }
          ],
          trailerTypes: [
            { id: 'nessuno', name: 'Nessuno' },
            { id: 'tradizionale', name: 'Tradizionale' },
            { id: 'refrigerato', name: 'Refrigerato' }
          ]
        };
        setSettings(defaultSettings);
        await setDoc(doc(db, `users/${currentUser.uid}/config/settings`), defaultSettings);
      }
    } catch (error) {
      console.error('Errore caricamento impostazioni:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, `users/${currentUser.uid}/config/settings`), settings);
      alert('✅ Impostazioni salvate');
    } catch (error) {
      console.error('Errore salvataggio:', error);
      alert('❌ Errore durante il salvataggio');
    }
  };

  const generateId = (name) => {
    if (!name) return 'item_' + Date.now();
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) || 'item_' + Date.now();
  };

  const handleAdd = (section) => {
    setEditingSection(section);
    setEditingItem(null);

    const defaults = {
      fuelTypes: { name: '', unit: '', price: 0 },
      licenseTypes: { name: '', dailyCost: 0 },
      vehicleTypes: {
        name: '',
        licenseId: (settings.licenseTypes && settings.licenseTypes.length > 0) ? settings.licenseTypes[0].id : 'b'
      },
      chargeTypes: { name: '', unit: '€/kWh', price: 0 },
      trailerTypes: { name: '' }
    };

    setFormData(defaults[section] || {});
  };

  const handleEdit = (section, index) => {
    setEditingSection(section);
    setEditingItem(index);
    setFormData({ ...settings[section][index] });
  };

  const handleDelete = (section, index) => {
    if (!confirm('Eliminare questa voce?')) return;
    const newSettings = { ...settings };
    if (newSettings[section]) {
      newSettings[section].splice(index, 1);
      setSettings(newSettings);
    }
  };

  const handleSaveItem = () => {
    const newSettings = { ...settings };

    // Assicurati che l'array esista
    if (!newSettings[editingSection]) {
      newSettings[editingSection] = [];
    }

    if (editingItem !== null) {
      newSettings[editingSection][editingItem] = formData;
    } else {
      const newItem = { ...formData, id: generateId(formData.name) };
      newSettings[editingSection].push(newItem);
    }

    setSettings(newSettings);
    setEditingSection(null);
    setEditingItem(null);
    setFormData({});
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  const sections = [
  {
    key: 'fuelTypes',
    title: 'Tipi Alimentazione',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', placeholder: 'es: Metano CNG' },
      {
        key: 'unit',
        label: 'Unità Misura Consumi',
        type: 'select',
        options: () => [
          { value: 'kWh/km', label: 'kWh/km (Elettrico - consumo per km)' },
          { value: 'L/100km', label: 'L/100km (Gasolio/Benzina - per 100km)' },
          { value: 'kg/100km', label: 'kg/100km (Metano/LNG - per 100km)' },
          { value: 'm³/100km', label: 'm³/100km (Metano - per 100km)' }
        ]
      },
      { key: 'price', label: 'Prezzo Unitario (€)', type: 'number', step: '0.001', placeholder: '1.640' }
    ],
    display: (item) => `${item.name} (${item.unit} • €${parseFloat(item.price).toFixed(3)})`
  },
  {
    key: 'licenseTypes',
    title: 'Tipi Patente',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', placeholder: 'es: Patente D' },
      { key: 'dailyCost', label: 'Costo Giornaliero (€)', type: 'number', step: '0.01', placeholder: '120.00' }
    ],
    display: (item) => `${item.name} (€${parseFloat(item.dailyCost).toFixed(2)}/giorno)`
  },
  {
    key: 'vehicleTypes',
    title: 'Tipi Veicolo',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', placeholder: 'es: Autotreno' },
      {
        key: 'licenseId',
        label: 'Patente Richiesta',
        type: 'select',
        options: () => {
          const licenses = settings.licenseTypes || [];
          if (licenses.length === 0) {
            return [{ value: 'b', label: 'Configura prima le patenti' }];
          }
          return licenses.map(l => ({ value: l.id, label: l.name }));
        }
      }
    ],
    display: (item) => {
      const license = (settings.licenseTypes || []).find(l => l.id === item.licenseId);
      return `${item.name} (${license?.name || 'N/A'})`;
    }
  },
  {
    key: 'chargeTypes',
    title: 'Tipi Ricarica Elettrica',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', placeholder: 'es: Aziendale' },
      { key: 'unit', label: 'Unità', type: 'text', placeholder: '€/kWh', disabled: true },
      { key: 'price', label: 'Prezzo (€/kWh)', type: 'number', step: '0.001', placeholder: '0.700' }
    ],
    display: (item) => `${item.name} (€${parseFloat(item.price).toFixed(3)}/kWh)`
  },
  {
    key: 'trailerTypes',
    title: 'Tipi Rimorchio',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', placeholder: 'es: Centinato' }
    ],
    display: (item) => item.name
  }
];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center">
          <Settings className="w-8 h-8 mr-3 text-primary-600" />
          Impostazioni
        </h1>
        <p className="text-gray-600">Configura i parametri base</p>
      </div>

      <button
        onClick={saveSettings}
        className="mb-6 flex items-center space-x-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition font-medium"
      >
        <Save className="w-5 h-5" />
        <span>Salva Tutto</span>
      </button>

      <div className="space-y-6">
        {sections.map(section => (
          <div key={section.key} className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">{section.title}</h2>
              <button
                onClick={() => handleAdd(section.key)}
                className="flex items-center space-x-1 bg-primary-600 text-white px-3 py-1.5 rounded text-sm hover:bg-primary-700"
              >
                <Plus className="w-4 h-4" />
                <span>Aggiungi</span>
              </button>
            </div>

            {editingSection === section.key && (
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="space-y-3">
                  {section.fields.map(field => (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.label}
                      </label>
                      {field.type === 'select' ? (
                        <select
                          value={formData[field.key] || ''}
                          onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                          {(field.options ? field.options() : []).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type}
                          step={field.step}
                          value={formData[field.key] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            [field.key]: field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex space-x-2 mt-4">
                  <button onClick={handleSaveItem} className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700">
                    Salva
                  </button>
                  <button onClick={() => setEditingSection(null)} className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">
                    Annulla
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(settings[section.key] || []).map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium">{section.display(item)}</span>
                  <div className="flex space-x-2">
                    <button onClick={() => handleEdit(section.key, index)} className="text-blue-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(section.key, index)} className="text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
