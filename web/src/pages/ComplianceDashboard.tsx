import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Empty, Pill, timeAgo } from '@/ui';

interface ComplianceCandidate {
  candidateId: string; name: string; stage: string;
  missingDocs: string[]; expiredDocs: any[]; expiringSoon: any[];
  checklistProgress: { complete: number; total: number };
  applicationCompleteness: number;
  experienceFit: number; complianceRisk: 'low' | 'medium' | 'high';
  recommendedAction: string; onboardingBlocked: boolean;
}
interface Summary {
  total: number; missingDocuments: number; expiredDocuments: number;
  expiringSoon: number; onboardingBlocked: number; readyForOnboarding: number; highRisk: number;
}

export default function ComplianceDashboard() {
  const s = useStore();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [candidates, setCandidates] = useState<ComplianceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'blocked' | 'expiring' | 'missing' | 'risk'>('all');

  const h = () => ({ 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' });

  useEffect(() => {
    fetch('/api/compliance/dashboard', { headers: h() })
      .then((r) => r.json())
      .then((d) => { setSummary(d.summary); setCandidates(d.candidates); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = candidates.filter((c) => {
    if (filter === 'blocked') return c.onboardingBlocked;
    if (filter === 'expiring') return c.expiringSoon.length > 0;
    if (filter === 'missing') return c.missingDocs.length > 0;
    if (filter === 'risk') return c.complianceRisk === 'high';
    return true;
  });

  const riskColor = (r: string) => r === 'high' ? 'pill-missing' : r === 'medium' ? 'pill-amber' : 'pill-green';

  return (
    <>
      <PageHeader crumbs={[{ label: 'Compliance Dashboard' }]} />

      {loading ? <Empty icon="⏳" title="Loading compliance data…" /> : (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Candidates', value: summary.total, icon: '👥', color: 'bg-blue-50 text-blue-700' },
                { label: 'Onboarding Blocked', value: summary.onboardingBlocked, icon: '🚫', color: 'bg-red-50 text-red-700' },
                { label: 'Missing Documents', value: summary.missingDocuments, icon: '📄', color: 'bg-amber-50 text-amber-700' },
                { label: 'Expired Documents', value: summary.expiredDocuments, icon: '⏰', color: 'bg-orange-50 text-orange-700' },
                { label: 'Expiring Soon (30d)', value: summary.expiringSoon, icon: '⚠', color: 'bg-yellow-50 text-yellow-700' },
                { label: 'Ready for Onboarding', value: summary.readyForOnboarding, icon: '✅', color: 'bg-green-50 text-green-700' },
                { label: 'High Risk', value: summary.highRisk, icon: '🚨', color: 'bg-red-50 text-red-700' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className={`rounded-xl border p-4 ${color}`}>
                  <div className="text-2xl font-extrabold">{value}</div>
                  <div className="text-[13px] font-semibold mt-1">{icon} {label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 mb-4">
            {[['all', 'All Candidates'], ['blocked', '🚫 Blocked'], ['expiring', '⚠ Expiring Soon'], ['missing', '📄 Missing Docs'], ['risk', '🚨 High Risk']].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key as any)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border ${filter === key ? 'bg-ink text-white border-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Candidate Table */}
          {filtered.length === 0 ? <Empty icon="✅" title="No candidates match this filter" /> : (
            <div className="bg-surface rounded-xl border border-line overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left p-3 text-muted font-semibold">Driver</th>
                    <th className="text-left p-3 text-muted font-semibold">Stage</th>
                    <th className="text-left p-3 text-muted font-semibold">Checklist</th>
                    <th className="text-left p-3 text-muted font-semibold">App %</th>
                    <th className="text-left p-3 text-muted font-semibold">Risk</th>
                    <th className="text-left p-3 text-muted font-semibold">Issues</th>
                    <th className="text-left p-3 text-muted font-semibold">Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.candidateId} className="border-b border-line last:border-0 hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(`/candidates/${c.candidateId}`)}>
                      <td className="p-3 font-semibold text-ink">{c.name}</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]">{c.stage}</span></td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(c.checklistProgress.complete / c.checklistProgress.total) * 100}%` }} />
                          </div>
                          <span className="text-muted">{c.checklistProgress.complete}/{c.checklistProgress.total}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={c.applicationCompleteness >= 80 ? 'text-green-600' : c.applicationCompleteness >= 50 ? 'text-amber-600' : 'text-red-600'}>
                          {c.applicationCompleteness}%
                        </span>
                      </td>
                      <td className="p-3"><span className={`pill ${riskColor(c.complianceRisk)}`}>{c.complianceRisk}</span></td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {c.missingDocs.length > 0 && <span className="pill pill-amber text-[10px]">{c.missingDocs.length} missing</span>}
                          {c.expiredDocs.length > 0 && <span className="pill pill-missing text-[10px]">{c.expiredDocs.length} expired</span>}
                          {c.expiringSoon.length > 0 && <span className="pill pill-amber text-[10px]">{c.expiringSoon.length} expiring</span>}
                          {!c.missingDocs.length && !c.expiredDocs.length && !c.expiringSoon.length && <span className="text-green-600">✓ Clear</span>}
                        </div>
                      </td>
                      <td className="p-3 text-muted max-w-[200px] truncate" title={c.recommendedAction}>{c.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
