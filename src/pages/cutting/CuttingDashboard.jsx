import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { lotsAPI } from '../../api/client';

export default function CuttingDashboard() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLots();
  }, []);

  const fetchLots = async () => {
    try {
      const response = await lotsAPI.list({ search });
      setLots(response.data.lots);
    } catch (err) {
      console.error('Error fetching lots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setLoading(true);
    fetchLots();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <span className="text-2xl">✂️</span>
              Cutting Dashboard
            </h1>
            <p className="text-gray-500 text-sm mt-1">Manage production lots</p>
          </div>
          <Link to="/cutting/create"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all bg-green-600 hover:bg-green-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Lot
          </Link>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by lot number or SKU..."
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
              />
            </div>
            <button type="submit"
              className="px-6 py-3 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all">
              Search
            </button>
          </div>
        </form>

        {/* Lots Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 rounded-full border-2 border-green-500 border-t-transparent animate-spin mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading lots...</p>
            </div>
          ) : lots.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-gray-500">No lots found</p>
              <p className="text-gray-400 text-sm mt-1">Create your first lot to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lot No</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Sizes</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-3 py-1 rounded-lg">
                          {lot.lot_no}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{lot.sku}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {lot.sizes?.map((s, i) => (
                            <span key={i} className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded-md font-mono">
                              {s.size_label}: {s.quantity}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900">{lot.total_pieces}</span>
                        <span className="text-gray-400 text-sm ml-1">pcs</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(lot.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <Link to={`/cutting/lot/${lot.lot_no}`}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 hover:text-green-700 transition-colors">
                          View
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
