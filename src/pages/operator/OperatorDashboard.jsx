import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { reportsAPI, lotsAPI } from '../../api/client';

// Tooltip component
function Tooltip({ children, text }) {
  return (
    <div className="relative group">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
}

// Link badge component for SKU links
function LinkBadge({ link }) {
  return (
    <Tooltip text={link.link}>
      <a
        href={link.link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-full border border-blue-200 hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 transition-all shadow-sm"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {link.label || 'View Link'}
      </a>
    </Tooltip>
  );
}

// Stage progress indicator
function StageIndicator({ stage, compact = false }) {
  const isComplete = stage.summary.is_complete;
  const isStarted = stage.summary.is_started;
  const progress = stage.summary.total_original > 0
    ? Math.round((stage.summary.total_received / stage.summary.total_original) * 100)
    : 0;

  if (compact) {
    return (
      <Tooltip text={`${stage.display_name}: ${stage.summary.total_received}/${stage.summary.total_original} pieces (${progress}%)`}>
        <span className={`text-xs px-3 py-1.5 rounded-full font-medium border cursor-default ${
          isComplete ? 'bg-green-100 text-green-700 border-green-200' :
          isStarted ? 'bg-blue-100 text-blue-700 border-blue-200' :
          'bg-gray-100 text-gray-500 border-gray-200'
        }`}>
          {stage.display_name}: {progress}%
        </span>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isComplete ? (
        <Tooltip text="Stage completed">
          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center cursor-default">
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </Tooltip>
      ) : isStarted ? (
        <Tooltip text="Stage in progress">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center cursor-default">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div>
          </div>
        </Tooltip>
      ) : (
        <Tooltip text="Stage not started">
          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center cursor-default">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export default function OperatorDashboard() {
  const [summary, setSummary] = useState(null);
  const [searchLot, setSearchLot] = useState('');
  const [searchSku, setSearchSku] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const response = await reportsAPI.getSummary();
      setSummary(response.data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLotSearch = async (e) => {
    e.preventDefault();
    if (!searchLot.trim()) return;
    setSearching(true);
    setSearchResult(null);

    try {
      const response = await lotsAPI.get(searchLot.trim());
      setSearchResult({ type: 'lot', data: response.data });
    } catch (err) {
      setSearchResult({ type: 'error', message: 'Lot not found. Please check the lot number and try again.' });
    } finally {
      setSearching(false);
    }
  };

  const handleSkuSearch = async (e) => {
    e.preventDefault();
    if (!searchSku.trim()) return;
    setSearching(true);
    setSearchResult(null);

    try {
      const response = await reportsAPI.getSku(searchSku.trim());
      setSearchResult({ type: 'sku', data: response.data });
    } catch (err) {
      setSearchResult({ type: 'error', message: 'No lots found for this SKU. Try a different search term.' });
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await reportsAPI.download();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `nowi_report_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const clearSearch = () => {
    setSearchLot('');
    setSearchSku('');
    setSearchResult(null);
  };

  const stageColors = {
    'Cutting': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: '✂️', gradient: 'from-purple-500 to-purple-600' },
    'Stitching': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '🧵', gradient: 'from-blue-500 to-blue-600' },
    'Finishing': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '✨', gradient: 'from-amber-500 to-amber-600' },
    'Dispatch': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: '📦', gradient: 'from-green-500 to-green-600' },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Operator Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Monitor production across all stages</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Tooltip text="Configure SKU brands, genders & categories">
              <Link to="/operator/sku-config"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">SKU Config</span>
              </Link>
            </Tooltip>
            <Tooltip text="Manage external links for SKUs">
              <Link to="/operator/sku-links"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span className="hidden sm:inline">SKU Links</span>
              </Link>
            </Tooltip>
            <Tooltip text="Add, edit or remove users">
              <Link to="/operator/users"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="hidden sm:inline">Users</span>
              </Link>
            </Tooltip>
            <Tooltip text="Download complete Excel report">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium text-white transition-all bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-sm disabled:opacity-50">
                {downloading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span className="hidden sm:inline">{downloading ? 'Exporting...' : 'Export'}</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <Tooltip text="Total number of lots created">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-default">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 text-xs sm:text-sm font-medium">Total Lots</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{summary?.total_lots || 0}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
              </div>
            </div>
          </Tooltip>

          <Tooltip text="Total pieces across all lots">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-default">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 text-xs sm:text-sm font-medium">Total Pieces</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{summary?.total_original_pieces?.toLocaleString() || 0}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
              </div>
            </div>
          </Tooltip>

          {summary?.stages?.map(s => {
            const colors = stageColors[s.stage_name] || stageColors['Cutting'];
            return (
              <Tooltip key={s.stage_id} text={`${s.stage_name}: ${s.total_received?.toLocaleString()} pieces received from ${s.active_lots} lots`}>
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-default">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`${colors.text} text-xs sm:text-sm font-medium`}>{s.stage_name}</p>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{s.total_received?.toLocaleString() || 0}</p>
                      <p className="text-xs text-gray-500 mt-1">{s.active_lots} active lots</p>
                    </div>
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg`}>
                      <span className="text-lg sm:text-xl">{colors.icon}</span>
                    </div>
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>

        {/* Search Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <form onSubmit={handleLotSearch} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              Search by Lot Number
            </h3>
            <p className="text-xs text-gray-500 mb-3">Enter a lot number to view its complete tracking history</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchLot}
                onChange={(e) => setSearchLot(e.target.value)}
                placeholder="e.g., cu01, mohit-001"
                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
              />
              <button
                type="submit"
                disabled={searching || !searchLot.trim()}
                className="px-5 py-3 rounded-xl font-medium text-white transition-all bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>

          <form onSubmit={handleSkuSearch} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              Search by SKU
            </h3>
            <p className="text-xs text-gray-500 mb-3">Find all lots associated with a specific SKU</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchSku}
                onChange={(e) => setSearchSku(e.target.value)}
                placeholder="e.g., NW-WOMENPANT_261"
                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              <button
                type="submit"
                disabled={searching || !searchSku.trim()}
                className="px-5 py-3 rounded-xl font-medium text-white transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
        </div>

        {/* Search Results */}
        {searching && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="w-12 h-12 rounded-full border-3 border-green-500 border-t-transparent animate-spin mx-auto"></div>
            <p className="text-gray-500 mt-4">Searching...</p>
          </div>
        )}

        {searchResult?.type === 'error' && (
          <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 text-red-600 px-5 py-4 mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {searchResult.message}
            </div>
            <button onClick={clearSearch} className="text-red-400 hover:text-red-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {searchResult?.type === 'lot' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Lot Header */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">Lot: {searchResult.data.lot.lot_no}</h2>
                    <button onClick={clearSearch} className="text-gray-400 hover:text-gray-600 p-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="inline-flex items-center px-3 py-1 bg-white rounded-full text-sm font-medium text-gray-700 border border-gray-200">
                      SKU: {searchResult.data.lot.sku}
                    </span>
                    {searchResult.data.lot.links?.length > 0 && (
                      <>
                        {searchResult.data.lot.links.map((link) => (
                          <LinkBadge key={link.id} link={link} />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stages */}
            <div className="p-6 space-y-3">
              {searchResult.data.stages?.map((stage) => {
                const colors = stageColors[stage.display_name] || stageColors['Cutting'];
                const isOrigin = stage.summary.is_origin;
                const progress = stage.summary.total_original > 0
                  ? Math.round((stage.summary.total_received / stage.summary.total_original) * 100)
                  : 0;

                return (
                  <div key={stage.stage_id} className={`rounded-xl border ${colors.border} overflow-hidden`}>
                    {/* Stage Header */}
                    <div className={`${colors.bg} px-4 py-3 flex items-center justify-between`}>
                      <div className="flex items-center gap-3">
                        <StageIndicator stage={stage} />
                        <h3 className={`font-medium ${colors.text}`}>{stage.display_name}</h3>
                        <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full">
                          {stage.summary.total_received}/{stage.summary.total_original} pieces
                        </span>
                      </div>
                      <Tooltip text={`${progress}% complete`}>
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${colors.gradient} transition-all duration-500`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </Tooltip>
                    </div>

                    {/* Stage Content */}
                    <div className="bg-white px-4 py-3">
                      {isOrigin ? (
                        <div className="text-sm text-gray-600">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Created: {new Date(searchResult.data.lot.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            <span className="text-gray-400">by</span>
                            <span className="font-medium">{searchResult.data.lot.created_by_name || searchResult.data.lot.created_by_username}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {searchResult.data.lot.sizes?.map((s, i) => (
                              <Tooltip key={i} text={`Size ${s.size_label}: ${s.quantity} pieces`}>
                                <span className="font-mono bg-gray-50 px-3 py-1 rounded-lg border border-gray-200 text-xs cursor-default hover:bg-gray-100 transition-colors">
                                  {s.size_label}: {s.quantity}
                                </span>
                              </Tooltip>
                            ))}
                          </div>
                        </div>
                      ) : stage.receipts?.length > 0 ? (
                        <div className="space-y-2">
                          {stage.receipts.slice(0, 5).map((r, i) => (
                            <div key={i} className="text-sm text-gray-600 flex items-center gap-2 py-1">
                              <span className="font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200 text-xs">{r.size_label}</span>
                              <span className="font-medium">{r.quantity_received} pcs</span>
                              <span className="text-gray-400 text-xs">
                                {new Date(r.received_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} by {r.received_by_name || r.received_by_username}
                              </span>
                            </div>
                          ))}
                          {stage.receipts.length > 5 && (
                            <p className="text-xs text-gray-400 pt-1">+ {stage.receipts.length - 5} more receipts</p>
                          )}
                          {stage.remaining?.filter(r => r.remaining > 0).length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-amber-600 bg-amber-50 -mx-4 -mb-3 px-4 py-2">
                              <span className="font-medium">Pending:</span> {stage.remaining.filter(r => r.remaining > 0).map(r =>
                                `${r.size_label}: ${r.remaining}`
                              ).join(' | ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Waiting for previous stage to complete</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {searchResult?.type === 'sku' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* SKU Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">SKU: {searchResult.data.sku}</h2>
                    <button onClick={clearSearch} className="text-gray-400 hover:text-gray-600 p-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-gray-500 text-sm">Found {searchResult.data.lots?.length || 0} lots</span>
                    {/* Show links from first lot if available */}
                    {searchResult.data.lots?.[0]?.lot?.links?.length > 0 && (
                      <>
                        <span className="text-gray-300">|</span>
                        {searchResult.data.lots[0].lot.links.map((link) => (
                          <LinkBadge key={link.id} link={link} />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Lots List */}
            <div className="p-4 sm:p-6 space-y-3">
              {searchResult.data.lots?.map((lotData) => (
                <div
                  key={lotData.lot.id}
                  className="rounded-xl border border-gray-200 p-4 bg-gray-50 hover:bg-white hover:shadow-md transition-all cursor-pointer"
                  onClick={() => {
                    setSearchLot(lotData.lot.lot_no);
                    handleLotSearch({ preventDefault: () => {} });
                    lotsAPI.get(lotData.lot.lot_no).then(response => {
                      setSearchResult({ type: 'lot', data: response.data });
                    });
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-900">{lotData.lot.lot_no}</h3>
                      <span className="text-xs text-gray-500">
                        {new Date(lotData.lot.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lotData.stages?.map(s => (
                      <StageIndicator key={s.stage_id} stage={s} compact />
                    ))}
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
