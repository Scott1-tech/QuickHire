import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Btn, Avatar, SegTabs, useToasts, ToastHost } from '../tasks/lib';
import { annaApi } from './api';
import { DEMO_PORTFOLIOS, demoPortfolioDetail, demoMatch, DEMO_METRICS, SAMPLE_LEAD } from './demo';

/* ───────────────────────── shared bits ───────────────────────── */
const TIER: Record<string, any> = {
  ELIGIBLE: { label: 'Eligible', bg: 'rgba(52,199,89,0.12)', text: '#248A3D', dot: '#34C759', ring: '#34C759' },
  NEEDS_DATA: { label: 'Needs Data', bg: 'rgba(255,159,10,0.14)', text: '#A05A00', dot: '#FF9F0A', ring: '#FF9F0A' },
  INELIGIBLE: { label: 'Ineligible', bg: 'rgba(255,59,48,0.12)', text: '#C62820', dot: '#FF3B30', ring: '#FF3B30' },
};
const FLAG: Record<string, any> = {
  approve: { label: 'Approved', bg: 'rgba(52,199,89,0.12)', text: '#248A3D', dot: '#34C759', icon: 'checkCircle' },
  review: { label: 'Needs Review', bg: 'rgba(255,159,10,0.14)', text: '#A05A00', dot: '#FF9F0A', icon: 'alert' },
  reject: { label: 'Rejected', bg: 'rgba(255,59,48,0.12)', text: '#C62820', dot: '#FF3B30', icon: 'ban' },
};
const REVIEW: Record<string, any> = {
  awaiting_carrier: { label: 'Awaiting carrier', color: '#A05A00', bg: 'rgba(255,159,10,0.14)' },
  pending: { label: 'Pending decision', color: '#3F3BB8', bg: 'rgba(88,86,214,0.12)' },
  approved: { label: 'Approved', color: '#248A3D', bg: 'rgba(52,199,89,0.12)' },
  rejected: { label: 'Rejected', color: '#C62820', bg: 'rgba(255,59,48,0.12)' },
};

