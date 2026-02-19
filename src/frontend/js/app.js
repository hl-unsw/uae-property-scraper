const API = '';

// ─── State ───────────────────────────────────────
let currentPage = 1;
let currentFilters = {};

const SOURCE_LABELS = { pf: 'PropertyFinder', bayut: 'Bayut', dubizzle: 'Dubizzle' };

// ─── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadBedroomChart();
  loadListings();

  document.getElementById('filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    currentPage = 1;
    currentFilters = getFilters();
    loadStats();
    loadBedroomChart();
    loadListings();
  });
});

// ─── API Calls ───────────────────────────────────

function getSourceParam() {
  const source = document.getElementById('source').value;
  return source || 'all';
}

async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats?source=${getSourceParam()}`);
    const data = await res.json();

    document.getElementById('stat-total').textContent =
      data.totalListings.toLocaleString();
    document.getElementById('stat-avg-price').textContent =
      data.avgPrice.toLocaleString();
    document.getElementById('stat-price-range').textContent =
      `${data.minPrice.toLocaleString()} - ${data.maxPrice.toLocaleString()}`;
    document.getElementById('stat-avg-size').textContent =
      data.avgSize.toLocaleString();
    document.getElementById('stat-last-crawled').textContent =
      data.lastCrawled
        ? new Date(data.lastCrawled).toLocaleString('zh-CN')
        : '从未更新';

    // Advanced Stats
    document.getElementById('stat-median-price').textContent =
      (data.medianPrice || 0).toLocaleString();
    document.getElementById('stat-sqft-price').textContent =
      (data.medianPricePerSqm || 0).toLocaleString();
    document.getElementById('stat-iqr').textContent =
      `${(data.priceP25 || 0).toLocaleString()} - ${(data.priceP75 || 0).toLocaleString()}`;
    document.getElementById('stat-dom').textContent =
      (data.medianDaysOnMarket || 0).toLocaleString();

  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

async function loadBedroomChart() {
  try {
    const res = await fetch(`${API}/api/bedrooms?source=${getSourceParam()}`);
    const data = await res.json();

    const container = document.getElementById('bedroom-chart');
    if (!data.length) {
      container.innerHTML = '<p class="empty-state">暂无数据</p>';
      return;
    }

    const maxCount = Math.max(...data.map((d) => d.count));
    const labels = {
      '0': '开间', '1': '1室', '2': '2室', '3': '3室',
      '4': '4室', '5': '5室', '6': '6室', '7': '7室+',
    };

    container.innerHTML = data
      .map((d) => {
        const pct = (d.count / maxCount) * 100;
        const label = labels[d._id] || `${d._id}室`;
        return `
          <div class="bar-item">
            <span class="bar-value">${d.count}</span>
            <div class="bar" style="height: ${pct}%"></div>
            <span class="bar-label">${label}</span>
          </div>
        `;
      })
      .join('');
  } catch {
    console.error('Failed to load bedroom chart');
  }
}

async function loadListings() {
  const container = document.getElementById('listings');
  container.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 20,
      source: getSourceParam(),
      ...currentFilters,
    });

    const res = await fetch(`${API}/api/listings?${params}`);
    const data = await res.json();

    document.getElementById('results-count').textContent =
      `${data.total.toLocaleString()} 条结果`;

    if (!data.docs.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>未找到房源</h3>
          <p>请尝试调整筛选条件或运行爬虫更新数据。</p>
        </div>
      `;
      renderPagination(0, 0);
      return;
    }

    container.innerHTML = data.docs.map(renderCard).join('');
    renderPagination(data.page, data.totalPages);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>连接错误</h3>
        <p>请确保 API 服务器和 MongoDB 正在运行。</p>
      </div>
    `;
  }
}

// ─── Render Helpers ──────────────────────────────

function renderCard(doc) {
  const priceStr = (doc.price || 0).toLocaleString();
  const beds = (doc.bedrooms === '0' || doc.bedrooms === 'studio') ? '开间' : `${doc.bedrooms}室`;
  const sizeStr = doc.size ? `${doc.size} ㎡` : '';
  const furnStr = doc.furnished === 'YES' ? '精装'
    : doc.furnished === 'NO' ? '毛坯'
    : doc.furnished === 'PARTLY' ? '简装'
    : doc.furnished === 'furnished' ? '精装'
    : doc.furnished === 'unfurnished' ? '毛坯'
    : doc.furnished === 'semi-furnished' ? '简装'
    : '';
  const sourceLabel = SOURCE_LABELS[doc.source] || doc.source;
  const badgeClass = `source-badge source-${doc.source}`;
  const crawledAt = doc.crawled_at
    ? new Date(doc.crawled_at).toLocaleDateString('zh-CN')
    : '';

  return `
    <div class="listing-card">
      <div class="listing-header">
        <div class="listing-title">
          <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${escapeHtml(doc.title)}</a>
        </div>
        <span class="${badgeClass}">${escapeHtml(sourceLabel)}</span>
      </div>
      <div class="listing-price">
        AED ${priceStr} <span class="period">/ 年</span>
      </div>
      <div class="listing-meta">
        <span>${beds}</span>
        ${sizeStr ? `<span>${sizeStr}</span>` : ''}
        ${furnStr ? `<span>${furnStr}</span>` : ''}
      </div>
      <div class="listing-location">${escapeHtml(doc.location)}</div>
      <div class="listing-footer">
        <span class="${badgeClass}">${escapeHtml(sourceLabel)}</span>
        <span>更新于 ${crawledAt}</span>
      </div>
    </div>
  `;
}

function renderPagination(page, totalPages) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  html += `<button ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">上一页</button>`;

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">下一页</button>`;

  container.innerHTML = html;
}

// ─── Utilities ───────────────────────────────────

function getFilters() {
  const f = {};
  const search = document.getElementById('search').value.trim();
  const bedrooms = document.getElementById('bedrooms').value;
  const minPrice = document.getElementById('minPrice').value;
  const maxPrice = document.getElementById('maxPrice').value;
  const furnished = document.getElementById('furnished').value;

  if (search) f.search = search;
  if (bedrooms) f.bedrooms = bedrooms;
  if (minPrice) f.minPrice = minPrice;
  if (maxPrice) f.maxPrice = maxPrice;
  if (furnished) f.furnished = furnished;

  return f;
}

function goToPage(page) {
  currentPage = page;
  loadListings();
  window.scrollTo({ top: document.querySelector('.results').offsetTop - 20, behavior: 'smooth' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
