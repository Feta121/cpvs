import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import L, { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

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
  const [center] = useState<[number, number]>(
    latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_CENTER
  );
  const hasPoint = latitude !== null && longitude !== null;

  return (
    <div className="overflow-hidden rounded-xl border border-surface-line">
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
              pathOptions={{ color: '#1f6dfa', fillColor: '#1f6dfa', fillOpacity: 0.12, weight: 1.5 }}
            />
          </>
        )}
      </MapContainer>
      <p className="border-t border-surface-line bg-surface-muted px-3 py-2 text-xs text-ink-500">
        Click anywhere on the map to set the hospital's location — the shaded circle previews the geofence radius.
      </p>
    </div>
  );
}