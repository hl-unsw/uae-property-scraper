const API = '';

let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentLang = localStorage.getItem('lang') || 'zh';
let exchangeRate = 1.97; // Fallback
let exchangeRateUpdated = null;
let fetchController = null;

// Auth state
let isAuthenticated = false;

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ESCAPE_MAP[s]);
}

const TRANSLATIONS = {
  zh: {
    title: '精选房源',
    match_label: '匹配度',
    stat_total: '房源',
    stat_avg_score: '中位分',
    stat_avg_cost: '中位成本',
    stat_avg_ratio: '负担率',
    top_meta: '50k–80k · 开间/一居 · 精选推荐',
    label_neighborhood: '片区',
    label_interest: '互动标记',
    label_sort: '排序',
    label_min_score: '总分 ≥',
    opt_all: '全部',
    opt_all_hoods: '全部片区',
    opt_interest_all: '所有状态',
    opt_interested: '感兴趣',
    opt_ignored: '不感兴趣',
    sort_score: '综合评分 ↓',
    sort_cost: '月均成本 ↑',
    sort_newest: '最新发布 ↓',
    sort_price_asc: '租金 ↑',
    sort_price_desc: '租金 ↓',
    sort_size: '面积 ↓',
    beds_0: '开间',
    beds_n: '居室',
    currency: '¥',
    per_year: '/ 年',
    per_month: '/ 月',
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
    verified_label: '认证',
    is_verified: '已认证',
    oven_label: '烤箱',
    has_oven: '有烤箱',
    value_score: '综合成本 ≥',
    size_score: '面积加分 ≥',
    hint_val: '（满分 67）',
    hint_size: '（满分 10）',
    cost_parking_saving: '停车节省',
    cost_utility_saving: '包水电节省',
    cost_chiller_saving: '免冷却费',
    cost_commission_saving: '免佣金节省',
    sort_commute: '通勤 ↑',
    label_commute: '通勤 ≤',
    hint_commute: '分钟',
    commute_unit: '分钟',
    commute_to: '→ Sky Tower',
    cost_rent: '房租',
    cost_time: '时间成本',
    cost_fuel: '油费',
    cost_total: '月均总成本',
    cost_salary: '预算占比',
    btn_star: '★',
    btn_hide: '✕',
    filter_toggle: '筛选条件',
    btn_star_hint: '标记为感兴趣',
    btn_hide_hint: '忽略此房源',
    updated_label: '更新'
  },
  en: {
    title: 'Top Listings',
    match_label: 'Match',
    stat_total: 'Listings',
    stat_avg_score: 'Med Score',
    stat_avg_cost: 'Med Cost/Mo',
    stat_avg_ratio: 'Burden %',
    top_meta: '50k–80k · Studio/1BR · Curated',
    label_neighborhood: 'Area',
    label_interest: 'Status',
    label_sort: 'Sort',
    label_min_score: 'Score ≥',
    opt_all: 'All',
    opt_all_hoods: 'All Areas',
    opt_interest_all: 'All Listings',
    opt_interested: 'Interested',
    opt_ignored: 'Ignored',
    sort_score: 'Top Score ↓',
    sort_cost: 'Eff. Cost ↑',
    sort_newest: 'Newest ↓',
    sort_price_asc: 'Price ↑',
    sort_price_desc: 'Price ↓',
    sort_size: 'Size ↓',
    beds_0: 'Studio',
    beds_n: 'BR',
    currency: 'AED',
    per_year: '/ yr',
    per_month: '/ mo',
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
    verified_label: 'Verified',
    is_verified: 'Verified',
    oven_label: 'Oven',
    has_oven: 'Oven',
    value_score: 'Eff. Cost ≥',
    size_score: 'Size Bonus ≥',
    hint_val: '(Max 67)',
    hint_size: '(Max 10)',
    cost_parking_saving: 'Parking saving',
    cost_utility_saving: 'Utilities saving',
    cost_chiller_saving: 'Chiller free',
    cost_commission_saving: 'No commission',
    sort_commute: 'Commute ↑',
    label_commute: 'Commute ≤',
    hint_commute: 'min',
    commute_unit: 'min',
    commute_to: '→ Sky Tower',
    cost_rent: 'Rent',
    cost_time: 'Time cost',
    cost_fuel: 'Fuel',
    cost_total: 'Total/mo',
    cost_salary: 'of budget',
    btn_star: '★',
    btn_hide: '✕',
    filter_toggle: 'Filters',
    btn_star_hint: 'Mark as interested',
    btn_hide_hint: 'Ignore listing',
    updated_label: 'Updated'
  }
};

