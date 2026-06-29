/** @typedef {{ stopId: string, arrivalSec?: number | null, departureSec?: number | null, delaySec?: number | null }} TripStopRow */

import { occupancyLevelFromLabel } from './occupancyEnrichment.js';

function protobufTimeToSec(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  if (typeof value === 'object' && value.low != null) return Number(value.low);
  return null;
}

export function vehicleStatusLabel(currentStatus) {
  const code = Number(currentStatus);
  if (code === 0) return 'Approaching stop';
  if (code === 1) return 'Stopped at station';
  if (code === 2) return 'In service';
  return null;
}

/** Parse agency vehicle labels like "49 Lindbergh - WEST" or "2 Red - NORTH". */
export function parseMetroVehicleLabel(label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) {
    return { routeLabel: null, lineCode: null, headsign: null, lineName: null, direction: null };
  }

  const dash = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (!dash) {
    return { routeLabel: trimmed, lineCode: null, headsign: trimmed, lineName: null, direction: null };
  }

  const left = dash[1].trim();
  const direction = formatDirectionLabel(dash[2].trim());
  const numbered = left.match(/^(\d+)\s+(.+)$/);
  if (numbered) {
    const lineCode = numbered[1];
    const namePart = numbered[2].trim();
    const lineName = /^(Red|Blue)$/i.test(namePart) ? `${namePart[0].toUpperCase()}${namePart.slice(1).toLowerCase()} Line` : null;
    return {
      routeLabel: left,
      lineCode,
      headsign: lineName || namePart,
      lineName,
      direction,
    };
  }

  return { routeLabel: left, lineCode: null, headsign: left, lineName: null, direction };
}

