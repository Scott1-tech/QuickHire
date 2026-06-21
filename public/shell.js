/* ============================================================
   FleetView Shell — Sidebar, state management, shared utilities
   ============================================================ */

// ── Mock data (TODO: connect to API) ────────────────────────
const MOCK_CARRIERS = [
  { id: 'c1', name: 'GRAND ONE LLC', dot: '1234567', mc: 'MC-123456', authority: 'active', driverCount: 12, candidateCount: 3 },
  { id: 'c2', name: 'TAYLOR TRANSPORTATION', dot: '2345678', mc: 'MC-234567', authority: 'active', driverCount: 8, candidateCount: 1 },
  { id: 'c3', name: 'SKY EXPRESS LLC', dot: '3456789', mc: 'MC-345678', authority: 'active', driverCount: 5, candidateCount: 2 },
];

const MOCK_DRIVERS = [
  { id: 'd1', carrierId: 'c1', name: 'JAMES WILSON', score: 94, license: 'TX12345678', state: 'TX', status: 'active', type: 'company', vehicle: 'Peterbilt 389', hireDate: '2023-01-15', isNew: false },
  { id: 'd2', carrierId: 'c1', name: 'MARIA GARCIA', score: 87, license: 'TX87654321', state: 'TX', status: 'active', type: 'owner-operator', vehicle: 'Kenworth T680', hireDate: '2023-06-20', isNew: true },
  { id: 'd3', carrierId: 'c2', name: 'CARLOS MENDEZ', score: 91, license: 'FL44332211', state: 'FL', status: 'active', type: 'company', vehicle: 'Freightliner Cascadia', hireDate: '2022-11-01', isNew: false },
  { id: 'd4', carrierId: 'c3', name: 'ANGELA WHITE', score: 78, license: 'GA99887766', state: 'GA', status: 'inactive', type: 'company', vehicle: 'Volvo VNL', hireDate: '2021-03-10', isNew: false },
];

const MOCK_CANDIDATES = [
  { id: 'p1', carrierId: 'c1', name: 'ROBERT JOHNSON', stage: 'Screening', email: 'rj@example.com', phone: '555-0101', stageEnteredAt: new Date(Date.now() - 3*86400000 - 22*3600000) },
  { id: 'p2', carrierId: 'c1', name: 'LINDA MARTINEZ', stage: 'Lead', email: 'lm@example.com', phone: '555-0102', stageEnteredAt: new Date(Date.now() - 6*86400000 - 23*3600000) },
  { id: 'p3', carrierId: 'c1', name: 'DEREK HILL', stage: 'Background Check', email: 'dh@example.com', phone: '555-0103', stageEnteredAt: new Date(Date.now() - 1*86400000 - 4*3600000) },
  { id: 'p4', carrierId: 'c1', name: 'SARAH CHEN', stage: 'Offer', email: 'sc@example.com', phone: '555-0104', stageEnteredAt: new Date(Date.now() - 2*86400000) },
  { id: 'p5', carrierId: 'c1', name: 'MIKE OKAFOR', stage: 'Onboarding', email: 'mo@example.com', phone: '555-0105', stageEnteredAt: new Date(Date.now() - 4*3600000) },
  { id: 'p6', carrierId: 'c2', name: 'TRACY BOWMAN', stage: 'Lead', email: 'tb@example.com', phone: '555-0106', stageEnteredAt: new Date(Date.now() - 8*86400000) },
];

// ── Shared state ─────────────────────────────────────────────
const Shell = {
  get currentCarrierId() { return localStorage.getItem('fv_carrierId') || MOCK_CARRIERS[0].id; },
  set currentCarrierId(v) { localStorage.setItem('fv_carrierId', v); },

  get role() { return localStorage.getItem('fv_role') || 'Admin'; },
  set role(v) { localStorage.setItem('fv_role', v); },

  get theme() { return localStorage.getItem('fv_theme') || 'light'; },
  set theme(v) { localStorage.setItem('fv_theme', v); },

  get sidebarCollapsed() { return localStorage.getItem('fv_sidebar') === '1'; },
  set sidebarCollapsed(v) { localStorage.setItem('fv_sidebar', v ? '1' : '0'); },

  currentCarrier() { return MOCK_CARRIERS.find(c => c.id === this.currentCarrierId) || MOCK_CARRIERS[0]; },
  carriers() { return MOCK_CARRIERS; },
  drivers(carrierId) { return MOCK_DRIVERS.filter(d => d.carrierId === (carrierId || this.currentCarrierId)); },
  candidates(carrierId) { return MOCK_CANDIDATES.filter(c => c.carrierId === (carrierId || this.currentCarrierId)); },
};

