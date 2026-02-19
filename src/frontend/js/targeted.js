const API = '';

let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentLang = localStorage.getItem('lang') || 'zh';
let exchangeRate = 1.97; // Fallback

const TRANSLATIONS = {
  zh: {
    title: '精选房源',
    stat_total: '房源',
    stat_avg_score: '均分',
    stat_avg_price: '中位价',
    stat_hoods: '片区',
    top_meta: '50k–80k · 开间/一居',
    label_neighborhood: '片区',
    label_source: '平台',
    label_sort: '排序',
    label_min_score: '总分 ≥',
    opt_all: '全部',
    sort_score: '综合评分 ↓',
    sort_newest: '最新发布 ↓',
    sort_price_asc: '租金 ↑',
    sort_price_desc: '租金 ↓',
    sort_size: '面积 ↓',
    beds_0: '开间',
    beds_n: '居室',
    currency: '¥',
    per_year: '/ 年',
    loading: '加载中',
    no_results: '未找到房源',
    run_script: '请先运行评分脚本',
    conn_error: '连接错误',
    parking: '停车位',
    utilities: '水电费',
    fees: '中介费',
    payment: '付款方式',
    unlimited: '不限',
    has_parking: '有停车',
    inc_util: '包水电',
    no_fee: '免佣金',
    flex_pay: '灵活付款',
    value_score: '性价比',
    size_score: '面积加分'
  },
  en: {
    title: 'Top Listings',
    stat_total: 'Listings',
    stat_avg_score: 'Avg Score',
    stat_avg_price: 'Median',
    stat_hoods: 'Hoods',
    top_meta: '50k–80k · Studio/1BR',
    label_neighborhood: 'Area',
    label_source: 'Platform',
    label_sort: 'Sort',
    label_min_score: 'Score ≥',
    opt_all: 'All',
    sort_score: 'Top Score ↓',
    sort_newest: 'Newest ↓',
    sort_price_asc: 'Price ↑',
    sort_price_desc: 'Price ↓',
    sort_size: 'Size ↓',
    beds_0: 'Studio',
    beds_n: 'BR',
    currency: 'AED',
    per_year: '/ yr',
    loading: 'Loading',
    no_results: 'No listings found',
    run_script: 'Please run the scoring script first',
    conn_error: 'Connection error',
    parking: 'Parking',
    utilities: 'Utilities',
    fees: 'Commission',
    payment: 'Payment',
    unlimited: 'All',
    has_parking: 'Parking Incl.',
    inc_util: 'Bills Incl.',
    no_fee: 'No Fee',
    flex_pay: 'Flexible',
    value_score: 'Value',
    size_score: 'Size Bonus'
  }
};

// ─── Init ────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await fetchExchangeRate();
  initLanguage();
  loadResults();
  setupInfiniteScroll();

  document.getElementById('filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    resetAndLoad();
  });

  // Select dropdowns — auto-search on change
  ['neighborhood', 'source', 'sort'].forEach(id => {
    document.getElementById(id).addEventListener('change', resetAndLoad);
  });

  // Score Sliders — update display + debounced auto-search
  let sliderTimer = null;
  const sliders = ['minScore', 'minVal', 'minSize'];
  sliders.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        document.getElementById(`${id}-display`).textContent = el.value;
        clearTimeout(sliderTimer);
        sliderTimer = setTimeout(resetAndLoad, 400);
      });
    }
  });

  // Toggle Pills
  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', function() {
      const parent = this.parentElement;
      parent.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      resetAndLoad();
    });
  });

  // Language Switcher
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const lang = this.dataset.lang;
      if (lang === currentLang) return;
      setLanguage(lang);
    });
  });
});

async function fetchExchangeRate() {
  try {
    const res = await fetch(`${API}/api/exchange/rate`);
    const data = await res.json();
    if (data.rate) exchangeRate = data.rate;
  } catch (err) {
    console.warn('Failed to fetch exchange rate', err);
  }
}

function initLanguage() {
  setLanguage(currentLang, false);
}

function setLanguage(lang, reload = true) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  
  // Update Buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Apply UI translations
  applyI18n();

  if (reload) {
    resetAndLoad();
  }
}