export function formatDirectionLabel(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(upper)) {
    return `${upper}bound`;
  }
  if (/^(NORTH|SOUTH|EAST|WEST)$/i.test(text)) {
    return `${text[0].toUpperCase()}${text.slice(1).toLowerCase()}bound`;
  }
  if (/^COUNTERCLOCKWISE$/i.test(text)) return 'Counter-clockwise';
  if (/^CLOCKWISE$/i.test(text)) return 'Clockwise';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function formatGtfsClockTime(startTime, startDate) {
  const time = String(startTime || '').trim();
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  const date = String(startDate || '').trim();
  const dateLabel =
    /^\d{8}$/.test(date)
      ? `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`
      : null;
  const clock = `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  return dateLabel ? `${clock} · ${dateLabel}` : clock;
}

export function observedAtIso(timestampSec) {
  if (!Number.isFinite(timestampSec) || timestampSec <= 0) return null;
  const ms = timestampSec > 1e12 ? timestampSec : timestampSec * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatEventClockTime(eventSec, delaySec = null) {
  const sec = protobufTimeToSec(eventSec);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const date = new Date(sec * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const clock = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (delaySec == null || delaySec === 0) return clock;
  const delayMin = Math.round(Number(delaySec) / 60);
  if (delayMin === 0) return `${clock} · on time`;
  if (delayMin > 0) return `${clock} · ${delayMin} min late`;
  return `${clock} · ${Math.abs(delayMin)} min early`;
}

const OCCUPANCY_STATUS_CODES = {
  EMPTY: 0,
  MANY_SEATS_AVAILABLE: 1,
  FEW_SEATS_AVAILABLE: 2,
  STANDING_ROOM_ONLY: 3,
  CRUSHED_STANDING_ROOM_ONLY: 4,
  FULL: 5,
  NOT_ACCEPTING_PASSENGERS: 6,
  NO_DATA_AVAILABLE: 7,
  NOT_BOARDABLE: 8,
};

export function normalizeOccupancyCode(code, present = true) {
  if (code == null) return null;
  let value = code;
  if (typeof code === 'string') {
    const trimmed = code.trim();
    if (!trimmed) return null;
    if (Object.hasOwnProperty.call(OCCUPANCY_STATUS_CODES, trimmed)) {
      value = OCCUPANCY_STATUS_CODES[trimmed];
    } else {
      value = Number(trimmed);
    }
  }
  if (!Number.isFinite(value)) return null;
  if (value === OCCUPANCY_STATUS_CODES.NO_DATA_AVAILABLE) return null;
  if (value === OCCUPANCY_STATUS_CODES.NOT_BOARDABLE) return null;
  if (value === OCCUPANCY_STATUS_CODES.EMPTY && !present) return null;
  return value;
}

export function occupancyStatusLabel(code, options = {}) {
  const value = normalizeOccupancyCode(code, options.present !== false);
  if (value == null) return null;
  switch (value) {
    case OCCUPANCY_STATUS_CODES.EMPTY:
      return 'Empty';
    case OCCUPANCY_STATUS_CODES.MANY_SEATS_AVAILABLE:
      return 'Many seats available';
    case OCCUPANCY_STATUS_CODES.FEW_SEATS_AVAILABLE:
      return 'Few seats available';
    case OCCUPANCY_STATUS_CODES.STANDING_ROOM_ONLY:
      return 'Standing room only';
    case OCCUPANCY_STATUS_CODES.CRUSHED_STANDING_ROOM_ONLY:
      return 'Crushed standing room';
    case OCCUPANCY_STATUS_CODES.FULL:
      return 'Full';
    case OCCUPANCY_STATUS_CODES.NOT_ACCEPTING_PASSENGERS:
      return 'Not accepting passengers';
    default:
      return null;
  }
}

export function formatOccupancyPercentage(value, present = true) {
  if (value == null || !present) return null;
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  if (pct >= 100) return 'Full (100% full)';
  return `${Math.round(pct)}% full`;
}

export function resolveOccupancyLabel(row, tripDepartureOccupancy = null) {
  const statusLabel = occupancyStatusLabel(row.occupancyStatus, {
    present: row.occupancyStatusPresent !== false,
  });
  const percentageLabel = formatOccupancyPercentage(row.occupancyPercentage, row.occupancyPercentagePresent);
  const tripLabel = occupancyStatusLabel(tripDepartureOccupancy?.code, {
    present: tripDepartureOccupancy?.present === true,
  });

  if (statusLabel && percentageLabel) return `${statusLabel} · ${percentageLabel}`;
  return statusLabel || percentageLabel || tripLabel || null;
}

function alertText(field) {
  const translation = field?.translation || field?.translations || [];
  const list = Array.isArray(translation) ? translation : [translation];
  for (const row of list) {
    const text = row?.text || row?.Text;
    if (text) return String(text).trim();
  }
  return null;
}

function informedRouteIds(alert) {
  const entities = alert?.informedEntity || alert?.informed_entity || [];
  const list = Array.isArray(entities) ? entities : [entities];
  const routeIds = new Set();
  for (const row of list) {
    const routeId = row?.routeId || row?.route_id;
    if (routeId) routeIds.add(String(routeId));
  }
  return routeIds;
}

/** Parse GTFS-RT alerts into routeId -> alert summaries. */
export function buildRouteAlertIndex(feedMessage) {
  const entities = Array.isArray(feedMessage?.entity) ? feedMessage.entity : [];
  /** @type {Map<string, Array<{ header: string, description: string | null, url: string | null }>>} */
  const byRoute = new Map();

  for (const entity of entities) {
    const alert = entity?.alert;
    if (!alert) continue;
    const header = alertText(alert.headerText || alert.header_text);
    if (!header) continue;
    const summary = {
      header,
      description: alertText(alert.descriptionText || alert.description_text),
      url: alertText(alert.url),
    };
    const routeIds = informedRouteIds(alert);
    if (!routeIds.size) continue;
    for (const routeId of routeIds) {
      const rows = byRoute.get(routeId) || [];
      rows.push(summary);
      byRoute.set(routeId, rows);
    }
  }

  return byRoute;
}

function readStopTimeEventSec(event) {
  if (!event) return { timeSec: null, delaySec: null };
  return {
    timeSec: protobufTimeToSec(event.time),
    delaySec: Number.isFinite(Number(event.delay)) ? Number(event.delay) : null,
  };
}

/** Build tripId -> trip context from GTFS-RT TripUpdate entities. */
export function buildTripUpdateIndex(feedMessage) {
  const entities = Array.isArray(feedMessage?.entity) ? feedMessage.entity : [];
  const index = new Map();

  for (const entity of entities) {
    const tripUpdate = entity?.tripUpdate;
    const trip = tripUpdate?.trip;
    const tripId = String(trip?.tripId || trip?.trip_id || '').trim();
    if (!tripId || !tripUpdate) continue;

    const stopRows = (tripUpdate.stopTimeUpdate || [])
      .map((row) => {
        const arrival = readStopTimeEventSec(row.arrival);
        const departure = readStopTimeEventSec(row.departure);
        const event = departure.timeSec != null ? departure : arrival;
        const departureOccupancyRaw =
          row.departureOccupancyStatus ??
          row.departure_occupancy_status ??
          null;
        const departureOccupancyPresent =
          Object.hasOwnProperty.call(row, 'departureOccupancyStatus') ||
          Object.hasOwnProperty.call(row, 'departure_occupancy_status');

        return {
          stopId: String(row.stopId || row.stop_id || '').trim(),
          arrivalSec: arrival.timeSec,
          departureSec: departure.timeSec,
          delaySec: event.delaySec ?? arrival.delaySec ?? departure.delaySec ?? null,
          eventSec: event.timeSec ?? departure.timeSec ?? arrival.timeSec,
          departureOccupancyCode: departureOccupancyRaw,
          departureOccupancyPresent,
        };
      })
      .filter((row) => row.stopId);

    if (!stopRows.length) continue;

    index.set(tripId, {
      routeId: String(trip.routeId || trip.route_id || '').trim() || null,
      startTime: trip.startTime || trip.start_time || null,
      startDate: trip.startDate || trip.start_date || null,
      stopRows,
      originStopId: stopRows[0].stopId,
      destStopId: stopRows[stopRows.length - 1].stopId,
    });
  }

  return index;
}

export function pickNextTripStop(stopRows, nowSec = Math.floor(Date.now() / 1000)) {
  if (!Array.isArray(stopRows) || !stopRows.length) return null;
  for (let index = 0; index < stopRows.length; index += 1) {
    const row = stopRows[index];
    if (row.eventSec == null) continue;
    if (row.eventSec >= nowSec - 90) {
      return { ...row, stopIndex: index };
    }
  }
  const lastIndex = stopRows.length - 1;
  return { ...stopRows[lastIndex], stopIndex: lastIndex };
}

export function pickPreviousTripStop(stopRows, nextIndex) {
  if (!Array.isArray(stopRows) || nextIndex == null || nextIndex <= 0) return null;
  return stopRows[nextIndex - 1];
}

export function stopsRemainingCount(stopRows, nextIndex) {
  if (!Array.isArray(stopRows) || nextIndex == null) return null;
  return Math.max(stopRows.length - nextIndex, 0);
}

export function stopRecord(stopId, stopNameLookup) {
  const id = String(stopId || '').trim();
  if (!id) return null;
  const name = stopNameLookup?.(id) || null;
  return {
    name: name || `Stop ${id}`,
    code: id,
    status: '',
    scheduledArrival: null,
    scheduledDeparture: null,
  };
}

export function enrichVehicleRow(row, options = {}) {
  const { tripIndex, stopNameLookup, routeAlerts } = options;
  const labelParts = parseMetroVehicleLabel(row.label);
  const vehicleStatus = vehicleStatusLabel(row.currentStatus);
  const observedAt = observedAtIso(row.timestampSec);

  let tripStartTime = null;
  let delayMinutes = null;
  let originStop = null;
  let destStop = null;
  let nextStop = null;
  let previousStop = null;
  let stopsRemaining = null;
  let activeAlerts = null;
  let tripDepartureOccupancy = null;

  const tripId = String(row.tripId || '').trim();
  const trip = tripId && tripIndex ? tripIndex.get(tripId) : null;
  if (trip) {
    tripStartTime = formatGtfsClockTime(trip.startTime, trip.startDate);
    originStop = stopRecord(trip.originStopId, stopNameLookup);
    destStop = stopRecord(trip.destStopId, stopNameLookup);
    const upcoming = pickNextTripStop(trip.stopRows);
    if (upcoming) {
      nextStop = stopRecord(upcoming.stopId, stopNameLookup);
      const previous = pickPreviousTripStop(trip.stopRows, upcoming.stopIndex);
      if (previous) previousStop = stopRecord(previous.stopId, stopNameLookup);
      stopsRemaining = stopsRemainingCount(trip.stopRows, upcoming.stopIndex);
      if (nextStop && upcoming.delaySec != null) {
        nextStop.status =
          upcoming.delaySec === 0
            ? 'On time'
            : upcoming.delaySec > 0
              ? `${Math.round(upcoming.delaySec / 60)} min late`
              : `${Math.round(Math.abs(upcoming.delaySec) / 60)} min early`;
        delayMinutes = Math.round(upcoming.delaySec / 60);
      }
      if (nextStop && upcoming.eventSec != null) {
        const eta = formatEventClockTime(upcoming.eventSec, upcoming.delaySec);
        if (eta) nextStop.scheduledDeparture = eta;
      }
      if (upcoming.departureOccupancyPresent) {
        tripDepartureOccupancy = {
          code: upcoming.departureOccupancyCode,
          present: true,
        };
      }
    }
  }

  const occupancyLabel = resolveOccupancyLabel(row, tripDepartureOccupancy);
  const occupancyLevel = occupancyLevelFromLabel(occupancyLabel);
  const occupancySource = occupancyLabel
    ? row.occupancyStatusPresent || row.occupancyPercentagePresent || tripDepartureOccupancy?.present
      ? 'gtfs-rt'
      : null
    : null;

  if (row.stopId) {
    const atStop = stopRecord(row.stopId, stopNameLookup);
    if (atStop) {
      nextStop = {
        ...atStop,
        status: vehicleStatus === 'Stopped at station' ? 'Current stop' : atStop.status,
      };
    }
  }

  const routeId = String(row.routeId || trip?.routeId || '').trim();
  if (routeId && routeAlerts?.size) {
    activeAlerts = routeAlerts.get(routeId) || null;
  }

  return {
    ...row,
    ...labelParts,
    vehicleStatus,
    observedAt,
    occupancyLabel,
    occupancyLevel,
    occupancySource,
    tripStartTime,
    delayMinutes,
    originStop,
    destStop,
    nextStop,
    previousStop,
    stopsRemaining,
    activeAlerts,
    destName: labelParts.headsign || destStop?.name || null,
    destCode: trip?.destStopId || null,
    originName: originStop?.name || null,
    originCode: trip?.originStopId || null,
  };
}
