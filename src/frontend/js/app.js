const API = '';

// ─── State ───────────────────────────────────────
let currentPage = 1;
let currentFilters = {};

// ─── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadBedroomChart();
  loadListings();

  document.getElementById('filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    currentPage = 1;
    currentFilters = getFilters();
    loadListings();
  });
});

// ─── API Calls ───────────────────────────────────

async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
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
        ? new Date(data.lastCrawled).toLocaleString()
        : 'Never';
  } catch {
    console.error('Failed to load stats');
  }
}

async function loadBedroomChart() {
  try {
    const res = await fetch(`${API}/api/bedrooms`);
    const data = await res.json();

    const container = document.getElementById('bedroom-chart');
    if (!data.length) {
      container.innerHTML = '<p class="empty-state">No data yet</p>';
      return;
    }

    const maxCount = Math.max(...data.map((d) => d.count));
    const labels = {
      '0': 'Studio', '1': '1 Bed', '2': '2 Beds', '3': '3 Beds',
      '4': '4 Beds', '5': '5 Beds', '6': '6 Beds', '7': '7+',
    };

    container.innerHTML = data
      .map((d) => {
        const pct = (d.count / maxCount) * 100;
        const label = labels[d._id] || `${d._id} Bed`;
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
  container.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 20,
      ...currentFilters,
    });

    const res = await fetch(`${API}/api/listings?${params}`);
    const data = await res.json();

    document.getElementById('results-count').textContent =
      `${data.total.toLocaleString()} results`;

    if (!data.docs.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No listings found</h3>
          <p>Try adjusting your filters or run the scraper first.</p>
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
        <h3>Connection error</h3>
        <p>Make sure the API server and MongoDB are running.</p>
      </div>
    `;
  }
}

// ─── Render Helpers ──────────────────────────────

function renderCard(doc) {
  const p = doc.property || {};
  const price = p.price || {};
  const loc = p.location || {};
  const agent = p.agent || {};
  const amenities = (p.amenity_names || []).slice(0, 5);

  const priceStr = (price.value || 0).toLocaleString();
  const period = price.period || 'yearly';
  const beds = p.bedrooms === '0' ? 'Studio' : `${p.bedrooms} Bed`;
  const baths = `${p.bathrooms || '-'} Bath`;
  const size = p.size ? `${p.size.value} sqft` : '';
  const furnished = p.furnished === 'YES' ? 'Furnished' : p.furnished === 'PARTLY' ? 'Partly Furn.' : '';
  const url = p.share_url || '#';
  const listed = p.listed_date
    ? new Date(p.listed_date).toLocaleDateString()
    : '';

  return `
    <div class="listing-card">
      <div class="listing-title">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(p.title || 'Untitled')}</a>
      </div>
      <div class="listing-price">
        AED ${priceStr} <span class="period">/ ${period}</span>
      </div>
      <div class="listing-meta">
        <span>${beds}</span>
        <span>${baths}</span>
        ${size ? `<span>${size}</span>` : ''}
        ${furnished ? `<span>${furnished}</span>` : ''}
      </div>
      <div class="listing-location">${escapeHtml(loc.full_name || '')}</div>
      ${amenities.length ? `
        <div class="listing-amenities">
          ${amenities.map((a) => `<span class="amenity-tag">${escapeHtml(a)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="listing-footer">
        <span class="listing-agent">${escapeHtml(agent.name || '')}</span>
        <span>${listed}</span>
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

  html += `<button ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">Prev</button>`;

  // Show up to 5 page buttons centered on current page
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">Next</button>`;

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
