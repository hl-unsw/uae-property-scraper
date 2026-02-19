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
    
    // 2. Breakdown Filters
    const breakdownMap = {
      minVal: 'value',
      minPark: 'parking',
      minUtil: 'utilities',
      minSize: 'size_bonus',
      minFee: 'fees',
      minPay: 'payment'
    };
    
    for (const [p, field] of Object.entries(breakdownMap)) {
      if (params[p] && parseInt(params[p], 10) > 0) {
        docs = docs.filter(d => (d.score_breakdown?.[field] || 0) >= parseInt(params[p], 10));
      }
    }

    // 3. Sorting
    const sort = params.sort || 'score';
    docs.sort((a, b) => {
      if (sort === 'score') return b.score - a.score;
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
