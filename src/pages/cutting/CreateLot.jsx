import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { lotsAPI, skuConfigAPI, fabricTypesAPI } from '../../api/client';

export default function CreateLot() {
  const navigate = useNavigate();

  // Form state
  const [lotNo, setLotNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [fabricType, setFabricType] = useState('');
  const [tableLength, setTableLength] = useState('');

  // SKU Builder state
  const [brands, setBrands] = useState([]);
  const [genders, setGenders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableSizes, setAvailableSizes] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [skuCode, setSkuCode] = useState('');

  // Fabric type autocomplete
  const [fabricSuggestions, setFabricSuggestions] = useState([]);
  const [showFabricSuggestions, setShowFabricSuggestions] = useState(false);
  const fabricInputRef = useRef(null);

  // Sizes with pattern count
  const [sizes, setSizes] = useState([]);
  const [sizeInput, setSizeInput] = useState('');
  const [sizeInputError, setSizeInputError] = useState('');

  // Rolls
  const [rolls, setRolls] = useState([{ roll_no: '', layers: '', full_weight: '', remaining_weight: '' }]);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [lotNumRes, brandsRes, gendersRes, categoriesRes, sizesRes] = await Promise.all([
          lotsAPI.generateNumber(),
          skuConfigAPI.getBrands(),
          skuConfigAPI.getGenders(),
          skuConfigAPI.getCategories(),
          skuConfigAPI.getSizes()
        ]);

        setLotNo(lotNumRes.data.lot_no);
        setBrands(brandsRes.data.brands || []);
        setGenders(gendersRes.data.genders || []);
        setCategories(categoriesRes.data.categories || []);
        setAvailableSizes(sizesRes.data.sizes || []);
      } catch (err) {
        console.error('Error loading initial data:', err);
        setError('Failed to load configuration data');
      } finally {
        setInitialLoading(false);
      }
    };

    loadData();
  }, []);

  // Fetch fabric suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (fabricType.length >= 1) {
        try {
          const res = await fabricTypesAPI.list(fabricType);
          setFabricSuggestions(res.data.fabric_types || []);
        } catch (err) {
          console.error('Error fetching fabric suggestions:', err);
        }
      } else {
        setFabricSuggestions([]);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(debounce);
  }, [fabricType]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (fabricInputRef.current && !fabricInputRef.current.contains(e.target)) {
        setShowFabricSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate SKU preview
  const skuPreview = () => {
    const brand = brands.find(b => b.id === parseInt(selectedBrand))?.code || '';
    const gender = genders.find(g => g.id === parseInt(selectedGender))?.code || '';
    const category = categories.find(c => c.id === parseInt(selectedCategory))?.code || '';

    if (!brand || !gender || !category || !skuCode) {
      return '';
    }

    return `${brand}-${gender}${category}_${skuCode}`;
  };

  // Calculate total pieces
  const totalLayers = rolls.reduce((sum, r) => sum + (parseInt(r.layers) || 0), 0);
  const totalPatterns = sizes.reduce((sum, s) => sum + (parseFloat(s.pattern_count) || 0), 0);
  const totalPieces = Math.floor(totalPatterns * totalLayers);

  // Size handlers
  const handleSizeInput = (value) => {
    setSizeInput(value);
    setSizeInputError('');
  };

  const parseSizesFromInput = () => {
    if (!sizeInput.trim()) return;

    // Split by comma and clean up
    const inputSizes = sizeInput.split(',').map(s => s.trim()).filter(s => s);

    if (inputSizes.length === 0) return;

    // Get valid size labels from available sizes
    const validSizeLabels = availableSizes.map(s => s.label.toUpperCase());

    const newSizes = [];
    const invalidSizes = [];
    const existingLabels = sizes.map(s => s.size_label.toUpperCase());

    for (const inputSize of inputSizes) {
      const upperSize = inputSize.toUpperCase();
      // Find exact match (case-insensitive)
      const matchedSize = availableSizes.find(s => s.label.toUpperCase() === upperSize);

      if (matchedSize) {
        // Check if already added
        if (!existingLabels.includes(upperSize) && !newSizes.find(s => s.size_label.toUpperCase() === upperSize)) {
          newSizes.push({ size_label: matchedSize.label, pattern_count: '' });
        }
      } else {
        invalidSizes.push(inputSize);
      }
    }

    if (invalidSizes.length > 0) {
      setSizeInputError(`Invalid sizes: ${invalidSizes.join(', ')}`);
    }

    if (newSizes.length > 0) {
      setSizes([...sizes, ...newSizes]);
      setSizeInput('');
    }
  };

  const handleSizeInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      parseSizesFromInput();
    }
  };

  const removeSizeRow = (index) => {
    setSizes(sizes.filter((_, i) => i !== index));
  };

  const updateSize = (index, field, value) => {
    const newSizes = [...sizes];
    newSizes[index][field] = value;
    setSizes(newSizes);
  };

  // Roll handlers
  const addRollRow = () => {
    setRolls([...rolls, { roll_no: '', layers: '', full_weight: '', remaining_weight: '' }]);
  };

  const removeRollRow = (index) => {
    if (rolls.length > 1) {
      setRolls(rolls.filter((_, i) => i !== index));
    }
  };

  const updateRoll = (index, field, value) => {
    const newRolls = [...rolls];
    newRolls[index][field] = value;
    setRolls(newRolls);
  };

  // Calculate weight used for a roll
  const getWeightUsed = (roll) => {
    const full = parseFloat(roll.full_weight) || 0;
    const remaining = parseFloat(roll.remaining_weight) || 0;
    if (full > 0 && remaining >= 0) {
      return (full - remaining).toFixed(2);
    }
    return '-';
  };

  // Calculate total pieces for a size
  const getSizeTotalPieces = (patternCount) => {
    const pc = parseFloat(patternCount) || 0;
    return Math.floor(pc * totalLayers);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const sku = skuPreview();
    if (!sku) {
      setError('Please complete the SKU builder (Brand, Gender, Category, and Code)');
      setLoading(false);
      return;
    }

    const validSizes = sizes.filter(s => s.size_label && parseFloat(s.pattern_count) > 0)
      .map(s => ({
        size_label: s.size_label,
        pattern_count: parseFloat(s.pattern_count)
      }));

    if (validSizes.length === 0) {
      setError('At least one size with pattern count is required');
      setLoading(false);
      return;
    }

    const validRolls = rolls.filter(r => r.roll_no && parseInt(r.layers) > 0)
      .map(r => ({
        roll_no: r.roll_no,
        layers: parseInt(r.layers),
        full_weight: parseFloat(r.full_weight) || null,
        remaining_weight: parseFloat(r.remaining_weight) || null
      }));

    if (validRolls.length === 0) {
      setError('At least one roll with layers is required');
      setLoading(false);
      return;
    }

    try {
      await lotsAPI.create({
        lot_no: lotNo,
        sku,
        fabric_type: fabricType || null,
        table_length: tableLength ? parseFloat(tableLength) : null,
        remarks,
        sizes: validSizes,
        rolls: validRolls
      });
      navigate('/cutting');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create lot');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
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

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => navigate('/cutting')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="text-2xl">✂️</span>
            Create New Lot
          </h1>
          <p className="text-gray-500 text-sm mt-1">Add a new production lot with pattern and roll tracking</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Lot Details Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Lot Details</h2>

            {/* Lot Number - Auto Generated */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lot Number
              </label>
              <input
                type="text"
                value={lotNo}
                readOnly
                className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 font-mono font-semibold cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">Auto-generated based on your username</p>
            </div>

            {/* SKU Builder */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SKU <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                >
                  <option value="">Brand</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.code}</option>
                  ))}
                </select>

                <select
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value)}
                  className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                >
                  <option value="">Gender</option>
                  {genders.map(g => (
                    <option key={g.id} value={g.id}>{g.code}</option>
                  ))}
                </select>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                >
                  <option value="">Category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>

                <input
                  type="text"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                  placeholder="Code (e.g., 261)"
                />
              </div>
              {skuPreview() && (
                <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-sm text-green-700">Preview: </span>
                  <span className="font-mono font-semibold text-green-800">{skuPreview()}</span>
                </div>
              )}
            </div>

            {/* Fabric Type and Table Length */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="relative" ref={fabricInputRef}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fabric Type
                </label>
                <input
                  type="text"
                  value={fabricType}
                  onChange={(e) => setFabricType(e.target.value)}
                  onFocus={() => setShowFabricSuggestions(true)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                  placeholder="e.g., Cotton Lycra"
                />
                {showFabricSuggestions && fabricSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {fabricSuggestions.map((ft) => (
                      <button
                        key={ft.id}
                        type="button"
                        onClick={() => {
                          setFabricType(ft.name);
                          setShowFabricSuggestions(false);
                        }}
                        className="w-full px-4 py-2 text-left text-gray-900 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                      >
                        {ft.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Table Length (meters)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tableLength}
                  onChange={(e) => setTableLength(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                  placeholder="e.g., 12.5"
                />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remarks
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all resize-none"
                placeholder="Optional notes about this lot..."
                rows={2}
              />
            </div>
          </div>

          {/* Sizes & Patterns Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Sizes & Patterns</h2>
              <span className="text-sm text-gray-500">
                Total Patterns: <span className="font-semibold text-gray-900">{totalPatterns}</span>
              </span>
            </div>

            {/* Size Input Field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add Sizes <span className="text-gray-400 font-normal">(comma-separated, e.g., 24,26,28,30 or S,M,L,XL)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sizeInput}
                  onChange={(e) => handleSizeInput(e.target.value)}
                  onKeyDown={handleSizeInputKeyDown}
                  placeholder="Type sizes: 24,26,28,30 or S,M,L,XL"
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={parseSizesFromInput}
                  className="px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                >
                  Add
                </button>
              </div>
              {sizeInputError && (
                <p className="mt-1 text-sm text-red-500">{sizeInputError}</p>
              )}
            </div>

            {/* Size Table */}
            {sizes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Size</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Pattern Count</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Total Pieces</th>
                      <th className="px-3 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sizes.map((size, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-3 py-1.5 bg-gray-100 rounded-lg font-medium text-gray-800">
                            {size.size_label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={size.pattern_count}
                            onChange={(e) => updateSize(index, 'pattern_count', e.target.value)}
                            placeholder="e.g., 2.5"
                            autoFocus={!size.pattern_count}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white transition-all"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="font-medium text-gray-900">
                            {getSizeTotalPieces(size.pattern_count) || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeSizeRow(index)}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="font-medium">No sizes added yet</p>
                <p className="text-sm mt-1">Type sizes above and press Enter or click Add</p>
              </div>
            )}
          </div>

          {/* Rolls Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Rolls Used</h2>
              <span className="text-sm text-gray-500">
                Total Layers: <span className="font-semibold text-gray-900">{totalLayers}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Roll No</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Layers</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Full Wt (kg)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Remain Wt (kg)</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Used (kg)</th>
                    <th className="px-3 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rolls.map((roll, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={roll.roll_no}
                          onChange={(e) => updateRoll(index, 'roll_no', e.target.value)}
                          placeholder="e.g., ROLL-001"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white transition-all"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={roll.layers}
                          onChange={(e) => updateRoll(index, 'layers', e.target.value)}
                          placeholder="e.g., 10"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white transition-all"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={roll.full_weight}
                          onChange={(e) => updateRoll(index, 'full_weight', e.target.value)}
                          placeholder="e.g., 50.0"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white transition-all"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={roll.remaining_weight}
                          onChange={(e) => updateRoll(index, 'remaining_weight', e.target.value)}
                          placeholder="e.g., 30.0"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white transition-all"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="font-medium text-green-600">
                          {getWeightUsed(roll)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeRollRow(index)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          disabled={rolls.length === 1}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addRollRow}
              className="mt-3 flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Roll
            </button>
          </div>

          {/* Total Calculation & Submit */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
                <span className="text-green-700">Total:</span>
                <span className="font-mono text-lg">
                  <span className="font-semibold text-green-800">{totalPatterns}</span>
                  <span className="text-green-600"> patterns</span>
                  <span className="text-green-600 mx-2">×</span>
                  <span className="font-semibold text-green-800">{totalLayers}</span>
                  <span className="text-green-600"> layers</span>
                  <span className="text-green-600 mx-2">=</span>
                  <span className="font-bold text-green-800 text-xl">{totalPieces}</span>
                  <span className="text-green-600"> pieces</span>
                </span>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/cutting')}
                  className="py-3 px-6 rounded-xl font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || totalPieces === 0}
                  className="py-3 px-6 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Create Lot
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
