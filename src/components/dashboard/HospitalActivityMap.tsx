import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../theme/ThemeProvider';

export interface HospitalActivity {
  hospitalId: string;
  name: string;
  latitude: number;
  longitude: number;
  activeNow: number; // checked in, not yet checked out, today
  checkedOutToday: number;
}

const ADDIS_CENTER: [number, number] = [9.0250, 38.7469];

/** Reads a CSS custom property's resolved value (e.g. "0 220 230") off the
 * document root and formats it as an rgb() string Leaflet can use directly.
 * Needed because Leaflet passes marker colors straight into SVG attributes,
 * which don't reliably resolve var() the way an actual CSS property does —
 * so the theme's real color is read once per theme change instead. */
function readThemeColor(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value ? `rgb(${value})` : fallback;
}

/**
 * Shows each hospital as a marker sized/colored by how many students are
 * currently checked in (still on-site) vs already checked out today. Reuses
 * the same Leaflet + free OpenStreetMap tile setup as MapPicker.tsx — no new
 * mapping dependency introduced.
 */
export default function HospitalActivityMap({ hospitals }: { hospitals: HospitalActivity[] }) {
  const { preference } = useTheme();
  const withCoords = hospitals.filter((h) => h.latitude && h.longitude);

  const [colors, setColors] = useState({ active: '#0fa080', inactive: '#94a1b8' });
  useEffect(() => {
    setColors({
      active: readThemeColor('--accent-600', '#0fa080'),
      inactive: readThemeColor('--ink-300', '#94a1b8'),
    });
  }, [preference]);

  return (
    <div className="isolate overflow-hidden rounded-xl border border-surface-line">
      <MapContainer center={ADDIS_CENTER} zoom={11} style={{ height: '320px', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withCoords.map((h) => {
          const total = h.activeNow + h.checkedOutToday;
          const radius = 8 + Math.min(20, total * 2);
          const color = h.activeNow > 0 ? colors.active : colors.inactive;
          return (
            <CircleMarker
              key={h.hospitalId}
              center={[h.latitude, h.longitude]}
              radius={radius}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 2 }}
            >
              <LeafletTooltip direction="top" offset={[0, -radius]} permanent={false}>
                <div className="text-xs">
                  <strong>{h.name}</strong>
                  <br />
                  {h.activeNow} on-site now · {h.checkedOutToday} checked out today
                </div>
              </LeafletTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}