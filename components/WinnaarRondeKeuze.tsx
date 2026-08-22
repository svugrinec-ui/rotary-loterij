'use client';

import { useState } from 'react';
import { datumLabel } from '@/lib/format';

interface Props {
  rondes: { id: string; maand: string; naam: string }[];
  /** Voorgeselecteerde ronde (uit de laatste trekking). */
  standaard?: string;
}

/**
 * Ronde kiezen bij een winnaar. Hangt de winnaar aan een ronde, dan komt de
 * weekopbrengst uit de betaalde loten van die ronde en hoeft niemand een bedrag
 * in te tikken — het veld is er dan ook niet. Alleen bij een losse week (een
 * oude avond zonder digitale loten) vraagt hij het bedrag alsnog.
 */
export default function WinnaarRondeKeuze({ rondes, standaard = '' }: Props) {
  const [ronde, setRonde] = useState(standaard);

  return (
    <>
      <label htmlFor="w-ronde">Bij welke loterijronde hoort dit?</label>
      <select
        id="w-ronde"
        name="ronde_id"
        value={ronde}
        onChange={(e) => setRonde(e.target.value)}
      >
        <option value="">Geen ronde — losse week van vóór de digitale loten</option>
        {rondes.map((r) => (
          <option key={r.id} value={r.id}>
            {datumLabel(r.maand)} — {r.naam}
          </option>
        ))}
      </select>

      {ronde ? (
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
          De opbrengst van deze week komt automatisch uit de betaalde loten van
          de ronde.
        </p>
      ) : (
        <>
          <label htmlFor="w-opbrengst" style={{ marginTop: 12 }}>
            Opbrengst deze week (€)
          </label>
          <input
            id="w-opbrengst"
            name="opbrengst"
            type="number"
            step="0.01"
            min="0"
            defaultValue={0}
          />
        </>
      )}
    </>
  );
}
