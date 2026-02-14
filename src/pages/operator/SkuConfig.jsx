import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { skuConfigAPI } from '../../api/client';

const TABS = [
  { id: 'brands', label: 'Brands', icon: '🏷️' },
  { id: 'genders', label: 'Genders', icon: '👤' },
  { id: 'categories', label: 'Categories', icon: '📦' }
];

export default function SkuConfig() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('brands');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [activeTab]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      let response;
      if (activeTab === 'brands') {
        response = await skuConfigAPI.getBrands();
        setItems(response.data.brands);
      } else if (activeTab === 'genders') {
        response = await skuConfigAPI.getGenders();
        setItems(response.data.genders);
      } else {
        response = await skuConfigAPI.getCategories();
        setItems(response.data.categories);
      }
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (editingItem) {
        // Update
        if (activeTab === 'brands') {
          await skuConfigAPI.updateBrand(editingItem.id, formData);
        } else if (activeTab === 'genders') {
          await skuConfigAPI.updateGender(editingItem.id, formData);
        } else {
          await skuConfigAPI.updateCategory(editingItem.id, formData);
        }
      } else {
        // Create
        if (activeTab === 'brands') {
          await skuConfigAPI.createBrand(formData);
        } else if (activeTab === 'genders') {
          await skuConfigAPI.createGender(formData);
        } else {
          await skuConfigAPI.createCategory(formData);
        }
      }
      setShowForm(false);
      setEditingItem(null);
      setFormData({ code: '', name: '' });
      fetchItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ code: item.code, name: item.name });
    setShowForm(true);
  };

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return;

    try {
      if (activeTab === 'brands') {
        await skuConfigAPI.deleteBrand(item.id);
      } else if (activeTab === 'genders') {
        await skuConfigAPI.deleteGender(item.id);
      } else {
        await skuConfigAPI.deleteCategory(item.id);
      }
      fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData({ code: '', name: '' });
    setError('');
  };

  const getTabLabel = () => {
    const tab = TABS.find(t => t.id === activeTab);
    return tab ? tab.label.slice(0, -1) : 'Item'; // Remove 's' for singular
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <button onClick={() => navigate('/operator')}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              SKU Configuration
            </h1>
            <p className="text-gray-500 text-sm mt-1">Manage brands, genders, and categories for SKU generation</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); cancelForm(); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add Button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => { setShowForm(!showForm); setEditingItem(null); setFormData({ code: '', name: '' }); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              showForm
                ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {showForm ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add {getTabLabel()}
              </>
            )}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="font-medium text-gray-900 mb-4">
              {editingItem ? `Edit ${getTabLabel()}` : `Add New ${getTabLabel()}`}
            </h2>

            {error && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-4">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                  placeholder="e.g., NW"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Used in SKU (auto uppercase)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                  placeholder="e.g., Nowi"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-4 px-6 py-3 rounded-xl font-medium text-white transition-all disabled:opacity-50 flex items-center gap-2 bg-green-600 hover:bg-green-700"
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
                  {editingItem ? 'Update' : 'Create'}
                </>
              )}
            </button>
          </form>
        )}

        {/* Items Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-gray-500">No {activeTab} found</p>
              <p className="text-gray-400 text-sm mt-1">Add your first {getTabLabel().toLowerCase()}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono font-semibold text-gray-900 bg-blue-100 text-blue-700 px-3 py-1 rounded-lg">
                        {item.code}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900">{item.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleEdit(item)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
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
