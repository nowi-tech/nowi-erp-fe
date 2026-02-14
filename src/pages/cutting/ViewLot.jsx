import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { lotsAPI } from '../../api/client';

export default function ViewLot() {
  const { lotNo } = useParams();
  const navigate = useNavigate();
  const [lot, setLot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLot();
  }, [lotNo]);

  const fetchLot = async () => {
    try {
      const response = await lotsAPI.get(lotNo);
      setLot(response.data.lot);
    } catch (err) {
      console.error('Error fetching lot:', err);
      setError(err.response?.data?.error || 'Failed to load lot');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadChallan = async () => {
    setDownloading(true);
    try {
      const response = await lotsAPI.downloadChallan(lotNo);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Challan_${lotNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading challan:', err);
      alert('Failed to download challan');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex justify-center items-center h-64">
          <div className="w-12 h-12 rounded-full border-2 border-green-500 border-t-transparent animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 text-red-600 px-5 py-4">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <button onClick={() => navigate('/cutting')}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <span className="text-2xl">📋</span>
              Lot Details
            </h1>
          </div>
          <button
            onClick={handleDownloadChallan}
            disabled={downloading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Downloading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Challan
              </>
            )}
          </button>
        </div>

        {/* Lot Info Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Lot Number</p>
              <p className="font-mono font-semibold text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg inline-block">
                {lot.lot_no}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">SKU</p>
              <p className="font-medium text-gray-900">{lot.sku}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Pieces</p>
              <p className="font-bold text-green-600 text-xl">{lot.total_pieces || 0}</p>
            </div>
            {lot.fabric_type && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Fabric Type</p>
                <p className="text-gray-900">{lot.fabric_type}</p>
              </div>
            )}
            {lot.table_length && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Table Length</p>
                <p className="text-gray-900">{lot.table_length} m</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500 mb-1">Created At</p>
              <p className="text-gray-900">{new Date(lot.created_at).toLocaleString()}</p>
            </div>
            {lot.remarks && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-gray-500 mb-1">Remarks</p>
                <p className="text-gray-900">{lot.remarks}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sizes Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Sizes & Patterns</h2>
          </div>
          {lot.sizes && lot.sizes.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Size</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Pattern Count</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Total Pieces</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lot.sizes.map((size, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg">
                        {size.size_label}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center text-gray-600">
                      {size.pattern_count || '-'}
                    </td>
                    <td className="px-6 py-3 text-center font-medium text-gray-900">
                      {size.total_pieces || size.quantity || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-gray-500">No sizes found</div>
          )}
        </div>

        {/* Rolls Table */}
        {lot.rolls && lot.rolls.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">Rolls Used</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Roll No</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Layers</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Full Weight</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Remaining</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lot.rolls.map((roll, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <span className="font-mono text-gray-900">{roll.roll_no}</span>
                    </td>
                    <td className="px-6 py-3 text-center text-gray-600">{roll.layers}</td>
                    <td className="px-6 py-3 text-center text-gray-600">
                      {roll.full_weight ? `${roll.full_weight} kg` : '-'}
                    </td>
                    <td className="px-6 py-3 text-center text-gray-600">
                      {roll.remaining_weight ? `${roll.remaining_weight} kg` : '-'}
                    </td>
                    <td className="px-6 py-3 text-center font-medium text-green-600">
                      {roll.weight_used ? `${roll.weight_used} kg` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Stage Tracking */}
        {lot.stages && lot.stages.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">Stage Tracking</h2>
            </div>
            <div className="p-6">
              {lot.stages.map((stage, i) => (
                <div key={i} className={`flex items-start gap-4 ${i > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    stage.status === 'complete' ? 'bg-green-100 text-green-600' :
                    stage.status === 'partial' ? 'bg-blue-100 text-blue-600' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {stage.status === 'complete' ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : stage.status === 'partial' ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{stage.display_name}</h3>
                    <p className="text-sm text-gray-500">
                      {stage.status === 'complete' ? 'Completed' :
                       stage.status === 'partial' ? 'In Progress' : 'Pending'}
                    </p>
                    {stage.received && stage.received > 0 && (
                      <p className="text-sm text-gray-600 mt-1">
                        Received: <span className="font-medium">{stage.received}</span> / {stage.total} pieces
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