// Apply theme on load
(function() {
  if (Shell.theme === 'dark') document.documentElement.classList.add('dark');
})();

// ── Utility helpers ──────────────────────────────────────────
function timeAgo(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeSince(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d) / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function stagePillClass(stage) {
  const map = {
    'Lead': 'pill-lead',
    'Screening': 'pill-screening',
    'Background Check': 'pill-background',
    'Offer': 'pill-offer',
    'Onboarding': 'pill-onboarding',
    'Complete': 'pill-complete',
    'active': 'pill-active',
    'inactive': 'pill-inactive',
    'terminated': 'pill-terminated',
    'missing': 'pill-missing',
    'pending': 'pill-pending',
    'valid': 'pill-valid',
  };
  return map[stage] || 'pill-lead';
}

function stagePill(stage) {
  return `<span class="pill ${stagePillClass(stage)}">${stage}</span>`;
}

// ── Nav config ───────────────────────────────────────────────
function getNavItems(role) {
  const isRecruiter = role === 'Recruiter';
  const isOwnerOrAdmin = role === 'Owner' || role === 'Admin';

  return [
    { type: 'link', icon: '⊞', label: 'Dashboard', href: '/dashboard.html', key: 'dashboard' },
    { type: 'section', label: 'FEATURES' },
    { type: 'link', icon: '✉', label: 'Inbox', href: '/inbox.html', key: 'inbox', badge: '3', badgeClass: 'red' },
    { type: 'link', icon: '✓', label: 'Tasks', href: '#tasks', key: 'tasks', badge: '5' },
    ...(!isRecruiter ? [{ type: 'link', icon: '🔍', label: 'Research', href: '#research', key: 'research' }] : []),
    { type: 'section', label: 'MANAGE' },
    {
      type: 'expandable', icon: '🚚', label: 'Drivers', key: 'drivers',
      children: [
        { label: 'Active', href: '/drivers.html', key: 'drivers-active' },
        { label: 'Hiring', href: '/hiring.html', key: 'hiring' },
      ]
    },
    {
      type: 'expandable', icon: '📋', label: 'Compliance', key: 'compliance',
      children: [
        { label: 'Documents', href: '#docs', key: 'docs' },
        { label: 'Expirations', href: '#exp', key: 'exp' },
      ]
    },
    {
      type: 'expandable', icon: '⚙', label: 'Administration', key: 'admin-group',
      children: [
        ...( isOwnerOrAdmin ? [
          { label: 'Automations', href: '#automations', key: 'automations' },
          { label: 'Team', href: '#team', key: 'team' },
          { label: 'Activity Log', href: '#activity', key: 'activity' },
        ] : []),
        { label: 'Settings', href: '#settings', key: 'settings' },
      ]
    },
    { type: 'section', label: 'SUPER ADMIN', superAdminOnly: true },
    { type: 'link', icon: '🏢', label: 'All Carriers', href: '/carriers.html', key: 'carriers', superAdminOnly: true },
  ];
}

// ── Sidebar renderer ─────────────────────────────────────────
function renderSidebar(activePage) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;

  const role = Shell.role;
  const carrier = Shell.currentCarrier();
  const collapsed = Shell.sidebarCollapsed;
  const navItems = getNavItems(role);
  const isSuperAdmin = role === 'Owner' || role === 'Admin';

  const roleIcons = { Admin: '🛡', Owner: '👑', Recruiter: '📞' };

  // Detect which expandable groups should start open
  const openGroups = new Set();
  if (['drivers-active', 'hiring'].includes(activePage)) openGroups.add('drivers');
  if (['docs', 'exp'].includes(activePage)) openGroups.add('compliance');
  if (['automations', 'team', 'activity', 'settings'].includes(activePage)) openGroups.add('admin-group');

  const carriersHtml = MOCK_CARRIERS.map(c => `
    <div class="carrier-option ${c.id === Shell.currentCarrierId ? 'active' : ''}" data-carrier-id="${c.id}">
      <span style="font-size:8px;color:${c.id === Shell.currentCarrierId ? '#22C55E' : '#64748B'}">●</span>
      <span class="carrier-option-name">${c.name}</span>
      <span class="carrier-option-dot ml-auto">DOT ${c.dot}</span>
    </div>
  `).join('');

  let navHtml = '';
  for (const item of navItems) {
    if (item.superAdminOnly && !isSuperAdmin) continue;

    if (item.type === 'section') {
      navHtml += `<div class="sidebar-section-label">${item.label}</div>`;
    } else if (item.type === 'link') {
      const isActive = activePage === item.key;
      const badgeHtml = item.badge ? `<span class="sidebar-badge ${item.badgeClass || ''}">${item.badge}</span>` : '';
      navHtml += `
        <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}" data-page="${item.key}">
          <span class="nav-icon">${item.icon}</span>
          <span class="sidebar-label">${item.label}</span>
          ${badgeHtml}
        </a>`;
    } else if (item.type === 'expandable') {
      const isOpen = openGroups.has(item.key) || item.children.some(c => c.key === activePage);
      const childrenHtml = item.children.map(child => {
        const isChildActive = activePage === child.key;
        return `<a href="${child.href}" class="sub-nav-item ${isChildActive ? 'active' : ''}" data-page="${child.key}">${child.label}</a>`;
      }).join('');
      navHtml += `
        <div class="nav-item ${isOpen ? 'expanded' : ''}" data-expand="${item.key}">
          <span class="nav-icon">${item.icon}</span>
          <span class="sidebar-label">${item.label}</span>
          <span class="sidebar-chevron">›</span>
        </div>
        <div class="sidebar-sub ${isOpen ? 'open' : ''}" id="sub-${item.key}">${childrenHtml}</div>`;
    }
  }

  const myCarriersSection = isSuperAdmin ? `
    <div class="sidebar-section-label">MY CARRIERS</div>
    ${MOCK_CARRIERS.map(c => `
      <div class="nav-item carrier-switch-item ${c.id === Shell.currentCarrierId ? 'active' : ''}" data-carrier-switch="${c.id}" style="font-size:12px;">
        <span class="nav-icon" style="font-size:12px;">●</span>
        <span class="sidebar-label" style="font-size:12px;">${c.name}</span>
      </div>
    `).join('')}
  ` : '';

  root.innerHTML = `
  <div id="mobile-overlay"></div>
  <div id="sidebar" class="${collapsed ? 'collapsed' : ''}">
    <div class="sidebar-scroll">
      <!-- User area -->
      <div class="sidebar-user" id="user-toggle">
        <div class="user-avatar">${role[0]}</div>
        <div class="user-info">
          <div class="user-name">Fleet Admin</div>
          <div class="user-role">${roleIcons[role] || ''} ${role}</div>
        </div>
        <span class="sidebar-chevron">›</span>
      </div>
      <div id="role-dropdown" class="role-dropdown hidden">
        ${['Admin', 'Owner', 'Recruiter'].map(r => `
          <div class="role-option ${Shell.role === r ? 'active' : ''}" data-role="${r}">
            <span>${roleIcons[r]}</span> ${r}
          </div>
        `).join('')}
      </div>

      <!-- Carrier badge -->
      <div class="carrier-badge" id="carrier-badge-toggle">
        <span class="carrier-dot"></span>
        <span class="carrier-badge-text">
          <div class="carrier-name">${carrier.name}</div>
          <div class="carrier-sub">DOT ${carrier.dot} · ${carrier.mc}</div>
        </span>
        <span class="carrier-chevron">▾</span>
      </div>
      <div id="carrier-dropdown" class="carrier-dropdown hidden" style="position:relative;top:0;left:0;right:0;margin:0 8px 6px;">
        ${carriersHtml}
        <div class="carrier-option" style="border-top:1px solid rgba(255,255,255,0.08);margin-top:4px;padding-top:12px;">
          <span>＋</span> <a href="/carriers.html" style="color:inherit;text-decoration:none;">Manage Carriers</a>
        </div>
      </div>

      <div class="sidebar-divider"></div>

      <!-- Nav -->
      ${navHtml}

      <!-- My Carriers -->
      ${myCarriersSection}

      <div style="height:12px"></div>
    </div>

    <!-- Footer -->
    <div class="sidebar-footer">
      <button class="footer-btn" id="search-btn" title="Search (Ctrl+K)">
        <span>⌕</span>
      </button>
      <button class="footer-btn" id="notif-btn" title="Notifications">
        <span>🔔</span>
        <span class="notif-badge">3</span>
      </button>
      <button class="footer-btn" id="theme-btn" title="Toggle theme">
        <span id="theme-icon">${Shell.theme === 'dark' ? '☀' : '🌙'}</span>
      </button>
      <button class="footer-btn" id="collapse-btn" title="Collapse sidebar">
        <span id="collapse-icon">${collapsed ? '›' : '‹'}</span>
      </button>
    </div>
  </div>
  `;

  // ── Event listeners ──────────────────────────────────────
  // Role toggle
  document.getElementById('user-toggle').addEventListener('click', () => {
    document.getElementById('role-dropdown').classList.toggle('hidden');
    document.getElementById('carrier-dropdown').classList.add('hidden');
  });
  document.querySelectorAll('.role-option').forEach(el => {
    el.addEventListener('click', () => {
      Shell.role = el.dataset.role;
      renderSidebar(activePage);
      if (window.onShellRoleChange) window.onShellRoleChange(Shell.role);
    });
  });

  // Carrier badge toggle
  document.getElementById('carrier-badge-toggle').addEventListener('click', () => {
    document.getElementById('carrier-dropdown').classList.toggle('hidden');
    document.getElementById('role-dropdown').classList.add('hidden');
  });
  document.querySelectorAll('.carrier-option[data-carrier-id]').forEach(el => {
    el.addEventListener('click', () => {
      Shell.currentCarrierId = el.dataset.carrierId;
      renderSidebar(activePage);
      if (window.onShellCarrierChange) window.onShellCarrierChange(Shell.currentCarrierId);
    });
  });

  // Carrier switcher in nav section
  document.querySelectorAll('.carrier-switch-item[data-carrier-switch]').forEach(el => {
    el.addEventListener('click', () => {
      Shell.currentCarrierId = el.dataset.carrierSwitch;
      renderSidebar(activePage);
      if (window.onShellCarrierChange) window.onShellCarrierChange(Shell.currentCarrierId);
    });
  });

  // Expandable groups
  document.querySelectorAll('[data-expand]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.expand;
      const sub = document.getElementById(`sub-${key}`);
      const isOpen = sub.classList.contains('open');
      sub.classList.toggle('open', !isOpen);
      el.classList.toggle('expanded', !isOpen);
    });
  });

  // Theme toggle
  document.getElementById('theme-btn').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    Shell.theme = isDark ? 'dark' : 'light';
    document.getElementById('theme-icon').textContent = isDark ? '☀' : '🌙';
  });

  // Collapse toggle
  document.getElementById('collapse-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const collapsed = sidebar.classList.toggle('collapsed');
    Shell.sidebarCollapsed = collapsed;
    document.getElementById('collapse-icon').textContent = collapsed ? '›' : '‹';
  });

  // Search button
  document.getElementById('search-btn').addEventListener('click', openSearchModal);

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-toggle') && !e.target.closest('#role-dropdown')) {
      document.getElementById('role-dropdown')?.classList.add('hidden');
    }
    if (!e.target.closest('#carrier-badge-toggle') && !e.target.closest('#carrier-dropdown')) {
      document.getElementById('carrier-dropdown')?.classList.add('hidden');
    }
  }, true);

  // Mobile overlay
  const mobileOverlay = document.getElementById('mobile-overlay');
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', closeMobileSidebar);
  }

  // Hamburger (injected by page)
  const ham = document.getElementById('hamburger');
  if (ham) ham.addEventListener('click', openMobileSidebar);
}