// ─── Init ────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  renderAuthUI();
  await fetchExchangeRate();
  initLanguage();
  loadResults();
  setupInfiniteScroll();

  document.getElementById('filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    resetAndLoad();
  });

  // Select dropdowns — auto-search on change
  ['neighborhood', 'sort', 'interest'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', resetAndLoad);
  });

  // Score Sliders — update display + debounced auto-search
  let sliderTimer = null;
  const sliders = ['minScore', 'minVal', 'minSize', 'maxCommute'];
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

  // Event Delegation for Listing Actions
  const listingsContainer = document.getElementById('listings');
  if (listingsContainer) {
    listingsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.act-btn');
      if (!btn) return;
      
      const card = btn.closest('.listing-card');
      const listingId = card?.dataset.id;
      const status = btn.classList.contains('star') ? 'interested' : 'ignored';
      
      if (listingId && card) {
        interact(listingId, status, card);
      }
    });

    listingsContainer.addEventListener('animationend', (e) => {
      if (e.animationName === 'border-trace') {
        const card = e.target.closest('.listing-card');
        if (card) card.classList.remove('is-new', 'in-view');
      }
    });
  }

  // Mobile Filter Toggle
  const toggleBtn = document.getElementById('toggle-filters');
  const filtersSection = document.getElementById('filters-section');
  if (toggleBtn && filtersSection) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', !isExpanded);
      filtersSection.classList.toggle('visible');
    });
  }
});

// ─── Auth ─────────────────────────────────

async function checkAuth() {
  try {
    const res = await fetch(`${API}/api/auth/validate`, {
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (data.valid) isAuthenticated = true;
  } catch (err) { /* ignore */ }
}

function renderAuthUI() {
  const topBar = document.querySelector('.top-meta-group');
  if (!topBar) return;

  // Remove existing auth actions if any
  const existing = topBar.querySelector('.auth-actions');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.className = 'auth-actions';

  if (isAuthenticated) {
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'auth-btn';
    logoutBtn.textContent = currentLang === 'zh' ? '登出' : 'Logout';
    logoutBtn.addEventListener('click', logout);
    container.appendChild(logoutBtn);
  } else {
    // Login button
    const loginBtn = document.createElement('button');
    loginBtn.type = 'button';
    loginBtn.className = 'auth-btn auth-btn-primary';
    loginBtn.textContent = 'Touch ID';
    loginBtn.addEventListener('click', loginWebAuthn);
    container.appendChild(loginBtn);

    // Register button (prompt for token on click)
    const regBtn = document.createElement('button');
    regBtn.type = 'button';
    regBtn.className = 'auth-btn';
    regBtn.textContent = currentLang === 'zh' ? '注册指纹' : 'Register';
    regBtn.addEventListener('click', registerWebAuthn);
    container.appendChild(regBtn);
  }

  topBar.appendChild(container);
}

async function loginWebAuthn() {
  try {
    // 1. Get login options
    const optRes = await fetch(`${API}/api/webauthn/login-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });
    if (!optRes.ok) {
      const err = await optRes.json();
      alert(err.error || 'Failed to get login options');
      return;
    }
    const options = await optRes.json();

    // 2. Touch ID prompt
    const credential = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });

    // 3. Verify
    const verRes = await fetch(`${API}/api/webauthn/login-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(credential),
    });
    const result = await verRes.json();

    if (result.verified) {
      isAuthenticated = true;
      renderAuthUI();
      injectAdminButtons();
    } else {
      alert(result.error || 'Authentication failed');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('WebAuthn login failed', err);
      alert(currentLang === 'zh' ? '认证失败' : 'Authentication failed');
    }
  }
}

async function registerWebAuthn() {
  const token = prompt(currentLang === 'zh' ? '请输入管理员 Token：' : 'Enter admin token:');
  if (!token) return;

  try {
    // 1. Get registration options
    const optRes = await fetch(`${API}/api/webauthn/register-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token }),
    });
    if (!optRes.ok) {
      const err = await optRes.json();
      alert(err.error || 'Failed to get registration options');
      return;
    }
    const options = await optRes.json();

    // 2. Touch ID prompt
    const credential = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });

    // 3. Verify
    const verRes = await fetch(`${API}/api/webauthn/register-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(credential),
    });
    const result = await verRes.json();

    if (result.verified) {
      showCredentialResult(result.envVars);
    } else {
      alert(result.error || 'Registration failed');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('WebAuthn registration failed', err);
      alert(currentLang === 'zh' ? '注册失败' : 'Registration failed');
    }
  }
}

