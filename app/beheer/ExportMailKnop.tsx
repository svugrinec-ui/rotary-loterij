'use client';

import { useState } from 'react';

type Status = null | 'bezig' | 'ok' | 'fout' | 'nietingesteld' | 'geenselectie' | 'demo';

// Leest de aangevinkte rondes (checkboxes name="ronde") en biedt twee acties:
// de CSV downloaden of naar de penningmeester mailen. Beide: niets aangevinkt
// = niets doen (met een melding).
function gekozenRondes(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="ronde"]:checked'),
  ).map((el) => el.value);
}

export default function ExportMailKnop() {
  const [status, setStatus] = useState<Status>(null);
  const [naar, setNaar] = useState<string | null>(null);

  function download() {
    const ids = gekozenRondes();
    if (ids.length === 0) {
      setStatus('geenselectie');
      return;
    }
    setStatus(null);
    const qs = ids.map((id) => `ronde=${encodeURIComponent(id)}`).join('&');
    window.location.href = `/api/beheer/export?${qs}`;
  }

  async function mail() {
    const ids = gekozenRondes();
    if (ids.length === 0) {
      setStatus('geenselectie');
      return;
    }
    setStatus('bezig');
    try {
      const res = await fetch('/api/beheer/email-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ronde: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNaar(data.naar ?? null);
        setStatus('ok');
      } else {
        setStatus(data.error === 'nietingesteld' ? 'nietingesteld' : data.error === 'demo' ? 'demo' : 'fout');
      }
    } catch {
      setStatus('fout');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={download}>
        Export (CSV)
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={mail}
        disabled={status === 'bezig'}
      >
        {status === 'bezig' ? 'Versturen…' : 'Mail naar penningmeester'}
      </button>
      {status === 'ok' && (
        <span className="muted" style={{ fontSize: 13, color: 'var(--ok)' }}>
          Verstuurd{naar ? ` naar ${naar}` : ''} ✓
        </span>
      )}
      {status === 'fout' && (
        <span className="muted" style={{ fontSize: 13, color: '#b03535' }}>
          Versturen mislukt — probeer het nog eens.
        </span>
      )}
      {status === 'nietingesteld' && (
        <span className="muted" style={{ fontSize: 13, color: '#b03535' }}>
          E-mail nog niet ingesteld (penningmeester-adres/sleutel ontbreekt).
        </span>
      )}
      {status === 'demo' && (
        <span className="muted" style={{ fontSize: 13 }}>
          In de demo worden geen mails verstuurd. Bij je eigen club gaat het overzicht hier naar de penningmeester.
        </span>
      )}
      {status === 'geenselectie' && (
        <span className="muted" style={{ fontSize: 13, color: '#b03535' }}>
          Vink eerst een of meer rondes aan.
        </span>
      )}
    </div>
  );
}