function Card({ children, style, pad = 18 }: any) {
  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: pad, ...style }}>{children}</div>;
}
function Pill({ tier }: { tier: string }) {
  const t = TIER[tier] || TIER.NEEDS_DATA;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 9px', borderRadius: 999, background: t.bg, color: t.text, fontSize: 11.5, fontWeight: 650, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot }} />{t.label}</span>;
}
function FitRing({ score, tier, size = 46 }: any) {
  const t = TIER[tier] || TIER.ELIGIBLE;
  const r = (size - 6) / 2, c = 2 * Math.PI * r, off = c * (1 - (score || 0) / 100);
  const color = tier === 'ELIGIBLE' ? t.ring : '#C7C7CC';
  return <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={4} />
      {tier === 'ELIGIBLE' && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />}
    </svg>
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: tier === 'ELIGIBLE' ? t.text : T.faint }}>{tier === 'ELIGIBLE' ? score : '—'}</div>
  </div>;
}
function fmtAgo(iso: string) {
  const ms = Date.now() - +new Date(iso); const h = Math.floor(ms / 36e5);
  if (h < 1) return Math.max(1, Math.floor(ms / 6e4)) + 'm ago';
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

/* ───────────────────────── root ───────────────────────── */
export default function AnnaWorkspace({ go }: { go?: (page: string, payload?: any) => void }) {
  const [tab, setTab] = React.useState('assistant');
  const [conn, setConn] = React.useState<any>(null); // anna settings status
  const { toasts, toast } = useToasts();

  React.useEffect(() => { annaApi.getSettings().then(setConn).catch(() => setConn({ configured: false, provider: 'anthropic', offline: true })); }, []);

  const tabs = [
    { key: 'assistant', label: 'Assistant', icon: 'messageCircle' },
    { key: 'intake', label: 'Intake & Match', icon: 'target' },
    { key: 'portfolios', label: 'Portfolios', icon: 'briefcase' },
    { key: 'metrics', label: 'Metrics', icon: 'barChart' },
  ];

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
    <ToastHost toasts={toasts} />
    {/* header */}
    <div style={{ flex: 'none', padding: '22px 28px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: 'linear-gradient(135deg,#007AFF,#5856D6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkles" size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Anna</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13.5, color: T.muted }}>Driver qualification & carrier matching — intake, screening, and compliance.</p>
        </div>
        <ConnBadge conn={conn} go={go} />
      </div>
      <div style={{ marginTop: 16 }}><SegTabs tabs={tabs} value={tab} onChange={setTab} /></div>
    </div>
    {/* body */}
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 28px 28px' }}>
      {tab === 'assistant' && <AssistantTab conn={conn} go={go} />}
      {tab === 'intake' && <IntakeTab conn={conn} toast={toast} />}
      {tab === 'portfolios' && <PortfoliosTab toast={toast} />}
      {tab === 'metrics' && <MetricsTab />}
    </div>
  </div>;
}

function ConnBadge({ conn, go }: any) {
  if (!conn) return null;
  if (conn.configured) {
    return <Hover as="button" onClick={() => go && go('settings', { section: 'annaai' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 13px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer' }} hover={{ background: T.hover }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: '#34C759' }} />
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>Live on {conn.provider === 'openai' ? 'OpenAI' : 'Claude'}</span>
      <span style={{ fontSize: 11.5, color: T.faint }}>{conn.model}</span>
    </Hover>;
  }
  return <Btn variant="primary" icon="key" onClick={() => go && go('settings', { section: 'annaai' })}>Connect AI</Btn>;
}

/* ───────────────────────── assistant ───────────────────────── */
function AssistantTab({ conn, go }: any) {
  const [msgs, setMsgs] = React.useState<any[]>([{ role: 'assistant', content: "Hi, I'm Anna. Ask me about driver qualification, FMCSA compliance (MVR, PSP, Clearinghouse), or carrier requirements — or tell me to open a record, summarize what you're viewing, or create a task." }]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const send = async () => {
    const text = input.trim(); if (!text || busy) return;
    const next = [...msgs, { role: 'user', content: text }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const res = await annaApi.chat(next.filter((m) => m.role !== 'system'), {});
      setMsgs((m) => [...m, { role: 'assistant', content: res.reply, actions: res.actions, engine: res.engine }]);
      for (const a of res.actions || []) handleAction(a, go);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: "I couldn't reach the backend just now. Connect an API key in Settings → Anna AI for full answers; navigation and task commands still work once the app is deployed.", engine: 'offline' }]);
    } finally { setBusy(false); }
  };

  const prompts = ['What disqualifies a driver under FMCSA?', 'Summarize MVR vs PSP vs Clearinghouse', 'How does carrier matching score work?'];

  return <div style={{ maxWidth: 860, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Card pad={0} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {msgs.map((m, i) => <Bubble key={i} m={m} />)}
        {busy && <Bubble m={{ role: 'assistant', content: '…', typing: true }} />}
        <div ref={endRef} />
      </div>
      {msgs.length <= 1 && <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 22px 14px' }}>
        {prompts.map((p) => <Hover key={p} as="button" onClick={() => setInput(p)} style={{ height: 30, padding: '0 12px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12.5, color: T.muted, cursor: 'pointer' }} hover={{ background: T.hover }}>{p}</Hover>)}
      </div>}
      <div style={{ flex: 'none', borderTop: `1px solid ${T.hair}`, padding: 12, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Message Anna…" style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', maxHeight: 120, padding: '8px 6px', background: 'transparent', color: T.text }} />
        <Btn variant="primary" icon="send" onClick={send} style={{ opacity: input.trim() ? 1 : 0.5 }}>Send</Btn>
      </div>
    </Card>
    {conn && !conn.configured && <div style={{ marginTop: 10, fontSize: 12, color: T.faint, textAlign: 'center' }}>Running in heuristic mode. Connect an API key in Settings → Anna AI for full free-form answers.</div>}
  </div>;
}

function Bubble({ m }: any) {
  const me = m.role === 'user';
  return <div style={{ display: 'flex', gap: 10, flexDirection: me ? 'row-reverse' : 'row' }}>
    {!me && <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 999, background: 'linear-gradient(135deg,#007AFF,#5856D6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkles" size={15} /></span>}
    <div style={{ maxWidth: '78%' }}>
      <div style={{ padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: me ? '#007AFF' : '#F2F2F7', color: me ? '#fff' : T.text, borderTopLeftRadius: me ? 14 : 4, borderTopRightRadius: me ? 4 : 14, fontStyle: m.typing ? 'italic' : 'normal' }}>{m.content}</div>
      {(m.actions || []).map((a: any, i: number) => <div key={i} style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.muted, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 999, padding: '3px 10px' }}><Icon name={a.type === 'create_task' ? 'listChecks' : a.type === 'open_profile' ? 'user' : 'arrowRight'} size={12} />{actionLabel(a)}</div>)}
    </div>
  </div>;
}
function actionLabel(a: any) {
  if (a.type === 'create_task') return `Task: ${a.task?.title || 'New task'}`;
  if (a.type === 'open_profile') return `Open ${a.entityType} · ${a.name}`;
  if (a.type === 'navigate') return `Go to ${a.page}`;
  return 'Action';
}
function handleAction(a: any, go?: (p: string, payload?: any) => void) {
  if (!go) return;
  if (a.type === 'navigate' && a.page) go(a.page === 'inbox' ? 'messages' : a.page);
  if (a.type === 'open_profile') go('profile', { name: a.name, entityType: a.entityType });
}

/* ───────────────────────── intake & match ───────────────────────── */
function IntakeTab({ conn, toast }: any) {
  const [raw, setRaw] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const parseLead = (): any => {
    const txt = raw.trim();
    if (!txt) return null;
    try { return JSON.parse(txt); } catch { /* free text */ }
    const lead: any = { notes: txt };
    const nameM = txt.match(/name[:\s]+([A-Za-z][A-Za-z .'-]+)/i); if (nameM) lead.name = nameM[1].trim();
    return lead;
  };

  const run = async () => {
    const lead = parseLead();
    if (!lead) { toast('Paste a lead or use the sample', 'info'); return; }
    setBusy(true);
    try {
      const res = await annaApi.match(lead);
      setResult(res);
    } catch {
      setResult(demoMatch(lead.cdl ? lead : SAMPLE_LEAD));
      toast('Preview — sample matching (connect backend for live)', 'info');
    } finally { setBusy(false); }
  };

  const onFile = async (f: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        const scan = await annaApi.scan(String(reader.result), f.type.includes('pdf') ? 'document' : 'cdl');
        const lead = scan.profile || scan;
        setRaw(JSON.stringify(lead, null, 2));
        toast('Document scanned — review the profile', 'success');
      } catch {
        toast('Scanning needs ANTHROPIC_API_KEY on the server', 'warning');
      } finally { setBusy(false); }
    };
    reader.readAsDataURL(f);
  };

  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 18, alignItems: 'start', maxWidth: 1180, margin: '0 auto' }}>
    {/* left: lead input */}
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Icon name="user" size={16} style={{ color: T.primary }} /><span style={{ fontSize: 15, fontWeight: 650 }}>New lead</span></div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: T.muted }}>Paste raw application text or JSON. Anna normalizes it into a structured driver profile, then ranks every carrier.</p>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={9} placeholder={'e.g. "Marcus Bell, Class A, 5 yrs OTR, hazmat + tanker, clean MVR…"  — or paste JSON'} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 10, border: `1px solid ${T.border}`, padding: 11, fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5, outline: 'none', color: T.text }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Btn variant="primary" icon="target" onClick={run} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? 'Matching…' : 'Run matching'}</Btn>
        <Btn icon="sparkles" onClick={() => setRaw(JSON.stringify(SAMPLE_LEAD, null, 2))}>Sample lead</Btn>
        <Btn icon="upload" onClick={() => fileRef.current?.click()}>Scan document</Btn>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => e.target.files && onFile(e.target.files[0])} />
      </div>
      {conn && !conn.configured && <div style={{ marginTop: 10, fontSize: 11.5, color: T.faint }}>Matching is deterministic and works without AI. Document scanning needs an Anthropic key.</div>}
    </Card>
    {/* right: results */}
    <div style={{ minWidth: 0 }}>
      {!result ? <Card style={{ textAlign: 'center', padding: 48, color: T.faint }}>
        <Icon name="target" size={28} style={{ color: '#C7C7CC' }} />
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: T.muted }}>No match run yet</div>
        <div style={{ fontSize: 12.5, marginTop: 3 }}>Enter a lead and run matching to see ranked carrier recommendations.</div>
      </Card> : <MatchResult result={result} />}
    </div>
  </div>;
}

function MatchResult({ result }: any) {
  const { profile, match } = result;
  const s = match.summary || {};
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={profile?.name || 'Driver'} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{profile?.name || 'Unnamed driver'}</div>
          <div style={{ fontSize: 12.5, color: T.muted }}>{[profile?.cdl?.class && `Class ${profile.cdl.class}`, profile?.cdl?.experienceYears != null && `${profile.cdl.experienceYears} yrs exp`, (profile?.cdl?.endorsements || []).length ? profile.cdl.endorsements.join(', ') : null].filter(Boolean).join(' · ') || 'Profile normalized'}</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Stat n={s.eligible || 0} label="Eligible" color="#248A3D" />
          <Stat n={s.needsData || 0} label="Needs data" color="#A05A00" />
          <Stat n={s.ineligible || 0} label="Ineligible" color="#C62820" />
        </div>
      </div>
      {result.source && <div style={{ marginTop: 8, fontSize: 11, color: T.faint }}>Normalized via {result.source === 'ai' ? 'AI extraction' : 'rule-based parsing'}.</div>}
    </Card>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(match.matches || []).map((m: any) => <CarrierMatch key={m.carrierId} m={m} top={match.top?.carrierId === m.carrierId} />)}
    </div>
  </div>;
}
function Stat({ n, label, color }: any) {
  return <div style={{ textAlign: 'center' }}><div style={{ fontSize: 19, fontWeight: 700, color }}>{n}</div><div style={{ fontSize: 10.5, color: T.faint, fontWeight: 600 }}>{label}</div></div>;
}
function CarrierMatch({ m, top }: any) {
  const t = TIER[m.status] || TIER.NEEDS_DATA;
  return <Card style={{ borderColor: top ? 'rgba(0,122,255,0.4)' : T.border, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
    <FitRing score={m.fitScore} tier={m.status} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14.5, fontWeight: 650 }}>{m.carrierName}</span>
        <Pill tier={m.status} />
        {top && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#007AFF', background: 'rgba(0,122,255,0.1)', borderRadius: 999, padding: '2px 8px' }}><Icon name="sparkles" size={11} />Anna's pick</span>}
      </div>
      {m.fitSummary && <div style={{ marginTop: 6, fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{m.fitSummary}</div>}
      {(m.reasons || []).length > 0 && <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {m.reasons.map((r: string, i: number) => <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: t.text }}><Icon name={m.status === 'INELIGIBLE' ? 'ban' : 'alert'} size={13} style={{ flex: 'none', marginTop: 1 }} />{r}</div>)}
      </div>}
    </div>
  </Card>;
}

/* ───────────────────────── portfolios ───────────────────────── */
function PortfoliosTab({ toast }: any) {
  const [list, setList] = React.useState<any[] | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    annaApi.portfolios().then((r) => setList(r && r.length ? r : DEMO_PORTFOLIOS)).catch(() => setList(DEMO_PORTFOLIOS));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (!list) return <Card style={{ color: T.faint, textAlign: 'center', padding: 40 }}>Loading portfolios…</Card>;
  if (!list.length) return <Card style={{ textAlign: 'center', padding: 48, color: T.faint }}><Icon name="briefcase" size={28} style={{ color: '#C7C7CC' }} /><div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: T.muted }}>No driver portfolios yet</div><div style={{ fontSize: 12.5, marginTop: 3 }}>Run a lead through Intake & Match to build one.</div></Card>;

  return <div style={{ maxWidth: 1180, margin: '0 auto' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.9fr 1fr 1fr', gap: 12, padding: '0 16px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint }}>
      <div>Driver</div><div>Selected carrier</div><div>Fit</div><div>Stage</div><div>Compliance</div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((p) => <PortfolioRow key={p.id} p={p} onOpen={() => setOpenId(p.id)} />)}
    </div>
    {openId && <PortfolioDrawer id={openId} onClose={() => setOpenId(null)} onChange={load} toast={toast} />}
  </div>;
}
function PortfolioRow({ p, onOpen }: any) {
  const rv = REVIEW[p.reviewStatus] || REVIEW.pending;
  const fl = p.complianceFlag ? FLAG[p.complianceFlag] : null;
  return <Hover as="button" onClick={onOpen} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.9fr 1fr 1fr', gap: 12, alignItems: 'center', textAlign: 'left', width: '100%', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 16px', cursor: 'pointer' }} hover={{ background: T.hover }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Avatar name={p.driverName} size={32} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.driverName}</div><div style={{ fontSize: 11.5, color: T.faint }}>{p.recruiter || 'Unassigned'} · {fmtAgo(p.createdAt)}</div></div></div>
    <div style={{ fontSize: 13, color: p.carrierName ? T.text : T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.carrierName || '— not selected'}{!p.carrierName && p.recommendationCount ? <span style={{ color: T.primary }}> · {p.recommendationCount} eligible</span> : null}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color: p.fitScore != null ? '#248A3D' : T.faint }}>{p.fitScore != null ? p.fitScore : '—'}</div>
    <div><span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: rv.bg, color: rv.color, fontSize: 11.5, fontWeight: 600 }}>{rv.label}</span></div>
    <div>{fl ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 999, background: fl.bg, color: fl.text, fontSize: 11.5, fontWeight: 600 }}><Icon name={fl.icon} size={12} />{fl.label}</span> : <span style={{ fontSize: 12, color: T.faint }}>Not run</span>}</div>
  </Hover>;
}

