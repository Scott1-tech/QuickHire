import React from 'react';
import { css, Hover as H } from './lib/dc';
import { QuickHireLogic } from './logic';
import TasksWorkspace from './tasks/TasksWorkspace';

/**
 * QuickHire — recruiter command center. Faithful React port of the QuickHire.dc
 * design: a single self-contained SPA with state-driven page switching.
 */
export default class QuickHire extends QuickHireLogic {
  render() {
    const v: any = this.renderVals();
    return (
      <div style={css('display:flex; height:100vh; width:100%; overflow:hidden; background:#F5F5F7;')}>

        {/* SIDEBAR */}
        <aside style={v.sidebarStyle}>
          <div style={css('display:flex; align-items:center; gap:10px; height:64px; padding:0 16px; flex:none;')}>
            <div style={css('width:30px; height:30px; border-radius:8px; background:#B01D30; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:15px; flex:none;')}>Q</div>
            {v.expanded && (
              <div style={{ ...css('font-size:15px; font-weight:650; letter-spacing:-0.01em; white-space:nowrap;'), color: v.sidebarStrong }}>QuickHire</div>
            )}
          </div>

          {v.expanded && (
            <button onClick={v.cycleCarrier} style={v.carrierSwitchStyle}>
              <div style={css('width:22px; height:22px; border-radius:6px; background:rgba(0,122,255,0.14); color:#007AFF; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex:none;')}>{v.carrierBadge}</div>
              <div style={css('flex:1; min-width:0; text-align:left;')}>
                <div style={{ ...css('font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;'), color: v.sidebarStrong }}>{v.carrierName}</div>
                <div style={{ ...css('font-size:11px;'), color: v.sidebarFaint }}>DOT {v.carrierDot}</div>
              </div>
              <span style={{ color: v.sidebarFaint, display: 'flex' }}>{v.icChevDown}</span>
            </button>
          )}

          <nav style={css('flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:2px;')}>
            {v.nav.map((item: any) => (
              <H as="button" key={item.key} onClick={item.onClick} title={item.label} style={item.style} hover={css('background:rgba(0,0,0,0.04);')}>
                <span style={{ ...css('position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:18px; border-radius:0 3px 3px 0;'), background: item.indicator }}></span>
                <span style={css('display:flex; flex:none;')}>{item.icon}</span>
                {v.expanded && (
                  <span style={{ ...css('font-size:13.5px; white-space:nowrap;'), fontWeight: item.weight }}>{item.label}</span>
                )}
                {item.showBadge && (<span style={item.badgeStyle}>{item.badge}</span>)}
              </H>
            ))}
          </nav>

          <div style={{ ...css('flex:none; padding:8px;'), borderTop: `1px solid ${v.sidebarBorder}` }}>
            <div style={css('display:flex; align-items:center; gap:10px; padding:8px; border-radius:10px;')}>
              <div style={css('width:30px; height:30px; border-radius:999px; background:linear-gradient(135deg,#007AFF,#4DA2FF); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:650; flex:none;')}>NP</div>
              {v.expanded && (
                <div style={css('flex:1; min-width:0;')}>
                  <div style={{ ...css('font-size:13px; font-weight:600; white-space:nowrap;'), color: v.sidebarStrong }}>Nina Patel</div>
                  <div style={{ ...css('font-size:11px;'), color: v.sidebarFaint }}>Recruiter</div>
                </div>
              )}
              {v.expanded && (
                <button onClick={v.toggleTheme} title="Toggle sidebar theme" style={v.themeBtnStyle}>{v.icTheme}</button>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div style={css('flex:1; min-width:0; display:flex; flex-direction:column; height:100vh; overflow:hidden;')}>

          {/* TOP COMMAND BAR */}
          <header style={css('height:64px; flex:none; display:flex; align-items:center; gap:16px; padding:0 20px; background:rgba(245,245,247,0.72); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-bottom:1px solid rgba(0,0,0,0.07); z-index:20;')}>
            <H as="button" onClick={v.toggleCollapse} title="Toggle sidebar" style={css('width:34px; height:34px; flex:none; display:flex; align-items:center; justify-content:center; border:none; background:transparent; border-radius:9px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.05);')}>{v.icCollapse}</H>
            <div style={css('display:flex; align-items:center; gap:7px; min-width:0;')}>
              <span style={css('font-size:13px; color:#8E8E93; white-space:nowrap;')}>QuickHire</span>
              <span style={css('color:#C7C7CC; display:flex;')}>{v.icChevRight}</span>
              <span style={css('font-size:13.5px; font-weight:600; color:#1D1D1F; white-space:nowrap;')}>{v.pageTitle}</span>
            </div>
            <div style={css('flex:1;')}></div>
            <H as="button" onClick={v.openPalette} style={css('display:flex; align-items:center; gap:9px; width:340px; max-width:38vw; height:38px; padding:0 12px; background:#FFFFFF; border:1px solid rgba(0,0,0,0.08); border-radius:12px; cursor:text; color:#8E8E93;')} hover={css('border-color:rgba(0,0,0,0.16);')}>
              <span style={css('display:flex;')}>{v.icSearch}</span>
              <span style={css('flex:1; text-align:left; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>Search drivers, carriers, documents, tasks…</span>
              <span style={css('font-size:11px; font-weight:600; color:#8E8E93; background:#F2F2F7; border:1px solid rgba(0,0,0,0.06); border-radius:6px; padding:2px 6px;')}>⌘K</span>
            </H>
            <div style={css('flex:1;')}></div>
            <H as="button" onClick={v.primaryCreate} style={css('display:flex; align-items:center; gap:7px; height:38px; padding:0 14px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icPlus}<span>Create</span></H>
            <H as="button" onClick={v.openTasks} title="Tasks" style={css('position:relative; width:36px; height:36px; flex:none; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:10px; color:#3a3a3c; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.03);')}>{v.icTaskTop}<span style={css('position:absolute; top:-5px; right:-5px; min-width:17px; height:17px; padding:0 4px; border-radius:999px; background:#007AFF; color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; border:1.5px solid #fff;')}>{v.taskCount}</span></H>
            <H as="button" onClick={v.notify} title="Notifications" style={css('position:relative; width:36px; height:36px; flex:none; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:10px; color:#3a3a3c; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.03);')}>{v.icBell}<span style={css('position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:999px; background:#FF3B30; border:1.5px solid #fff;')}></span></H>
            <div style={css('width:36px; height:36px; flex:none; border-radius:999px; background:linear-gradient(135deg,#007AFF,#4DA2FF); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:650; cursor:pointer;')}>NP</div>
          </header>

          {/* SCROLL CONTENT */}
          <main style={css('flex:1; overflow-y:auto; position:relative;')}>
            {v.isDashboard && this.renderDashboard(v)}
            {v.isPipeline && this.renderPipeline(v)}
            {v.isProfile && this.renderProfile(v)}
            {v.isDocusign && this.renderDocusign(v)}
            {v.isCompliance && this.renderCompliance(v)}
            {v.isMessages && this.renderMessages(v)}
            {v.isSettings && this.renderSettings(v)}
            {v.isDrivers && this.renderDrivers(v)}
            {v.isCarriers && this.renderCarriers(v)}
            {v.isReports && this.renderReports(v)}
            {v.isIntegrations && this.renderIntegrationsPage(v)}
            {v.isTasks && <TasksWorkspace />}
          </main>
        </div>

        {v.builderOpen && this.renderBuilder(v)}
        {v.missingSheetOpen && this.renderMissingSheet(v)}
        {v.taskDrawerOpen && this.renderTaskDrawer(v)}
        {v.taskDetailOpen && this.renderTaskDetail(v)}
        {v.dotSheetOpen && this.renderDotSheet(v)}
        {v.paletteOpen && this.renderPalette(v)}
        {this.renderToasts(v)}
      </div>
    );
  }

  // ===================== DASHBOARD =====================
  renderDashboard(v: any) {
    return (
      <div style={css('max-width:1180px; margin:0 auto; padding:32px 32px 64px;')}>
        <div style={css('margin-bottom:24px;')}>
          <h1 style={css('margin:0; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>{v.greeting}</h1>
          <p style={css('margin:6px 0 0; font-size:15px; color:#6E6E73;')}>You have <span style={css('color:#1D1D1F; font-weight:600;')}>18 items</span> needing attention.</p>
        </div>

        <div style={css('display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:28px;')}>
          {v.metrics.map((m: any, i: number) => (
            <H as="button" key={i} onClick={m.onClick} style={css('text-align:left; cursor:pointer; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:16px 18px; display:flex; flex-direction:column; gap:10px; transition:box-shadow .18s, transform .18s;')} hover={css('box-shadow:0 8px 24px rgba(0,0,0,0.08); transform:translateY(-1px);')}>
              <div style={css('display:flex; align-items:center; justify-content:space-between;')}>
                <span style={{ ...css('width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center;'), background: m.iconBg, color: m.iconFg }}>{m.icon}</span>
                <span style={m.trendStyle}>{m.trend}</span>
              </div>
              <div style={css('font-size:30px; font-weight:700; letter-spacing:-0.02em; line-height:1;')}>{m.value}</div>
              <div style={css('font-size:13px; color:#6E6E73;')}>{m.label}</div>
            </H>
          ))}
        </div>

        <div style={css('display:grid; grid-template-columns:1.5fr 1fr; gap:20px; align-items:start;')}>
          <section style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
            <div style={css('display:flex; align-items:center; justify-content:space-between; padding:16px 18px 12px;')}>
              <h2 style={css('margin:0; font-size:16px; font-weight:650; letter-spacing:-0.01em;')}>Today's Priorities</h2>
              <span style={css('font-size:12px; color:#8E8E93;')}>{v.priorities.length} items</span>
            </div>
            {v.priorities.map((p: any, i: number) => (
              <H key={i} style={css('display:flex; align-items:center; gap:13px; padding:12px 18px; border-top:1px solid rgba(0,0,0,0.06);')} hover={css('background:rgba(0,0,0,0.018);')}>
                <span style={{ ...css('width:9px; height:9px; border-radius:999px; flex:none;'), background: p.dot }}></span>
                <div style={css('flex:1; min-width:0;')}>
                  <div style={css('font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{p.title}</div>
                  <div style={css('font-size:12.5px; color:#6E6E73; margin-top:1px;')}>{p.sub}</div>
                </div>
                <span style={css('font-size:12px; color:#8E8E93; white-space:nowrap;')}>{p.age}</span>
                <H as="button" onClick={p.onClick} style={css('height:30px; padding:0 12px; font-size:12.5px; font-weight:600; color:#1D1D1F; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer; white-space:nowrap;')} hover={css('background:rgba(0,0,0,0.04);')}>{p.action}</H>
              </H>
            ))}
          </section>

          <div style={css('display:flex; flex-direction:column; gap:20px;')}>
            <section style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
              <div style={css('display:flex; align-items:center; gap:9px; padding:16px 18px 12px;')}>
                <span style={css('color:#FF9F0A; display:flex;')}>{v.icAlert}</span>
                <h2 style={css('margin:0; font-size:16px; font-weight:650; letter-spacing:-0.01em;')}>Compliance Alerts</h2>
              </div>
              {v.complianceAlerts.map((a: any, i: number) => (
                <H as="button" key={i} onClick={a.onClick} style={css('width:100%; text-align:left; display:flex; align-items:center; gap:11px; padding:11px 18px; border-top:1px solid rgba(0,0,0,0.06); background:transparent; border-left:none; border-right:none; border-bottom:none; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.018);')}>
                  <div style={css('flex:1; min-width:0;')}>
                    <div style={css('font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{a.name}</div>
                    <div style={css('font-size:12px; color:#6E6E73;')}>{a.doc}</div>
                  </div>
                  <span style={a.chipStyle}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: a.chipDot }}></span>{a.chip}</span>
                </H>
              ))}
            </section>

            <section style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
              <div style={css('display:flex; align-items:center; gap:9px; padding:16px 18px 12px;')}>
                <span style={css('color:#007AFF; display:flex;')}>{v.icDoc}</span>
                <h2 style={css('margin:0; font-size:16px; font-weight:650; letter-spacing:-0.01em;')}>DocuSign Waiting</h2>
              </div>
              {v.docusignWaiting.map((d: any, i: number) => (
                <H key={i} style={css('display:flex; align-items:center; gap:11px; padding:11px 18px; border-top:1px solid rgba(0,0,0,0.06);')} hover={css('background:rgba(0,0,0,0.018);')}>
                  <div style={css('flex:1; min-width:0;')}>
                    <div style={css('font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{d.doc}</div>
                    <div style={css('font-size:12px; color:#6E6E73;')}>{d.who} · {d.age}</div>
                  </div>
                  <H as="button" onClick={d.onClick} style={css('height:28px; padding:0 11px; font-size:12px; font-weight:600; color:#0066CC; background:rgba(0,122,255,0.10); border:none; border-radius:8px; cursor:pointer;')} hover={css('background:rgba(0,122,255,0.18);')}>Remind</H>
                </H>
              ))}
            </section>
          </div>
        </div>

        <div style={css('display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px; align-items:start;')}>
          <section style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
            <div style={css('display:flex; align-items:center; justify-content:space-between; padding:16px 18px 12px;')}>
              <h2 style={css('margin:0; font-size:16px; font-weight:650; letter-spacing:-0.01em;')}>Recent Applications</h2>
              <button onClick={v.goPipeline} style={css('font-size:12.5px; font-weight:600; color:#007AFF; background:none; border:none; cursor:pointer;')}>View pipeline</button>
            </div>
            {v.recentApps.map((r: any, i: number) => (
              <H as="button" key={i} onClick={r.onClick} style={css('width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:11px 18px; border-top:1px solid rgba(0,0,0,0.06); background:transparent; border-left:none; border-right:none; border-bottom:none; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.018);')}>
                <div style={{ ...css('width:34px; height:34px; border-radius:999px; flex:none; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:650; color:#fff;'), background: r.avatarBg }}>{r.initials}</div>
                <div style={css('flex:1; min-width:0;')}>
                  <div style={css('font-size:13.5px; font-weight:600;')}>{r.name}</div>
                  <div style={css('font-size:12px; color:#6E6E73;')}>{r.carrier}</div>
                </div>
                <span style={r.chipStyle}>{r.stage}</span>
              </H>
            ))}
          </section>

          <section style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
            <div style={css('display:flex; align-items:center; justify-content:space-between; padding:16px 18px 12px;')}>
              <h2 style={css('margin:0; font-size:16px; font-weight:650; letter-spacing:-0.01em;')}>Messages Needing Reply</h2>
              <button onClick={v.goMessages} style={css('font-size:12.5px; font-weight:600; color:#007AFF; background:none; border:none; cursor:pointer;')}>Open inbox</button>
            </div>
            {v.messagesReply.map((m: any, i: number) => (
              <H as="button" key={i} onClick={m.onClick} style={css('width:100%; text-align:left; display:flex; align-items:flex-start; gap:12px; padding:12px 18px; border-top:1px solid rgba(0,0,0,0.06); background:transparent; border-left:none; border-right:none; border-bottom:none; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.018);')}>
                <div style={{ ...css('width:34px; height:34px; border-radius:999px; flex:none; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:650; color:#fff;'), background: m.avatarBg }}>{m.initials}</div>
                <div style={css('flex:1; min-width:0;')}>
                  <div style={css('display:flex; align-items:center; gap:8px;')}><span style={css('font-size:13.5px; font-weight:600;')}>{m.name}</span><span style={m.chanStyle}>{m.channel}</span></div>
                  <div style={css('font-size:12.5px; color:#6E6E73; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{m.preview}</div>
                </div>
                <span style={css('font-size:11.5px; color:#8E8E93; white-space:nowrap;')}>{m.age}</span>
              </H>
            ))}
          </section>
        </div>
      </div>
    );
  }

  // ===================== HIRING PIPELINE =====================
  renderPipeline(v: any) {
    return (
      <div style={css('padding:28px 28px 0; height:100%; display:flex; flex-direction:column;')}>
        <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex:none;')}>
          <div>
            <h1 style={css('margin:0; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>Hiring Pipeline</h1>
            <p style={css('margin:6px 0 0; font-size:14px; color:#6E6E73;')}>142 candidates · <span style={css('color:#A05A00; font-weight:600;')}>18 need action</span> · <span style={css('color:#248A3D; font-weight:600;')}>6 ready for onboarding</span></p>
          </div>
          <div style={css('display:flex; gap:8px; flex:none;')}>
            <H as="button" onClick={v.inviteDriver} style={css('display:flex; align-items:center; gap:7px; height:38px; padding:0 14px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icPlus}<span>Invite Driver</span></H>
            <H as="button" onClick={v.importDrivers} style={css('height:38px; padding:0 14px; background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:10px; color:#1D1D1F; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Import</H>
            <H as="button" onClick={v.exportData} style={css('height:38px; padding:0 14px; background:transparent; border:none; border-radius:10px; color:#6E6E73; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.05);')}>Export</H>
          </div>
        </div>

        <div style={css('display:flex; align-items:center; gap:8px; margin:18px 0 16px; flex:none;')}>
          {v.pipelineFilters.map((f: any, i: number) => (
            <button key={i} onClick={f.onClick} style={f.style}>{f.label}{f.hasCount && (<span style={css('margin-left:6px; opacity:0.7;')}>{f.count}</span>)}</button>
          ))}
        </div>

        <div style={css('flex:1; overflow-x:auto; overflow-y:hidden; padding-bottom:24px;')}>
          <div style={css('display:flex; gap:14px; height:100%; min-width:max-content;')}>
            {v.columns.map((col: any) => (
              <div key={col.key} onDragOver={col.onDragOver} onDrop={col.onDrop} style={css('width:288px; flex:none; background:#F9FAFB; border:1px solid rgba(0,0,0,0.06); border-radius:14px; display:flex; flex-direction:column; max-height:100%;')}>
                <div style={css('display:flex; align-items:center; gap:8px; padding:13px 14px 10px; flex:none;')}>
                  <span style={{ ...css('width:8px; height:8px; border-radius:999px;'), background: col.dot }}></span>
                  <span style={css('font-size:13px; font-weight:650; letter-spacing:-0.01em;')}>{col.title}</span>
                  <span style={css('font-size:11.5px; font-weight:600; color:#6E6E73; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:999px; padding:1px 8px;')}>{col.count}</span>
                </div>
                <div style={css('flex:1; overflow-y:auto; padding:4px 10px 10px; display:flex; flex-direction:column; gap:9px;')}>
                  {col.cards.map((c: any) => (
                    <H key={c.id} draggable onDragStart={c.onDragStart} onClick={c.onClick} style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:12px; padding:12px; cursor:pointer; transition:box-shadow .16s, transform .16s;')} hover={css('box-shadow:0 6px 18px rgba(0,0,0,0.08); transform:translateY(-1px);')}>
                      <div style={css('display:flex; align-items:center; justify-content:space-between; gap:8px;')}>
                        <span style={css('font-size:13.5px; font-weight:650; letter-spacing:-0.01em;')}>{c.name}</span>
                        <span style={c.riskStyle}>{c.risk}</span>
                      </div>
                      <div style={css('font-size:11.5px; color:#8E8E93; margin-top:3px;')}>{c.stageTime}</div>
                      {c.hasMissing && (
                        <div style={css('display:inline-flex; align-items:center; gap:5px; margin-top:9px; font-size:11.5px; font-weight:600; color:#C62820; background:rgba(255,59,48,0.10); border-radius:7px; padding:3px 8px;')}>{v.icAlertSm}Missing: {c.missing}</div>
                      )}
                      <div style={css('display:flex; align-items:center; justify-content:space-between; margin-top:11px; padding-top:10px; border-top:1px solid rgba(0,0,0,0.06);')}>
                        <div style={css('display:flex; align-items:center; gap:7px; min-width:0;')}>
                          <span style={{ ...css('width:22px; height:22px; border-radius:999px; flex:none; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:650; color:#fff;'), background: c.ownerColor }}>{c.owner}</span>
                          <span style={css('font-size:11.5px; color:#6E6E73; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{c.next}</span>
                        </div>
                        <span style={{ ...css('font-size:11px; font-weight:700;'), color: c.scoreColor }}>{c.score}</span>
                      </div>
                    </H>
                  ))}
                  <H as="button" onClick={col.onAdd} style={css('display:flex; align-items:center; justify-content:center; gap:6px; padding:9px; font-size:12.5px; font-weight:600; color:#6E6E73; background:transparent; border:1px dashed rgba(0,0,0,0.14); border-radius:10px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.03); color:#1D1D1F;')}>{v.icPlusSm}Add candidate</H>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===================== CANDIDATE PROFILE =====================
  renderProfile(v: any) {
    const c = v.cand;
    return (
      <div style={css('display:flex; height:100%;')}>
        <div style={css('width:300px; flex:none; border-right:1px solid rgba(0,0,0,0.08); background:#fff; overflow-y:auto; padding:24px 20px;')}>
          <button onClick={v.goPipeline} style={css('display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#6E6E73; background:none; border:none; cursor:pointer; padding:0; margin-bottom:18px;')}>{v.icBack}Pipeline</button>
          <div style={css('display:flex; flex-direction:column; align-items:center; text-align:center;')}>
            <div style={{ ...css('width:76px; height:76px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:650; color:#fff;'), background: c.avatarBg }}>{c.initials}</div>
            <h1 style={css('margin:14px 0 0; font-size:20px; font-weight:700; letter-spacing:-0.01em;')}>{c.name}</h1>
            <div style={css('margin-top:8px;')}><span style={c.chipStyle}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: c.chipDot }}></span>{c.stage}</span></div>
            <div style={css('font-size:12.5px; color:#6E6E73; margin-top:8px;')}>Recruiter · {c.recruiter}</div>
          </div>
          <div style={css('display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin:20px 0;')}>
            {c.quickActions.map((q: any, i: number) => (
              <H as="button" key={i} onClick={q.onClick} title={q.label} style={css('display:flex; flex-direction:column; align-items:center; gap:4px; padding:9px 0; background:#F2F2F7; border:none; border-radius:10px; color:#1D1D1F; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.07);')}>{q.icon}<span style={css('font-size:10px; font-weight:600; color:#6E6E73;')}>{q.label}</span></H>
            ))}
          </div>
          <div style={css('border-top:1px solid rgba(0,0,0,0.07); padding-top:16px;')}>
            <div style={css('font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#8E8E93; margin-bottom:12px;')}>About</div>
            {c.about.map((a: any, i: number) => (
              <div key={i} style={css('display:flex; justify-content:space-between; gap:12px; padding:7px 0; font-size:13px;')}>
                <span style={css('color:#8E8E93;')}>{a.label}</span>
                <span style={css('font-weight:550; text-align:right;')}>{a.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={css('flex:1; min-width:0; display:flex; flex-direction:column; overflow:hidden;')}>
          <div style={css('display:flex; gap:2px; padding:0 24px; border-bottom:1px solid rgba(0,0,0,0.08); flex:none; overflow-x:auto;')}>
            {c.tabs.map((t: any, i: number) => (
              <button key={i} onClick={t.onClick} style={t.style}>{t.label}</button>
            ))}
          </div>
          <div style={css('flex:1; overflow-y:auto; padding:24px;')}>
            <div style={css('display:grid; grid-template-columns:1fr 1fr; gap:16px;')}>
              <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:18px;')}>
                <div style={css('font-size:13px; font-weight:650; margin-bottom:14px;')}>Scorecard</div>
                <div style={css('display:flex; align-items:flex-end; gap:8px;')}><span style={{ ...css('font-size:40px; font-weight:700; letter-spacing:-0.02em; line-height:1;'), color: c.scoreColor }}>{c.score}</span><span style={css('font-size:13px; color:#6E6E73; padding-bottom:5px;')}>/ 100</span></div>
                <div style={css('margin-top:10px;')}><span style={c.riskStyle}>{c.risk}</span></div>
              </div>
              <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:18px;')}>
                <div style={css('font-size:13px; font-weight:650; margin-bottom:14px;')}>Progress</div>
                {c.progress.map((pr: any, i: number) => (
                  <div key={i} style={css('margin-bottom:12px;')}>
                    <div style={css('display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px;')}><span style={css('color:#6E6E73;')}>{pr.label}</span><span style={css('font-weight:600;')}>{pr.pct}%</span></div>
                    <div style={css('height:7px; background:#F2F2F7; border-radius:999px; overflow:hidden;')}><div style={{ ...css('height:100%; border-radius:999px;'), width: pr.pct + '%', background: pr.color }}></div></div>
                  </div>
                ))}
              </div>
            </div>

            <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:18px; margin-top:16px;')}>
              <div style={css('font-size:13px; font-weight:650; margin-bottom:6px;')}>Missing Items</div>
              {c.missingItems.map((mi: any, i: number) => (
                <div key={i} style={css('display:flex; align-items:center; gap:10px; padding:10px 0; border-top:1px solid rgba(0,0,0,0.06);')}>
                  <span style={css('color:#C62820; display:flex;')}>{v.icAlertSm2}</span>
                  <span style={css('flex:1; font-size:13.5px; font-weight:550;')}>{mi.name}</span>
                  <H as="button" onClick={mi.onClick} style={css('height:30px; padding:0 12px; font-size:12.5px; font-weight:600; color:#1D1D1F; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Request</H>
                </div>
              ))}
              {c.noMissing && (
                <div style={css('display:flex; align-items:center; gap:9px; padding:10px 0; color:#248A3D; font-size:13.5px; font-weight:550;')}>{v.icCheckSm}All required documents collected.</div>
              )}
            </div>

            <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:18px; margin-top:16px;')}>
              <div style={css('font-size:13px; font-weight:650; margin-bottom:6px;')}>Recent Activity</div>
              {c.activity.map((ac: any, i: number) => (
                <div key={i} style={css('display:flex; gap:12px; padding:11px 0; border-top:1px solid rgba(0,0,0,0.06);')}>
                  <span style={{ ...css('width:7px; height:7px; border-radius:999px; margin-top:5px; flex:none;'), background: ac.dot }}></span>
                  <div style={css('flex:1; min-width:0;')}><div style={css('font-size:13px;')}>{ac.text}</div><div style={css('font-size:11.5px; color:#8E8E93; margin-top:1px;')}>{ac.time}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={css('width:300px; flex:none; border-left:1px solid rgba(0,0,0,0.08); background:#fafafa; overflow-y:auto; padding:24px 20px;')}>
          <div style={css('background:linear-gradient(135deg,#F0F6FF,#E3F0FF); border:1px solid rgba(0,122,255,0.18); border-radius:14px; padding:16px;')}>
            <div style={css('display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#007AFF;')}>{v.icSpark}Next Best Action</div>
            <div style={css('font-size:14.5px; font-weight:650; margin:9px 0 4px;')}>{c.nextAction}</div>
            <div style={css('font-size:12.5px; color:#6E6E73;')}>{c.nextReason}</div>
            <H as="button" onClick={c.doNext} style={css('margin-top:12px; width:100%; height:36px; background:#007AFF; border:none; border-radius:9px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{c.nextCta}</H>
          </div>
          <div style={css('margin-top:18px;')}>
            {c.inspector.map((ins: any, i: number) => (
              <div key={i} style={css('display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 0; border-bottom:1px solid rgba(0,0,0,0.06);')}>
                <span style={css('font-size:12.5px; color:#8E8E93;')}>{ins.label}</span>
                {ins.isChip && (<span style={ins.chipStyle}>{ins.value}</span>)}
                {ins.isText && (<span style={css('font-size:12.5px; font-weight:600; text-align:right;')}>{ins.value}</span>)}
              </div>
            ))}
          </div>
          <div style={css('display:flex; flex-direction:column; gap:8px; margin-top:18px;')}>
            <H as="button" onClick={c.sendOffer} style={css('width:100%; height:40px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>Send Offer Package</H>
            <H as="button" onClick={c.requestDocs} style={css('width:100%; height:38px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Request Documents</H>
            <H as="button" onClick={c.moveStage} style={css('width:100%; height:38px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Move Stage</H>
            <H as="button" onClick={c.archive} style={css('width:100%; height:36px; background:transparent; border:none; border-radius:10px; color:#C62820; font-size:12.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(255,59,48,0.06);')}>Archive Candidate</H>
          </div>
        </div>
      </div>
    );
  }

  // ===================== DOCUSIGN =====================
  renderDocusign(v: any) {
    return (
      <div style={css('max-width:1180px; margin:0 auto; padding:28px 32px 64px;')}>
        <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:16px;')}>
          <div>
            <div style={css('display:flex; align-items:center; gap:10px;')}>
              <h1 style={css('margin:0; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>DocuSign</h1>
              <span style={css('display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; color:#A05A00; background:rgba(255,159,10,0.14); border-radius:999px; padding:3px 10px;')}><span style={css('width:6px; height:6px; border-radius:999px; background:#FF9F0A;')}></span>Simulated Mode</span>
            </div>
            <p style={css('margin:6px 0 0; font-size:14px; color:#6E6E73;')}>E-signature command center</p>
          </div>
          <H as="button" onClick={v.openBuilder} style={css('display:flex; align-items:center; gap:7px; height:38px; padding:0 14px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icPlus}<span>Start Envelope</span></H>
        </div>

        <div style={css('display:flex; gap:2px; margin:18px 0 22px; border-bottom:1px solid rgba(0,0,0,0.08);')}>
          {v.dsTabs.map((t: any, i: number) => (<button key={i} onClick={t.onClick} style={t.style}>{t.label}</button>))}
        </div>

        {v.dsHome && (
          <>
            <div style={css('display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px;')}>
              {v.dsStats.map((s: any, i: number) => (
                <div key={i} style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:16px 18px;')}>
                  <div style={{ ...css('font-size:28px; font-weight:700; letter-spacing:-0.02em;'), color: s.color }}>{s.value}</div>
                  <div style={css('font-size:13px; color:#6E6E73; margin-top:4px;')}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={css('display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px;')}>
              {v.dsQuick.map((q: any, i: number) => (
                <H as="button" key={i} onClick={q.onClick} style={css('display:flex; align-items:center; gap:11px; padding:14px 16px; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; cursor:pointer; text-align:left;')} hover={css('box-shadow:0 8px 24px rgba(0,0,0,0.08); transform:translateY(-1px);')}>
                  <span style={{ ...css('width:36px; height:36px; flex:none; border-radius:10px; display:flex; align-items:center; justify-content:center;'), background: q.bg, color: q.fg }}>{q.icon}</span>
                  <span style={css('font-size:13px; font-weight:600;')}>{q.label}</span>
                </H>
              ))}
            </div>
            <section style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
              <div style={css('padding:16px 18px 12px; font-size:16px; font-weight:650;')}>Recent Agreements</div>
              {v.agreements.map((a: any, i: number) => (
                <H key={i} style={css('display:flex; align-items:center; gap:13px; padding:12px 18px; border-top:1px solid rgba(0,0,0,0.06);')} hover={css('background:rgba(0,0,0,0.018);')}>
                  <span style={css('color:#8E8E93; display:flex;')}>{v.icDocSm}</span>
                  <div style={css('flex:1; min-width:0;')}><div style={css('font-size:13.5px; font-weight:600;')}>{a.doc}</div><div style={css('font-size:12px; color:#6E6E73;')}>{a.candidate} · {a.carrier}</div></div>
                  <span style={a.chipStyle}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: a.chipDot }}></span>{a.status}</span>
                  <span style={css('font-size:12px; color:#8E8E93; width:90px; text-align:right;')}>{a.event}</span>
                </H>
              ))}
            </section>
          </>
        )}

        {v.dsAgreements && (
          <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
            <div style={css('display:grid; grid-template-columns:1.6fr 1.2fr 1fr 1fr 0.9fr 80px; gap:12px; padding:11px 18px; background:#FAFAFA; border-bottom:1px solid rgba(0,0,0,0.06); font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:#8E8E93;')}>
              <span>Document</span><span>Candidate</span><span>Carrier</span><span>Status</span><span>Last Event</span><span style={css('text-align:right;')}>Actions</span>
            </div>
            {v.agreements.map((a: any, i: number) => (
              <H key={i} style={css('display:grid; grid-template-columns:1.6fr 1.2fr 1fr 1fr 0.9fr 80px; gap:12px; align-items:center; padding:13px 18px; border-top:1px solid rgba(0,0,0,0.06); font-size:13px;')} hover={css('background:rgba(0,0,0,0.022);')}>
                <span style={css('font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{a.doc}</span>
                <span style={css('color:#3a3a3c;')}>{a.candidate}</span>
                <span style={css('color:#6E6E73; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{a.carrier}</span>
                <span><span style={a.chipStyle}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: a.chipDot }}></span>{a.status}</span></span>
                <span style={css('color:#8E8E93; font-size:12px;')}>{a.event}</span>
                <span style={css('display:flex; gap:4px; justify-content:flex-end;')}>
                  <H as="button" onClick={a.onRemind} title="Remind" style={css('width:30px; height:30px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; border-radius:8px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.06);')}>{v.icBellSm}</H>
                  <H as="button" onClick={a.onView} title="View" style={css('width:30px; height:30px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; border-radius:8px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.06);')}>{v.icEye}</H>
                </span>
              </H>
            ))}
          </div>
        )}

        {v.dsTemplates && (
          <div style={css('display:grid; grid-template-columns:repeat(2,1fr); gap:14px;')}>
            {v.templates.map((t: any, i: number) => (
              <H key={i} style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:16px 18px;')} hover={css('box-shadow:0 8px 24px rgba(0,0,0,0.06);')}>
                <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:10px;')}>
                  <div style={css('display:flex; align-items:center; gap:11px; min-width:0;')}>
                    <span style={css('width:36px; height:36px; flex:none; border-radius:10px; background:rgba(0,122,255,0.10); color:#007AFF; display:flex; align-items:center; justify-content:center;')}>{v.icDocSm}</span>
                    <div style={css('min-width:0;')}><div style={css('font-size:14px; font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{t.name}</div><div style={css('font-size:12px; color:#8E8E93;')}>{t.fields} fields · {t.updated}</div></div>
                  </div>
                  <span style={t.chipStyle}>{t.status}</span>
                </div>
                <div style={css('font-size:12.5px; color:#6E6E73; margin-top:12px;')}>Assigned: {t.carriers}</div>
                <div style={css('display:flex; gap:6px; margin-top:14px;')}>
                  <H as="button" onClick={t.onPreview} style={css('flex:1; height:32px; font-size:12.5px; font-weight:600; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Preview</H>
                  <H as="button" onClick={t.onEdit} style={css('flex:1; height:32px; font-size:12.5px; font-weight:600; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Edit Fields</H>
                </div>
              </H>
            ))}
          </div>
        )}

        {v.dsPackages && (
          <div style={css('display:grid; grid-template-columns:repeat(2,1fr); gap:14px;')}>
            {v.packages.map((p: any, i: number) => (
              <div key={i} style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:18px;')}>
                <div style={css('font-size:15px; font-weight:650;')}>{p.name}</div>
                <div style={css('font-size:12.5px; color:#8E8E93; margin-top:3px;')}>{p.count} documents</div>
                <div style={css('display:flex; flex-direction:column; gap:7px; margin:14px 0;')}>
                  {p.docs.map((d: any, j: number) => (
                    <div key={j} style={css('display:flex; align-items:center; gap:9px; font-size:13px; color:#3a3a3c;')}>{v.icCheckTiny}<span>{d.name}</span></div>
                  ))}
                </div>
                <H as="button" onClick={p.onSend} style={css('width:100%; height:38px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>Send Package</H>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===================== COMPLIANCE =====================
  renderCompliance(v: any) {
    return (
      <div style={css('max-width:1240px; margin:0 auto; padding:28px 32px 64px;')}>
        <h1 style={css('margin:0 0 4px; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>Compliance</h1>
        <p style={css('margin:0 0 22px; font-size:14px; color:#6E6E73;')}>Document &amp; compliance readiness across your fleet</p>
        <div style={css('display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:22px;')}>
          {v.compStats.map((s: any, i: number) => (
            <div key={i} style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:16px 18px;')}>
              <div style={css('font-size:13px; color:#6E6E73;')}>{s.label}</div>
              <div style={{ ...css('font-size:28px; font-weight:700; letter-spacing:-0.02em; margin-top:6px;'), color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={css('display:flex; align-items:center; gap:8px; margin-bottom:16px; flex-wrap:wrap;')}>
          {v.compFilters.map((f: any, i: number) => (<button key={i} onClick={f.onClick} style={f.style}>{f.label}</button>))}
        </div>
        {v.compHasSelection && (
          <div style={css('display:flex; align-items:center; gap:12px; padding:10px 16px; background:#1D1D1F; border-radius:12px; margin-bottom:12px; animation:qhSlideUp .2s ease;')}>
            <span style={css('font-size:13px; font-weight:600; color:#fff;')}>{v.compSelCount} selected</span>
            <div style={css('flex:1;')}></div>
            <button onClick={v.bulkRequest} style={css('height:30px; padding:0 12px; font-size:12.5px; font-weight:600; color:#1D1D1F; background:#fff; border:none; border-radius:8px; cursor:pointer;')}>Request Upload</button>
            <button onClick={v.bulkApprove} style={css('height:30px; padding:0 12px; font-size:12.5px; font-weight:600; color:#fff; background:#34C759; border:none; border-radius:8px; cursor:pointer;')}>Approve</button>
            <button onClick={v.clearSelection} style={css('width:30px; height:30px; display:flex; align-items:center; justify-content:center; color:#fff; background:rgba(255,255,255,0.14); border:none; border-radius:8px; cursor:pointer;')}>{v.icXsm}</button>
          </div>
        )}
        <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
          <div style={css('display:grid; grid-template-columns:34px 1.3fr 1.2fr 1.3fr 1fr 1fr 0.9fr 90px; gap:10px; padding:11px 16px; background:#FAFAFA; border-bottom:1px solid rgba(0,0,0,0.06); font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:#8E8E93; align-items:center;')}>
            <span></span><span>Driver</span><span>Carrier</span><span>Document</span><span>Status</span><span>Expiration</span><span>Days Left</span><span style={css('text-align:right;')}>Action</span>
          </div>
          {v.compRows.map((r: any, i: number) => (
            <H key={i} style={css('display:grid; grid-template-columns:34px 1.3fr 1.2fr 1.3fr 1fr 1fr 0.9fr 90px; gap:10px; align-items:center; padding:0 16px; height:52px; border-top:1px solid rgba(0,0,0,0.06); font-size:13px;')} hover={css('background:rgba(0,0,0,0.022);')}>
              <button onClick={r.onToggle} style={{ ...css('width:18px; height:18px; border-radius:5px; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;'), border: `1.5px solid ${r.checkBorder}`, background: r.checkBg }}>{r.check}</button>
              <span style={css('font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{r.driver}</span>
              <span style={css('color:#6E6E73; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{r.carrier}</span>
              <span style={css('white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{r.doc}</span>
              <span><span style={r.chipStyle}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: r.chipDot }}></span>{r.status}</span></span>
              <span style={css('color:#6E6E73;')}>{r.expiry}</span>
              <span style={{ ...css('font-weight:600;'), color: r.daysColor }}>{r.days}</span>
              <span style={css('text-align:right;')}><H as="button" onClick={r.onAction} style={css('height:28px; padding:0 10px; font-size:12px; font-weight:600; color:#1D1D1F; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:8px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>{r.actionLabel}</H></span>
            </H>
          ))}
        </div>
      </div>
    );
  }

  // ===================== MESSAGES =====================
  renderMessages(v: any) {
    const th = v.thread;
    return (
      <div style={css('display:flex; height:100%; overflow-x:auto;')}>
        <div style={css('width:272px; flex:none; border-right:1px solid rgba(0,0,0,0.08); background:#fff; display:flex; flex-direction:column;')}>
          <div style={css('padding:18px 18px 10px;')}><h1 style={css('margin:0; font-size:20px; font-weight:700; letter-spacing:-0.01em;')}>Inbox</h1></div>
          <div style={css('display:flex; gap:6px; padding:0 14px 12px; overflow-x:auto;')}>
            {v.msgFilters.map((f: any, i: number) => (<button key={i} onClick={f.onClick} style={f.style}>{f.label}</button>))}
          </div>
          <div style={css('flex:1; overflow-y:auto;')}>
            {v.threads.map((t: any) => (
              <button key={t.id} onClick={t.onClick} style={t.style}>
                <div style={{ ...css('width:38px; height:38px; border-radius:999px; flex:none; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:650; color:#fff;'), background: t.avatarBg }}>{t.initials}</div>
                <div style={css('flex:1; min-width:0;')}>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; gap:6px;')}><span style={css('font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{t.name}</span><span style={css('font-size:11px; color:#8E8E93; flex:none;')}>{t.age}</span></div>
                  <div style={css('display:flex; align-items:center; gap:6px; margin-top:2px;')}><span style={t.chanStyle}>{t.channel}</span><span style={css('font-size:12px; color:#6E6E73; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{t.preview}</span></div>
                </div>
                {t.unread && (<span style={css('width:8px; height:8px; border-radius:999px; background:#007AFF; flex:none;')}></span>)}
              </button>
            ))}
          </div>
        </div>

        <div style={css('flex:1; min-width:360px; display:flex; flex-direction:column; background:#F5F5F7;')}>
          <div style={css('height:60px; flex:none; display:flex; align-items:center; gap:12px; padding:0 20px; background:rgba(255,255,255,0.82); backdrop-filter:blur(20px); border-bottom:1px solid rgba(0,0,0,0.07);')}>
            <div style={{ ...css('width:34px; height:34px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:650; color:#fff;'), background: th.avatarBg }}>{th.initials}</div>
            <div><div style={css('font-size:14px; font-weight:650;')}>{th.name}</div><div style={css('font-size:12px; color:#8E8E93;')}>{th.sub}</div></div>
          </div>
          <div style={css('flex:1; overflow-y:auto; padding:24px 28px; display:flex; flex-direction:column; gap:12px;')}>
            {th.messages.map((m: any, i: number) => (
              <div key={i} style={m.rowStyle}>
                <div style={m.bubbleStyle}><div style={css('font-size:13.5px; line-height:1.45;')}>{m.text}</div></div>
                <div style={{ ...css('font-size:11px; color:#8E8E93; margin-top:4px;'), ...m.metaAlign }}>{m.meta}</div>
              </div>
            ))}
          </div>
          <div style={css('flex:none; padding:14px 20px 18px; background:rgba(255,255,255,0.82); backdrop-filter:blur(20px); border-top:1px solid rgba(0,0,0,0.07);')}>
            <div style={css('display:flex; gap:6px; margin-bottom:9px;')}>
              {v.channels.map((cn: any, i: number) => (<button key={i} onClick={cn.onClick} style={cn.style}>{cn.label}</button>))}
              <div style={css('flex:1;')}></div>
              <H as="button" onClick={v.pickTemplate} style={css('height:28px; padding:0 11px; font-size:12px; font-weight:600; color:#6E6E73; background:transparent; border:1px solid rgba(0,0,0,0.10); border-radius:8px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Template</H>
            </div>
            <div style={css('display:flex; gap:10px; align-items:flex-end;')}>
              <textarea value={v.composerText} onChange={v.onComposer} placeholder="Write a message…" style={css('flex:1; resize:none; height:44px; max-height:120px; padding:12px 14px; font-family:inherit; font-size:13.5px; background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:12px; outline:none;')}></textarea>
              <H as="button" onClick={v.sendMessage} style={css('width:44px; height:44px; flex:none; display:flex; align-items:center; justify-content:center; background:#007AFF; border:none; border-radius:12px; color:#fff; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icSend}</H>
            </div>
          </div>
        </div>

        <div style={css('width:248px; flex:none; border-left:1px solid rgba(0,0,0,0.08); background:#fff; overflow-y:auto; padding:22px 18px;')}>
          <div style={css('display:flex; flex-direction:column; align-items:center; text-align:center; padding-bottom:16px; border-bottom:1px solid rgba(0,0,0,0.07);')}>
            <div style={{ ...css('width:56px; height:56px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:650; color:#fff;'), background: th.avatarBg }}>{th.initials}</div>
            <div style={css('font-size:15px; font-weight:650; margin-top:10px;')}>{th.name}</div>
            <div style={css('margin-top:7px;')}><span style={th.stageChip}>{th.stage}</span></div>
          </div>
          <div style={css('padding:16px 0; border-bottom:1px solid rgba(0,0,0,0.07);')}>
            <div style={css('font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#8E8E93; margin-bottom:10px;')}>Missing Documents</div>
            {th.missing.map((m: any, i: number) => (
              <div key={i} style={css('display:flex; align-items:center; gap:8px; font-size:13px; padding:5px 0; color:#C62820;')}>{v.icAlertSm3}<span>{m.name}</span></div>
            ))}
          </div>
          <div style={css('display:flex; flex-direction:column; gap:8px; padding-top:16px;')}>
            <H as="button" onClick={v.sendLink} style={css('width:100%; height:36px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:12.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Send Link</H>
            <H as="button" onClick={v.reqDocsMsg} style={css('width:100%; height:36px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:12.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Request Docs</H>
            <H as="button" onClick={v.scheduleCall} style={css('width:100%; height:36px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:12.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Schedule Call</H>
          </div>
        </div>
      </div>
    );
  }

  // ===================== SETTINGS =====================
  renderSettings(v: any) {
    return (
      <div style={css('display:flex; height:100%;')}>
        <div style={css('width:240px; flex:none; border-right:1px solid rgba(0,0,0,0.08); background:#fff; overflow-y:auto; padding:22px 12px;')}>
          <div style={css('padding:0 10px 12px; font-size:20px; font-weight:700; letter-spacing:-0.01em;')}>Settings</div>
          {v.settingsNav.map((s: any, i: number) => (<button key={i} onClick={s.onClick} style={s.style}>{s.label}</button>))}
        </div>
        <div style={css('flex:1; min-width:0; overflow-y:auto; padding:28px 32px;')}>
          {v.setIntegrations && (
            <>
              <h1 style={css('margin:0 0 4px; font-size:24px; font-weight:700; letter-spacing:-0.02em;')}>Integrations</h1>
              <p style={css('margin:0 0 22px; font-size:14px; color:#6E6E73;')}>Connect QuickHire to the tools your team already uses.</p>
              <div style={css('display:grid; grid-template-columns:repeat(2,1fr); gap:14px; max-width:880px;')}>
                {v.integrations.map((it: any, i: number) => (
                  <div key={i} style={css('background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:16px 18px;')}>
                    <div style={css('display:flex; align-items:center; gap:12px;')}>
                      <span style={{ ...css('width:40px; height:40px; flex:none; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#fff;'), background: it.logoBg }}>{it.mark}</span>
                      <div style={css('flex:1; min-width:0;')}><div style={css('font-size:14px; font-weight:650;')}>{it.name}</div><div style={css('display:flex; align-items:center; gap:6px; margin-top:2px;')}><span style={{ ...css('width:7px; height:7px; border-radius:999px;'), background: it.statusDot }}></span><span style={css('font-size:12px; color:#6E6E73;')}>{it.statusText}</span></div></div>
                    </div>
                    <div style={css('display:flex; gap:6px; margin-top:14px;')}>
                      <button onClick={it.onPrimary} style={it.primaryStyle}>{it.primaryLabel}</button>
                      <H as="button" onClick={it.onTest} style={css('flex:none; height:32px; padding:0 12px; font-size:12.5px; font-weight:600; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Test</H>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {v.setGeneric && (
            <>
              <h1 style={css('margin:0 0 4px; font-size:24px; font-weight:700; letter-spacing:-0.02em;')}>{v.settingsTitle}</h1>
              <p style={css('margin:0 0 22px; font-size:14px; color:#6E6E73;')}>{v.settingsDesc}</p>
              <div style={css('max-width:680px; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; overflow:hidden;')}>
                {v.settingsForm.map((f: any, i: number) => (
                  <div key={i} style={css('display:flex; align-items:center; gap:16px; padding:16px 18px; border-top:1px solid rgba(0,0,0,0.06);')}>
                    <div style={css('flex:1; min-width:0;')}><div style={css('font-size:13.5px; font-weight:600;')}>{f.label}</div><div style={css('font-size:12.5px; color:#8E8E93; margin-top:2px;')}>{f.desc}</div></div>
                    {f.isToggle && (<button onClick={f.onToggle} style={f.toggleTrack}><span style={f.toggleKnob}></span></button>)}
                    {f.isValue && (<span style={css('font-size:13px; font-weight:600; color:#6E6E73;')}>{f.value}</span>)}
                  </div>
                ))}
              </div>
              <H as="button" onClick={v.saveSettings} style={css('margin-top:18px; height:38px; padding:0 18px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>Save Changes</H>
            </>
          )}
        </div>
      </div>
    );
  }

  // ===================== DRIVERS / TRUCKS =====================
  renderDrivers(v: any) {
    return (
      <div style={css('max-width:1240px; margin:0 auto; padding:28px 32px 64px;')}>
        <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px;')}>
          <div><h1 style={css('margin:0; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>Drivers</h1><p style={css('margin:6px 0 0; font-size:14px; color:#6E6E73;')}>{v.driverSubtitle}</p></div>
          <H as="button" onClick={v.addDriver} style={css('display:flex; align-items:center; gap:7px; height:38px; padding:0 14px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icPlus}<span>{v.addDriverLabel}</span></H>
        </div>
        <div style={css('display:inline-flex; gap:2px; padding:3px; background:#F2F2F7; border-radius:10px; margin-bottom:16px;')}>
          {v.driverSeg.map((s: any, i: number) => (<button key={i} onClick={s.onClick} style={s.style}>{s.label}</button>))}
        </div>
        {v.showDrivers && (
          <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; overflow:hidden;')}>
            <div style={css('display:grid; grid-template-columns:1.4fr 1.3fr 1fr 1.1fr 0.8fr 1fr 1.1fr 70px; gap:10px; padding:11px 18px; background:#FAFAFA; border-bottom:1px solid rgba(0,0,0,0.06); font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:#8E8E93;')}>
              <span>Driver</span><span>Carrier</span><span>CDL</span><span>Medical Exp</span><span>Truck</span><span>Status</span><span>Compliance</span><span style={css('text-align:right;')}>Actions</span>
            </div>
            {v.driverRows.map((r: any, i: number) => (
              <H key={i} style={css('display:grid; grid-template-columns:1.4fr 1.3fr 1fr 1.1fr 0.8fr 1fr 1.1fr 70px; gap:10px; align-items:center; padding:0 18px; height:52px; border-top:1px solid rgba(0,0,0,0.06); font-size:13px;')} hover={css('background:rgba(0,0,0,0.022);')}>
                <div style={css('display:flex; align-items:center; gap:10px; min-width:0;')}><span style={{ ...css('width:30px; height:30px; border-radius:999px; flex:none; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:650; color:#fff;'), background: r.avatarBg }}>{r.initials}</span><span style={css('font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{r.name}</span></div>
                <span style={css('color:#6E6E73; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{r.carrier}</span>
                <span style={css('color:#3a3a3c;')}>{r.cdl}</span>
                <span style={{ color: r.medColor }}>{r.med}</span>
                <span style={css('color:#3a3a3c;')}>{r.truck}</span>
                <span><span style={r.statusChip}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: r.statusDot }}></span>{r.status}</span></span>
                <span><span style={r.compChip}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: r.compDot }}></span>{r.comp}</span></span>
                <span style={css('text-align:right;')}><H as="button" onClick={r.onView} title="View" style={css('width:30px; height:30px; display:flex; align-items:center; justify-content:center; margin-left:auto; background:transparent; border:none; border-radius:8px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.06);')}>{v.icChevRight}</H></span>
              </H>
            ))}
          </div>
        )}
        {v.showTrucks && (
          <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; overflow:hidden;')}>
            <div style={css('display:grid; grid-template-columns:0.7fr 1.2fr 1.2fr 1fr 1fr 1fr 1fr 70px; gap:10px; padding:11px 18px; background:#FAFAFA; border-bottom:1px solid rgba(0,0,0,0.06); font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:#8E8E93;')}>
              <span>Unit</span><span>Carrier</span><span>Driver</span><span>Status</span><span>Registration</span><span>Inspection</span><span>Insurance</span><span style={css('text-align:right;')}>Actions</span>
            </div>
            {v.truckRows.map((r: any, i: number) => (
              <H key={i} style={css('display:grid; grid-template-columns:0.7fr 1.2fr 1.2fr 1fr 1fr 1fr 1fr 70px; gap:10px; align-items:center; padding:0 18px; height:52px; border-top:1px solid rgba(0,0,0,0.06); font-size:13px;')} hover={css('background:rgba(0,0,0,0.022);')}>
                <span style={css('font-weight:700;')}>#{r.unit}</span>
                <span style={css('color:#6E6E73; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{r.carrier}</span>
                <span style={css('white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{r.driver}</span>
                <span><span style={r.statusChip}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: r.statusDot }}></span>{r.status}</span></span>
                <span style={{ color: r.regColor }}>{r.reg}</span>
                <span style={{ color: r.inspColor }}>{r.insp}</span>
                <span style={{ color: r.insColor }}>{r.ins}</span>
                <span style={css('text-align:right;')}><H as="button" onClick={r.onView} title="View" style={css('width:30px; height:30px; display:flex; align-items:center; justify-content:center; margin-left:auto; background:transparent; border:none; border-radius:8px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.06);')}>{v.icChevRight}</H></span>
              </H>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===================== CARRIERS =====================
  renderCarriers(v: any) {
    return (
      <>
        {v.carrierList && (
          <div style={css('max-width:1100px; margin:0 auto; padding:28px 32px 64px;')}>
            <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px;')}>
              <div><h1 style={css('margin:0; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>Carriers</h1><p style={css('margin:6px 0 0; font-size:14px; color:#6E6E73;')}>4 carriers · 1 pending authority</p></div>
              <H as="button" onClick={v.inviteCarrier} style={css('display:flex; align-items:center; gap:7px; height:38px; padding:0 14px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icPlus}<span>Invite Carrier</span></H>
            </div>
            <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px; margin-bottom:18px;')}>
              <div style={css('font-size:13px; font-weight:650; margin-bottom:4px;')}>Look Up DOT / MC</div>
              <div style={css('font-size:12.5px; color:#8E8E93; margin-bottom:12px;')}>Pull verified carrier details from FMCSA before adding.</div>
              <div style={css('display:flex; gap:10px;')}>
                <input value={v.dotLookup} onChange={v.onDotLookup} placeholder="Enter DOT number, e.g. 1234567" style={css('flex:1; height:40px; padding:0 14px; font-size:13.5px; font-family:inherit; background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:12px; outline:none;')} />
                <H as="button" onClick={v.lookupDot} style={css('display:flex; align-items:center; gap:7px; height:40px; padding:0 16px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icRefresh}Look Up</H>
              </div>
            </div>
            <div style={css('display:grid; grid-template-columns:repeat(2,1fr); gap:14px;')}>
              {v.carrierCards.map((c: any, i: number) => (
                <H as="button" key={i} onClick={c.onClick} style={css('text-align:left; cursor:pointer; background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px; transition:box-shadow .18s, transform .18s;')} hover={css('box-shadow:0 8px 24px rgba(0,0,0,0.08); transform:translateY(-1px);')}>
                  <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:10px;')}>
                    <div style={css('display:flex; align-items:center; gap:11px; min-width:0;')}><span style={css('width:40px; height:40px; flex:none; border-radius:10px; background:rgba(0,122,255,0.10); color:#007AFF; display:flex; align-items:center; justify-content:center;')}>{v.icCarrier}</span><div style={css('min-width:0;')}><div style={css('font-size:14.5px; font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{c.name}</div><div style={css('font-size:12px; color:#8E8E93;')}>DOT {c.dot} · {c.mc}</div></div></div>
                    <span style={c.authChip}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: c.authDot }}></span>{c.auth}</span>
                  </div>
                  <div style={css('margin-top:16px;')}>
                    <div style={css('display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;')}><span style={css('color:#6E6E73;')}>Profile completeness</span><span style={css('font-weight:600;')}>{c.complete}%</span></div>
                    <div style={css('height:7px; background:#F2F2F7; border-radius:999px; overflow:hidden;')}><div style={{ ...css('height:100%; border-radius:999px;'), width: c.complete + '%', background: c.completeColor }}></div></div>
                  </div>
                </H>
              ))}
            </div>
          </div>
        )}
        {v.carrierProfile && (
          <div style={css('max-width:1100px; margin:0 auto; padding:24px 32px 64px;')}>
            <button onClick={v.backToCarriers} style={css('display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#007AFF; background:none; border:none; cursor:pointer; padding:0; margin-bottom:16px;')}>{v.icBack}Carriers</button>
            <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:16px;')}>
              <div style={css('display:flex; align-items:center; gap:14px;')}>
                <span style={css('width:54px; height:54px; flex:none; border-radius:13px; background:rgba(0,122,255,0.10); color:#007AFF; display:flex; align-items:center; justify-content:center;')}>{v.icCarrierLg}</span>
                <div>
                  <h1 style={css('margin:0; font-size:24px; font-weight:700; letter-spacing:-0.02em;')}>{v.cp.name}</h1>
                  <div style={css('display:flex; align-items:center; gap:10px; margin-top:6px;')}><span style={css('font-size:13px; color:#6E6E73;')}>DOT {v.cp.dot} · {v.cp.mc}</span><span style={v.cp.authChip}><span style={{ ...css('width:6px; height:6px; border-radius:999px;'), background: v.cp.authDot }}></span>{v.cp.auth}</span></div>
                </div>
              </div>
              <div style={css('display:flex; gap:8px;')}>
                <H as="button" onClick={v.cpEdit} style={css('height:36px; padding:0 14px; background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:10px; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Edit</H>
                <H as="button" onClick={v.cpAddContact} style={css('height:36px; padding:0 14px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>Add Contact</H>
              </div>
            </div>
            <div style={css('display:flex; gap:2px; margin:20px 0 22px; border-bottom:1px solid rgba(0,0,0,0.08); overflow-x:auto;')}>
              {v.carrierTabs.map((t: any, i: number) => (<button key={i} onClick={t.onClick} style={t.style}>{t.label}</button>))}
            </div>
            <div style={css('display:grid; grid-template-columns:1.4fr 1fr; gap:16px; align-items:start;')}>
              <div style={css('display:flex; flex-direction:column; gap:16px;')}>
                <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
                  <div style={css('font-size:13px; font-weight:650; margin-bottom:14px;')}>Carrier Details</div>
                  {v.cp.details.map((d: any, i: number) => (
                    <div key={i} style={css('display:flex; justify-content:space-between; gap:12px; padding:9px 0; font-size:13.5px; border-top:1px solid rgba(0,0,0,0.05);')}><span style={css('color:#8E8E93;')}>{d.label}</span><span style={css('font-weight:550; text-align:right;')}>{d.value}</span></div>
                  ))}
                </div>
                <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
                  <div style={css('font-size:13px; font-weight:650; margin-bottom:6px;')}>Requirements</div>
                  {v.cp.requirements.map((rq: any, i: number) => (
                    <div key={i} style={css('display:flex; align-items:center; gap:11px; padding:11px 0; border-top:1px solid rgba(0,0,0,0.05);')}><span style={{ color: rq.color, display: 'flex' }}>{rq.icon}</span><span style={css('flex:1; font-size:13.5px;')}>{rq.name}</span><span style={rq.chip}>{rq.status}</span></div>
                  ))}
                </div>
              </div>
              <div style={css('display:flex; flex-direction:column; gap:16px;')}>
                <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
                  <div style={css('font-size:13px; font-weight:650; margin-bottom:12px;')}>Completeness</div>
                  <div style={css('display:flex; align-items:flex-end; gap:8px;')}><span style={css('font-size:36px; font-weight:700; letter-spacing:-0.02em; line-height:1; color:#248A3D;')}>{v.cp.complete}%</span></div>
                  <div style={css('height:7px; background:#F2F2F7; border-radius:999px; overflow:hidden; margin-top:12px;')}><div style={{ ...css('height:100%; background:#34C759; border-radius:999px;'), width: v.cp.complete + '%' }}></div></div>
                </div>
                <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;')}><span style={css('font-size:13px; font-weight:650;')}>Contacts</span><button onClick={v.cpAddContact} style={css('font-size:12px; font-weight:600; color:#007AFF; background:none; border:none; cursor:pointer;')}>Add</button></div>
                  {v.cp.contacts.map((ct: any, i: number) => (
                    <div key={i} style={css('display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px solid rgba(0,0,0,0.05);')}><span style={{ ...css('width:30px; height:30px; border-radius:999px; flex:none; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:650; color:#fff;'), background: ct.color }}>{ct.initials}</span><div style={css('min-width:0;')}><div style={css('font-size:13px; font-weight:600;')}>{ct.name}</div><div style={css('font-size:11.5px; color:#8E8E93;')}>{ct.role}</div></div></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ===================== REPORTS =====================
  renderReports(v: any) {
    return (
      <div style={css('max-width:1240px; margin:0 auto; padding:28px 32px 64px;')}>
        <h1 style={css('margin:0 0 4px; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>Reports</h1>
        <p style={css('margin:0 0 22px; font-size:14px; color:#6E6E73;')}>Recruiting and compliance performance · Last 90 days</p>
        <div style={css('display:grid; grid-template-columns:1.3fr 1fr; gap:16px; align-items:start;')}>
          <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
            <div style={css('font-size:15px; font-weight:650; margin-bottom:16px;')}>Hiring Funnel</div>
            {v.funnel.map((f: any, i: number) => (
              <div key={i} style={css('margin-bottom:12px;')}>
                <div style={css('display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px;')}><span style={css('color:#3a3a3c;')}>{f.label}</span><span style={css('font-weight:600; color:#6E6E73;')}>{f.count}</span></div>
                <div style={css('height:10px; background:#F2F2F7; border-radius:999px; overflow:hidden;')}><div style={{ ...css('height:100%; border-radius:999px;'), width: f.pct + '%', background: f.color }}></div></div>
              </div>
            ))}
          </div>
          <div style={css('display:flex; flex-direction:column; gap:16px;')}>
            <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
              <div style={css('font-size:13px; font-weight:650; color:#6E6E73; margin-bottom:6px;')}>Avg. Time to Hire</div>
              <div style={css('display:flex; align-items:flex-end; gap:8px;')}><span style={css('font-size:38px; font-weight:700; letter-spacing:-0.02em; line-height:1;')}>14</span><span style={css('font-size:14px; color:#6E6E73; padding-bottom:5px;')}>days</span><span style={css('font-size:12px; font-weight:600; color:#248A3D; padding-bottom:6px;')}>↓ 3 days</span></div>
              <div style={css('display:flex; align-items:flex-end; gap:5px; height:48px; margin-top:14px;')}>
                {v.tthBars.map((b: any, i: number) => (<div key={i} style={{ ...css('flex:1; border-radius:4px 4px 0 0;'), background: b.color, height: b.h + '%' }}></div>))}
              </div>
            </div>
            <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
              <div style={css('font-size:13px; font-weight:650; margin-bottom:14px;')}>DocuSign Completion</div>
              <div style={css('display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:6px;')}><span style={css('color:#6E6E73;')}>Signed within 48h</span><span style={css('font-weight:600;')}>78%</span></div>
              <div style={css('height:10px; background:#F2F2F7; border-radius:999px; overflow:hidden;')}><div style={css('height:100%; width:78%; background:#007AFF; border-radius:999px;')}></div></div>
            </div>
          </div>
        </div>
        <div style={css('display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:16px; align-items:start;')}>
          <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px;')}>
            <div style={css('font-size:14px; font-weight:650; margin-bottom:16px;')}>Recruiter Performance</div>
            {v.recruiters.map((r: any, i: number) => (
              <div key={i} style={css('margin-bottom:13px;')}>
                <div style={css('display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px;')}><span>{r.name}</span><span style={css('font-weight:600; color:#6E6E73;')}>{r.hires} hires</span></div>
                <div style={css('height:8px; background:#F2F2F7; border-radius:999px; overflow:hidden;')}><div style={{ ...css('height:100%; background:#007AFF; border-radius:999px;'), width: r.pct + '%' }}></div></div>
              </div>
            ))}
          </div>
          <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px; display:flex; flex-direction:column; align-items:center;')}>
            <div style={css('font-size:14px; font-weight:650; align-self:flex-start; margin-bottom:8px;')}>Candidate Sources</div>
            <div style={css('position:relative;')}>{v.sourcesDonut}<div style={css('position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;')}><div style={css('font-size:22px; font-weight:700;')}>142</div><div style={css('font-size:11px; color:#8E8E93;')}>candidates</div></div></div>
            <div style={css('display:flex; flex-direction:column; gap:6px; width:100%; margin-top:14px;')}>
              {v.sources.map((s: any, i: number) => (
                <div key={i} style={css('display:flex; align-items:center; gap:8px; font-size:12px;')}><span style={{ ...css('width:9px; height:9px; border-radius:3px;'), background: s.color }}></span><span style={css('flex:1; color:#3a3a3c;')}>{s.label}</span><span style={css('font-weight:600; color:#6E6E73;')}>{s.pct}%</span></div>
              ))}
            </div>
          </div>
          <div style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:18px; display:flex; flex-direction:column; align-items:center;')}>
            <div style={css('font-size:14px; font-weight:650; align-self:flex-start; margin-bottom:8px;')}>Compliance Readiness</div>
            <div style={css('position:relative; margin-top:6px;')}>{v.complianceDonut}<div style={css('position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;')}><div style={css('font-size:26px; font-weight:700; color:#248A3D;')}>86%</div><div style={css('font-size:11px; color:#8E8E93;')}>ready</div></div></div>
            <div style={css('font-size:12.5px; color:#6E6E73; text-align:center; margin-top:14px; line-height:1.5;')}>11 of 18 active candidates are<br />fully compliant and ready.</div>
          </div>
        </div>
      </div>
    );
  }

  // ===================== INTEGRATIONS (page) =====================
  renderIntegrationsPage(v: any) {
    return (
      <div style={css('max-width:1000px; margin:0 auto; padding:28px 32px 64px;')}>
        <h1 style={css('margin:0 0 4px; font-size:28px; font-weight:700; letter-spacing:-0.02em;')}>Integrations</h1>
        <p style={css('margin:0 0 22px; font-size:14px; color:#6E6E73;')}>Connect QuickHire to the tools your team already uses.</p>
        <div style={css('display:grid; grid-template-columns:repeat(2,1fr); gap:14px;')}>
          {v.integrations.map((it: any, i: number) => (
            <div key={i} style={css('background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:14px; padding:16px 18px;')}>
              <div style={css('display:flex; align-items:center; gap:12px;')}>
                <span style={{ ...css('width:40px; height:40px; flex:none; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#fff;'), background: it.logoBg }}>{it.mark}</span>
                <div style={css('flex:1; min-width:0;')}><div style={css('font-size:14px; font-weight:650;')}>{it.name}</div><div style={css('display:flex; align-items:center; gap:6px; margin-top:2px;')}><span style={{ ...css('width:7px; height:7px; border-radius:999px;'), background: it.statusDot }}></span><span style={css('font-size:12px; color:#6E6E73;')}>{it.statusText}</span></div></div>
              </div>
              <div style={css('display:flex; gap:6px; margin-top:14px;')}>
                <button onClick={it.onPrimary} style={it.primaryStyle}>{it.primaryLabel}</button>
                <H as="button" onClick={it.onTest} style={css('flex:none; height:32px; padding:0 12px; font-size:12.5px; font-weight:600; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Test</H>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===================== DOCUSIGN BUILDER (full-screen) =====================
  renderBuilder(v: any) {
    return (
      <div style={css('position:fixed; inset:0; z-index:60; background:#F5F5F7; display:flex; flex-direction:column;')}>
        <div style={css('height:58px; flex:none; display:flex; align-items:center; gap:14px; padding:0 18px; background:#fff; border-bottom:1px solid rgba(0,0,0,0.08);')}>
          <H as="button" onClick={v.closeBuilder} style={css('width:34px; height:34px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; border-radius:9px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.05);')}>{v.icXsm}</H>
          <div><div style={css('font-size:14px; font-weight:650;')}>Company Driver Agreement</div><div style={css('font-size:12px; color:#8E8E93;')}>Sarah Chen · GRAND ONE LLC</div></div>
          <div style={css('flex:1;')}></div>
          <H as="button" onClick={v.builderPreview} style={css('height:36px; padding:0 14px; font-size:13px; font-weight:600; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Preview</H>
          <H as="button" onClick={v.builderSaveDraft} style={css('height:36px; padding:0 14px; font-size:13px; font-weight:600; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:9px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Save Draft</H>
          <H as="button" onClick={v.builderSend} style={css('height:36px; padding:0 16px; font-size:13px; font-weight:600; background:#007AFF; border:none; border-radius:9px; color:#fff; cursor:pointer;')} hover={css('background:#0066D6;')}>Send</H>
        </div>
        <div style={css('flex:1; display:flex; min-height:0;')}>
          <div style={css('width:240px; flex:none; border-right:1px solid rgba(0,0,0,0.08); background:#fff; overflow-y:auto; padding:18px 14px;')}>
            <div style={css('font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#8E8E93; margin-bottom:10px;')}>Field Tools</div>
            <div style={css('display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:22px;')}>
              {v.builderTools.map((t: any, i: number) => (<button key={i} onClick={t.onClick} style={t.style}>{t.icon}<span style={css('font-size:11.5px; font-weight:600;')}>{t.label}</span></button>))}
            </div>
            <div style={css('font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#8E8E93; margin-bottom:10px;')}>Auto-Fill Groups</div>
            {v.autofillGroups.map((g: any, i: number) => (
              <div key={i} style={css('margin-bottom:6px;')}>
                <div style={css('font-size:12.5px; font-weight:650; padding:7px 8px; color:#1D1D1F;')}>{g.name}</div>
                {g.fields.map((f: any, j: number) => (
                  <H as="button" key={j} onClick={f.onClick} style={css('display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:6px 8px; font-size:12.5px; background:transparent; border:none; border-radius:7px; cursor:pointer; color:#3a3a3c;')} hover={css('background:rgba(0,0,0,0.04);')}><span style={{ ...css('width:7px; height:7px; border-radius:999px;'), background: f.dot }}></span>{f.label}</H>
                ))}
              </div>
            ))}
          </div>

          <div style={css('flex:1; min-width:0; overflow:auto; padding:28px; display:flex; justify-content:center;')}>
            <div onClick={v.placeField} style={{ ...css('width:680px; min-height:880px; background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:6px; box-shadow:0 8px 30px rgba(0,0,0,0.08); padding:54px 60px; position:relative;'), cursor: v.docCursor }}>
              <div style={css('font-size:19px; font-weight:700; text-align:center; margin-bottom:4px;')}>COMPANY DRIVER AGREEMENT</div>
              <div style={css('font-size:12px; color:#8E8E93; text-align:center; margin-bottom:28px;')}>GRAND ONE LLC · DOT 1234567</div>
              <div style={css('font-size:12.5px; color:#48484A; line-height:1.9;')}>This Company Driver Agreement ("Agreement") is entered into between GRAND ONE LLC ("Carrier") and the driver named below ("Driver"). The Driver agrees to operate commercial motor vehicles in compliance with all FMCSA regulations and company safety policies.</div>
              <div style={css('height:14px;')}></div>
              <div style={css('font-size:12.5px; color:#48484A; line-height:1.9;')}>Driver Name: ________________________  CDL #: ________________  State: ______</div>
              <div style={css('height:8px;')}></div>
              <div style={css('font-size:12.5px; color:#48484A; line-height:1.9;')}>The Driver acknowledges receipt of the company handbook and agrees to the terms of compensation, hours-of-service rules, and equipment use policies set forth herein.</div>
              <div style={css('height:120px;')}></div>
              <div style={css('font-size:12.5px; color:#48484A; line-height:1.9;')}>Driver Signature: ____________________________   Date: ____________</div>
              {v.placedFields.map((f: any, i: number) => (<div key={i} onClick={f.onSelect} style={f.style}>{f.label}</div>))}
              {v.builderHint && (
                <div style={css('position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; pointer-events:none;')}>
                  <div style={css('font-size:13px; color:#007AFF; font-weight:600; background:rgba(0,122,255,0.08); padding:8px 14px; border-radius:10px;')}>Click on the document to place a {v.activeToolLabel} field</div>
                </div>
              )}
            </div>
          </div>

          <div style={css('width:280px; flex:none; border-left:1px solid rgba(0,0,0,0.08); background:#fff; overflow-y:auto; padding:18px 16px;')}>
            <div style={css('font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#8E8E93; margin-bottom:10px;')}>Recipients</div>
            {v.recipients.map((r: any, i: number) => (
              <div key={i} style={css('display:flex; align-items:center; gap:9px; padding:9px 10px; background:#F9FAFB; border:1px solid rgba(0,0,0,0.06); border-radius:10px; margin-bottom:7px;')}>
                <span style={{ ...css('width:26px; height:26px; border-radius:999px; flex:none; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:650; color:#fff;'), background: r.color }}>{r.initials}</span>
                <div style={css('flex:1; min-width:0;')}><div style={css('font-size:12.5px; font-weight:600;')}>{r.name}</div><div style={css('font-size:11px; color:#8E8E93;')}>{r.role}</div></div>
              </div>
            ))}
            <div style={css('border-top:1px solid rgba(0,0,0,0.07); margin:14px 0; padding-top:14px;')}>
              <div style={css('font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#8E8E93; margin-bottom:12px;')}>Field Inspector</div>
              {v.hasSelectedField && (
                <>
                  <div style={css('font-size:13px; font-weight:650; margin-bottom:12px;')}>{v.selectedField.label}</div>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; padding:9px 0;')}><span style={css('font-size:12.5px; color:#6E6E73;')}>Required</span><button onClick={v.toggleReq} style={v.reqToggle}><span style={v.reqKnob}></span></button></div>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; padding:9px 0;')}><span style={css('font-size:12.5px; color:#6E6E73;')}>Editable by signer</span><button onClick={v.toggleEdit} style={v.editToggle}><span style={v.editKnob}></span></button></div>
                  <div style={css('display:flex; align-items:center; justify-content:space-between; padding:9px 0;')}><span style={css('font-size:12.5px; color:#6E6E73;')}>Locked</span><button onClick={v.toggleLock} style={v.lockToggle}><span style={v.lockKnob}></span></button></div>
                </>
              )}
              {v.noSelectedField && (
                <div style={css('font-size:12.5px; color:#8E8E93; line-height:1.5;')}>Select a placed field to edit its properties, or pick an auto-fill value to drop it on the document.</div>
              )}
            </div>
            <div style={css('border-top:1px solid rgba(0,0,0,0.07); padding-top:14px;')}>
              <div style={css('font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#8E8E93; margin-bottom:8px;')}>Legend</div>
              {v.legend.map((l: any, i: number) => (
                <div key={i} style={css('display:flex; align-items:center; gap:8px; font-size:12px; color:#6E6E73; padding:3px 0;')}><span style={{ ...css('width:12px; height:12px; border-radius:4px;'), background: l.color }}></span>{l.label}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===================== MISSING FIELDS SHEET =====================
  renderMissingSheet(v: any) {
    return (
      <div onClick={v.closeMissing} style={css('position:fixed; inset:0; z-index:70; background:rgba(0,0,0,0.24); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; animation:qhFade .18s ease;')}>
        <div onClick={v.stop} style={css('width:440px; max-width:92vw; background:#fff; border-radius:18px; box-shadow:0 30px 80px rgba(0,0,0,0.3); padding:24px;')}>
          <div style={css('display:flex; align-items:center; gap:11px; margin-bottom:6px;')}><span style={css('width:38px; height:38px; border-radius:10px; background:rgba(255,159,10,0.14); color:#FF9F0A; display:flex; align-items:center; justify-content:center;')}>{v.icAlert}</span><h2 style={css('margin:0; font-size:18px; font-weight:650;')}>Some fields are missing</h2></div>
          <p style={css('margin:8px 0 14px; font-size:13.5px; color:#6E6E73; line-height:1.5;')}>These auto-fill values aren't available yet. You can fill them in now or let the driver complete them.</p>
          <div style={css('background:#F9FAFB; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:6px 14px; margin-bottom:18px;')}>
            {v.missingFields.map((m: any, i: number) => (
              <div key={i} style={css('display:flex; align-items:center; gap:9px; padding:9px 0; font-size:13px; border-bottom:1px solid rgba(0,0,0,0.05);')}>{v.icAlertSm4}<span style={css('font-weight:550;')}>{m.name}</span></div>
            ))}
          </div>
          <div style={css('display:flex; gap:8px;')}>
            <H as="button" onClick={v.fillNow} style={css('flex:1; height:40px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>Fill Now</H>
            <H as="button" onClick={v.letDriver} style={css('flex:1; height:40px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Let Driver Complete</H>
          </div>
        </div>
      </div>
    );
  }

  // ===================== TASK DRAWER =====================
  renderTaskDrawer(v: any) {
    return (
      <>
        <div onClick={v.closeTasks} style={css('position:fixed; inset:0; z-index:65; background:rgba(0,0,0,0.24); backdrop-filter:blur(3px); animation:qhFade .18s ease;')}></div>
        <aside onClick={v.stop} style={css('position:fixed; top:0; right:0; bottom:0; width:380px; max-width:92vw; z-index:66; background:rgba(255,255,255,0.92); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border-left:1px solid rgba(0,0,0,0.08); box-shadow:-12px 0 40px rgba(0,0,0,0.12); display:flex; flex-direction:column;')}>
          <div style={css('display:flex; align-items:center; justify-content:space-between; padding:18px 18px 12px; flex:none;')}>
            <div><div style={css('font-size:18px; font-weight:700; letter-spacing:-0.01em;')}>Tasks</div><div style={css('font-size:12.5px; color:#6E6E73; margin-top:2px;')}>Today · {v.taskTodayCount}</div></div>
            <div style={css('display:flex; align-items:center; gap:6px;')}>
              <H as="button" onClick={v.newTask} style={css('display:flex; align-items:center; gap:6px; height:32px; padding:0 12px; background:#007AFF; border:none; border-radius:9px; color:#fff; font-size:12.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>{v.icPlusSm}New Task</H>
              <H as="button" onClick={v.closeTasks} style={css('width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; border-radius:8px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.06);')}>{v.icXsm}</H>
            </div>
          </div>
          <div style={css('padding:0 16px 12px; flex:none;')}>
            <div style={css('display:flex; gap:2px; padding:3px; background:#F2F2F7; border-radius:10px;')}>
              {v.taskSeg.map((s: any, i: number) => (<button key={i} onClick={s.onClick} style={s.style}>{s.label}</button>))}
            </div>
          </div>
          <div style={css('flex:1; overflow-y:auto; padding:4px 16px 24px;')}>
            {v.taskGroups.map((g: any, i: number) => (
              <div key={i} style={css('margin-bottom:18px;')}>
                <div style={css('display:flex; align-items:center; gap:8px; padding:6px 4px;')}><span style={{ ...css('font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;'), color: g.color }}>{g.label}</span><span style={css('font-size:11px; font-weight:600; color:#8E8E93;')}>{g.count}</span></div>
                {g.tasks.map((t: any) => (
                  <H key={t.id} onClick={t.onClick} style={css('display:flex; align-items:flex-start; gap:11px; width:100%; text-align:left; padding:11px 12px; margin-bottom:7px; background:#fff; border:1px solid rgba(0,0,0,0.07); border-radius:12px; cursor:pointer;')} hover={css('box-shadow:0 4px 14px rgba(0,0,0,0.07);')}>
                    <button onClick={t.onComplete} title="Complete" style={{ ...css('width:18px; height:18px; margin-top:1px; flex:none; border-radius:999px; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;'), border: `1.5px solid ${t.checkBorder}`, background: t.checkBg }}>{t.check}</button>
                    <div style={css('flex:1; min-width:0;')}>
                      <div style={css('display:flex; align-items:center; gap:7px;')}><span style={{ ...css('width:7px; height:7px; border-radius:999px; flex:none;'), background: t.prioDot }}></span><span style={{ ...css('font-size:13px; font-weight:600;'), ...t.titleStyle }}>{t.title}</span></div>
                      <div style={css('font-size:11.5px; color:#8E8E93; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{t.related}</div>
                      {t.isAuto && (<span style={css('display:inline-flex; align-items:center; gap:4px; margin-top:6px; font-size:10.5px; font-weight:600; color:#5856D6; background:rgba(88,86,214,0.10); border-radius:6px; padding:2px 7px;')}>{v.icBolt}Auto</span>)}
                    </div>
                    <div style={css('display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex:none;')}><span style={{ ...css('font-size:11px;'), color: t.dueColor }}>{t.due}</span><span style={{ ...css('width:22px; height:22px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:9.5px; font-weight:650; color:#fff;'), background: t.assigneeColor }}>{t.assignee}</span></div>
                  </H>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </>
    );
  }

  // ===================== TASK DETAIL SHEET =====================
  renderTaskDetail(v: any) {
    const td = v.td;
    return (
      <div onClick={v.closeTaskDetail} style={css('position:fixed; inset:0; z-index:75; background:rgba(0,0,0,0.24); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; animation:qhFade .16s ease;')}>
        <div onClick={v.stop} style={css('width:480px; max-width:92vw; max-height:86vh; overflow-y:auto; background:#fff; border-radius:18px; box-shadow:0 30px 80px rgba(0,0,0,0.3);')}>
          <div style={css('display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:22px 22px 0;')}>
            <div style={css('display:flex; align-items:flex-start; gap:10px;')}><span style={{ ...css('width:9px; height:9px; border-radius:999px; margin-top:7px; flex:none;'), background: td.prioDot }}></span><h2 style={css('margin:0; font-size:18px; font-weight:650; letter-spacing:-0.01em;')}>{td.title}</h2></div>
            <H as="button" onClick={v.closeTaskDetail} style={css('width:32px; height:32px; flex:none; display:flex; align-items:center; justify-content:center; background:transparent; border:none; border-radius:8px; color:#6E6E73; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.06);')}>{v.icXsm}</H>
          </div>
          <div style={css('padding:16px 22px;')}>
            <div style={css('display:grid; grid-template-columns:1fr 1fr; gap:10px 16px; margin-bottom:16px;')}>
              {td.meta.map((m: any, i: number) => (
                <div key={i}><div style={css('font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:#8E8E93; margin-bottom:4px;')}>{m.label}</div>{m.isChip && (<span style={m.chip}>{m.value}</span>)}{m.isText && (<div style={css('font-size:13.5px; font-weight:550;')}>{m.value}</div>)}</div>
              ))}
            </div>
            <div style={css('font-size:11px; font-weight:600; letter-spacing:0.03em; text-transform:uppercase; color:#8E8E93; margin-bottom:6px;')}>Description</div>
            <p style={css('margin:0 0 16px; font-size:13.5px; color:#3a3a3c; line-height:1.55;')}>{td.description}</p>
            <div style={css('display:flex; gap:8px; flex-wrap:wrap;')}>
              <button onClick={td.complete} style={css('display:flex; align-items:center; gap:6px; height:38px; padding:0 14px; background:#34C759; border:none; border-radius:10px; color:#fff; font-size:13px; font-weight:600; cursor:pointer;')}>{v.icCheckTiny}Complete</button>
              <H as="button" onClick={td.snooze} style={css('height:38px; padding:0 14px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Snooze</H>
              <H as="button" onClick={td.reassign} style={css('height:38px; padding:0 14px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Reassign</H>
              <H as="button" onClick={td.openCand} style={css('height:38px; padding:0 14px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:13px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Open Candidate</H>
              <H as="button" onClick={td.del} style={css('height:38px; padding:0 14px; background:transparent; border:none; border-radius:10px; color:#C62820; font-size:13px; font-weight:600; cursor:pointer; margin-left:auto;')} hover={css('background:rgba(255,59,48,0.06);')}>Delete</H>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===================== FMCSA REVIEW SHEET =====================
  renderDotSheet(v: any) {
    return (
      <div onClick={v.closeDotSheet} style={css('position:fixed; inset:0; z-index:75; background:rgba(0,0,0,0.24); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; animation:qhFade .16s ease;')}>
        <div onClick={v.stop} style={css('width:440px; max-width:92vw; background:#fff; border-radius:18px; box-shadow:0 30px 80px rgba(0,0,0,0.3); padding:24px;')}>
          <div style={css('display:flex; align-items:center; gap:11px; margin-bottom:4px;')}><span style={css('width:38px; height:38px; border-radius:10px; background:rgba(0,122,255,0.10); color:#007AFF; display:flex; align-items:center; justify-content:center;')}>{v.icCarrier}</span><div><h2 style={css('margin:0; font-size:17px; font-weight:650;')}>Carrier found</h2><div style={css('font-size:12px; color:#8E8E93;')}>Verified via FMCSA · DOT {v.dotLookupShown}</div></div></div>
          <div style={css('background:#F9FAFB; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:6px 14px; margin:16px 0 18px;')}>
            {v.dotResult.map((d: any, i: number) => (
              <div key={i} style={css('display:flex; justify-content:space-between; gap:12px; padding:9px 0; font-size:13px; border-bottom:1px solid rgba(0,0,0,0.05);')}><span style={css('color:#8E8E93;')}>{d.label}</span>{d.isChip && (<span style={d.chip}>{d.value}</span>)}{d.isText && (<span style={css('font-weight:550; text-align:right;')}>{d.value}</span>)}</div>
            ))}
          </div>
          <div style={css('display:flex; gap:8px;')}>
            <H as="button" onClick={v.saveDot} style={css('flex:1; height:40px; background:#007AFF; border:none; border-radius:10px; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:#0066D6;')}>Save Carrier</H>
            <H as="button" onClick={v.closeDotSheet} style={css('flex:none; height:40px; padding:0 16px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-size:13.5px; font-weight:600; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.04);')}>Cancel</H>
          </div>
        </div>
      </div>
    );
  }

  // ===================== COMMAND PALETTE =====================
  renderPalette(v: any) {
    return (
      <div onClick={v.closePalette} style={css('position:fixed; inset:0; z-index:80; background:rgba(0,0,0,0.24); backdrop-filter:blur(3px); display:flex; align-items:flex-start; justify-content:center; padding-top:14vh; animation:qhFade .16s ease;')}>
        <div onClick={v.stop} style={css('width:560px; max-width:92vw; background:rgba(255,255,255,0.98); border:1px solid rgba(0,0,0,0.08); border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,0.3); overflow:hidden;')}>
          <div style={css('display:flex; align-items:center; gap:11px; padding:14px 18px; border-bottom:1px solid rgba(0,0,0,0.07);')}>
            <span style={css('color:#8E8E93; display:flex;')}>{v.icSearch}</span>
            <input value={v.paletteQuery} onChange={v.onPaletteQuery} placeholder="Search drivers, carriers, documents, tasks…" autoFocus style={css('flex:1; border:none; outline:none; font-size:15px; font-family:inherit; background:transparent;')} />
            <span style={css('font-size:11px; font-weight:600; color:#8E8E93; background:#F2F2F7; border-radius:6px; padding:2px 7px;')}>ESC</span>
          </div>
          <div style={css('max-height:340px; overflow-y:auto; padding:8px;')}>
            {v.paletteResults.map((r: any, i: number) => (
              <H as="button" key={i} onClick={r.onClick} style={css('display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:10px 12px; background:transparent; border:none; border-radius:10px; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.05);')}>
                <span style={{ ...css('width:30px; height:30px; flex:none; border-radius:8px; display:flex; align-items:center; justify-content:center;'), background: r.bg, color: r.fg }}>{r.icon}</span>
                <div style={css('flex:1; min-width:0;')}><div style={css('font-size:13.5px; font-weight:600;')}>{r.title}</div><div style={css('font-size:12px; color:#8E8E93;')}>{r.sub}</div></div>
                <span style={css('color:#C7C7CC; display:flex;')}>{v.icChevRight}</span>
              </H>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===================== TOASTS =====================
  renderToasts(v: any) {
    return (
      <div style={css('position:fixed; top:18px; right:18px; z-index:90; display:flex; flex-direction:column; gap:10px; width:340px; max-width:90vw; pointer-events:none;')}>
        {v.toasts.map((t: any) => (
          <div key={t.id} style={css('display:flex; align-items:flex-start; gap:11px; padding:13px 15px; background:rgba(255,255,255,0.96); backdrop-filter:blur(20px); border:1px solid rgba(0,0,0,0.08); border-radius:13px; box-shadow:0 12px 30px rgba(0,0,0,0.12); pointer-events:auto; animation:qhToastIn .24s ease;')}>
            <span style={{ ...css('width:22px; height:22px; flex:none; border-radius:999px; display:flex; align-items:center; justify-content:center;'), background: t.iconBg, color: t.iconFg }}>{t.icon}</span>
            <div style={css('flex:1; min-width:0;')}><div style={css('font-size:13.5px; font-weight:600;')}>{t.title}</div>{t.hasBody && (<div style={css('font-size:12.5px; color:#6E6E73; margin-top:1px;')}>{t.body}</div>)}</div>
            <H as="button" onClick={t.onClose} style={css('width:22px; height:22px; flex:none; display:flex; align-items:center; justify-content:center; background:transparent; border:none; border-radius:6px; color:#8E8E93; cursor:pointer;')} hover={css('background:rgba(0,0,0,0.06);')}>{v.icXtiny}</H>
          </div>
        ))}
      </div>
    );
  }
}
