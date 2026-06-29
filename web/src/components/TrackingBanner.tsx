import { useEffect, useRef, useState } from 'react';
import type { TrackingStatsPayload } from '../hooks/useTrackingStats';
import type { EmergencyRecentCategory, EmergencyRecentItem } from '../lib/emergencyRecent';
import {
  EMERGENCY_RECENT_MENU_LABELS,
  formatEmergencyObservedAt,
} from '../lib/emergencyRecent';

interface Props {
  stats: TrackingStatsPayload | null;
  loading?: boolean;
  onSelectEmergency?: (item: EmergencyRecentItem) => void;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function emergencyTooltip(stats: TrackingStatsPayload) {
  const emergency = stats.emergency;
  if (!emergency) return undefined;

  const lines = [
    'Nationwide US emergencies (CONUS totals from all wired feeds — not your map view)',
    'Click a metric for the 10 newest events US-wide, refreshed in the background.',
    `EMS / fire dispatch calls: ${formatCount(emergency.liveIncidents)}`,
    `  PulsePoint: ${formatCount(emergency.pulsePointLive)}`,
    `  Socrata CAD: ${formatCount(emergency.socrataLive)}`,
    `  ArcGIS CAD: ${formatCount(emergency.arcgisLive)}`,
    `Active wildfire zones: ${formatCount(emergency.wildfirePerimeters)}`,
    emergency.wildfireIncidents > 0
      ? `Wildfire incident points: ${formatCount(emergency.wildfireIncidents)}`
      : null,
    `Weather alerts: ${formatCount(emergency.nwsAlerts)}`,
    emergency.femaCounties > 0 ? `FEMA zones: ${formatCount(emergency.femaCounties)}` : null,
    emergency.ipawsAlerts > 0 ? `IPAWS public alerts: ${formatCount(emergency.ipawsAlerts)}` : null,
  ].filter(Boolean);

  if (emergency.approximate || emergency.partial?.pulsePoint) {
    lines.push('EMS total may be low until PulsePoint nationwide cache finishes loading (~1 min).');
  }

  return lines.join('\n');
}

function recentItemsForCategory(
  emergency: NonNullable<TrackingStatsPayload['emergency']>,
  category: EmergencyRecentCategory
) {
  return emergency.recent?.[category] || [];
}

export function TrackingBanner({ stats, loading = false, onSelectEmergency }: Props) {
  const [openMenu, setOpenMenu] = useState<EmergencyRecentCategory | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!bannerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  const warming = stats?.partial?.cameras;
  const emergency = stats?.emergency;
  const emsApprox = emergency?.approximate || emergency?.partial?.pulsePoint;

  const toggleMenu = (category: EmergencyRecentCategory) => {
    setOpenMenu((current) => (current === category ? null : category));
  };

  const handleSelect = (item: EmergencyRecentItem) => {
    setOpenMenu(null);
    onSelectEmergency?.(item);
  };

  const renderMenu = (category: EmergencyRecentCategory) => {
    if (!emergency || openMenu !== category) return null;
    const items = recentItemsForCategory(emergency, category);
    return (
      <div className="map-tracking-banner-menu" role="dialog" aria-label={EMERGENCY_RECENT_MENU_LABELS[category]}>
        <div className="map-tracking-banner-menu-title">{EMERGENCY_RECENT_MENU_LABELS[category]}</div>
        <p className="map-tracking-banner-menu-scope">
          Nationwide · all wired feeds · not limited to map zoom
        </p>
        {items.length ? (
          <ul className="map-tracking-banner-menu-list">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="map-tracking-banner-menu-item" onClick={() => handleSelect(item)}>
                  <span className="map-tracking-banner-menu-item-title">{item.title}</span>
                  {item.subtitle ? (
                    <span className="map-tracking-banner-menu-item-subtitle">{item.subtitle}</span>
                  ) : null}
                  <span className="map-tracking-banner-menu-item-time">
                    {formatEmergencyObservedAt(item.observedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="map-tracking-banner-menu-empty">
            {loading
              ? 'Loading nationwide feed…'
              : 'No nationwide events in this category yet — background feeds may still be warming.'}
          </p>
        )}
      </div>
    );
  };

  return (
    <div ref={bannerRef} className="map-tracking-banner" aria-live="polite" aria-busy={loading && !stats}>
      {openMenu && emergency ? renderMenu(openMenu) : null}

      <span className="map-tracking-banner-label">Tracking</span>

      {stats ? (
        <>
          <span>{formatCount(stats.flights)} flights</span>
          <span className="map-tracking-banner-sep" aria-hidden="true">
            ·
          </span>
          <span>
            {formatCount(stats.cameras)} cams{warming ? '+' : ''}
          </span>
          <span className="map-tracking-banner-sep" aria-hidden="true">
            ·
          </span>
          <span>{formatCount(stats.boats)} boats</span>
          <span className="map-tracking-banner-sep" aria-hidden="true">
            ·
          </span>
          <span>{formatCount(stats.trains)} trains</span>

          {emergency ? (
            <>
              <span className="map-tracking-banner-sep map-tracking-banner-sep-emergency" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className={`map-tracking-banner-emergency map-tracking-banner-clickable${openMenu === 'ems' ? ' is-open' : ''}`}
                title={emergencyTooltip(stats)}
                aria-expanded={openMenu === 'ems'}
                onClick={() => toggleMenu('ems')}
              >
                {formatCount(emergency.liveIncidents)} EMS calls{emsApprox ? '~' : ''}
              </button>
              <span className="map-tracking-banner-sep" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className={`map-tracking-banner-emergency map-tracking-banner-clickable${openMenu === 'wildfirePerimeters' ? ' is-open' : ''}`}
                aria-expanded={openMenu === 'wildfirePerimeters'}
                onClick={() => toggleMenu('wildfirePerimeters')}
              >
                {formatCount(emergency.wildfirePerimeters)} fire zones
              </button>
              <span className="map-tracking-banner-sep" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className={`map-tracking-banner-emergency map-tracking-banner-clickable${openMenu === 'nwsAlerts' ? ' is-open' : ''}`}
                aria-expanded={openMenu === 'nwsAlerts'}
                onClick={() => toggleMenu('nwsAlerts')}
              >
                {formatCount(emergency.nwsAlerts)} Weather Alerts
              </button>
              {emergency.femaCounties > 0 ? (
                <>
                  <span className="map-tracking-banner-sep" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    className={`map-tracking-banner-emergency map-tracking-banner-clickable${openMenu === 'femaZones' ? ' is-open' : ''}`}
                    aria-expanded={openMenu === 'femaZones'}
                    onClick={() => toggleMenu('femaZones')}
                  >
                    {formatCount(emergency.femaCounties)} FEMA Zones
                  </button>
                </>
              ) : null}
              {emergency.ipawsAlerts > 0 ? (
                <>
                  <span className="map-tracking-banner-sep" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    className={`map-tracking-banner-emergency map-tracking-banner-clickable${openMenu === 'ipawsAlerts' ? ' is-open' : ''}`}
                    aria-expanded={openMenu === 'ipawsAlerts'}
                    onClick={() => toggleMenu('ipawsAlerts')}
                  >
                    {formatCount(emergency.ipawsAlerts)} IPAWS alerts
                  </button>
                </>
              ) : null}
            </>
          ) : loading ? (
            <>
              <span className="map-tracking-banner-sep map-tracking-banner-sep-emergency" aria-hidden="true">
                ·
              </span>
              <span className="map-tracking-banner-emergency map-tracking-banner-loading">loading emergencies…</span>
            </>
          ) : null}
        </>
      ) : (
        <span className="map-tracking-banner-loading">
          {loading ? 'loading nationwide stats…' : 'nationwide stats unavailable'}
        </span>
      )}

      <span className="map-tracking-banner-scope">nationwide</span>
    </div>
  );
}