function PortfolioDrawer({ id, onClose, onChange, toast }: any) {
  const [p, setP] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => { annaApi.portfolio(id).then(setP).catch(() => setP(demoPortfolioDetail(id))); }, [id]);
  React.useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, 'success'); load(); onChange && onChange(); }
    catch { toast('Preview — connect backend to persist', 'info'); }
    finally { setBusy(false); }
  };

  return <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(2px)' }} />
    <div style={{ position: 'relative', width: 560, maxWidth: '92vw', height: '100%', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
      {!p ? <div style={{ padding: 30, color: T.faint }}>Loading…</div> : <>
        <div style={{ flex: 'none', padding: '18px 22px', borderBottom: `1px solid ${T.hair}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={(p.driver || {}).name || 'Driver'} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{(p.driver || {}).name || 'Driver'}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{[(p.driver?.cdl?.class && `Class ${p.driver.cdl.class}`), (p.driver?.cdl?.experienceYears != null && `${p.driver.cdl.experienceYears} yrs`), (p.review?.assignedRecruiter)].filter(Boolean).join(' · ')}</div>
          </div>
          <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: T.segBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }} hover={{ background: 'rgba(0,0,0,0.08)' }}><Icon name="x" size={16} /></Hover>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* recommendations */}
          <Section title="Carrier recommendations" icon="target">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(p.recommendations || []).map((r: any) => {
                const sel = (p.carrier || {}).carrierId === r.carrierId;
                return <div key={r.carrierId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${sel ? 'rgba(0,122,255,0.4)' : T.border}`, borderRadius: 12, background: sel ? 'rgba(0,122,255,0.04)' : '#fff' }}>
                  <FitRing score={r.fitScore} tier={r.status} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 13.5, fontWeight: 650 }}>{r.carrierName}</span><Pill tier={r.status} /></div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{r.fitSummary || r.nearMiss || r.topReason || '—'}</div>
                  </div>
                  {r.status === 'ELIGIBLE' && (sel ? <span style={{ fontSize: 11.5, fontWeight: 700, color: '#248A3D' }}>Selected</span> : <Btn onClick={() => act(() => annaApi.selectCarrier(p.id, r.carrierId), `Selected ${r.carrierName}.`)} style={{ height: 30, padding: '0 11px' }}>Select</Btn>)}
                </div>;
              })}
            </div>
          </Section>
          {/* compliance */}
          <Section title="Compliance verdict" icon="shield">
            {p.compliance ? <ComplianceCard c={p.compliance} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: `1px dashed ${T.border}`, borderRadius: 12 }}>
              <div style={{ fontSize: 12.5, color: T.muted }}>{p.carrier ? 'Run a compliance check against the selected carrier.' : 'Select a carrier first, then run compliance.'}</div>
              {p.carrier && <Btn variant="primary" onClick={() => act(() => annaApi.compliance(p.id), 'Compliance verdict written.')} style={{ opacity: busy ? 0.6 : 1 }}>Run check</Btn>}
            </div>}
          </Section>
          {/* decision */}
          {p.carrier && <Section title="Recruiter decision" icon="checkCircle">
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="primary" icon="check" onClick={() => act(() => annaApi.decision(p.id, { decision: 'approved', by: 'Nina Patel' }), 'Driver approved.')}>Approve</Btn>
              <Btn icon="x" onClick={() => act(() => annaApi.decision(p.id, { decision: 'rejected', by: 'Nina Patel' }), 'Driver rejected.')}>Reject</Btn>
            </div>
          </Section>}
          {/* outcome */}
          <Section title="Outcome (closes the learning loop)" icon="trendingUp">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['hired', 'started', 'retained_90d', 'washed_out', 'declined_by_driver'].map((o) => {
                const on = (p.outcome || {}).status === o;
                return <Hover key={o} as="button" onClick={() => act(() => annaApi.outcome(p.id, o), `Marked ${o.replace(/_/g, ' ')}.`)} style={{ height: 30, padding: '0 11px', borderRadius: 999, border: `1px solid ${on ? 'rgba(0,122,255,0.4)' : T.border}`, background: on ? 'rgba(0,122,255,0.08)' : '#fff', color: on ? '#007AFF' : T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }} hover={{ background: T.hover }}>{o.replace(/_/g, ' ')}</Hover>;
              })}
            </div>
          </Section>
          {/* audit */}
          {(p.audit || []).length > 0 && <Section title="Audit trail" icon="fileText">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {p.audit.map((a: any, i: number) => <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: '#C7C7CC', marginTop: 6, flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, color: T.text }}>{a.detail}</div><div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{a.actor} · {fmtAgo(a.at)}</div></div>
              </div>)}
            </div>
          </Section>}
        </div>
      </>}
    </div>
  </div>;
}
function Section({ title, icon, children }: any) {
  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}><Icon name={icon} size={15} style={{ color: T.muted }} /><span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint }}>{title}</span></div>
    {children}
  </div>;
}
function ComplianceCard({ c }: any) {
  const fl = FLAG[c.flag] || FLAG.review;
  return <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', background: fl.bg }}>
      <Icon name={fl.icon} size={16} style={{ color: fl.text }} /><span style={{ fontSize: 13.5, fontWeight: 700, color: fl.text }}>{fl.label}</span>
      <span style={{ fontSize: 11.5, color: fl.text, opacity: 0.8 }}>· {c.carrierName}</span>
    </div>
    <div style={{ padding: 14 }}>
      <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55, marginBottom: 10 }}>{c.summary}</div>
      {(c.categories || []).map((cat: any) => <div key={cat.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0' }}>
        <Icon name={cat.pass ? 'checkCircle' : 'alert'} size={14} style={{ color: cat.pass ? '#34C759' : '#FF9F0A', flex: 'none', marginTop: 1 }} />
        <div><span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: T.faint, marginRight: 6 }}>{cat.key}</span><span style={{ fontSize: 12.5, color: T.muted }}>{cat.reason}</span></div>
      </div>)}
    </div>
  </div>;
}

