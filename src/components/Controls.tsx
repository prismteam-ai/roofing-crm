import { useState } from "react";
import type { PermitFilter, Pin } from "../lib/types";

interface Props {
  pin: Pin; radius: number; roofAge: number; permitFilter: PermitFilter;
  onRadius: (n: number) => void; onRoofAge: (n: number) => void; onPermitFilter: (f: PermitFilter) => void; onPin: (p: Pin) => void;
}

export default function Controls({ pin, radius, roofAge, permitFilter, onRadius, onRoofAge, onPermitFilter, onPin }: Props) {
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const gps = () => {
    if (!navigator.geolocation) return setGpsMsg("Geolocation is not available in this browser.");
    setGpsMsg("Locating…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGpsMsg(null); onPin({ lat: p.coords.latitude, lon: p.coords.longitude }); },
      (e) => setGpsMsg(`Could not get location (${e.message}). Click the map to drop a pin instead.`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  return (
    <div className="controls">
      <div className="field">
        <label>Search center</label>
        <div className="row">
          <button onClick={gps}>Use my GPS location</button>
          <button onClick={() => onPin({ lat: 40.7684, lon: -73.5251 })}>Hicksville</button>
        </div>
        <small>{pin.lat.toFixed(4)}, {pin.lon.toFixed(4)} · click the map or drag the pin to move it</small>
        {gpsMsg && <small className="warn">{gpsMsg}</small>}
      </div>
      <div className="field">
        <label>Radius: {radius} mi</label>
        <input type="range" min={0.25} max={10} step={0.25} value={radius} onChange={(e) => onRadius(Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Roof older than: {roofAge} years</label>
        <input type="range" min={0} max={90} step={1} value={roofAge} onChange={(e) => onRoofAge(Number(e.target.value))} />
        <small>Default 15. Ages are estimates, see the confidence label on each roof.</small>
      </div>
      <div className="field">
        <label>Open permits to show</label>
        <select value={permitFilter} onChange={(e) => onPermitFilter(e.target.value as PermitFilter)}>
          <option value="roofing">Open roofing permits (medium/high confidence)</option>
          <option value="roofing_low">Open roofing permits incl. low-confidence candidates</option>
          <option value="all_open">All open permits (any type)</option>
        </select>
      </div>
    </div>
  );
}
