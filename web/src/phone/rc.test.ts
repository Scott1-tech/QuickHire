import { describe, expect, it } from 'vitest';
import { normalizeRcCall, telephonyState, toMs, adapterUrl, isValidClientId, isTrustedRcMessage, isMissedResult, RC_ORIGIN } from './rc';

describe('normalizeRcCall (undocumented payloads, read defensively)', () => {
  it('reads a web phone session shape', () => {
    const n = normalizeRcCall({
      id: 'web-1', telephonySessionId: 'tel-1', direction: 'Inbound', from: '+14695550188', to: '+12145551000',
      fromUserName: 'Marcus Bell', startTime: 1700000000000, isOnHold: false, isOnMute: true, isOnRecord: true,
    });
    expect(n.direction).toBe('inbound');
    expect(n.remote).toBe('+14695550188');
    expect(n.remoteName).toBe('Marcus Bell');
    expect(n.ids).toEqual(['tel-1', 'web-1']);
    expect(n.controlId).toBe('web-1');
    expect(n.muted).toBe(true);
    expect(n.recording).toEqual({ active: true });
    expect(n.startedAt).toBe(1700000000000);
  });

  it('reads a call-monitor / RingOut shape with nested parties', () => {
    const n = normalizeRcCall({
      sessionId: 's-9', direction: 'Outbound', from: { phoneNumber: '+12145551000' }, to: { phoneNumber: '+15550100101', name: 'Robert' },
      telephonyStatus: 'CallConnected', startTime: '2025-11-26T15:00:00.000Z', duration: 75,
      recordings: [{ id: 'rec-1', contentUri: 'https://media.ringcentral.com/rec-1' }],
    });
    expect(n.direction).toBe('outbound');
    expect(n.remote).toBe('+15550100101');
    expect(n.remoteName).toBe('Robert');
    expect(n.ids).toEqual(['s-9']);
    expect(n.duration).toBe(75);
    expect(n.recording).toEqual({ active: null, id: 'rec-1', url: 'https://media.ringcentral.com/rec-1' });
    expect(telephonyState(n.status)).toBe('live');
  });

  it('derives duration from start/end times and tolerates alt field names', () => {
    const n = normalizeRcCall({ callId: 'c1', callDirection: 'inbound', fromNumber: '4695550188', startTime: 1700000000000, endTime: 1700000060000 });
    expect(n.ids).toEqual(['c1']);
    expect(n.remote).toBe('4695550188');
    expect(n.duration).toBe(60);
  });

  it('never throws on junk', () => {
    for (const junk of [null, undefined, 42, 'x', [], { from: 7, to: null, duration: 'NaN' }]) {
      const n = normalizeRcCall(junk);
      expect(n.ids).toBeInstanceOf(Array);
      expect(n.direction === null || typeof n.direction === 'string').toBe(true);
    }
  });
});

describe('helpers', () => {
  it('telephonyState maps statuses (disconnected is not connected)', () => {
    expect(telephonyState('Ringing')).toBe('ringing');
    expect(telephonyState('Proceeding')).toBe('ringing');
    expect(telephonyState('CallConnected')).toBe('live');
    expect(telephonyState('OnHold')).toBe('held');
    expect(telephonyState('NoCall')).toBe('ended');
    expect(telephonyState('Disconnected')).toBe('ended');
    expect(telephonyState('')).toBeNull();
  });
  it('toMs handles ms, seconds and ISO strings', () => {
    expect(toMs(1700000000)).toBe(1700000000000);
    expect(toMs(1700000000000)).toBe(1700000000000);
    expect(toMs('2025-01-01T00:00:00Z')).toBe(Date.UTC(2025, 0, 1));
    expect(toMs('garbage')).toBeNull();
  });
  it('builds the latest adapter URL with our client id and mode', () => {
    const u = new URL(adapterUrl('AbC123_def-456', 'ringout'));
    expect(u.origin).toBe(RC_ORIGIN);
    expect(u.pathname).toBe('/integration/ringcentral-embeddable/latest/adapter.js');
    expect(u.searchParams.get('clientId')).toBe('AbC123_def-456');
    expect(u.searchParams.get('defaultCallWith')).toBe('ringout');
    expect(u.searchParams.get('disableInactiveTabCallEvent')).toBe('1');
  });
  it('validates client ids', () => {
    expect(isValidClientId('AbC123_def-456')).toBe(true);
    expect(isValidClientId('short')).toBe(false);
    expect(isValidClientId('abc&redirect=evil')).toBe(false);
  });
  it('only trusts RingCentral messages', () => {
    expect(isTrustedRcMessage({ origin: RC_ORIGIN, data: { type: 'rc-call-ring-notify' } })).toBe(true);
    expect(isTrustedRcMessage({ origin: 'https://evil.example', data: { type: 'rc-call-ring-notify' } })).toBe(false);
    expect(isTrustedRcMessage({ origin: RC_ORIGIN, data: { type: 'something-else' } })).toBe(false);
    expect(isTrustedRcMessage({ origin: RC_ORIGIN, data: 'rc-call-ring-notify' })).toBe(false);
  });
  it('recognises missed results', () => {
    expect(isMissedResult('Missed')).toBe(true);
    expect(isMissedResult('Voicemail')).toBe(true);
    expect(isMissedResult('Call connected')).toBe(false);
  });
});
