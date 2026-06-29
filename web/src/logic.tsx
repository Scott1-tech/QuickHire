import React from 'react';
import {
  CARRIERS, CARRIER_LIST, TASKS, DRIVERS_TBL, TRUCKS_TBL, CANDS, STAGES, STAGE_TITLES,
  STAGE_DOT, THREADS, TEMPLATES, PACKAGES, AGREEMENTS, COMP_ROWS, INTEGRATIONS,
  SETTINGS_NAV, AVATAR_COLORS, ICONS,
} from './data';

/**
 * Base class holding all QuickHire state, mock data, helpers and the renderVals()
 * view-model builder — a faithful port of the design-code component. The concrete
 * QuickHire component subclasses this and supplies render().
 */
export class QuickHireLogic extends React.Component<any, any> {
  CARRIERS = CARRIERS;
  CARRIER_LIST = CARRIER_LIST;
  TASKS = TASKS;
  DRIVERS_TBL = DRIVERS_TBL;
  TRUCKS_TBL = TRUCKS_TBL;
  CANDS = CANDS;
  STAGES = STAGES;
  STAGE_TITLES = STAGE_TITLES;
  STAGE_DOT = STAGE_DOT;
  THREADS = THREADS;
  TEMPLATES = TEMPLATES;
  PACKAGES = PACKAGES;
  AGREEMENTS = AGREEMENTS;
  COMP_ROWS = COMP_ROWS;
  INTEGRATIONS = INTEGRATIONS;
  SETTINGS_NAV = SETTINGS_NAV;
  AVATAR_COLORS = AVATAR_COLORS;
  ICONS = ICONS;

  _key?: (e: KeyboardEvent) => void;
  _drag?: string | null;

  state: any = {
    page: 'dashboard',
    theme: null,
    collapsed: false,
    candidateId: 'p1',
    profileTab: 'overview',
    dsTab: 'home',
    builderOpen: false,
    missingSheetOpen: false,
    paletteOpen: false,
    paletteQuery: '',
    pipelineFilter: 'all',
    compFilter: 'all',
    compSelected: {},
    settingsSection: 'integrations',
    threadId: 'm1',
    composerText: '',
    channel: 'email',
    activeTool: null,
    placedFields: [
      { id: 'pf1', label: 'Driver Name', kind: 'autofill', top: 196, left: 60, w: 150, color: 'green', required: true, editable: false, locked: false },
      { id: 'pf2', label: 'Signature', kind: 'signature', top: 470, left: 60, w: 170, color: 'red', required: true, editable: true, locked: false },
    ],
    selectedFieldId: null,
    toasts: [],
    carrierIdx: 0,
    integ: { docusign: true, ringcentral: true, gmail: false, fmcsa: true, tenstreet: false, drive: true, onedrive: false, slack: false },
    settingsToggles: { twofa: true, sso: false, audit: true, notify: true },
    taskDrawerOpen: false, taskFilter: 'mine', taskDetailId: null, taskDone: {},
    driverView: 'drivers', carrierProfileId: null, carrierTab: 'overview', dotLookup: '', dotSheetOpen: false,
  };

