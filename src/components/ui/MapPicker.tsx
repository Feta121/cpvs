import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import { MousePointerClick } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useTheme } from '../../theme/ThemeProvider';

// Vite doesn't resolve Leaflet's default marker asset URLs automatically —
// without this, pins silently fail to render (a well-known Leaflet + bundler
// gotcha, distinct from anything else in this app).
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Addis Ababa city center — sensible default when no coordinates are set yet.
const DEFAULT_CENTER: [number, number] = [9.0250, 38.7469];

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const { preference } = useTheme();
  const [center] = useState<[number, number]>(
    latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_CENTER
  );
  const hasPoint = latitude !== null && longitude !== null;

  // Same trick as HospitalActivityMap: Leaflet writes this color straight
  // into an SVG attribute, where var() doesn't resolve — so the theme's
  // primary is read off the document root once per theme change instead of
  // leaving the geofence ring a hardcoded blue on every theme.
  const [ringColor, setRingColor] = useState('#1f6dfa');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const value = getComputedStyle(document.documentElement).getPropertyValue('--primary-500').trim();
    if (value) setRingColor(`rgb(${value})`);
  }, [preference]);

  return (
    <div className="isolate overflow-hidden rounded-xl2 border border-surface-line shadow-card">
      {/* map-shell-dark inverts only Leaflet's tile pane (see index.css) so
          the OSM raster matches the dark/Aether palettes; the marker and
          geofence ring stay outside that filter. */}
      <div className={preference === 'light' ? '' : 'map-shell-dark'}>
        <MapContainer center={center} zoom={hasPoint ? 16 : 12} style={{ height: '280px', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onChange} />
          {hasPoint && (
            <>
              <Marker position={[latitude!, longitude!]} icon={defaultIcon} />
              <Circle
                center={[latitude!, longitude!]}
                radius={radiusMeters}
                pathOptions={{ color: ringColor, fillColor: ringColor, fillOpacity: 0.14, weight: 1.5 }}
              />
            </>
          )}
        </MapContainer>
      </div>
      <p className="flex items-start gap-2 border-t border-surface-line bg-surface-alt px-3.5 py-2.5 text-xs leading-relaxed text-ink-500">
        <MousePointerClick size={13} className="mt-px shrink-0 text-clinical-600" />
        Click anywhere on the map to set the hospital's location — the shaded circle previews the geofence radius.
      </p>
    </div>
  );
}
