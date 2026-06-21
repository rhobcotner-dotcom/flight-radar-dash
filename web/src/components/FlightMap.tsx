import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import type { AreaSettings, Flight } from '../types';

const planeIcon = L.divIcon({
  className: 'plane-marker',
  html: '<div class="plane-dot"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function Recenter({ area }: { area: AreaSettings }) {
  const map = useMap();
  useEffect(() => {
    map.setView([area.lat, area.lon], map.getZoom());
  }, [area.lat, area.lon, map]);
  return null;
}

interface Props {
  area: AreaSettings;
  flights: Flight[];
}

export function FlightMap({ area, flights }: Props) {
  const radiusMeters = area.radiusMiles * 1609.34;

  return (
    <div className="panel map-panel">
      <div className="panel-header">
        <h2>Live map</h2>
        <span className="muted">{flights.length} aircraft</span>
      </div>
      <MapContainer center={[area.lat, area.lon]} zoom={8} className="flight-map">
        <Recenter area={area} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={[area.lat, area.lon]}
          radius={radiusMeters}
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1 }}
        />
        {flights.map((flight) => (
          <Marker
            key={flight.fr24_id || flight.hex || `${flight.lat}-${flight.lon}`}
            position={[flight.lat, flight.lon]}
            icon={planeIcon}
          >
            <Popup>
              <strong>{flight.callsign || flight.flight || 'Unknown'}</strong>
              <br />
              {flight.type || '—'} · {flight.alt ?? '—'} ft · {flight.gspeed ?? '—'} kt
              <br />
              {flight.orig_iata || '?'} → {flight.dest_iata || '?'}
              {flight.squawk ? (
                <>
                  <br />
                  Squawk {flight.squawk}
                </>
              ) : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
