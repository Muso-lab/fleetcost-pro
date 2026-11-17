import { Info, Calculator, Fuel, DollarSign, Wrench, CircleDollarSign, TrendingDown, Snowflake, Satellite, Users } from 'lucide-react';
import { COST_EXPLANATIONS } from '../utils/calculations';

const CostExplanation = () => {
  const explanations = [
    {
      icon: <Fuel className="w-5 h-5 text-green-600" />,
      data: COST_EXPLANATIONS.fuel,
      color: 'green'
    },
    {
      icon: <DollarSign className="w-5 h-5 text-blue-600" />,
      data: COST_EXPLANATIONS.toll,
      color: 'blue'
    },
    {
      icon: <CircleDollarSign className="w-5 h-5 text-orange-600" />,
      data: COST_EXPLANATIONS.driver,
      color: 'orange'
    },
    {
      icon: <Calculator className="w-5 h-5 text-red-600" />,
      data: COST_EXPLANATIONS.tires,
      color: 'red'
    },
    {
      icon: <Wrench className="w-5 h-5 text-purple-600" />,
      data: COST_EXPLANATIONS.maintenance,
      color: 'purple'
    },
    {
      icon: <TrendingDown className="w-5 h-5 text-gray-600" />,
      data: COST_EXPLANATIONS.depreciation,
      color: 'gray'
    },
    {
      icon: <Snowflake className="w-5 h-5 text-cyan-600" />,
      data: COST_EXPLANATIONS.nitrogen,
      color: 'cyan'
    },
    {
      icon: <Satellite className="w-5 h-5 text-indigo-600" />,
      data: COST_EXPLANATIONS.telematics,
      color: 'indigo'
    },
    {
      icon: <Users className="w-5 h-5 text-pink-600" />,
      data: COST_EXPLANATIONS.partnerFee,
      color: 'pink'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Info className="w-5 h-5 mr-2 text-primary-600" />
        Come vengono calcolati i costi
      </h3>

      <div className="space-y-6">
        {explanations.map((item, index) => (
          <details key={index} className="group">
            <summary className="cursor-pointer flex items-start space-x-3 hover:text-primary-600 transition">
              {item.icon}
              <div className="flex-1">
                <h4 className="font-semibold text-sm">{item.data.title}</h4>
                <p className="text-xs text-gray-500 mt-1">Clicca per dettagli</p>
              </div>
            </summary>

            <div className="mt-3 ml-8 space-y-2 text-sm text-gray-700">
              {item.data.formula && (
                <div className="bg-gray-50 p-3 rounded">
                  <p className="font-mono text-xs text-primary-700">
                    {item.data.formula}
                  </p>
                </div>
              )}

              {item.data.rates && (
                <div className="space-y-1">
                  <p className="font-medium text-xs text-gray-600">Tariffe applicate:</p>
                  <ul className="space-y-1 text-xs">
                    {Object.entries(item.data.rates).map(([key, value]) => (
                      <li key={key} className="flex justify-between">
                        <span className="text-gray-600">• {key}:</span>
                        <span className="font-medium">{value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {item.data.defaults && (
                <div className="space-y-1">
                  <p className="font-medium text-xs text-gray-600">Valori predefiniti:</p>
                  <ul className="space-y-1 text-xs">
                    {Object.entries(item.data.defaults).map(([key, value]) => (
                      <li key={key} className="flex justify-between">
                        <span className="text-gray-600">• {key}:</span>
                        <span className="font-medium">{value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-gray-500 italic mt-2">
                ℹ️ {item.data.note}
              </p>
            </div>
          </details>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm font-medium text-blue-800 mb-2">
            🛣️ Calcolo Pedaggi Preciso
          </p>
          <p className="text-xs text-blue-700">
            Per un calcolo esatto dei pedaggi autostradali basato su tratta specifica, utilizza:{' '}
            <a
              href="https://www.infoviaggiando.it/pedaggi"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:text-blue-900"
            >
              infoviaggiando.it/pedaggi
            </a>
          </p>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          📊 Tutti i valori sono basati su medie nazionali aggiornate a ottobre 2025 (fonti: MIT, MIMS, operatori di settore) e possono essere personalizzati nei parametri di simulazione.
        </p>
      </div>
    </div>
  );
};

export default CostExplanation;
