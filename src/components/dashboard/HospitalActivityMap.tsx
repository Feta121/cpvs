import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface HospitalActivity {
  hospitalId: string;
  name: string;
  latitude: number;
  longitude: number;
  activeNow: number; // checked in, not yet checked out, today
  checkedOutToday: number;
}

const ADDIS_CENTER: [number, number] = [9.0250, 38.7469];

/**
 * Shows each hospital as a marker sized/colored by how many students are
 * currently checked in (still on-site) vs already checked out today. Reuses
 * the same Leaflet + free OpenStreetMap tile setup as MapPicker.tsx — no new
 * mapping dependency introduced.
 */
export default function HospitalActivityMap({ hospitals }: { hospitals: HospitalActivity[] }) {
  const withCoords = hospitals.filter((h) => h.latitude && h.longitude);

  return (
    <div className="overflow-hidden rounded-xl border border-surface-line">
      <MapContainer center={ADDIS_CENTER} zoom={11} style={{ height: '320px', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withCoords.map((h) => {
          const total = h.activeNow + h.checkedOutToday;
          const radius = 8 + Math.min(20, total * 2);
          const color = h.activeNow > 0 ? '#0fa080' : '#94a1b8';
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