function applyI18n() {
  const t = TRANSLATIONS[currentLang];
  document.getElementById('i18n-title').textContent = t.title;
  document.getElementById('i18n-stat-total').textContent = t.stat_total;
  document.getElementById('i18n-stat-avg-score').textContent = t.stat_avg_score;
  document.getElementById('i18n-stat-avg-price').textContent = t.stat_avg_price;
  document.getElementById('i18n-stat-hoods').textContent = t.stat_hoods;
  document.getElementById('i18n-top-meta').textContent = t.top_meta;

  // Form labels
  document.querySelector('label[for="neighborhood"]').firstChild.textContent = t.label_neighborhood;
  document.querySelector('label[for="source"]').firstChild.textContent = t.label_source;
  document.querySelector('label[for="sort"]').firstChild.textContent = t.label_sort;
  document.getElementById('neighborhood').options[0].textContent = t.opt_all;
  document.getElementById('source').options[0].textContent = t.opt_all;
  
  // Sort options
  const sortMap = { score: 'sort_score', newest: 'sort_newest', price: 'sort_price_asc', price_desc: 'sort_price_desc', size: 'sort_size' };
  Object.keys(sortMap).forEach(val => {
    const opt = document.querySelector(`#sort option[value="${val}"]`);
    if (opt) opt.textContent = t[sortMap[val]];
  });

  // Toggles
  const toggles = { minPark: 'parking', minUtil: 'utilities', minFee: 'fees', minPay: 'payment' };
  const toggleOptions = { minPark: 'has_parking', minUtil: 'inc_util', minFee: 'no_fee', minPay: 'flex_pay' };
  
  Object.keys(toggles).forEach(key => {
    const group = document.querySelector(`.toggle-pills[data-filter="${key}"]`);
    if (group) {
      group.previousElementSibling.textContent = t[toggles[key]];
      group.querySelector('button[data-value="0"]').textContent = t.unlimited;
      group.querySelector('button[data-value="1"]').textContent = t[toggleOptions[key]];
    }
  });

  document.querySelector('label[for="minScore"]').firstChild.textContent = t.label_min_score;
  document.querySelector('.filter-group-sm:nth-child(5) label').firstChild.textContent = t.value_score;
  document.querySelector('.filter-group-sm:nth-child(6) label').firstChild.textContent = t.size_score;
}

// ─── Infinite Scroll ─────────────────────

function setupInfiniteScroll() {
  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && hasMore) {
      currentPage++;
      loadResults(true);
    }
  }, { rootMargin: '200px' });

  observer.observe(sentinel);
}

function resetAndLoad() {
  currentPage = 1;
  hasMore = true;
  loadResults(false);
}

// ─── API ─────────────────────────────────

function getActiveFilterValue(filterName) {
  const pill = document.querySelector(`.toggle-pills[data-filter="${filterName}"] .pill.active`);
  return pill ? pill.dataset.value : '0';
}

