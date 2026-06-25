import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AisVesselPayload,
  AprsPayload,
  DroughtCollection,
  EarthquakePayload,
  EbirdPayload,
  INaturalistPayload,
  LightningPayload,
  RiverForecastPayload,
  RiverGaugePayload,
  RoadConditionCollection,
  TransitPayload,
  WeatherAlertPolygonCollection,
  WildfirePayload,
} from '../lib/mapLayers';
import { friendlyApiError } from '../lib/panelHelp';

interface LayerToggles {
  weatherAlerts: boolean;
  lightning: boolean;
  rivers: boolean;
  transit: boolean;
  roads: boolean;
  aisVessels: boolean;
  earthquakes: boolean;
  wildfires: boolean;
  riverForecast: boolean;
  ebird: boolean;
  inaturalist: boolean;
  aprs: boolean;
  drought: boolean;
}

const REFRESH_MS = {
  weatherAlerts: 60_000,
  lightning: 30_000,
  rivers: 5 * 60_000,
  transit: 20_000,
  roads: 3 * 60_000,
  aisVessels: 60_000,
  earthquakes: 5 * 60_000,
  wildfires: 15 * 60_000,
  riverForecast: 10 * 60_000,
  ebird: 10 * 60_000,
  inaturalist: 5 * 60_000,
  aprs: 60_000,
  drought: 6 * 60 * 60_000,
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function useMapLayers(
  queryString: string,
  toggles: LayerToggles,
  enabled = true
) {
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlertPolygonCollection | null>(null);
  const [lightning, setLightning] = useState<LightningPayload | null>(null);
  const [rivers, setRivers] = useState<RiverGaugePayload | null>(null);
  const [transit, setTransit] = useState<TransitPayload | null>(null);
  const [roads, setRoads] = useState<RoadConditionCollection | null>(null);
  const [aisVessels, setAisVessels] = useState<AisVesselPayload | null>(null);
  const [earthquakes, setEarthquakes] = useState<EarthquakePayload | null>(null);
  const [wildfires, setWildfires] = useState<WildfirePayload | null>(null);
  const [riverForecast, setRiverForecast] = useState<RiverForecastPayload | null>(null);
  const [ebird, setEbird] = useState<EbirdPayload | null>(null);
  const [inaturalist, setINaturalist] = useState<INaturalistPayload | null>(null);
  const [aprs, setAprs] = useState<AprsPayload | null>(null);
  const [drought, setDrought] = useState<DroughtCollection | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const inFlight = useRef(new Set<string>());

  const loadLayer = useCallback(
    async (key: keyof LayerToggles, url: string, setter: (value: never) => void) => {
      if (!enabled || !toggles[key]) return;
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);

      try {
        const data = await fetchJson(url);
        setter(data as never);
        setErrors((prev) => ({ ...prev, [key]: null }));
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [key]: friendlyApiError(err instanceof Error ? err.message : 'Layer unavailable'),
        }));
      } finally {
        inFlight.current.delete(key);
      }
    },
    [enabled, toggles]
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const jobs: Array<{ key: keyof LayerToggles; url: string; setter: (value: never) => void }> = [
      {
        key: 'weatherAlerts',
        url: `/api/weather/alert-polygons?${queryString}`,
        setter: setWeatherAlerts as (value: never) => void,
      },
      {
        key: 'lightning',
        url: `/api/weather/lightning?${queryString}`,
        setter: setLightning as (value: never) => void,
      },
      {
        key: 'rivers',
        url: `/api/live/river-gauges?${queryString}`,
        setter: setRivers as (value: never) => void,
      },
      {
        key: 'transit',
        url: `/api/live/transit?${queryString}`,
        setter: setTransit as (value: never) => void,
      },
      {
        key: 'roads',
        url: `/api/live/road-conditions?${queryString}`,
        setter: setRoads as (value: never) => void,
      },
      {
        key: 'aisVessels',
        url: `/api/live/ais-vessels?${queryString}`,
        setter: setAisVessels as (value: never) => void,
      },
      {
        key: 'earthquakes',
        url: `/api/live/earthquakes?${queryString}`,
        setter: setEarthquakes as (value: never) => void,
      },
      {
        key: 'wildfires',
        url: `/api/weather/wildfires?${queryString}`,
        setter: setWildfires as (value: never) => void,
      },
      {
        key: 'riverForecast',
        url: `/api/live/river-forecast?${queryString}`,
        setter: setRiverForecast as (value: never) => void,
      },
      {
        key: 'ebird',
        url: `/api/live/ebird?${queryString}`,
        setter: setEbird as (value: never) => void,
      },
      {
        key: 'inaturalist',
        url: `/api/live/inaturalist?${queryString}`,
        setter: setINaturalist as (value: never) => void,
      },
      {
        key: 'aprs',
        url: `/api/live/aprs?${queryString}`,
        setter: setAprs as (value: never) => void,
      },
      {
        key: 'drought',
        url: `/api/weather/drought?${queryString}`,
        setter: setDrought as (value: never) => void,
      },
    ];

    const intervals: number[] = [];

    for (const job of jobs) {
      if (!toggles[job.key]) continue;
      void loadLayer(job.key, job.url, job.setter);
      intervals.push(
        window.setInterval(() => {
          void loadLayer(job.key, job.url, job.setter);
        }, REFRESH_MS[job.key])
      );
    }

    return () => {
      intervals.forEach((id) => window.clearInterval(id));
    };
  }, [enabled, loadLayer, queryString, toggles]);

  useEffect(() => {
    if (!toggles.weatherAlerts) setWeatherAlerts(null);
    if (!toggles.lightning) setLightning(null);
    if (!toggles.rivers) setRivers(null);
    if (!toggles.transit) setTransit(null);
    if (!toggles.roads) setRoads(null);
    if (!toggles.aisVessels) setAisVessels(null);
    if (!toggles.earthquakes) setEarthquakes(null);
    if (!toggles.wildfires) setWildfires(null);
    if (!toggles.riverForecast) setRiverForecast(null);
    if (!toggles.ebird) setEbird(null);
    if (!toggles.inaturalist) setINaturalist(null);
    if (!toggles.aprs) setAprs(null);
    if (!toggles.drought) setDrought(null);
  }, [toggles]);

  return {
    weatherAlerts,
    lightning,
    rivers,
    transit,
    roads,
    aisVessels,
    earthquakes,
    wildfires,
    riverForecast,
    ebird,
    inaturalist,
    aprs,
    drought,
    errors,
  };
}
