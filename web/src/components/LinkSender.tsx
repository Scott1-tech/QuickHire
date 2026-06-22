import { useState } from 'react';
import { inviteSubject, inviteBody, mailtoHref, smsHref } from '@/lib/carrierApi';

/**
 * Shows the carrier's secure intake link and the easiest ways to deliver it:
 *  • "Open in my email app" / "Open in my messages" — composes a pre-filled
 *    message from the recruiter's OWN email/SMS app (works with zero server
 *    configuration).
 *  • Copy link / copy full message — for pasting into webmail or anywhere.
 * If a server email/SMS provider IS configured, the auto-send result is shown too.
 */
export default function LinkSender({
  link, name, ownerName, email, phone, serverEmail, serverSms,
}: {
  link: string | null;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  serverEmail: { sent: boolean; reason?: string } | null;
  serverSms: { sent: boolean; reason?: string } | null;
}) {
  const [copied, setCopied] = useState<'' | 'link' | 'msg'>('');
  const subject = inviteSubject(name);
  const body = inviteBody(name, ownerName, link ?? '');

  const copy = (text: string, which: 'link' | 'msg') => {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(''), 1500);
  };

  // Did the server actually send anything itself?
  const autoSent = (serverEmail?.sent || serverSms?.sent);

  return (
    <div>
      {/* Auto-send status (only meaningful once a provider is configured) */}
      {(serverEmail || serverSms) && (
        <div className="rounded-lg bg-slate-50 border border-line p-3 mb-3 text-[12.5px]">
          {autoSent ? (
            <div className="text-success">
              Automatically sent {serverEmail?.sent ? 'by email' : ''}{serverEmail?.sent && serverSms?.sent ? ' & ' : ''}{serverSms?.sent ? 'by SMS' : ''} ✓
            </div>
          ) : (
            <div className="text-muted">
              Automatic email/SMS isn't set up yet, so we didn't send it for you — use a button below to send it from your own email or phone.
            </div>
          )}
        </div>
      )}

      <div className="text-[12.5px] font-semibold text-ink mb-2">Send {name || 'the carrier'} their link:</div>
      <div className="flex flex-col gap-2">
        {email.trim() && (
          <a href={mailtoHref(email, subject, body)} className="btn-primary text-center no-underline">✉️ Open in my email app</a>
        )}
        {phone.trim() && (
          <a href={smsHref(phone, body)} className="btn-ghost text-center no-underline">💬 Open in my messages</a>
        )}

        <div className="flex gap-2 mt-1">
          <input className="input flex-1 text-[12px]" readOnly value={link ?? ''} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => link && copy(link, 'link')}>
            {copied === 'link' ? 'Copied' : 'Copy link'}</button>
        </div>
        <button type="button" className="btn-ghost text-[12.5px]" onClick={() => copy(body, 'msg')}>
          {copied === 'msg' ? 'Message copied ✓' : '📋 Copy full message (paste into Gmail, Outlook…)'}</button>
      </div>
    </div>
  );
}