/* ───────────────────────── metrics ───────────────────────── */
function MetricsTab() {
  const [m, setM] = React.useState<any>(null);
  React.useEffect(() => { annaApi.metrics().then((r) => setM(r && r.leads ? r : DEMO_METRICS)).catch(() => setM(DEMO_METRICS)); }, []);
  if (!m) return <Card style={{ color: T.faint, textAlign: 'center', padding: 40 }}>Loading metrics…</Card>;

  const kpis = [
    { v: m.leads, label: 'Leads processed', icon: 'users', color: '#007AFF' },
    { v: m.matchRate != null ? m.matchRate + '%' : '—', label: 'Match rate', icon: 'target', color: '#34C759' },
    { v: m.outcomes?.successRate != null ? m.outcomes.successRate + '%' : '—', label: '90-day success', icon: 'trendingUp', color: '#5856D6' },
    { v: m.recruiterHoursSaved + 'h', label: 'Recruiter hours saved', icon: 'clock', color: '#FF9500' },
  ];
  const pipe = [
    ['awaiting_carrier', 'Awaiting carrier', '#FF9F0A'], ['pending', 'Pending decision', '#5856D6'],
    ['approved', 'Approved', '#34C759'], ['rejected', 'Rejected', '#FF3B30'],
  ];
  const pipeTotal = Object.values(m.pipeline || {}).reduce((a: number, b: any) => a + b, 0) || 1;

  return <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
      {kpis.map((k) => <Card key={k.label}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: k.color + '18', color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={k.icon} size={18} /></span>
        <div style={{ fontSize: 27, fontWeight: 700, marginTop: 12, letterSpacing: '-0.02em' }}>{k.v}</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{k.label}</div>
      </Card>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 14 }}>Pipeline</div>
        {pipe.map(([k, label, color]) => { const val = (m.pipeline || {})[k] || 0; return <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}><span style={{ color: T.muted }}>{label}</span><span style={{ fontWeight: 650 }}>{val}</span></div>
          <div style={{ height: 7, borderRadius: 999, background: '#F2F2F7', overflow: 'hidden' }}><div style={{ width: `${(val / pipeTotal) * 100}%`, height: '100%', borderRadius: 999, background: color as string }} /></div>
        </div>; })}
        <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.hair}` }}>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{m.avgHoursToSelect ?? '—'}h</div><div style={{ fontSize: 11, color: T.faint }}>Avg to carrier select</div></div>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{m.avgHoursToDecision ?? '—'}h</div><div style={{ fontSize: 11, color: T.faint }}>Avg to decision</div></div>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{m.offersSelected}</div><div style={{ fontSize: 11, color: T.faint }}>Carriers selected</div></div>
        </div>
      </Card>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 14 }}>Carrier performance</div>
        {(m.perCarrier || []).slice(0, 5).map((c: any) => <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: `1px solid ${T.hair}` }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div><div style={{ fontSize: 11, color: T.faint }}>{c.selections} selected</div></div>
          {c.successRate != null && <div style={{ width: 90, display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 6, borderRadius: 999, background: '#F2F2F7', overflow: 'hidden' }}><div style={{ width: `${c.successRate}%`, height: '100%', background: c.successRate >= 70 ? '#34C759' : c.successRate >= 50 ? '#FF9F0A' : '#FF3B30' }} /></div><span style={{ fontSize: 12, fontWeight: 650, width: 32, textAlign: 'right' }}>{c.successRate}%</span></div>}
        </div>)}
        {!(m.perCarrier || []).length && <div style={{ fontSize: 12.5, color: T.faint }}>No carrier outcomes recorded yet.</div>}
      </Card>
    </div>
    <Card>
      <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>Lead source ROI</div>
      <div style={{ fontSize: 12, color: T.faint, marginBottom: 12 }}>Which sources actually convert to hires — not just volume.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(3, 0.8fr)', gap: 12, padding: '0 4px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint }}>
        <div>Source</div><div style={{ textAlign: 'right' }}>Leads</div><div style={{ textAlign: 'right' }}>Hired</div><div style={{ textAlign: 'right' }}>Hire rate</div>
      </div>
      {(m.bySource || []).map((s: any) => <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(3, 0.8fr)', gap: 12, padding: '9px 4px', borderTop: `1px solid ${T.hair}`, fontSize: 13 }}>
        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{s.source}</div>
        <div style={{ textAlign: 'right', color: T.muted }}>{s.leads}</div>
        <div style={{ textAlign: 'right', color: T.muted }}>{s.hired}</div>
        <div style={{ textAlign: 'right', fontWeight: 700, color: (s.hireRate || 0) >= 50 ? '#248A3D' : (s.hireRate || 0) >= 30 ? '#A05A00' : '#C62820' }}>{s.hireRate != null ? s.hireRate + '%' : '—'}</div>
      </div>)}
    </Card>
    <div style={{ fontSize: 11, color: T.faint, textAlign: 'center' }}>Generated {m.generatedAt ? fmtAgo(m.generatedAt) : 'just now'} · {DEMO_METRICS === m ? 'sample data (connect backend for live metrics)' : 'live'}</div>
  </div>;
}
