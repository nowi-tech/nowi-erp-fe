import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { lotsAPI, stagesAPI, receiptsAPI } from '../../api/client';

const stageIcons = {
  stitching: '🧵',
  finishing: '✨',
  dispatch: '📦',
};

export default function StageDashboard() {
  const { stageName } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState(null);
  const [loading, setLoading] = useState(true);

  // My Receipts state
  const [myReceipts, setMyReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);

  // Search state
  const [searchLotNo, setSearchLotNo] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [lotData, setLotData] = useState(null);
  const [remaining, setRemaining] = useState([]);
  const [stageHistory, setStageHistory] = useState([]);

  useEffect(() => {
    fetchStage();
  }, [stageName]);

  useEffect(() => {
    if (stage) {
      fetchMyReceipts();
    }
  }, [stage]);

  const fetchStage = async () => {
    try {
      const stagesRes = await stagesAPI.list();
      const foundStage = stagesRes.data.stages.find(s => s.name === stageName);
      if (!foundStage) {
        setLoading(false);
        return;
      }
      setStage(foundStage);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyReceipts = async () => {
    setReceiptsLoading(true);
    try {
      const res = await receiptsAPI.getHistory({ limit: 20 });
      // Filter receipts for current stage only
      const stageReceipts = res.data.receipts.filter(r => r.stage_name === stageName);
      setMyReceipts(stageReceipts);
    } catch (err) {
      console.error('Error fetching my receipts:', err);
    } finally {
      setReceiptsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchLotNo.trim()) return;

    setSearchLoading(true);
    setSearchError('');
    setLotData(null);
    setRemaining([]);
    setStageHistory([]);

    try {
      // Get lot details with all tracking info
      const lotRes = await lotsAPI.get(searchLotNo.trim());
      const lot = lotRes.data.lot;
      const stages = lotRes.data.stages || [];

      setLotData(lot);

      // Get remaining quantities for current stage
      if (stage) {
        const remainingRes = await lotsAPI.getRemaining(searchLotNo.trim(), stage.id);
        setRemaining(remainingRes.data.remaining || []);
      }

      // Build stage history from stages data
      const history = stages.map(s => ({
        stage_id: s.stage_id,
        stage_name: s.display_name,
        sequence: s.sequence,
        receipts: s.receipts || [],
        is_complete: s.summary?.is_complete,
        is_started: s.summary?.is_started,
        total_received: s.summary?.total_received || 0,
        total_original: s.summary?.total_original || 0,
        total_available: s.summary?.total_available || s.summary?.total_original || 0
      }));
      setStageHistory(history);
    } catch (err) {
      console.error('Error:', err);
      setSearchError(err.response?.data?.error || 'Lot not found');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleReceive = () => {
    if (lotData) {
      navigate(`/stage/${stageName}/receive/${lotData.lot_no}`);
    }
  };

  const handleViewLot = (lotNo) => {
    setSearchLotNo(lotNo);
    // Trigger search
    handleSearchLot(lotNo);
  };

  const handleSearchLot = async (lotNo) => {
    setSearchLoading(true);
    setSearchError('');
    setLotData(null);
    setRemaining([]);
    setStageHistory([]);

    try {
      const lotRes = await lotsAPI.get(lotNo);
      const lot = lotRes.data.lot;
      const stages = lotRes.data.stages || [];

      setLotData(lot);

      if (stage) {
        const remainingRes = await lotsAPI.getRemaining(lotNo, stage.id);
        setRemaining(remainingRes.data.remaining || []);
      }

      const history = stages.map(s => ({
        stage_id: s.stage_id,
        stage_name: s.display_name,
        sequence: s.sequence,
        receipts: s.receipts || [],
        is_complete: s.summary?.is_complete,
        is_started: s.summary?.is_started,
        total_received: s.summary?.total_received || 0,
        total_original: s.summary?.total_original || 0,
        total_available: s.summary?.total_available || s.summary?.total_original || 0
      }));
      setStageHistory(history);
    } catch (err) {
      console.error('Error:', err);
      setSearchError(err.response?.data?.error || 'Lot not found');
    } finally {
      setSearchLoading(false);
    }
  };

  const icon = stageIcons[stageName] || '📋';
  const totalRemaining = remaining.reduce((sum, r) => sum + Math.max(0, r.remaining), 0);

  // Group my receipts by lot
  const receiptsByLot = myReceipts.reduce((acc, r) => {
    if (!acc[r.lot_no]) {
      acc[r.lot_no] = {
        lot_no: r.lot_no,
        sku: r.sku,
        receipts: [],
        latest_date: r.received_at
      };
    }
    acc[r.lot_no].receipts.push(r);
    if (new Date(r.received_at) > new Date(acc[r.lot_no].latest_date)) {
      acc[r.lot_no].latest_date = r.received_at;
    }
    return acc;
  }, {});

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

  if (!stage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 text-red-600 px-5 py-4">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            Stage not found
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            {stage.display_name} Dashboard
          </h1>
          <p className="text-gray-500 text-sm mt-1">Search for a lot to receive products</p>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={searchLotNo}
                onChange={(e) => setSearchLotNo(e.target.value)}
                placeholder="Enter Lot Number (e.g., cu01, dh03)"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all text-lg"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading || !searchLotNo.trim()}
              className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searchLoading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search
                </>
              )}
            </button>
          </form>

          {searchError && (
            <div className="mt-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {searchError}
            </div>
          )}
        </div>

        {/* Lot Details (shown after search) */}
        {lotData && (
          <>
            {/* Lot Info */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Lot Details</h2>
                {totalRemaining > 0 && (
                  <button
                    onClick={handleReceive}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Receive Items
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Lot Number</p>
                  <p className="font-mono font-semibold text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg inline-block">
                    {lotData.lot_no}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">SKU</p>
                  <p className="font-medium text-gray-900">{lotData.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Total Pieces</p>
                  <p className="font-bold text-green-600 text-lg">{lotData.total_pieces || 0}</p>
                </div>
                {lotData.fabric_type && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Fabric Type</p>
                    <p className="text-gray-900">{lotData.fabric_type}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500 mb-1">Created By</p>
                  <p className="text-gray-900 font-medium">
                    {lotData.created_by_name || lotData.created_by_username}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Created At</p>
                  <p className="text-gray-900">{new Date(lotData.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Stage History */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Stage History</h2>

              <div className="space-y-4">
                {stageHistory.map((s, idx) => (
                  <div key={s.stage_id} className={`relative pl-8 ${idx < stageHistory.length - 1 ? 'pb-4' : ''}`}>
                    {/* Timeline line */}
                    {idx < stageHistory.length - 1 && (
                      <div className="absolute left-3 top-8 bottom-0 w-0.5 bg-gray-200"></div>
                    )}

                    {/* Status icon */}
                    <div className={`absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center ${
                      s.is_complete ? 'bg-green-100 text-green-600' :
                      s.is_started ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {s.is_complete ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : s.is_started ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                      )}
                    </div>

                    {/* Stage content */}
                    <div>
                      <h3 className="font-medium text-gray-900">{s.stage_name}</h3>
                      <p className="text-sm text-gray-500">
                        {s.is_complete ? 'Completed' : s.is_started ? 'In Progress' : 'Pending'}
                        {s.is_started && ` - ${s.total_received}/${s.total_available} received`}
                        {!s.is_started && s.total_available > 0 && s.sequence > 1 && ` - ${s.total_available} available from previous stage`}
                      </p>

                      {/* Receipt details */}
                      {s.receipts && s.receipts.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {/* Group receipts by user */}
                          {Object.entries(
                            s.receipts.reduce((acc, r) => {
                              const key = r.received_by_name || r.received_by_username;
                              if (!acc[key]) acc[key] = [];
                              acc[key].push(r);
                              return acc;
                            }, {})
                          ).map(([user, userReceipts]) => (
                            <div key={user} className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                              <span className="font-medium">{user}</span>
                              <span className="text-gray-400 mx-2">-</span>
                              {userReceipts.map((r, i) => (
                                <span key={i}>
                                  {i > 0 && ', '}
                                  {r.size_label}: {r.quantity_received}
                                </span>
                              ))}
                              <span className="text-gray-400 mx-2">-</span>
                              <span className="text-gray-500">
                                {new Date(userReceipts[0].received_at).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Remaining to Receive */}
            {remaining.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="font-medium text-gray-900">Available to Receive at {stage.display_name}</h2>
                  <span className="text-sm text-gray-500">
                    Total: <span className="font-semibold text-gray-900">{totalRemaining}</span> pieces
                  </span>
                </div>

                {totalRemaining > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Size</th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Original</th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">From Prev Stage</th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Received Here</th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Can Receive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {remaining.map((r) => (
                        <tr key={r.size_label} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3">
                            <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg">
                              {r.size_label}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center text-gray-600">{r.original}</td>
                          <td className="px-6 py-3 text-center text-blue-600 font-medium">{r.available}</td>
                          <td className="px-6 py-3 text-center text-green-600 font-medium">{r.received}</td>
                          <td className="px-6 py-3 text-center">
                            <span className={`font-semibold ${r.remaining > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                              {Math.max(0, r.remaining)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-6 text-center">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium">All available items received at this stage</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* My Receipts Section */}
        {!lotData && Object.keys(receiptsByLot).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">My Recent Receipts</h2>
              <p className="text-sm text-gray-500 mt-0.5">Click on a lot to view details or receive more</p>
            </div>

            {receiptsLoading ? (
              <div className="p-6 text-center">
                <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin mx-auto"></div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {Object.values(receiptsByLot).map((lotGroup) => (
                  <div
                    key={lotGroup.lot_no}
                    onClick={() => handleViewLot(lotGroup.lot_no)}
                    className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg">
                          {lotGroup.lot_no}
                        </span>
                        <span className="ml-3 text-gray-600">{lotGroup.sku}</span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(lotGroup.latest_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {lotGroup.receipts.map((r, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          {r.size_label}: {r.quantity_received}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state when no search and no receipts */}
        {!lotData && !searchLoading && !searchError && Object.keys(receiptsByLot).length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Search for a lot to get started</p>
            <p className="text-gray-400 text-sm mt-1">Enter a lot number above to view details and receive items</p>
          </div>
        )}
      </div>
    </div>
  );
}