function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('mobile-open');
  document.getElementById('mobile-overlay')?.classList.add('visible');
}
function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('mobile-overlay')?.classList.remove('visible');
}

// ── Search modal ─────────────────────────────────────────────
function openSearchModal() {
  let modal = document.getElementById('global-search-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-search-modal';
    modal.innerHTML = `
      <div class="modal-overlay" style="align-items:flex-start;padding-top:80px;" id="search-modal-overlay">
        <div class="modal-box" style="padding:0;overflow:hidden;max-width:560px;">
          <div id="search-input-box">
            <span style="font-size:18px;color:var(--text-muted)">⌕</span>
            <input type="text" placeholder="Search drivers, carriers, candidates…" id="global-search-input" autocomplete="off"/>
            <kbd style="font-size:11px;color:var(--text-muted);background:var(--bg);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">ESC</kbd>
          </div>
          <div id="search-results" style="padding:8px;max-height:320px;overflow-y:auto;">
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
              Start typing to search…
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('search-modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeSearchModal();
    });

    document.getElementById('global-search-input').addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      const results = document.getElementById('search-results');
      if (!q) {
        results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Start typing to search…</div>';
        return;
      }
      const hits = [
        ...MOCK_DRIVERS.filter(d => d.name.toLowerCase().includes(q)).map(d => ({ type: 'Driver', name: d.name, sub: d.license, href: '/drivers.html' })),
        ...MOCK_CANDIDATES.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).map(c => ({ type: 'Candidate', name: c.name, sub: c.email, href: '/hiring.html' })),
        ...MOCK_CARRIERS.filter(c => c.name.toLowerCase().includes(q)).map(c => ({ type: 'Carrier', name: c.name, sub: `DOT ${c.dot}`, href: '/carriers.html' })),
      ].slice(0, 8);
      if (!hits.length) {
        results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">No results found.</div>';
        return;
      }
      results.innerHTML = hits.map(h => `
        <a href="${h.href}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;text-decoration:none;transition:background 0.12s;" class="search-result-item">
          <span style="font-size:11px;font-weight:700;color:var(--primary);background:var(--primary-light);padding:2px 7px;border-radius:99px;">${h.type}</span>
          <span style="font-size:13.5px;font-weight:600;color:var(--text-primary);">${h.name}</span>
          <span style="font-size:12px;color:var(--text-muted);margin-left:auto;">${h.sub}</span>
        </a>`).join('');
      results.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = 'var(--surface-hover)');
        el.addEventListener('mouseleave', () => el.style.background = '');
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSearchModal();
    });
  }
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('global-search-input')?.focus(), 50);
}

function closeSearchModal() {
  document.getElementById('global-search-modal')?.classList.add('hidden');
}

// Ctrl+K shortcut
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearchModal();
  }
});

// ── Page header helper ────────────────────────────────────────
function renderPageHeader(breadcrumbs, actions = '') {
  const bc = breadcrumbs.map((b, i) => {
    if (i === breadcrumbs.length - 1) return `<span class="current">${b.label}</span>`;
    return `<a href="${b.href || '#'}">${b.label}</a><span class="sep">›</span>`;
  }).join('');

  const carrier = Shell.currentCarrier();

  return `
    <div class="page-header">
      <button id="hamburger" onclick="openMobileSidebar()">☰</button>
      <nav class="breadcrumb">${bc}</nav>
      <div style="flex:1"></div>
      <div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
        <span style="width:7px;height:7px;border-radius:50%;background:#22C55E;display:inline-block;"></span>
        ${carrier.name}
      </div>
      ${actions}
    </div>`;
}

// ── Init ─────────────────────────────────────────────────────
function initShell(activePage) {
  renderSidebar(activePage);
}
