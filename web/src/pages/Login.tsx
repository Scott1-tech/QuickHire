import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const nav = useNavigate();
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [email, setEmail] = useState('');

  return (
    <div className="min-h-screen grid place-items-center relative overflow-hidden bg-[#0b1020]">
      {/* aurora */}
      <div className="aurora" />
      <style>{`
        .aurora{position:absolute;inset:-30%;background:
          radial-gradient(40% 40% at 20% 30%, rgba(99,102,241,.45), transparent 60%),
          radial-gradient(40% 40% at 80% 20%, rgba(139,92,246,.4), transparent 60%),
          radial-gradient(45% 45% at 60% 80%, rgba(20,184,166,.4), transparent 60%),
          radial-gradient(40% 40% at 30% 75%, rgba(37,99,235,.35), transparent 60%);
          filter:blur(40px);animation:drift 18s ease-in-out infinite alternate;}
        @keyframes drift{from{transform:translate3d(-4%,-2%,0) scale(1)}to{transform:translate3d(4%,3%,0) scale(1.1)}}
        .rise{animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
        @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion: reduce){.aurora{animation:none}.rise{animation:none}}
      `}</style>

      <div className="rise relative z-10 w-[380px] max-w-[90vw] bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-2xl font-extrabold text-[#0F172A] mb-1" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>FleetView</div>
        <p className="text-sm text-slate-500 mb-6">Sign in to your fleet workspace.</p>

        {step === 'email' ? (
          <>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus
              className="w-full border border-slate-200 rounded-[10px] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 mb-4" />
            <button onClick={() => email && setStep('password')} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-[10px] py-2.5 text-sm transition">Continue</button>
          </>
        ) : (
          <>
            <button onClick={() => setStep('email')} className="text-xs text-indigo-600 mb-2">← {email}</button>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
            <input type="password" autoFocus className="w-full border border-slate-200 rounded-[10px] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 mb-2" />
            <label className="flex items-center gap-2 text-[13px] text-slate-600 mb-4"><input type="checkbox" /> Remember me</label>
            <button onClick={() => nav('/dashboard')} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-[10px] py-2.5 text-sm transition">Sign in</button>
          </>
        )}

        <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px bg-slate-200" /><span className="text-[11px] text-slate-400">OR</span><div className="flex-1 h-px bg-slate-200" /></div>
        <div className="grid gap-2">
          {['Continue with Google', 'Continue with Passkey', 'Continue with SSO'].map((p) => (
            <button key={p} className="w-full border border-slate-200 rounded-[10px] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{p}</button>
          ))}
        </div>
        <p className="text-[12px] text-slate-400 text-center mt-5">New here? Ask your admin for an invite.</p>
      </div>
    </div>
  );
}
