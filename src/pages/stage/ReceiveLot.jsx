import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { lotsAPI, receiptsAPI, stagesAPI } from '../../api/client';

const stageIcons = { stitching: '🧵', finishing: '✨', dispatch: '📦' };

export default function ReceiveLot() {
  const { stageName, lotNo } = useParams();
  const navigate = useNavigate();

  const [stage, setStage] = useState(null);
  const [lot, setLot] = useState(null);
  const [remaining, setRemaining] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Success modal state
  const [showSuccess, setShowSuccess] = useState(false);
  const [receiptChallanUrl, setReceiptChallanUrl] = useState(null);
  const [downloadingChallan, setDownloadingChallan] = useState(false);

  useEffect(() => {
    fetchData();
  }, [stageName, lotNo]);

  const fetchData = async () => {
    try {
      const stagesRes = await stagesAPI.list();
      const foundStage = stagesRes.data.stages.find(s => s.name === stageName);
      if (!foundStage) {
        setError('Stage not found');
        setLoading(false);
        return;
      }
      setStage(foundStage);

      const lotRes = await lotsAPI.get(lotNo);
      setLot(lotRes.data.lot);

      const remainingRes = await lotsAPI.getRemaining(lotNo, foundStage.id);
      setRemaining(remainingRes.data.remaining);

      const initQty = {};
      remainingRes.data.remaining.forEach(r => {
        initQty[r.size_label] = '';
      });
      setQuantities(initQty);
    } catch (err) {
      console.error('Error:', err);
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const sizes = Object.entries(quantities)
      .filter(([_, qty]) => qty && parseInt(qty) > 0)
      .map(([size_label, quantity]) => ({
        size_label,
        quantity: parseInt(quantity)
      }));

    if (sizes.length === 0) {
      setError('Enter at least one quantity');
      setSubmitting(false);
      return;
    }

    try {
      const response = await receiptsAPI.create({
        lot_no: lotNo,
        stage_id: stage.id,
        sizes,
        remarks
      });

      // Store the challan URL and show success modal
      if (response.data.receipt_timestamp) {
        const timestamp = new Date(response.data.receipt_timestamp).getTime();
        setReceiptChallanUrl({ lotNo, stageId: stage.id, timestamp });
      }
      setShowSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create receipt');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadChallan = async () => {
    if (!receiptChallanUrl) return;

    setDownloadingChallan(true);
    try {
      const response = await receiptsAPI.downloadChallan(
        receiptChallanUrl.lotNo,
        receiptChallanUrl.stageId,
        receiptChallanUrl.timestamp
      );
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Receipt_${lotNo}_${stageName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading challan:', err);
      alert('Failed to download receipt challan');
    } finally {
      setDownloadingChallan(false);
    }
  };

  const handleDone = () => {
    navigate(`/stage/${stageName}`);
  };

  const icon = stageIcons[stageName] || '📋';
  const totalToReceive = Object.values(quantities).reduce((sum, q) => sum + (parseInt(q) || 0), 0);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => navigate(`/stage/${stageName}`)}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {stage?.display_name}
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            Receive at {stage?.display_name}
          </h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-100 border border-gray-200">
              <span className="text-gray-500 text-sm">Lot:</span>
              <span className="font-mono font-semibold text-gray-900">{lotNo}</span>
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-100 border border-gray-200">
              <span className="text-gray-500 text-sm">SKU:</span>
              <span className="text-gray-900">{lot?.sku}</span>
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Quantities Table */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-gray-900">Enter Received Quantities</h3>
              {totalToReceive > 0 && (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 border border-green-200">
                  <span className="text-sm text-green-700">Receiving:</span>
                  <span className="font-bold text-green-700">{totalToReceive}</span>
                  <span className="text-sm text-green-700">pieces</span>
                </span>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Size</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Original</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">From Prev</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Received</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Can Get</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Receive Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {remaining.map((r) => {
                    const canReceive = Math.max(0, r.remaining);
                    return (
                      <tr key={r.size_label} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg">
                            {r.size_label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{r.original}</td>
                        <td className="px-4 py-3 text-center text-blue-600 font-medium">{r.available}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-green-600 font-medium">{r.received}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${canReceive > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                            {canReceive}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {canReceive > 0 ? (
                            <input
                              type="number"
                              value={quantities[r.size_label] || ''}
                              onChange={(e) => setQuantities({
                                ...quantities,
                                [r.size_label]: e.target.value
                              })}
                              min="0"
                              max={canReceive}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-center placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                              placeholder="0"
                            />
                          ) : (
                            <span className="flex items-center justify-center gap-1.5 text-green-600 text-sm">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {r.available === 0 ? 'Waiting' : 'Complete'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all resize-none"
              rows={2}
              placeholder="Optional notes about this receipt..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(`/stage/${stageName}`)}
              className="flex-1 py-3.5 px-6 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || totalToReceive === 0}
              className="flex-1 py-3.5 px-6 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Receipt
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Receipt Saved!</h2>
              <p className="text-gray-500">
                Items have been received successfully at {stage?.display_name}.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleDownloadChallan}
                disabled={downloadingChallan}
                className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {downloadingChallan ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Receipt Challan
                  </>
                )}
              </button>

              <button
                onClick={handleDone}
                className="w-full py-3 px-6 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
