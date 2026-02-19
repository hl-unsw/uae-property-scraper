const fs = require('fs');
const path = require('path');

// Vercel handles __dirname differently, process.cwd() is safer for accessing project files
const DATA_PATH = path.join(process.cwd(), 'data/static');

function readJson(name) {
  const p = path.join(DATA_PATH, `${name}.json`);
  if (!fs.existsSync(p)) {
    console.warn(`Data file not found: ${p}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const staticDb = {
  queryTargeted: (params) => {
    let docs = readJson('targeted_results');
    
    // 1. Basic Filters
    if (params.neighborhood) {
      docs = docs.filter(d => d.neighborhood_en === params.neighborhood);
    }
    if (params.minScore) {
      docs = docs.filter(d => d.score >= parseInt(params.minScore, 10));
    }
    if (params.source) {
      docs = docs.filter(d => d.source === params.source);
    }
    
    // 2. Boolean filters (parking/utilities/fees/oven → has_* fields)
    if (params.minPark && parseInt(params.minPark, 10) > 0) {
      docs = docs.filter(d => d.has_parking === true);
    }
    if (params.minUtil && parseInt(params.minUtil, 10) > 0) {
      docs = docs.filter(d => d.has_utilities === true);
    }
    if (params.minFee && parseInt(params.minFee, 10) > 0) {
      docs = docs.filter(d => d.has_no_commission === true);
    }
    if (params.minOven && parseInt(params.minOven, 10) > 0) {
      docs = docs.filter(d => d.has_oven === true);
    }
    // Score-based filters
    if (params.minVal && parseInt(params.minVal, 10) > 0) {
      docs = docs.filter(d => (d.score_breakdown?.effective_cost || 0) >= parseInt(params.minVal, 10));
    }
    if (params.minSize && parseInt(params.minSize, 10) > 0) {
      docs = docs.filter(d => (d.score_breakdown?.size_bonus || 0) >= parseInt(params.minSize, 10));
    }
    if (params.minPay && parseInt(params.minPay, 10) > 0) {
      docs = docs.filter(d => (d.score_breakdown?.payment || 0) >= parseInt(params.minPay, 10));
    }
    if (params.minVerified && parseInt(params.minVerified, 10) > 0) {
      docs = docs.filter(d => (d.score_breakdown?.verified || 0) >= parseInt(params.minVerified, 10));
    }
    if (params.maxCommute && parseInt(params.maxCommute, 10) > 0 && parseInt(params.maxCommute, 10) < 90) {
      docs = docs.filter(d => (d.commute_min || 0) <= parseInt(params.maxCommute, 10));
    }

    // 3. Sorting
    const sort = params.sort || 'score';
    docs.sort((a, b) => {
      if (sort === 'score') return b.score - a.score;
      if (sort === 'cost') return (a.effective_monthly_cost || 0) - (b.effective_monthly_cost || 0);
      if (sort === 'commute') return (a.commute_min || 0) - (b.commute_min || 0);
      if (sort === 'price') return a.price - b.price;
      if (sort === 'price_desc') return b.price - a.price;
      if (sort === 'size') return (b.size_sqm || 0) - (a.size_sqm || 0);
      if (sort === 'newest') {
        const dateA = a.crawled_at ? new Date(a.crawled_at) : 0;
        const dateB = b.crawled_at ? new Date(b.crawled_at) : 0;
        return dateB - dateA;
      }
      return 0;
    });

    // 4. Statistics (Calculated before pagination)
    const total = docs.length;
    const sortedPrices = [...docs].map(d => d.price).filter(p => p > 0).sort((a, b) => a - b);
    let medianPrice = 0;
    if (sortedPrices.length > 0) {
      const mid = Math.floor(sortedPrices.length / 2);
      medianPrice = sortedPrices.length % 2 !== 0 
        ? sortedPrices[mid] 
        : (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;
    }

    const avgScore = total > 0 
      ? Math.round(docs.reduce((acc, d) => acc + (d.score || 0), 0) / total) 
      : 0;

    const neighborhoods = [...new Set(docs.map(d => d.neighborhood_en))].filter(Boolean).sort();

    // 5. Pagination
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 20));
    const paginatedDocs = docs.slice((page - 1) * limit, page * limit);

    return {
      docs: paginatedDocs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      neighborhoods,
      stats: {
        avgScore,
        medianPrice,
        neighborhoodCount: neighborhoods.length,
        avgEffectiveCost: total > 0 ? Math.round(docs.reduce((acc, d) => acc + (d.effective_monthly_cost || 0), 0) / total) : 0,
        avgBurdenIndex: total > 0 ? Math.round(docs.reduce((acc, d) => acc + (d.burden_index || 0), 0) / total) : 0
      }
    };
  }
};

module.exports = staticDb;
