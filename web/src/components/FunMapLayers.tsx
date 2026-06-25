import { Polyline, Tooltip, Popup, CircleMarker } from 'react-leaflet';
import type { AreaSettings, Flight, Train, WeatherConditions } from '../types';
import { mississippiMonsterVisible } from '../lib/fun/funCalculations';
import type { FunSettings } from '../hooks/useFunMode';

function chemtrailForFlight(flight: Flight): [number, number][] | null {
  const alt = flight.alt ?? 0;
  if (alt < 25000) return null;
  const trackDeg = flight.track ?? 0;
  const rad = (trackDeg * Math.PI) / 180;
  const lat = flight.lat;
  const lon = flight.lon;
  const scale = 0.08 + Math.min(alt, 45000) / 450000;
  const points: [number, number][] = [[lat, lon]];
  for (let i = 1; i <= 5; i++) {
    points.push([
      lat - Math.cos(rad) * scale * i,
      lon - Math.sin(rad) * scale * i * 1.2,
    ]);
  }
  return points;
}

export function FunMapLayers({
  area,
  flights,
  trains,
  weather,
  settings,
}: {
  area: AreaSettings;
  flights: Flight[];
  trains: Train[];
  weather: WeatherConditions | null;
  settings: FunSettings;
}) {
  const chemtrails = settings.chemtrails
    ? flights.map((flight) => chemtrailForFlight(flight)).filter(Boolean)
    : [];
  const monster =
    settings.monster ? mississippiMonsterVisible(area.lat, area.lon, weather) : null;
  const trainLine =
    settings.trainHorns && trains.length >= 2
      ? ([
          [trains[0].lat, trains[0].lon],
          [trains[1].lat, trains[1].lon],
        ] as [number, number][])
      : null;

  return (
    <>
      {chemtrails.map((points, index) => (
        <Polyline
          key={`chem-${index}`}
          positions={points as [number, number][]}
          pathOptions={{
            color: '#e2e8f0',
            weight: 2,
            opacity: 0.35,
            dashArray: '2 6',
          }}
        />
      ))}
      {trainLine ? (
        <Polyline
          positions={trainLine}
          pathOptions={{ color: '#fbbf24', weight: 2, dashArray: '8 10', opacity: 0.7 }}
        >
          <Tooltip sticky direction="top" opacity={1}>
            Estimated horn bearing: 100% fictional
          </Tooltip>
        </Polyline>
      ) : null}
      {monster ? (
        <CircleMarker
          center={[monster.lat, monster.lon]}
          radius={10}
          pathOptions={{
            color: '#22d3ee',
            fillColor: '#083344',
            fillOpacity: 0.6,
            weight: 2,
            dashArray: '4 6',
          }}
        >
          <Tooltip direction="top" opacity={1}>
            {monster.label}
          </Tooltip>
          <Popup>
            <div className="monster-popup">
              <strong>Mississippi River anomaly</strong>
              <div className="muted">Classification: probably a barge. Probably.</div>
            </div>
          </Popup>
        </CircleMarker>
      ) : null}
    </>
  );
}
