"use client";

import { usePlayerStore } from "../store";

const BANDS = ["60", "230", "910", "3.6k", "14k"];
const PRESETS = [
  { name: "フラット", gains: [0, 0, 0, 0, 0] },
  { name: "低音", gains: [7, 4, 1, 0, -1] },
  { name: "ボーカル", gains: [-2, 0, 4, 5, 1] },
  { name: "高音", gains: [-2, -1, 0, 4, 7] },
] as const;

export function Equalizer() {
  const { eqEnabled, eqBands, setEqEnabled, setEqBand, setEqPreset } = usePlayerStore();

  return (
    <section className={`equalizer-card ${eqEnabled ? "enabled" : ""}`}>
      <header>
        <div>
          <strong>5バンドイコライザー</strong>
          <small>{eqEnabled ? "音質補正を適用中" : "原音のまま再生"}</small>
        </div>
        <button
          className={`switch ${eqEnabled ? "on" : ""}`}
          role="switch"
          aria-label="イコライザー"
          aria-checked={eqEnabled}
          onClick={() => setEqEnabled(!eqEnabled)}
        ><span /></button>
      </header>
      <div className="eq-presets">
        {PRESETS.map((preset) => (
          <button key={preset.name} onClick={() => setEqPreset([...preset.gains])}>{preset.name}</button>
        ))}
      </div>
      <div className="eq-bands">
        {BANDS.map((label, index) => (
          <label key={label}>
            <output>{eqBands[index] > 0 ? "+" : ""}{eqBands[index].toFixed(0)}</output>
            <input
              aria-label={`${label} Hz`}
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eqBands[index]}
              onChange={(event) => setEqBand(index, Number(event.target.value))}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="eq-scale"><span>+12 dB</span><span>0</span><span>−12 dB</span></div>
    </section>
  );
}
