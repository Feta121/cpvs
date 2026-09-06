import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, ZoomControl } from 'react-leaflet';
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
    <div className="relative isolate overflow-hidden rounded-xl2 border border-surface-line shadow-card">
      {/* map-shell-dark inverts ONLY Leaflet's tile pane (see index.css) so
          the bright OpenStreetMap raster stops fighting the dark/Aether
          palettes. Markers and tooltips are already themed, so they're
          deliberately left outside that filter. */}
      <div className={preference === 'light' ? '' : 'map-shell-dark'}>
        <MapContainer center={ADDIS_CENTER} zoom={11} style={{ height: '320px', width: '100%' }} scrollWheelZoom={false} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Was the Leaflet default (top-left), which sat directly on top of
              the "Students on-site now" legend also anchored top-left,
              covering its text. Moved to top-right — nothing else lives
              there. */}
          <ZoomControl position="topright" />
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

      {/* Legend — floats over the map so the marker colors are decodable
          without hovering every circle. */}
      <div className="pointer-events-none absolute left-3 top-3 z-[400] flex flex-col gap-1.5 rounded-xl border border-surface-line bg-surface/85 px-3 py-2.5 shadow-card backdrop-blur-md">
        <span className="flex items-center gap-2 text-[11px] font-semibold text-ink-700">
          <span className="live-dot" /> Students on-site now
        </span>
        <span className="flex items-center gap-2 text-[11px] font-medium text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-300" /> No one checked in
        </span>
      </div>
    </div>
  );
}