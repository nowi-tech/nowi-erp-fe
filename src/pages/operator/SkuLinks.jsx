import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { skuLinksAPI } from '../../api/client';

export default function SkuLinks() {
  const [links, setLinks] = useState([]);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ sku: '', link: '', label: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchLinks();
    fetchSkus();
  }, []);

  const fetchLinks = async (searchQuery = '') => {
    try {
      setLoading(true);
      const response = await skuLinksAPI.list({ search: searchQuery });
      setLinks(response.data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSkus = async () => {
    try {
      const response = await skuLinksAPI.getSkus();
      setSkus(response.data);
    } catch (err) {
      console.error('Error fetching SKUs:', err);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLinks(search);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.sku || !form.link) {
      setError('SKU and Link are required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await skuLinksAPI.create(form);
      setSuccess('Link added successfully');
      setForm({ sku: '', link: '', label: '' });
      setShowAdd(false);
      fetchLinks(search);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id) => {
    const link = links.find(l => l.id === id);
    if (!link) return;

    setSubmitting(true);
    setError('');

    try {
      await skuLinksAPI.update(id, { link: link.link, label: link.label });
      setSuccess('Link updated successfully');
      setEditingId(null);
      fetchLinks(search);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this link?')) return;

    try {
      await skuLinksAPI.delete(id);
      setSuccess('Link deleted successfully');
      fetchLinks(search);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete link');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubmitting(true);
    setError('');
    setUploadResult(null);

    try {
      const response = await skuLinksAPI.bulkUpload(file);
      setUploadResult(response.data);
      setSuccess(`Uploaded: ${response.data.inserted} added, ${response.data.skipped} skipped`);
      fetchLinks(search);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await skuLinksAPI.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sku_links_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const updateLinkField = (id, field, value) => {
    setLinks(links.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <Link to="/operator" className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">SKU Links</h1>
            </div>
            <p className="text-gray-500 text-sm mt-1 ml-8">Connect SKUs to external links</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Template
            </button>
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={submitting}
              />
            </label>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Link
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 text-red-600 px-5 py-4 mb-4">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 text-green-600 px-5 py-4 mb-4">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </div>
        )}

        {uploadResult?.errors?.length > 0 && (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 text-yellow-800 px-5 py-4 mb-4">
            <p className="font-medium mb-2">Some rows had errors:</p>
            <ul className="text-sm space-y-1">
              {uploadResult.errors.slice(0, 5).map((e, i) => (
                <li key={i}>Row {e.row}: {e.error}</li>
              ))}
              {uploadResult.errors.length > 5 && (
                <li className="text-yellow-600">...and {uploadResult.errors.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Add Form Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Add SKU Link</h2>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input
                    list="sku-list"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="Select or type SKU..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
                  />
                  <datalist id="sku-list">
                    {skus.map(sku => (
                      <option key={sku} value={sku} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link URL</label>
                  <input
                    type="url"
                    value={form.link}
                    onChange={(e) => setForm({ ...form, link: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Label (Optional)</label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="e.g., Amazon, Product Page..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-3 rounded-xl font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-all"
                  >
                    {submitting ? 'Adding...' : 'Add Link'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU or label..."
            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
          />
          <button
            type="submit"
            className="px-5 py-3 rounded-xl font-medium text-white bg-green-600 hover:bg-green-700 transition-all"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); fetchLinks(''); }}
              className="px-4 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
            >
              Clear
            </button>
          )}
        </form>

        {/* Links Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 rounded-full border-2 border-green-500 border-t-transparent animate-spin mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading...</p>
            </div>
          ) : links.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p className="text-gray-500">No SKU links found</p>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-4 text-green-600 hover:text-green-700 font-medium"
              >
                Add your first link
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Link</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Label</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Added By</th>
                  <th className="text-right px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{link.sku}</span>
                    </td>
                    <td className="px-6 py-4">
                      {editingId === link.id ? (
                        <input
                          type="url"
                          value={link.link}
                          onChange={(e) => updateLinkField(link.id, 'link', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
                        />
                      ) : (
                        <a
                          href={link.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 hover:underline text-sm truncate block max-w-xs"
                        >
                          {link.link}
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingId === link.id ? (
                        <input
                          type="text"
                          value={link.label || ''}
                          onChange={(e) => updateLinkField(link.id, 'label', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500"
                        />
                      ) : (
                        <span className="text-gray-600 text-sm">{link.label || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-500 text-sm">{link.created_by_name}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingId === link.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdate(link.id)}
                            disabled={submitting}
                            className="text-green-600 hover:text-green-700 font-medium text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingId(link.id)}
                            className="text-blue-600 hover:text-blue-700 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(link.id)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