  // ---------- icons ----------
  ic(name: string, size?: number) {
    return React.createElement('svg', { width: size || 18, height: size || 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', dangerouslySetInnerHTML: { __html: this.ICONS[name] } });
  }

  // ---------- helpers ----------
  effTheme() { return this.state.theme || this.props.sidebarTheme || 'light'; }
  cand() { return this.CANDS.find((c: any) => c.id === this.state.candidateId) || this.CANDS[0]; }
  thread() { return this.THREADS.find((t: any) => t.id === this.state.threadId) || this.THREADS[0]; }
  avatarColor(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return this.AVATAR_COLORS[h % this.AVATAR_COLORS.length]; }
  initials(name: string) { return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase(); }
  riskColor(r: string) { return r === 'Low' ? '#34C759' : r === 'Medium' ? '#FF9F0A' : '#FF3B30'; }
  scoreColor(s: number) { return s >= 85 ? '#248A3D' : s >= 70 ? '#A05A00' : '#C62820'; }

  chip(kind: string): any {
    const map: Record<string, string[]> = {
      Complete: ['rgba(52,199,89,0.12)', '#248A3D', '#34C759'],
      complete: ['rgba(52,199,89,0.12)', '#248A3D', '#34C759'],
      Pending: ['rgba(255,159,10,0.14)', '#A05A00', '#FF9F0A'],
      pending: ['rgba(255,159,10,0.14)', '#A05A00', '#FF9F0A'],
      Missing: ['rgba(255,59,48,0.12)', '#C62820', '#FF3B30'],
      missing: ['rgba(255,59,48,0.12)', '#C62820', '#FF3B30'],
      'In Progress': ['rgba(0,122,255,0.12)', '#0066CC', '#007AFF'],
      Neutral: ['#F2F2F7', '#6E6E73', '#8E8E93'],
    };
    const m = map[kind] || map.Neutral;
    return { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', background: m[0], color: m[1], whiteSpace: 'nowrap' }, dot: m[2] };
  }
  stageChip(stage: string): any {
    const k = stage === 'Hired' ? 'Complete' : stage === 'Offer' || stage === 'Onboarding' ? 'In Progress' : stage === 'Lead' ? 'Neutral' : 'Pending';
    const c = this.chip(k);
    return { style: c.style, dot: this.STAGE_DOT[stage] || c.dot };
  }
  channelChip(ch: string): any {
    const blue = ch === 'Email';
    return { display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em', padding: '1px 6px', borderRadius: '5px', background: blue ? 'rgba(0,122,255,0.12)' : 'rgba(52,199,89,0.12)', color: blue ? '#0066CC' : '#248A3D', flex: 'none' };
  }
  toggleStyle(on: boolean): any { return { width: '40px', height: '24px', flex: 'none', borderRadius: '999px', border: 'none', cursor: 'pointer', padding: '2px', background: on ? '#34C759' : '#E5E5EA', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .2s' }; }
  knobStyle(): any { return { width: '20px', height: '20px', borderRadius: '999px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'block' }; }
  prioColor(p: string) { return ({ urgent: '#FF3B30', high: '#FF9F0A', normal: '#007AFF', low: '#8E8E93', done: '#34C759' } as Record<string, string>)[p] || '#8E8E93'; }
  statusChipFor(status: string): any {
    const m: Record<string, string> = {
      Active: 'Complete', Compliant: 'Complete', Available: 'Complete', Connected: 'Complete',
      'On-trip': 'In Progress', 'In-Transit': 'In Progress', Assigned: 'In Progress', Review: 'In Progress',
      Home: 'Neutral', Unassigned: 'Pending', Shop: 'Pending', Expiring: 'Pending',
      Inactive: 'Neutral', Missing: 'Missing', Expired: 'Missing',
    };
    return this.chip(m[status] || 'Neutral');
  }
  makeDonut(segments: any[], size?: number, stroke?: number) {
    size = size || 130; stroke = stroke || 20;
    const r = (size - stroke) / 2, c = 2 * Math.PI * r; let off = 0;
    const track = React.createElement('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: '#F2F2F7', strokeWidth: stroke });
    const arcs = segments.map((s, i) => { const len = c * s.pct / 100; const el = React.createElement('circle', { key: i, cx: size! / 2, cy: size! / 2, r, fill: 'none', stroke: s.color, strokeWidth: stroke, strokeDasharray: len + ' ' + (c - len), strokeDashoffset: -off, strokeLinecap: 'butt' }); off += len; return el; });
    return React.createElement('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size }, React.createElement('g', { transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' }, track, ...arcs));
  }
  integrationsVM() {
    const S = this.state;
    return this.INTEGRATIONS.map((i: any) => { const on = S.integ[i.key]; return { ...i, statusDot: on ? '#34C759' : '#C7C7CC', statusText: on ? (i.sync || 'Connected') : 'Not connected',
      primaryLabel: on ? 'Disconnect' : 'Connect', primaryStyle: { flex: 1, height: '32px', fontSize: '12.5px', fontWeight: 600, borderRadius: '9px', cursor: 'pointer', border: on ? '1px solid rgba(0,0,0,0.12)' : 'none', background: on ? '#fff' : '#007AFF', color: on ? '#C62820' : '#fff' },
      onPrimary: () => { this.setState((s: any) => ({ integ: { ...s.integ, [i.key]: !s.integ[i.key] } })); this.toast(on ? 'Disconnected' : 'Connected', i.name, on ? 'warning' : 'success'); },
      onTest: () => this.toast('Connection OK', i.name + ' responding', 'success') }; });
  }
  taskDone(id: string) { this.setState((s: any) => ({ taskDone: { ...s.taskDone, [id]: true } })); this.toast('Task completed', '', 'success'); }

  // ---------- actions ----------
  go(page: string) { this.setState({ page, paletteOpen: false }); }
  toast(title: string, body?: string, type?: string) {
    const id = 'to' + Date.now() + Math.random();
    const conf = (({ success: ['rgba(52,199,89,0.16)', '#248A3D', 'check'], warning: ['rgba(255,159,10,0.18)', '#A05A00', 'alert'], danger: ['rgba(255,59,48,0.14)', '#C62820', 'alert'], info: ['rgba(0,122,255,0.14)', '#0066CC', 'check'] } as Record<string, string[]>)[type || 'success']);
    const t = { id, title, body: body || '', type: type || 'success', iconBg: conf[0], iconFg: conf[1], iconName: conf[2] };
    this.setState((s: any) => ({ toasts: [...s.toasts, t] }));
    setTimeout(() => this.setState((s: any) => ({ toasts: s.toasts.filter((x: any) => x.id !== id) })), 3600);
  }
  openCand(id: string) { this.setState({ candidateId: id, page: 'profile', profileTab: 'overview', paletteOpen: false }); }
  moveCand(id: string, stage: string) { const c = this.CANDS.find((x: any) => x.id === id); if (c && c.stage !== stage) { c.stage = stage; this.forceUpdate(); this.toast(c.name + ' moved to ' + this.STAGE_TITLES[stage], '', 'success'); } }

  componentDidMount() {
    this._key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.setState((s: any) => ({ paletteOpen: !s.paletteOpen, paletteQuery: '' })); }
      if (e.key === 'Escape') this.setState({ paletteOpen: false, missingSheetOpen: false });
    };
    window.addEventListener('keydown', this._key);
  }
  componentWillUnmount() { if (this._key) window.removeEventListener('keydown', this._key); }

  addField(label: string, kind: string, color: string) { this.addFieldAt(label, kind, color, 196 + (this.state.placedFields.length * 6), 320); }
  addFieldAt(label: string, kind: string, color: string, top: number, left: number) {
    const id = 'pf' + Date.now();
    this.setState((s: any) => ({ placedFields: [...s.placedFields, { id, label, kind, top, left, w: kind === 'checkbox' ? 28 : 150, color, required: kind === 'signature', editable: kind === 'text' || kind === 'autofill', locked: false }], selectedFieldId: id, activeTool: null }));
    this.toast('Field added', label, 'success');
  }
  updField(id: string, prop: string) { this.setState((s: any) => ({ placedFields: s.placedFields.map((f: any) => f.id === id ? { ...f, [prop]: !f[prop] } : f) })); }

  renderVals(): any {
    const S = this.state;
    const theme = this.effTheme();
    const dark = theme === 'dark';
    const expanded = !S.collapsed;

    const sidebarStyle: any = {
      width: expanded ? '256px' : '72px', flex: 'none', display: 'flex', flexDirection: 'column', height: '100vh',
      transition: 'width .22s ease',
      background: dark ? '#111827' : 'rgba(255,255,255,0.78)',
      backdropFilter: dark ? 'none' : 'blur(20px)', WebkitBackdropFilter: dark ? 'none' : 'blur(20px)',
      borderRight: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
    };
    const sidebarStrong = dark ? '#F5F5F7' : '#1D1D1F';
    const sidebarFaint = dark ? 'rgba(255,255,255,0.45)' : '#8E8E93';
    const sidebarBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

    const navDefs = [
      ['dashboard', 'Dashboard', 'dashboard'], ['pipeline', 'Hiring', 'hiring'], ['drivers', 'Drivers', 'drivers'],
      ['carriers', 'Carriers', 'carriers'], ['compliance', 'Compliance', 'compliance'], ['docusign', 'DocuSign', 'docusign'],
      ['messages', 'Messages', 'messages'], ['tasks', 'Tasks', 'tasks'], ['reports', 'Reports', 'reports'],
      ['integrations', 'Integrations', 'wand'], ['settings', 'Settings', 'settings'],
    ];
    const pageGroup = (S.page === 'profile') ? 'pipeline' : S.page;
    const badges: Record<string, string> = { compliance: '4', messages: '2', docusign: '5' };
    const nav = navDefs.map(([key, label, icon]) => {
      const active = pageGroup === key;
      const base: any = { position: 'relative', display: 'flex', alignItems: 'center', gap: '11px', height: '40px', padding: expanded ? '0 12px' : '0', justifyContent: expanded ? 'flex-start' : 'center', borderRadius: '10px', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'background .14s' };
      let bg, color;
      if (active) { bg = dark ? 'rgba(0,122,255,0.22)' : 'rgba(0,122,255,0.10)'; color = dark ? '#5AA9FF' : '#007AFF'; }
      else { bg = 'transparent'; color = dark ? 'rgba(255,255,255,0.72)' : '#3a3a3c'; }
      const badge = badges[key];
      return {
        key, label, icon: this.ic(icon, 19),
        onClick: () => this.go(key),
        style: { ...base, background: bg, color },
        indicator: active ? '#007AFF' : 'transparent',
        weight: active ? 650 : 500,
        showBadge: !!badge && expanded,
        badge,
        badgeStyle: { marginLeft: 'auto', fontSize: '10.5px', fontWeight: 700, minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '999px', background: active ? 'rgba(0,122,255,0.18)' : (dark ? 'rgba(255,255,255,0.12)' : '#F2F2F7'), color: active ? '#007AFF' : (dark ? 'rgba(255,255,255,0.7)' : '#6E6E73'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      };
    });

    const carrier = this.CARRIERS[S.carrierIdx];
    const carrierSwitchStyle: any = { display: 'flex', alignItems: 'center', gap: '9px', margin: '4px 12px 6px', padding: '8px 10px', borderRadius: '10px', cursor: 'pointer', width: 'calc(100% - 24px)', border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' };
    const themeBtnStyle: any = { width: '30px', height: '30px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: 'none', cursor: 'pointer', background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', color: dark ? '#F5F5F7' : '#6E6E73' };

    const isDashboard = S.page === 'dashboard';
    const isPipeline = S.page === 'pipeline';
    const isProfile = S.page === 'profile';
    const isDocusign = S.page === 'docusign';
    const isCompliance = S.page === 'compliance';
    const isMessages = S.page === 'messages';
    const isSettings = S.page === 'settings';
    const isDrivers = S.page === 'drivers';
    const isCarriers = S.page === 'carriers';
    const isReports = S.page === 'reports';
    const isIntegrations = S.page === 'integrations';
    const isTasks = S.page === 'tasks';
    const titles: Record<string, string> = { dashboard: 'Dashboard', pipeline: 'Hiring Pipeline', profile: 'Candidate Profile', drivers: 'Drivers', carriers: 'Carriers', compliance: 'Compliance', docusign: 'DocuSign', messages: 'Messages', tasks: 'Tasks', reports: 'Reports', settings: 'Settings' };

    const out: any = {
      expanded, sidebarStyle, sidebarStrong, sidebarFaint, sidebarBorder, nav, carrierSwitchStyle, themeBtnStyle,
      carrierName: carrier.name, carrierDot: carrier.dot, carrierBadge: carrier.badge,
      cycleCarrier: () => this.setState((s: any) => ({ carrierIdx: (s.carrierIdx + 1) % this.CARRIERS.length })),
      toggleTheme: () => this.setState({ theme: dark ? 'light' : 'dark' }),
      toggleCollapse: () => this.setState((s: any) => ({ collapsed: !s.collapsed })),
      pageTitle: titles[S.page] || 'QuickHire',
      isDashboard, isPipeline, isProfile, isDocusign, isCompliance, isMessages, isSettings,
      isDrivers, isCarriers, isReports, isIntegrations, isTasks,
      icChevDown: this.ic('chevD', 15), icChevRight: this.ic('chevR', 15), icCollapse: this.ic('collapse', 18),
      icTaskTop: this.ic('list', 18), icRefresh: this.ic('refresh', 15), icCarrier: this.ic('carriers', 18), icCarrierLg: this.ic('carriers', 26), icBolt: this.ic('bolt', 11),
      openTasks: () => this.setState({ taskDrawerOpen: true }),
      taskCount: this.TASKS.filter((t: any) => t.group === 'today' && !S.taskDone[t.id]).length,
      icSearch: this.ic('search', 17), icPlus: this.ic('plus', 17), icBell: this.ic('bell', 18), icTheme: this.ic(dark ? 'dashboard' : 'settings', 16),
      icAlert: this.ic('alert', 18), icDoc: this.ic('docusign', 18), icBack: this.ic('back', 15), icSpark: this.ic('spark', 14),
      icSend: this.ic('send', 18), icDocSm: this.ic('fileText', 17), icPlusSm: this.ic('plus', 14), icAlertSm: this.ic('alert', 12),
      icAlertSm2: this.ic('alert', 16), icAlertSm3: this.ic('alert', 14), icAlertSm4: this.ic('alert', 15), icCheckSm: this.ic('check', 16),
      icCheckTiny: this.ic('check', 14), icBellSm: this.ic('bell', 16), icEye: this.ic('eye', 16), icXsm: this.ic('x', 17), icXtiny: this.ic('x', 14),
      icCheckTiny2: this.ic('check', 13),
      primaryCreate: () => this.toast('New record', 'Choose a type to create', 'info'),
      notify: () => this.toast('All caught up', 'No new notifications', 'info'),
      openPalette: () => this.setState({ paletteOpen: true, paletteQuery: '' }),
      goDashboard: () => this.go('dashboard'), goPipeline: () => this.go('pipeline'), goMessages: () => this.go('messages'),
      toasts: S.toasts.map((t: any) => ({ ...t, icon: this.ic(t.iconName, 14), hasBody: !!t.body, onClose: () => this.setState((s: any) => ({ toasts: s.toasts.filter((x: any) => x.id !== t.id) })) })),
    };

    if (isDashboard) {
      const hr = new Date().getHours();
      out.greeting = hr < 12 ? 'Good morning.' : hr < 18 ? 'Good afternoon.' : 'Good evening.';
      out.metrics = [
        { value: '7', label: 'Need Review', trend: '+2 today', icon: this.ic('eye', 18), iconBg: 'rgba(0,122,255,0.12)', iconFg: '#007AFF', page: 'pipeline' },
        { value: '4', label: 'Expiring Documents', trend: '2 this week', icon: this.ic('clock', 18), iconBg: 'rgba(255,159,10,0.14)', iconFg: '#FF9F0A', page: 'compliance' },
        { value: '5', label: 'Signatures Waiting', trend: '3 overdue', icon: this.ic('docusign', 18), iconBg: 'rgba(88,86,214,0.12)', iconFg: '#5856D6', page: 'docusign' },
        { value: '2', label: 'Carriers Incomplete', trend: 'Action needed', icon: this.ic('carriers', 18), iconBg: 'rgba(0,122,255,0.08)', iconFg: '#007AFF', page: 'carriers' },
      ].map((m: any) => ({ ...m, trendStyle: { fontSize: '11.5px', fontWeight: 600, color: '#8E8E93' }, onClick: () => this.go(m.page) }));
      out.priorities = [
        { title: 'Robert Johnson — verify CDL', sub: 'Screening · GRAND ONE LLC', age: '2h', action: 'Review', dot: '#FF9F0A', id: 'p1' },
        { title: 'Sarah Chen — review drug test results', sub: 'Offer · GRAND ONE LLC', age: '3h', action: 'Open', dot: '#FF3B30', id: 'p4' },
        { title: 'Derek Hill — PSP report ready', sub: 'Background Check · GRAND ONE LLC', age: '5h', action: 'View', dot: '#007AFF', id: 'p3' },
        { title: 'Mike Okafor — assign truck', sub: 'Onboarding · GRAND ONE LLC', age: '1d', action: 'Assign', dot: '#34C759', id: 'p5' },
        { title: 'Tracy Bowman — stale 8 days', sub: 'Lead · DT NATIONAL', age: '8d', action: 'Contact', dot: '#8E8E93', id: 'p6' },
      ].map((p: any) => ({ ...p, onClick: () => this.openCand(p.id) }));
      out.complianceAlerts = [
        { name: 'Robert Johnson', doc: 'Medical Card missing', chip: 'Missing', id: 'p1' },
        { name: 'Carlos Mendez', doc: 'CDL expires in 12 days', chip: 'Pending', id: 'p3' },
        { name: 'Kevin Brooks', doc: 'Medical Card missing', chip: 'Missing', id: 'p7' },
      ].map((a: any) => { const c = this.chip(a.chip); return { ...a, chipStyle: c.style, chipDot: c.dot, onClick: () => this.go('compliance') }; });
      out.docusignWaiting = [
        { doc: 'Offer Letter', who: 'Sarah Chen', age: '2h' },
        { doc: 'Company Driver Agreement', who: 'Mike Okafor', age: '5h' },
        { doc: 'Clearinghouse Consent', who: 'Aisha Bello', age: '2d' },
      ].map((d: any) => ({ ...d, onClick: () => this.toast('Reminder sent', d.who + ' · ' + d.doc, 'success') }));
      out.recentApps = this.CANDS.slice(0, 4).map((c: any) => { const ch = this.stageChip(c.stage); return { name: c.name, carrier: c.carrier, stage: c.stage, initials: this.initials(c.name), avatarBg: this.avatarColor(c.name), chipStyle: { ...ch.style }, onClick: () => this.openCand(c.id) }; });
      out.messagesReply = this.THREADS.slice(0, 3).map((t: any) => ({ name: t.name, channel: t.channel, preview: t.preview, age: t.age, initials: this.initials(t.name), avatarBg: this.avatarColor(t.name), chanStyle: this.channelChip(t.channel), onClick: () => this.setState({ page: 'messages', threadId: t.id }) }));
    }

    if (isPipeline) {
      const filt = S.pipelineFilter;
      const matches = (c: any) => {
        if (filt === 'mine') return c.owner === 'NP';
        if (filt === 'review') return c.missing || c.risk === 'High';
        if (filt === 'missing') return !!c.missing;
        if (filt === 'stale') return parseInt(c.time) >= 6 && c.time.includes('d');
        if (filt === 'ready') return c.stage === 'Onboarding' || c.stage === 'Hired';
        return true;
      };
      out.pipelineFilters = [
        ['all', 'All', this.CANDS.length], ['mine', 'Assigned to Me', this.CANDS.filter((c: any) => c.owner === 'NP').length],
        ['review', 'Needs Review', this.CANDS.filter((c: any) => c.missing || c.risk === 'High').length], ['missing', 'Missing Docs', this.CANDS.filter((c: any) => c.missing).length],
        ['stale', 'Stale', 2], ['ready', 'Ready for Onboarding', this.CANDS.filter((c: any) => c.stage === 'Onboarding' || c.stage === 'Hired').length],
      ].map(([key, label, count]: any) => ({ key, label, count, hasCount: true, onClick: () => this.setState({ pipelineFilter: key }), style: { height: '32px', padding: '0 13px', fontSize: '12.5px', fontWeight: 600, borderRadius: '999px', cursor: 'pointer', border: filt === key ? '1px solid #007AFF' : '1px solid rgba(0,0,0,0.10)', background: filt === key ? 'rgba(0,122,255,0.08)' : '#fff', color: filt === key ? '#007AFF' : '#3a3a3c', display: 'inline-flex', alignItems: 'center' } }));
      out.columns = this.STAGES.map((stage: string) => {
        const cards = this.CANDS.filter((c: any) => c.stage === stage && matches(c)).map((c: any) => ({
          id: c.id, name: c.name, risk: c.risk, stageTime: c.time, score: c.score, next: 'Next: ' + c.next, owner: c.owner,
          hasMissing: !!c.missing, missing: c.missing, ownerColor: this.avatarColor(c.ownerName), scoreColor: this.scoreColor(c.score),
          riskStyle: { fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px', background: this.riskColor(c.risk) + '22', color: this.riskColor(c.risk) === '#34C759' ? '#248A3D' : this.riskColor(c.risk) === '#FF9F0A' ? '#A05A00' : '#C62820', whiteSpace: 'nowrap' },
          onClick: () => this.openCand(c.id), onDragStart: (e: any) => { this._drag = c.id; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; },
        }));
        return { key: stage, title: this.STAGE_TITLES[stage], count: cards.length, dot: this.STAGE_DOT[stage], cards,
          onDragOver: (e: any) => e.preventDefault(), onDrop: (e: any) => { e.preventDefault(); if (this._drag) { this.moveCand(this._drag, stage); this._drag = null; } },
          onAdd: () => this.toast('Add candidate', 'Opens invite form for ' + this.STAGE_TITLES[stage], 'info') };
      });
      out.inviteDriver = () => this.toast('Invite sent', 'Driver application link generated', 'success');
      out.importDrivers = () => this.toast('Import', 'Upload a CSV or connect Tenstreet', 'info');
      out.exportData = () => this.toast('Export started', 'Pipeline CSV is downloading', 'success');
    }

    if (isProfile) {
      const c = this.cand();
      const ch = this.stageChip(c.stage);
      const tabs = ['Overview', 'Application', 'Checklist', 'Documents', 'DocuSign', 'Messages', 'PEV', 'Activity'];
      const noMissing = !c.missing;
      out.cand = {
        name: c.name, initials: this.initials(c.name), avatarBg: this.avatarColor(c.name), stage: c.stage, recruiter: c.ownerName,
        chipStyle: ch.style, chipDot: ch.dot, score: c.score, scoreColor: this.scoreColor(c.score), risk: c.risk + ' Risk',
        riskStyle: { display: 'inline-flex', fontSize: '11.5px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: this.riskColor(c.risk) + '22', color: this.riskColor(c.risk) === '#34C759' ? '#248A3D' : this.riskColor(c.risk) === '#FF9F0A' ? '#A05A00' : '#C62820' },
        quickActions: [
          { label: 'Call', icon: this.ic('phone', 16), onClick: () => this.toast('Calling ' + c.name, c.phone, 'info') },
          { label: 'Text', icon: this.ic('chat', 16), onClick: () => this.setState({ page: 'messages' }) },
          { label: 'Email', icon: this.ic('mail', 16), onClick: () => this.toast('Compose email', c.email, 'info') },
          { label: 'Note', icon: this.ic('note', 16), onClick: () => this.toast('Note added', '', 'success') },
          { label: 'Task', icon: this.ic('task', 16), onClick: () => this.toast('Task created', 'Assigned to ' + c.ownerName, 'success') },
        ],
        about: [
          { label: 'Phone', value: c.phone }, { label: 'Email', value: c.email }, { label: 'CDL', value: c.cdl },
          { label: 'Carrier', value: c.carrier }, { label: 'Position', value: c.position },
        ],
        progress: [
          { label: 'Application', pct: c.score >= 90 ? 100 : c.score >= 80 ? 80 : 55, color: '#007AFF' },
          { label: 'Compliance', pct: noMissing ? 100 : 70, color: noMissing ? '#34C759' : '#FF9F0A' },
        ],
        missingItems: c.missing ? [{ name: c.missing, onClick: () => this.toast('Requested ' + c.missing, 'Upload link sent to ' + c.name, 'success') }] : [],
        noMissing,
        activity: [
          { text: 'Moved to ' + c.stage, time: c.time, dot: '#007AFF' },
          { text: 'Application progress updated', time: 'Yesterday', dot: '#34C759' },
          { text: 'Recruiter ' + c.ownerName + ' assigned', time: '3 days ago', dot: '#8E8E93' },
        ],
        nextAction: c.next, nextReason: 'Recommended based on stage and missing items.', nextCta: c.next,
        doNext: () => this.toast(c.next, 'Action queued for ' + c.name, 'success'),
        inspector: [
          { label: 'Risk Level', isChip: true, value: c.risk, chipStyle: { display: 'inline-flex', fontSize: '11.5px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', background: this.riskColor(c.risk) + '22', color: this.riskColor(c.risk) === '#34C759' ? '#248A3D' : this.riskColor(c.risk) === '#FF9F0A' ? '#A05A00' : '#C62820' } },
          { label: 'Assigned Truck', isText: true, value: c.stage === 'Onboarding' ? 'Unit 103' : '—' },
          { label: 'Recruiter', isText: true, value: c.ownerName },
          { label: 'DocuSign', isChip: true, value: c.stage === 'Offer' ? 'In Progress' : 'Not Sent', chipStyle: this.chip(c.stage === 'Offer' ? 'In Progress' : 'Neutral').style },
          { label: 'Latest Message', isText: true, value: '12m ago' },
        ],
        requestDocs: () => this.toast('Documents requested', 'Secure upload link sent to ' + c.name, 'success'),
        sendOffer: () => { this.setState({ page: 'docusign', dsTab: 'home' }); this.toast('Offer package', 'Opening DocuSign…', 'info'); },
        moveStage: () => { const i = this.STAGES.indexOf(c.stage); if (i < this.STAGES.length - 1) this.moveCand(c.id, this.STAGES[i + 1]); },
        archive: () => { this.setState({ page: 'pipeline' }); this.toast('Candidate archived', c.name + ' moved to archive', 'warning'); },
      };
      out.cand.tabs = tabs.map((t: string) => ({ label: t, onClick: () => this.setState({ profileTab: t.toLowerCase() }), style: { height: '44px', padding: '0 14px', fontSize: '13px', fontWeight: S.profileTab === t.toLowerCase() ? 650 : 500, color: S.profileTab === t.toLowerCase() ? '#1D1D1F' : '#8E8E93', background: 'transparent', border: 'none', borderBottom: S.profileTab === t.toLowerCase() ? '2px solid #007AFF' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' } }));
    }

    if (isDocusign) {
      const tabs = [['home', 'Home'], ['agreements', 'Agreements'], ['templates', 'Templates'], ['packages', 'Packages'], ['settings', 'Settings']];
      out.dsTabs = tabs.map(([k, l]: any) => ({ label: l, onClick: () => this.setState({ dsTab: k }), style: { height: '40px', padding: '0 16px', fontSize: '13.5px', fontWeight: S.dsTab === k ? 650 : 500, color: S.dsTab === k ? '#1D1D1F' : '#8E8E93', background: 'transparent', border: 'none', borderBottom: S.dsTab === k ? '2px solid #007AFF' : '2px solid transparent', cursor: 'pointer' } }));
      out.dsHome = S.dsTab === 'home'; out.dsAgreements = S.dsTab === 'agreements'; out.dsTemplates = S.dsTab === 'templates'; out.dsPackages = S.dsTab === 'packages';
      out.dsStats = [
        { value: '5', label: 'Action Required', color: '#C62820' }, { value: '8', label: 'Waiting for Others', color: '#A05A00' },
        { value: '34', label: 'Completed', color: '#248A3D' }, { value: '3', label: 'Expiring Soon', color: '#0066CC' },
      ];
      out.dsQuick = [
        { label: 'Start Envelope', icon: this.ic('plus', 18), bg: 'rgba(0,122,255,0.10)', fg: '#007AFF', onClick: () => this.setState({ builderOpen: true, activeTool: null }) },
        { label: 'Send Offer Package', icon: this.ic('send', 18), bg: 'rgba(0,122,255,0.12)', fg: '#007AFF', onClick: () => this.toast('Offer package sent', 'Sarah Chen · 4 documents', 'success') },
        { label: 'Upload PDF', icon: this.ic('upload', 18), bg: 'rgba(52,199,89,0.14)', fg: '#248A3D', onClick: () => this.toast('Upload PDF', 'Select a file to import', 'info') },
        { label: 'Use Template', icon: this.ic('fileText', 18), bg: 'rgba(88,86,214,0.12)', fg: '#5856D6', onClick: () => this.setState({ dsTab: 'templates' }) },
      ];
      out.agreements = this.AGREEMENTS.map((a: any) => { const c = this.chip(a.status); return { ...a, chipStyle: c.style, chipDot: c.dot, onRemind: () => this.toast('Reminder sent', a.candidate, 'success'), onView: () => this.toast('Opening ' + a.doc, '', 'info') }; });
      out.templates = this.TEMPLATES.map((t: any) => ({ ...t, chipStyle: { display: 'inline-flex', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', background: t.status === 'Live' ? 'rgba(52,199,89,0.12)' : '#F2F2F7', color: t.status === 'Live' ? '#248A3D' : '#6E6E73' }, onPreview: () => this.toast('Preview', t.name, 'info'), onEdit: () => this.setState({ builderOpen: true, activeTool: null }) }));
      out.packages = this.PACKAGES.map((p: any) => ({ name: p.name, count: p.docs.length, docs: p.docs.map((d: string) => ({ name: d })), onSend: () => this.toast('Package sent', p.name, 'success') }));
      out.openBuilder = () => this.setState({ builderOpen: true, activeTool: null });
    }

    if (isCompliance) {
      out.compStats = [
        { label: 'Health Score', value: '86%', color: '#248A3D' }, { label: 'Missing Documents', value: '6', color: '#C62820' },
        { label: 'Expiring Soon', value: '4', color: '#A05A00' }, { label: 'Rejected', value: '1', color: '#C62820' }, { label: 'Ready', value: '11', color: '#248A3D' },
      ];
      const cf = S.compFilter;
      out.compFilters = [['all', 'All'], ['missingcdl', 'Missing CDL'], ['missingmed', 'Missing Medical Card'], ['expcdl', 'Expired CDL'], ['exp30', 'Expiring in 30 Days'], ['approval', 'Needs Approval'], ['ready', 'Ready for Onboarding']].map(([k, l]: any) => ({ label: l, onClick: () => this.setState({ compFilter: k }), style: { height: '32px', padding: '0 13px', fontSize: '12.5px', fontWeight: 600, borderRadius: '999px', cursor: 'pointer', border: cf === k ? '1px solid #007AFF' : '1px solid rgba(0,0,0,0.10)', background: cf === k ? 'rgba(0,122,255,0.08)' : '#fff', color: cf === k ? '#007AFF' : '#3a3a3c' } }));
      let rows = this.COMP_ROWS;
      if (cf === 'missingmed') rows = rows.filter((r: any) => r.doc === 'Medical Card' && r.status === 'Missing');
      else if (cf === 'approval') rows = rows.filter((r: any) => r.action === 'Approve' || r.status === 'Pending');
      else if (cf === 'exp30') rows = rows.filter((r: any) => r.days !== '—' && r.days !== 'n/a' && parseInt(r.days) <= 46);
      out.compRows = rows.map((r: any) => { const c = this.chip(r.status); const sel = !!S.compSelected[r.id]; return { ...r, chipStyle: c.style, chipDot: c.dot, actionLabel: r.action,
        check: sel ? this.ic('check', 13) : null, checkBg: sel ? '#007AFF' : '#fff', checkBorder: sel ? '#007AFF' : 'rgba(0,0,0,0.22)',
        onToggle: () => this.setState((s: any) => ({ compSelected: { ...s.compSelected, [r.id]: !s.compSelected[r.id] } })),
        onAction: () => this.toast(r.action + ' · ' + r.driver, r.doc, r.action === 'Approve' ? 'success' : 'info') }; });
      const selCount = Object.values(S.compSelected).filter(Boolean).length;
      out.compHasSelection = selCount > 0; out.compSelCount = selCount;
      out.bulkRequest = () => { this.toast('Upload requested', selCount + ' drivers notified', 'success'); this.setState({ compSelected: {} }); };
      out.bulkApprove = () => { this.toast('Approved', selCount + ' documents approved', 'success'); this.setState({ compSelected: {} }); };
      out.clearSelection = () => this.setState({ compSelected: {} });
    }

    if (isMessages) {
      out.msgFilters = ['All', 'Email', 'SMS', 'Unread', 'Needs Reply'].map((l: string) => ({ label: l, onClick: () => {}, style: { height: '28px', padding: '0 11px', fontSize: '12px', fontWeight: 600, borderRadius: '999px', cursor: 'pointer', flex: 'none', border: l === 'All' ? '1px solid #007AFF' : '1px solid rgba(0,0,0,0.10)', background: l === 'All' ? 'rgba(0,122,255,0.08)' : '#fff', color: l === 'All' ? '#007AFF' : '#6E6E73' } }));
      out.threads = this.THREADS.map((t: any) => ({ id: t.id, name: t.name, channel: t.channel, preview: t.preview, age: t.age, unread: t.unread, initials: this.initials(t.name), avatarBg: this.avatarColor(t.name), chanStyle: this.channelChip(t.channel), onClick: () => this.setState({ threadId: t.id }), style: { display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderLeft: S.threadId === t.id ? '3px solid #007AFF' : '3px solid transparent', background: S.threadId === t.id ? 'rgba(0,122,255,0.05)' : 'transparent', cursor: 'pointer' } }));
      const th = this.thread(); const tc = this.CANDS.find((c: any) => c.id === th.candId) || this.CANDS[0]; const sc = this.stageChip(tc.stage);
      out.thread = {
        name: th.name, initials: this.initials(th.name), avatarBg: this.avatarColor(th.name), sub: tc.carrier + ' · ' + th.channel, stage: tc.stage,
        stageChip: { display: 'inline-flex', alignItems: 'center', fontSize: '11.5px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', ...sc.style },
        missing: tc.missing ? [{ name: tc.missing }] : [{ name: 'None outstanding' }],
        messages: th.messages.map((m: any) => ({ text: m.text, meta: m.meta,
          rowStyle: { display: 'flex', flexDirection: 'column', alignItems: m.from === 'me' ? 'flex-end' : 'flex-start' },
          bubbleStyle: { maxWidth: '78%', padding: '10px 14px', borderRadius: m.from === 'me' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: m.from === 'me' ? '#007AFF' : '#fff', color: m.from === 'me' ? '#fff' : '#1D1D1F', border: m.from === 'me' ? 'none' : '1px solid rgba(0,0,0,0.08)' },
          metaAlign: { textAlign: m.from === 'me' ? 'right' : 'left' } })),
      };
      out.composerText = S.composerText;
      out.onComposer = (e: any) => this.setState({ composerText: e.target.value });
      out.channels = [['email', 'Email'], ['sms', 'SMS'], ['note', 'Internal Note']].map(([k, l]: any) => ({ label: l, onClick: () => this.setState({ channel: k }), style: { height: '28px', padding: '0 12px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', cursor: 'pointer', border: 'none', background: S.channel === k ? '#1D1D1F' : 'rgba(0,0,0,0.05)', color: S.channel === k ? '#fff' : '#6E6E73' } }));
      out.sendMessage = () => { if (!S.composerText.trim()) { this.toast('Empty message', 'Type something first', 'warning'); return; } th.messages.push({ from: 'me', text: S.composerText, meta: 'You · now' }); this.setState({ composerText: '' }); this.toast('Message sent', th.name, 'success'); };
      out.pickTemplate = () => this.toast('Templates', 'Insert a saved reply', 'info');
      out.sendLink = () => this.toast('Link sent', 'Secure upload link to ' + th.name, 'success');
      out.reqDocsMsg = () => this.toast('Documents requested', th.name, 'success');
      out.scheduleCall = () => this.toast('Schedule call', 'Opening calendar…', 'info');
    }

    if (isSettings) {
      out.settingsNav = this.SETTINGS_NAV.map((l: string) => { const k = l.toLowerCase().replace(/[^a-z]/g, ''); const active = S.settingsSection === k; return { label: l, onClick: () => this.setState({ settingsSection: k }), style: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', marginBottom: '2px', fontSize: '13.5px', fontWeight: active ? 600 : 500, borderRadius: '8px', border: 'none', cursor: 'pointer', background: active ? 'rgba(0,122,255,0.10)' : 'transparent', color: active ? '#007AFF' : '#3a3a3c' } }; });
      const sec = S.settingsSection;
      out.setIntegrations = sec === 'integrations';
      out.setGeneric = sec !== 'integrations';
      out.integrations = this.integrationsVM();
      const titleMap: Record<string, string[]> = { company: ['Company', 'Your organization profile and branding.'], usersroles: ['Users & Roles', 'Manage team members and permissions.'], docusign: ['DocuSign', 'E-signature account and sending defaults.'], ringcentral: ['RingCentral', 'Voice and SMS configuration.'], email: ['Email', 'Inbound and outbound email settings.'], fmcsa: ['FMCSA', 'DOT/MC lookup and authority sync.'], security: ['Security', 'Authentication and access controls.'], dataexport: ['Data Export', 'Export your records and audit logs.'] };
      const tm = titleMap[sec] || ['Settings', ''];
      out.settingsTitle = tm[0]; out.settingsDesc = tm[1];
      out.settingsForm = [
        { label: 'Two-factor authentication', desc: 'Require 2FA for all team members', isToggle: true, k: 'twofa' },
        { label: 'Single sign-on (SSO)', desc: 'Allow SAML / Google Workspace login', isToggle: true, k: 'sso' },
        { label: 'Audit logging', desc: 'Record all record changes', isToggle: true, k: 'audit' },
        { label: 'Default carrier', desc: 'Applied to new candidates', isValue: true, value: 'GRAND ONE LLC' },
      ].map((f: any) => f.isToggle ? { ...f, onToggle: () => this.setState((s: any) => ({ settingsToggles: { ...s.settingsToggles, [f.k]: !s.settingsToggles[f.k] } })), toggleTrack: this.toggleStyle(S.settingsToggles[f.k]), toggleKnob: this.knobStyle() } : f);
      out.saveSettings = () => this.toast('Settings saved', '', 'success');
    }

    if (isDrivers) {
      const v = S.driverView;
      out.showDrivers = v === 'drivers'; out.showTrucks = v === 'trucks';
      out.driverSubtitle = v === 'drivers' ? '5 drivers · 4 active · 1 inactive' : '5 units · 2 assigned · 1 in shop';
      out.addDriverLabel = v === 'drivers' ? 'Add Driver' : 'Add Truck';
      out.addDriver = () => this.toast(v === 'drivers' ? 'Add driver' : 'Add truck', 'Opening form…', 'info');
      out.driverSeg = [['drivers', 'Drivers'], ['trucks', 'Trucks']].map(([k, l]: any) => ({ label: l, onClick: () => this.setState({ driverView: k }), style: { height: '30px', padding: '0 16px', fontSize: '13px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: v === k ? '#fff' : 'transparent', color: v === k ? '#1D1D1F' : '#6E6E73', boxShadow: v === k ? '0 1px 2px rgba(0,0,0,0.10)' : 'none' } }));
      out.driverRows = this.DRIVERS_TBL.map((d: any) => { const sc = this.statusChipFor(d.status); const cc = this.statusChipFor(d.comp); return { ...d, initials: this.initials(d.name), avatarBg: this.avatarColor(d.name), medColor: d.medOk ? '#6E6E73' : '#C62820', statusChip: sc.style, statusDot: sc.dot, compChip: cc.style, compDot: cc.dot, onView: () => this.toast(d.name, 'Opening driver profile…', 'info') }; });
      out.truckRows = this.TRUCKS_TBL.map((t: any) => { const sc = this.statusChipFor(t.status); return { ...t, statusChip: sc.style, statusDot: sc.dot, regColor: t.regOk ? '#6E6E73' : '#C62820', inspColor: t.inspOk ? '#6E6E73' : '#C62820', insColor: t.insOk ? '#6E6E73' : '#C62820', onView: () => this.toast('Unit #' + t.unit, 'Opening truck record…', 'info') }; });
    }

    if (isCarriers) {
      out.carrierList = !S.carrierProfileId;
      out.carrierProfile = !!S.carrierProfileId;
      out.dotLookup = S.dotLookup;
      out.onDotLookup = (e: any) => this.setState({ dotLookup: e.target.value });
      out.inviteCarrier = () => this.toast('Invite sent', 'Carrier onboarding link generated', 'success');
      out.lookupDot = () => { if (!S.dotLookup.trim()) { this.toast('Enter a DOT number', '', 'warning'); return; } this.setState({ dotSheetOpen: true }); };
      const authChip = (a: string) => { const k = a === 'active' ? 'Complete' : a === 'pending' ? 'Pending' : 'Missing'; const c = this.chip(k); return { style: c.style, dot: c.dot, label: a === 'active' ? 'Active' : a === 'pending' ? 'Pending' : 'Inactive' }; };
      out.carrierCards = this.CARRIER_LIST.map((c: any) => { const a = authChip(c.auth); return { name: c.name, dot: c.dot, mc: c.mc, auth: a.label, authChip: a.style, authDot: a.dot, complete: c.complete, completeColor: c.complete >= 75 ? '#34C759' : c.complete >= 55 ? '#FF9F0A' : '#FF3B30', onClick: () => this.setState({ carrierProfileId: c.id, carrierTab: 'overview' }) }; });
      if (S.carrierProfileId) {
        const c = this.CARRIER_LIST.find((x: any) => x.id === S.carrierProfileId) || this.CARRIER_LIST[0];
        const a = authChip(c.auth);
        out.backToCarriers = () => this.setState({ carrierProfileId: null });
        out.cpEdit = () => this.toast('Edit carrier', c.name, 'info');
        out.cpAddContact = () => this.toast('Add contact', c.name, 'info');
        const tabs = ['Overview', 'Requirements', 'Drivers', 'Candidates', 'Documents', 'Contacts', 'Activity'];
        out.carrierTabs = tabs.map((t: string) => ({ label: t, onClick: () => this.setState({ carrierTab: t.toLowerCase() }), style: { height: '40px', padding: '0 14px', fontSize: '13px', fontWeight: S.carrierTab === t.toLowerCase() ? 650 : 500, color: S.carrierTab === t.toLowerCase() ? '#1D1D1F' : '#8E8E93', background: 'transparent', border: 'none', borderBottom: S.carrierTab === t.toLowerCase() ? '2px solid #007AFF' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' } }));
        const reqChip = (s: string) => ({ display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', ...this.chip(s).style });
        out.cp = {
          name: c.name, dot: c.dot, mc: c.mc, auth: a.label, authChip: a.style, authDot: a.dot, complete: c.complete,
          details: [ { label: 'Legal Name', value: c.name }, { label: 'DBA', value: c.dba }, { label: 'DOT', value: c.dot }, { label: 'MC', value: c.mc }, { label: 'Address', value: c.address }, { label: 'Phone', value: c.phone } ],
          requirements: [
            { name: 'Operating Authority', status: 'Complete', chip: reqChip('Complete'), icon: this.ic('check', 16), color: '#248A3D' },
            { name: 'Insurance on File', status: 'Complete', chip: reqChip('Complete'), icon: this.ic('check', 16), color: '#248A3D' },
            { name: 'W-9 Tax Form', status: 'Complete', chip: reqChip('Complete'), icon: this.ic('check', 16), color: '#248A3D' },
            { name: 'Safety Rating', status: 'Pending', chip: reqChip('Pending'), icon: this.ic('clock', 16), color: '#A05A00' },
          ],
          contacts: [ { name: 'Dana Reed', role: 'Operations Manager', initials: 'DR', color: this.avatarColor('Dana Reed') }, { name: 'Omar Flores', role: 'Accounting', initials: 'OF', color: this.avatarColor('Omar Flores') } ],
        };
      }
    }

    if (isReports) {
      const fn: any[] = [['Lead', 48], ['Screening', 32], ['Background Check', 24], ['Offer', 18], ['Onboarding', 12], ['Hired', 8]];
      out.funnel = fn.map(([label, count]: any) => ({ label, count, pct: Math.round(count / 48 * 100), color: '#007AFF' }));
      out.tthBars = [70, 58, 82, 64, 48, 40].map((h, i) => ({ h, color: i === 5 ? '#34C759' : '#9EC5FF' }));
      out.recruiters = [['Nina Patel', 14], ['Dana Reed', 11], ['Sam Pike', 7]].map(([name, hires]: any) => ({ name, hires, pct: Math.round(hires / 14 * 100) }));
      out.sources = [ { label: 'Referral', pct: 40, color: '#007AFF' }, { label: 'Job Board', pct: 30, color: '#5856D6' }, { label: 'Direct', pct: 20, color: '#34C759' }, { label: 'Tenstreet', pct: 10, color: '#FF9F0A' } ];
      out.sourcesDonut = this.makeDonut(out.sources, 130, 20);
      out.complianceDonut = this.makeDonut([{ pct: 86, color: '#34C759' }], 130, 20);
    }

    if (isIntegrations) { out.integrations = this.integrationsVM(); }

    // ---- Task drawer ----
    out.taskDrawerOpen = S.taskDrawerOpen;
    out.taskTodayCount = this.TASKS.filter((t: any) => t.group === 'today' && !S.taskDone[t.id]).length;
    out.closeTasks = () => this.setState({ taskDrawerOpen: false });
    out.newTask = () => this.toast('New task', 'Create a follow-up', 'info');
    if (S.taskDrawerOpen) {
      const tf = S.taskFilter;
      out.taskSeg = [['mine', 'Mine'], ['team', 'Team'], ['overdue', 'Overdue'], ['waiting', 'Waiting']].map(([k, l]: any) => ({ label: l, onClick: () => this.setState({ taskFilter: k }), style: { flex: 1, height: '28px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', background: tf === k ? '#fff' : 'transparent', color: tf === k ? '#1D1D1F' : '#6E6E73', boxShadow: tf === k ? '0 1px 2px rgba(0,0,0,0.10)' : 'none' } }));
      const match = (t: any) => tf === 'mine' ? t.assignee === 'NP' : tf === 'team' ? true : tf === 'overdue' ? t.group === 'overdue' : t.group === 'waiting';
      const groupDefs = [['overdue', 'Overdue', '#C62820'], ['today', 'Today', '#0066CC'], ['tomorrow', 'Tomorrow', '#5856D6'], ['week', 'This Week', '#6E6E73'], ['waiting', 'Waiting', '#A05A00']];
      out.taskGroups = groupDefs.map(([gk, glabel, gcolor]: any) => {
        const tasks = this.TASKS.filter((t: any) => t.group === gk && match(t)).map((t: any) => { const done = !!S.taskDone[t.id]; return {
          id: t.id, title: t.title, related: t.related, due: t.due, assignee: t.assignee, isAuto: t.auto,
          prioDot: this.prioColor(done ? 'done' : t.prio), assigneeColor: this.avatarColor(t.assignee === 'NP' ? 'Nina Patel' : t.assignee === 'DR' ? 'Dana Reed' : 'Sam Pike'),
          dueColor: t.group === 'overdue' ? '#C62820' : '#8E8E93',
          titleStyle: done ? { textDecoration: 'line-through', color: '#8E8E93' } : {},
          check: done ? this.ic('check', 12) : null, checkBg: done ? '#34C759' : '#fff', checkBorder: done ? '#34C759' : 'rgba(0,0,0,0.22)',
          onComplete: (e: any) => { if (e && e.stopPropagation) e.stopPropagation(); this.taskDone(t.id); },
          onClick: () => this.setState({ taskDetailId: t.id }),
        }; });
        return { label: glabel, color: gcolor, count: tasks.length, tasks };
      }).filter((g: any) => g.tasks.length > 0);
    }

    // ---- Task detail ----
    out.taskDetailOpen = !!S.taskDetailId;
    if (S.taskDetailId) {
      const t = this.TASKS.find((x: any) => x.id === S.taskDetailId) || this.TASKS[0];
      const reqChip2 = (s: string) => ({ display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', ...this.chip(s).style });
      const prioLabel = t.prio.charAt(0).toUpperCase() + t.prio.slice(1);
      out.td = {
        title: t.title, prioDot: this.prioColor(t.prio), description: t.desc,
        meta: [
          { label: 'Status', isChip: true, value: S.taskDone[t.id] ? 'Complete' : 'In Progress', chip: reqChip2(S.taskDone[t.id] ? 'Complete' : 'In Progress') },
          { label: 'Priority', isChip: true, value: prioLabel, chip: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', background: this.prioColor(t.prio) + '22', color: this.prioColor(t.prio) === '#8E8E93' ? '#6E6E73' : this.prioColor(t.prio) } },
          { label: 'Due', isText: true, value: t.due },
          { label: 'Assignee', isText: true, value: t.assignee === 'NP' ? 'Nina Patel' : t.assignee === 'DR' ? 'Dana Reed' : 'Sam Pike' },
          { label: 'Related', isText: true, value: t.related },
          { label: 'Source', isText: true, value: t.auto ? 'Auto-generated' : 'Manual' },
        ],
        complete: () => { this.taskDone(t.id); this.setState({ taskDetailId: null }); },
        snooze: () => { this.setState({ taskDetailId: null }); this.toast('Snoozed', 'Reminder in 1 day', 'info'); },
        reassign: () => this.toast('Reassign', 'Pick a team member', 'info'),
        openCand: () => { if (t.cand) this.openCand(t.cand); this.setState({ taskDetailId: null, taskDrawerOpen: false }); },
        del: () => { this.setState({ taskDetailId: null }); this.toast('Task deleted', '', 'warning'); },
      };
    }
    out.closeTaskDetail = () => this.setState({ taskDetailId: null });

    // ---- FMCSA review sheet ----
    out.dotSheetOpen = S.dotSheetOpen;
    out.dotLookupShown = S.dotLookup || '1234567';
    out.dotResult = [
      { label: 'Legal Name', isText: true, value: 'MIDWEST FREIGHT LINES LLC' },
      { label: 'DBA', isText: true, value: 'Midwest Freight' },
      { label: 'DOT', isText: true, value: S.dotLookup || '1234567' },
      { label: 'MC', isText: true, value: 'MC-998812' },
      { label: 'Authority', isChip: true, value: 'Active', chip: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', ...this.chip('Complete').style } },
      { label: 'Address', isText: true, value: '410 Industrial Pkwy, Columbus, OH' },
      { label: 'Phone', isText: true, value: '(614) 555-0710' },
    ];
    out.closeDotSheet = () => this.setState({ dotSheetOpen: false });
    out.saveDot = () => { this.setState({ dotSheetOpen: false, dotLookup: '' }); this.toast('Carrier saved', 'MIDWEST FREIGHT LINES LLC added', 'success'); };

    // ---- Builder ----
    if (S.builderOpen) {
      const toolDefs = [['signature', 'Signature', 'sign'], ['initial', 'Initial', 'type'], ['date', 'Date', 'calendar'], ['text', 'Text', 'type'], ['checkbox', 'Checkbox', 'checkbox'], ['autofill', 'Auto-Fill', 'wand']];
      out.builderTools = toolDefs.map(([k, l, ic]: any) => ({ label: l, icon: this.ic(ic, 16), onClick: () => this.setState({ activeTool: k }), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '11px 4px', borderRadius: '10px', cursor: 'pointer', border: S.activeTool === k ? '1px solid #007AFF' : '1px solid rgba(0,0,0,0.08)', background: S.activeTool === k ? 'rgba(0,122,255,0.06)' : '#fff', color: S.activeTool === k ? '#007AFF' : '#3a3a3c' } }));
      const groups = [
        ['Driver Info', [['Driver Name', 'green'], ['CDL Number', 'green'], ['Phone', 'yellow']]],
        ['Carrier Info', [['Carrier Name', 'green'], ['DOT Number', 'green']]],
        ['Employment Info', [['Start Date', 'yellow'], ['Position', 'blue']]],
        ['Truck Info', [['Unit Number', 'gray'], ['VIN', 'gray']]],
      ];
      const colorMap: Record<string, string> = { green: '#34C759', yellow: '#FF9F0A', blue: '#007AFF', gray: '#8E8E93', red: '#FF3B30' };
      out.autofillGroups = groups.map(([name, fields]: any) => ({ name, fields: fields.map(([label, color]: any) => ({ label, dot: colorMap[color], onClick: () => this.addField(label, 'autofill', color) })) }));
      out.docCursor = S.activeTool ? 'crosshair' : 'default';
      out.builderHint = !!S.activeTool;
      out.activeToolLabel = S.activeTool || 'field';
      out.placeField = (e: any) => {
        if (!S.activeTool) return;
        const r = e.currentTarget.getBoundingClientRect();
        const top = e.clientY - r.top - 14, left = e.clientX - r.left - 60;
        const labels: Record<string, string> = { signature: 'Signature', initial: 'Initial', date: 'Date', text: 'Text', checkbox: '✓', autofill: 'Auto-Fill' };
        const colors: Record<string, string> = { signature: 'red', initial: 'blue', date: 'blue', text: 'blue', checkbox: 'gray', autofill: 'green' };
        this.addFieldAt(labels[S.activeTool], S.activeTool, colors[S.activeTool], top, left);
      };
      out.placedFields = S.placedFields.map((f: any) => {
        const colorMap2: Record<string, string[]> = { green: ['rgba(52,199,89,0.16)', '#248A3D', '#34C759'], yellow: ['rgba(255,159,10,0.18)', '#A05A00', '#FF9F0A'], blue: ['rgba(0,122,255,0.14)', '#0066CC', '#007AFF'], gray: ['rgba(142,142,147,0.16)', '#48484A', '#8E8E93'], red: ['rgba(255,59,48,0.14)', '#C62820', '#FF3B30'] };
        const cm = colorMap2[f.color] || colorMap2.blue;
        const selected = S.selectedFieldId === f.id;
        return { label: f.label, onSelect: (e: any) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ selectedFieldId: f.id }); },
          style: { position: 'absolute', top: f.top + 'px', left: f.left + 'px', minWidth: f.w + 'px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px', fontWeight: 600, padding: '0 8px', borderRadius: '6px', cursor: 'pointer', background: cm[0], color: cm[1], border: selected ? '2px solid ' + cm[2] : '1px dashed ' + cm[2], boxShadow: selected ? '0 2px 10px rgba(0,0,0,0.12)' : 'none' } };
      });
      out.recipients = [
        { name: 'Sarah Chen', role: 'Driver — Signer', initials: 'SC', color: this.avatarColor('Sarah Chen') },
        { name: 'Nina Patel', role: 'Recruiter — CC', initials: 'NP', color: this.avatarColor('Nina Patel') },
      ];
      const sf = S.placedFields.find((f: any) => f.id === S.selectedFieldId);
      out.hasSelectedField = !!sf; out.noSelectedField = !sf;
      if (sf) {
        out.selectedField = { label: sf.label };
        out.reqToggle = this.toggleStyle(sf.required); out.reqKnob = this.knobStyle();
        out.editToggle = this.toggleStyle(sf.editable); out.editKnob = this.knobStyle();
        out.lockToggle = this.toggleStyle(sf.locked); out.lockKnob = this.knobStyle();
        out.toggleReq = () => this.updField(sf.id, 'required'); out.toggleEdit = () => this.updField(sf.id, 'editable'); out.toggleLock = () => this.updField(sf.id, 'locked');
      }
      out.legend = [
        { label: 'Auto-filled', color: '#34C759' }, { label: 'Missing value', color: '#FF9F0A' },
        { label: 'Editable by signer', color: '#007AFF' }, { label: 'Locked', color: '#8E8E93' }, { label: 'Required missing', color: '#FF3B30' },
      ];
      out.closeBuilder = () => this.setState({ builderOpen: false, activeTool: null, selectedFieldId: null });
      out.builderPreview = () => this.toast('Preview', 'Rendering envelope…', 'info');
      out.builderSaveDraft = () => this.toast('Draft saved', 'Company Driver Agreement', 'success');
      out.builderSend = () => this.setState({ missingSheetOpen: true });
    }
    out.builderOpen = S.builderOpen;

    // ---- Missing sheet ----
    out.missingSheetOpen = S.missingSheetOpen;
    out.missingFields = [{ name: 'Phone — driver info' }, { name: 'Start Date — employment info' }];
    out.closeMissing = () => this.setState({ missingSheetOpen: false });
    out.fillNow = () => { this.setState({ missingSheetOpen: false }); this.toast('Fill fields', 'Returning to builder', 'info'); };
    out.letDriver = () => { this.setState({ missingSheetOpen: false, builderOpen: false }); this.toast('Envelope sent', 'Sarah Chen will complete remaining fields', 'success'); };
    out.stop = (e: any) => { if (e && e.stopPropagation) e.stopPropagation(); };

    // ---- Palette ----
    out.paletteOpen = S.paletteOpen; out.paletteQuery = S.paletteQuery;
    out.onPaletteQuery = (e: any) => this.setState({ paletteQuery: e.target.value });
    const q = S.paletteQuery.toLowerCase();
    const navResults: any[] = [['dashboard', 'Dashboard', 'Overview of what needs attention', 'dashboard'], ['pipeline', 'Hiring Pipeline', 'Kanban of candidates', 'hiring'], ['compliance', 'Compliance', 'Document readiness', 'compliance'], ['docusign', 'DocuSign', 'E-signature center', 'docusign'], ['messages', 'Messages', 'Inbox', 'messages'], ['settings', 'Settings', 'Configuration', 'settings']];
    const candResults: any[] = this.CANDS.map((c: any) => ['cand', c.name, c.stage + ' · ' + c.carrier, 'hiring', c.id]);
    const results: any[] = [];
    navResults.forEach(([page, title, sub, icon]: any) => { if (!q || title.toLowerCase().includes(q)) results.push({ title, sub, icon: this.ic(icon, 15), bg: 'rgba(0,122,255,0.08)', fg: '#007AFF', onClick: () => this.go(page) }); });
    candResults.forEach(([_t, title, sub, _icon, id]: any) => { if (q && title.toLowerCase().includes(q)) results.push({ title, sub, icon: this.ic('hiring', 15), bg: 'rgba(0,122,255,0.10)', fg: '#007AFF', onClick: () => this.openCand(id) }); });
    out.paletteResults = results.slice(0, 7);
    out.closePalette = () => this.setState({ paletteOpen: false });

    return out;
  }
}