function showCredentialResult(envVars) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const text = `WEBAUTHN_CREDENTIAL_ID=${envVars.WEBAUTHN_CREDENTIAL_ID}\nWEBAUTHN_PUBLIC_KEY=${envVars.WEBAUTHN_PUBLIC_KEY}`;

  const note = currentLang === 'zh'
    ? '保存到 Vercel 环境变量后，需要重新部署才能生效。'
    : 'After saving these to Vercel, you must redeploy for changes to take effect.';

  overlay.innerHTML = `
    <div class="modal-content">
      <h3>${currentLang === 'zh' ? '注册成功 — 复制到 Vercel 环境变量' : 'Registration Success — Copy to Vercel Env Vars'}</h3>
      <pre class="credential-block">${escapeHtml(text)}</pre>
      <p class="modal-note">${note}</p>
      <div class="modal-actions">
        <button type="button" class="auth-btn auth-btn-primary" id="modal-copy">${currentLang === 'zh' ? '复制' : 'Copy'}</button>
        <button type="button" class="auth-btn" id="modal-close">${currentLang === 'zh' ? '关闭' : 'Close'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('modal-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(() => {
      document.getElementById('modal-copy').textContent = currentLang === 'zh' ? '已复制' : 'Copied!';
    });
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

async function logout() {
  try {
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch (err) { /* ignore */ }
  isAuthenticated = false;
  renderAuthUI();
  removeAdminButtons();
}

// ─── Exchange Rate ────────────────────────

async function fetchExchangeRate() {
  try {
    const res = await fetch(`${API}/api/exchange/rate`);
    const data = await res.json();
    if (data.rate) exchangeRate = data.rate;
    exchangeRateUpdated = data.lastUpdated ? new Date(data.lastUpdated) : new Date();
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

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  applyI18n();
  updateRateDisplay();
  renderAuthUI();

  if (reload) {
    resetAndLoad();
  }
}

function updateRateDisplay() {
  const el = document.getElementById('rate-info');
  if (!el) return;
  if (currentLang === 'zh') {
    let text = `1 AED ≈ ¥${exchangeRate.toFixed(2)}`;
    if (exchangeRateUpdated) {
      text += ` · ${exchangeRateUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新`;
    }
    el.textContent = text;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function applyI18n() {
  const t = TRANSLATIONS[currentLang];
  document.getElementById('i18n-title').textContent = t.title;
  document.getElementById('i18n-stat-total').textContent = t.stat_total;
  document.getElementById('i18n-stat-avg-score').textContent = t.stat_avg_score;
  document.getElementById('i18n-stat-avg-cost').textContent = t.stat_avg_cost;
  document.getElementById('i18n-stat-avg-ratio').textContent = t.stat_avg_ratio;
  document.getElementById('i18n-top-meta').textContent = t.top_meta;

  document.getElementById('i18n-label-neighborhood').firstChild.textContent = t.label_neighborhood;
  document.getElementById('i18n-label-sort').firstChild.textContent = t.label_sort;
  document.getElementById('i18n-opt-neighborhood-all').textContent = t.opt_all_hoods;

  // Interest Filter Labels
  const labelInt = document.getElementById('i18n-label-interest');
  if (labelInt) labelInt.textContent = t.label_interest;
  const optIntAll = document.querySelector('#interest option[value=""]');
  if (optIntAll) optIntAll.textContent = t.opt_interest_all;
  const optInterested = document.querySelector('#interest option[value="interested"]');
  if (optInterested) optInterested.textContent = t.opt_interested;
  const optIgnored = document.querySelector('#interest option[value="ignored"]');
  if (optIgnored) optIgnored.textContent = t.opt_ignored;

  const sortMap = { score: 'sort_score', cost: 'sort_cost', commute: 'sort_commute', newest: 'sort_newest', price: 'sort_price_asc', price_desc: 'sort_price_desc', size: 'sort_size' };
  Object.keys(sortMap).forEach(val => {
    const opt = document.querySelector(`#sort option[value="${val}"]`);
    if (opt) opt.textContent = t[sortMap[val]];
  });

  const toggles = { minPark: 'park', minUtil: 'util', minFee: 'fee', minPay: 'pay', minVerified: 'verified', minOven: 'oven' };
  const toggleLabels = { minPark: 'parking', minUtil: 'utilities', minFee: 'fees', minPay: 'payment', minVerified: 'verified_label', minOven: 'oven_label' };
  const toggleOptions = { minPark: 'has_parking', minUtil: 'inc_util', minFee: 'no_fee', minPay: 'flex_pay', minVerified: 'is_verified', minOven: 'has_oven' };

  Object.keys(toggles).forEach(key => {
    const group = document.querySelector(`.toggle-pills[data-filter="${key}"]`);
    if (group) {
      document.getElementById(`i18n-label-${toggles[key]}`).textContent = t[toggleLabels[key]];
      group.querySelector('button[data-value="0"]').textContent = t.unlimited;
      group.querySelector('button[data-value="1"]').textContent = t[toggleOptions[key]];
    }
  });

  document.getElementById('i18n-label-min-score').firstChild.textContent = t.label_min_score;
  document.getElementById('i18n-label-val').firstChild.textContent = t.value_score;
  document.getElementById('i18n-label-size').firstChild.textContent = t.size_score;
  document.getElementById('i18n-hint-val').textContent = t.hint_val;
  document.getElementById('i18n-hint-size').textContent = t.hint_size;
  document.getElementById('i18n-label-commute').firstChild.textContent = t.label_commute;
  document.getElementById('i18n-hint-commute').textContent = t.hint_commute;
  const filterToggle = document.getElementById('i18n-filter-toggle');
  if (filterToggle) filterToggle.textContent = t.filter_toggle;
}