async function loadResults(append = false) {
  if (isLoading) return;
  isLoading = true;

  const container = document.getElementById('listings');
  const loadingEl = document.getElementById('scroll-loading');

  if (!append) {
    container.innerHTML = `<div class="loading">${TRANSLATIONS[currentLang].loading}</div>`;
  }
  if (loadingEl) loadingEl.classList.add('visible');

  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 20,
      sort: document.getElementById('sort').value,
      neighborhood: document.getElementById('neighborhood').value,
      source: document.getElementById('source').value,
      minScore: document.getElementById('minScore').value,
      minVal: document.getElementById('minVal').value,
      minSize: document.getElementById('minSize').value,
      minPark: getActiveFilterValue('minPark'),
      minUtil: getActiveFilterValue('minUtil'),
      minFee: getActiveFilterValue('minFee'),
      minPay: getActiveFilterValue('minPay'),
    });

    const res = await fetch(`${API}/api/targeted-results?${params}`);
    const data = await res.json();

    const t = TRANSLATIONS[currentLang];
    document.getElementById('stat-total').textContent = data.total.toLocaleString();
    document.getElementById('stat-avg-score').textContent = data.stats.avgScore;
    
    // Currency conversion for Median Price
    const priceVal = currentLang === 'zh' ? data.stats.medianPrice * exchangeRate : data.stats.medianPrice;
    document.getElementById('stat-avg-price').textContent = Math.round(priceVal).toLocaleString();
    
    document.getElementById('stat-hoods').textContent = data.stats.neighborhoodCount;

    populateNeighborhoods(data.neighborhoods);

    if (!data.docs.length && !append) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>${t.no_results}</h3>
          <p>${t.run_script}</p>
        </div>
      `;
      hasMore = false;
      return;
    }

    const cardsHtml = data.docs.map(renderCard).join('');
    if (append) {
      container.insertAdjacentHTML('beforeend', cardsHtml);
    } else {
      container.innerHTML = cardsHtml;
    }

    hasMore = currentPage < data.totalPages;
  } catch (err) {
    if (!append) {
      container.innerHTML = `<div class="empty-state"><h3>${TRANSLATIONS[currentLang].conn_error}</h3></div>`;
    }
    hasMore = false;
  } finally {
    isLoading = false;
    if (loadingEl) loadingEl.classList.remove('visible');
  }
}

let neighborhoodsFilled = false;
function populateNeighborhoods(hoods) {
  if (neighborhoodsFilled || !hoods?.length) return;
  neighborhoodsFilled = true;
  const sel = document.getElementById('neighborhood');
  for (const h of hoods) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    sel.appendChild(opt);
  }
}

// ─── Render ──────────────────────────────

function renderCard(doc) {
  const t = TRANSLATIONS[currentLang];
  
  // Currency Conversion
  const rawPrice = doc.price || 0;
  const displayPrice = currentLang === 'zh' ? Math.round(rawPrice * exchangeRate) : rawPrice;
  const priceStr = displayPrice.toLocaleString();
  
  const beds = (doc.bedrooms === '0' || doc.bedrooms === 'studio') 
    ? t.beds_0 
    : `${doc.bedrooms} ${t.beds_n}`;
    
  const sizeStr = doc.size_sqm ? `${doc.size_sqm} ㎡` : '';
  const scoreTier = doc.score >= 60 ? 'high' : doc.score >= 35 ? 'mid' : 'low';
  const sb = doc.score_breakdown || {};

  // Feature icons
  const icons = [];
  if (sb.parking > 0) icons.push(`<span class="feature-icon" title="${t.parking}">P</span>`);
  if (sb.utilities > 0) icons.push(`<span class="feature-icon" title="${t.utilities}">W</span>`);
  if (sb.fees > 0) icons.push(`<span class="feature-icon" title="${t.fees}">D</span>`);
  if (sb.payment > 0) icons.push(`<span class="feature-icon" title="${t.payment}">$</span>`);

  // Language choice for text
  const title = currentLang === 'zh' ? (doc.title_zh || doc.title) : doc.title;
  const neighborhood = currentLang === 'zh' ? (doc.neighborhood_zh || doc.neighborhood_matched) : doc.neighborhood_matched;
  const location = currentLang === 'zh' ? '' : doc.location; // Less noise in ZH

  const dateStr = doc.crawled_at ? new Date(doc.crawled_at).toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' }) : '';

  return `
    <div class="listing-card">
      <div class="listing-header">
        <div class="listing-title">
          <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>
        </div>
        <div class="header-badges">
          <span class="score-badge score-${scoreTier}">${doc.score}</span>
        </div>
      </div>
      <div class="listing-price">
        <span class="currency">${t.currency}</span> <span class="price-num">${priceStr}</span> <span class="period">${t.per_year}</span>
      </div>
      <div class="listing-meta">
        <span>${beds}</span>
        ${sizeStr ? `<span>${sizeStr}</span>` : ''}
        ${dateStr ? `<span class="date">${dateStr}</span>` : ''}
        ${icons.length ? `<span class="feature-icons">${icons.join('')}</span>` : ''}
      </div>
      <div class="listing-location">
        <span class="location-main">${escapeHtml(neighborhood)}</span>
        ${location ? `<span class="location-sub">${escapeHtml(location)}</span>` : ''}
      </div>
      <div class="score-detail">
        ${renderScoreBar(t.value_score, sb.value || 0, 30)}
        ${renderScoreBar(t.parking, sb.parking || 0, 20)}
        ${renderScoreBar(t.utilities, sb.utilities || 0, 15)}
        ${renderScoreBar(t.size_score, sb.size_bonus || 0, 15)}
        ${renderScoreBar(t.fees, sb.fees || 0, 10)}
        ${renderScoreBar(t.payment, sb.payment || 0, 10)}
      </div>
    </div>
  `;
}

function renderScoreBar(label, points, max) {
  const pct = max > 0 ? Math.round((points / max) * 100) : 0;
  return `
    <div class="score-bar-row">
      <span class="score-bar-label">${label}</span>
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="score-bar-pts">${points}/${max}</span>
    </div>
  `;
}

// ─── Utilities ───────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