// ─── API ─────────────────────────────────

function getActiveFilterValue(filterName) {
  const pill = document.querySelector(`.toggle-pills[data-filter="${filterName}"] .pill.active`);
  return pill ? pill.dataset.value : '0';
}

async function loadResults(append = false) {
  if (isLoading && !append) {
    if (fetchController) fetchController.abort();
  }
  
  if (isLoading && append) return; // Prevent multiple pagination calls
  
  isLoading = true;
  fetchController = new AbortController();

  const container = document.getElementById('listings');
  const loadingEl = document.getElementById('scroll-loading');

  if (!append) container.innerHTML = `<div class="loading">${TRANSLATIONS[currentLang].loading}</div>`;
  if (loadingEl) loadingEl.classList.add('visible');

  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 20,
      sort: document.getElementById('sort').value,
      neighborhood: document.getElementById('neighborhood').value,
      interest: document.getElementById('interest').value,
      minScore: document.getElementById('minScore').value,
      minVal: document.getElementById('minVal').value,
      minSize: document.getElementById('minSize').value,
      minPark: getActiveFilterValue('minPark'),
      minUtil: getActiveFilterValue('minUtil'),
      minFee: getActiveFilterValue('minFee'),
      minPay: getActiveFilterValue('minPay'),
      minVerified: getActiveFilterValue('minVerified'),
      minOven: getActiveFilterValue('minOven'),
      maxCommute: document.getElementById('maxCommute').value,
    });

    const res = await fetch(`${API}/api/targeted-results?${params}`, {
      signal: fetchController.signal
    });
    const data = await res.json();

    document.getElementById('stat-total').textContent = data.total.toLocaleString();
    document.getElementById('stat-avg-score').textContent = data.stats.medianScore;
    const medCost = currentLang === 'zh' ? Math.round((data.stats.medianCost || 0) * exchangeRate) : (data.stats.medianCost || 0);
    document.getElementById('stat-avg-cost').textContent = medCost.toLocaleString();
    document.getElementById('stat-avg-ratio').textContent = `${data.stats.medianBurden || 0}%`;

    // Display lastUpdated timestamp in Dubai time
    const updatedEl = document.getElementById('stat-updated');
    if (updatedEl && data.stats.lastUpdated) {
      const d = new Date(data.stats.lastUpdated);
      const opts = { timeZone: 'Asia/Dubai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
      const t = TRANSLATIONS[currentLang];
      if (currentLang === 'zh') {
        const fmt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Dubai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        const parts = fmt.formatToParts(d);
        const mo = parts.find(p => p.type === 'month')?.value;
        const da = parts.find(p => p.type === 'day')?.value;
        const hr = parts.find(p => p.type === 'hour')?.value;
        const mi = parts.find(p => p.type === 'minute')?.value;
        updatedEl.textContent = `${mo}月${da}日 ${hr}:${mi} ${t.updated_label}`;
      } else {
        const fmt = new Intl.DateTimeFormat('en-US', opts);
        const parts = fmt.formatToParts(d);
        const mo = parts.find(p => p.type === 'month')?.value;
        const da = parts.find(p => p.type === 'day')?.value;
        const hr = parts.find(p => p.type === 'hour')?.value;
        const mi = parts.find(p => p.type === 'minute')?.value;
        updatedEl.textContent = `${t.updated_label} ${mo} ${da}, ${hr}:${mi}`;
      }
    }

    populateNeighborhoods(data.neighborhoods);

    if (!data.docs.length && !append) {
      container.innerHTML = `<div class="empty-state"><h3>${TRANSLATIONS[currentLang].no_results}</h3><p>${TRANSLATIONS[currentLang].run_script}</p></div>`;
      hasMore = false;
      return;
    }

    const cardsHtml = data.docs.map(renderCard).join('');
    if (append) container.insertAdjacentHTML('beforeend', cardsHtml);
    else container.innerHTML = cardsHtml;

    observeNewListings();

    hasMore = currentPage < data.totalPages;
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (!append) container.innerHTML = `<div class="empty-state"><h3>${TRANSLATIONS[currentLang].conn_error}</h3></div>`;
    hasMore = false;
  } finally {
    isLoading = false;
    if (loadingEl) loadingEl.classList.remove('visible');
    fetchController = null;
  }
}

async function interact(listingId, status, cardEl = null) {
  if (!isAuthenticated) return;
  const card = cardEl || document.querySelector(`[data-id="${listingId}"]`);
  if (!card) return;

  // Toggle: if already in this state, clear it
  const isActive = (status === 'interested' && card.classList.contains('is-interested'))
                || (status === 'ignored' && card.classList.contains('is-ignored'));
  const newStatus = isActive ? null : status;

  try {
    const res = await fetch(`${API}/api/targeted-results/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ listing_id: listingId, status: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      // Clear both states, then set new one
      card.classList.remove('is-interested', 'is-ignored');
      if (newStatus === 'interested') card.classList.add('is-interested');
      else if (newStatus === 'ignored') card.classList.add('is-ignored');
      // Update button active states
      card.querySelectorAll('.act-btn').forEach(btn => btn.classList.remove('active'));
      if (newStatus === 'interested') card.querySelector('.act-btn.star')?.classList.add('active');
      else if (newStatus === 'ignored') card.querySelector('.act-btn.hide')?.classList.add('active');
    }
  } catch (err) {
    console.error('Interaction failed', err);
  }
}

let neighborhoodsFilled = false;
function populateNeighborhoods(hoods) {
  if (neighborhoodsFilled || !hoods?.length) return;
  neighborhoodsFilled = true;
  const sel = document.getElementById('neighborhood');
  const fragment = document.createDocumentFragment();
  for (const h of hoods) {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = h;
    fragment.appendChild(opt);
  }
  sel.appendChild(fragment);
}

// ─── Render ──────────────────────────────

function renderCard(doc) {
  const t = TRANSLATIONS[currentLang];
  const cx = currentLang === 'zh' ? exchangeRate : 1;
  const displayPrice = Math.round((doc.price || 0) * cx).toLocaleString();
  const beds = (doc.bedrooms === '0' || doc.bedrooms === 'studio') ? t.beds_0 : `${doc.bedrooms} ${t.beds_n}`;
  const sizeStr = doc.size_sqm ? `${doc.size_sqm} ㎡` : '';
  const scoreTier = doc.score >= 60 ? 'high' : doc.score >= 35 ? 'mid' : 'low';
  const sb = doc.score_breakdown || {};
  const title = currentLang === 'zh' ? (doc.title_zh || doc.title) : doc.title;
  const neighborhood = currentLang === 'zh' ? (doc.neighborhood_zh || doc.neighborhood_matched) : doc.neighborhood_matched;
  const location = currentLang === 'zh' ? '' : doc.location;
  const dateStr = doc.crawled_at ? new Date(doc.crawled_at).toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' }) : '';
  const isNew = doc.first_seen_at &&
    (Date.now() - new Date(doc.first_seen_at).getTime()) < 72 * 3600000;
  const commuteStr = doc.commute_min ? `~${doc.commute_min} ${t.commute_unit} / ${doc.commute_km}km` : '';
  const burdenPct = doc.burden_index || 0;
  const ratioTier = burdenPct <= 25 ? 'low' : burdenPct <= 35 ? 'mid' : 'high';

  const savingsRows = [];
  if (doc.monthly_parking_saving) savingsRows.push({ label: t.cost_parking_saving, val: Math.round(doc.monthly_parking_saving * cx) });
  if (doc.monthly_utility_saving) savingsRows.push({ label: doc.has_chiller_free ? t.cost_chiller_saving : t.cost_utility_saving, val: Math.round(doc.monthly_utility_saving * cx) });
  if (doc.monthly_commission_saving) savingsRows.push({ label: t.cost_commission_saving, val: Math.round(doc.monthly_commission_saving * cx) });

  const perks = [];
  if (sb.verified > 0) perks.push(t.is_verified);
  if (sb.payment > 0) perks.push(t.flex_pay);
  if (doc.has_oven) perks.push(t.has_oven);

  const adminActions = isAuthenticated ? `
    <div class="admin-actions">
      <button class="act-btn star${doc.interest === 'interested' ? ' active' : ''}" aria-label="${t.btn_star_hint}">${t.btn_star}</button>
      <button class="act-btn hide${doc.interest === 'ignored' ? ' active' : ''}" aria-label="${t.btn_hide_hint}">${t.btn_hide}</button>
    </div>
  ` : '';

  const statusClass = doc.interest === 'interested' ? 'is-interested' : doc.interest === 'ignored' ? 'is-ignored' : '';

  return `
    <div class="listing-card ${statusClass}${isNew ? ' is-new' : ''}" data-id="${doc.listing_id}">
      <div class="listing-header">
        <div class="listing-title">
          <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>
        </div>
        <div class="header-right">
          <div class="score-badge score-${scoreTier}">
            <span class="score-label">${t.match_label}</span>
            <span class="score-val">${doc.score}%</span>
          </div>
          ${adminActions}
        </div>
      </div>
      <div class="listing-price"><span class="currency">${t.currency}</span> <span class="price-num">${displayPrice}</span> <span class="period">${t.per_year}</span></div>
      <div class="cost-breakdown">
        <div class="cost-row"><span class="cost-label">${t.cost_rent}</span><span class="cost-val">${Math.round(doc.monthly_rent * cx).toLocaleString()}</span></div>
        <div class="cost-row"><span class="cost-label">${t.cost_time}</span><span class="cost-val">+${Math.round(doc.monthly_time_cost * cx).toLocaleString()}</span></div>
        <div class="cost-row"><span class="cost-label">${t.cost_fuel}</span><span class="cost-val">+${Math.round(doc.monthly_fuel_cost * cx).toLocaleString()}</span></div>
        ${savingsRows.map(s => `<div class="cost-row cost-saving"><span class="cost-label">${s.label}</span><span class="cost-val">−${s.val.toLocaleString()}</span></div>`).join('')}
        <div class="cost-row cost-total"><span class="cost-label">${t.cost_total}</span><span class="cost-val">${Math.round(doc.effective_monthly_cost * cx).toLocaleString()} <span class="cost-ratio ratio-${ratioTier}">${burdenPct}% ${t.cost_salary}</span></span></div>
      </div>
      <div class="listing-meta"><span>${beds}</span>${sizeStr ? `<span>${sizeStr}</span>` : ''}<span class="location-main">${escapeHtml(neighborhood)}</span>${location ? `<span class="location-sub">${escapeHtml(location)}</span>` : ''}${commuteStr ? `<span class="commute-tag">${commuteStr}</span>` : ''}<span class="date">${dateStr}</span></div>
      ${perks.length ? `<div class="perks">${perks.map(p => `<span class="perk">${p}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function injectAdminButtons() {
  const t = TRANSLATIONS[currentLang];
  document.querySelectorAll('.listing-card').forEach(card => {
    if (card.querySelector('.admin-actions')) return;
    const headerRight = card.querySelector('.header-right');
    if (!headerRight) return;
    const interest = card.classList.contains('is-interested') ? 'interested'
                   : card.classList.contains('is-ignored') ? 'ignored' : null;
    headerRight.insertAdjacentHTML('beforeend', `
      <div class="admin-actions">
        <button class="act-btn star${interest === 'interested' ? ' active' : ''}">${t.btn_star}</button>
        <button class="act-btn hide${interest === 'ignored' ? ' active' : ''}">${t.btn_hide}</button>
      </div>
    `);
  });
}

function removeAdminButtons() {
  document.querySelectorAll('.admin-actions').forEach(el => el.remove());
}

function observeNewListings() {
  const cards = document.querySelectorAll('.listing-card.is-new:not(.in-view)');
  if (!cards.length) return;
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); }
    }
  }, { threshold: 0.3 });
  cards.forEach(c => obs.observe(c));
}

function resetAndLoad() { currentPage = 1; hasMore = true; loadResults(false); }
function setupInfiniteScroll() {
  const sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && hasMore) { currentPage++; loadResults(true); }
  }, { rootMargin: '200px' });
  observer.observe(sentinel);
}
window.interact = interact;
window.loginWebAuthn = loginWebAuthn;
window.registerWebAuthn = registerWebAuthn;
window.logout = logout;
