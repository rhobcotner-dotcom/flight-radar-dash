import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';

/** Decode a GTFS-RT FeedMessage from protobuf bytes. */
export function decodeGtfsRtProtobuf(buffer) {
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
}

/** Normalize JSON or decoded protobuf feed to { entity[] }. */
export function normalizeFeedMessage(body) {
  if (body?.entity) return body;
  if (Array.isArray(body?.entities)) return { entity: body.entities };
  return body;
}

export function isLikelyAuthOrTransportError(buffer) {
  if (!buffer?.length) return 'empty response';
  const head = buffer.slice(0, 200).toString('utf8').trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<Error')) {
    return 'non-GTFS XML response (check API key)';
  }
  if (head.startsWith('<!DOCTYPE') || head.startsWith('<html')) {
    return 'HTML error page';
  }
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const body = JSON.parse(buffer.toString('utf8'));
      if (body?.message && typeof body.message === 'string') return body.message;
      if (body?.Message) return body.Message;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Extract vehicle positions with valid coordinates from a GTFS-RT feed message.
 * Filters out (0,0) placeholders common in schedule-based vehicle records.
 */
export function protobufTimeToSec(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  if (typeof value === 'object' && value.low != null) return Number(value.low);
  return null;
}

export function extractVehiclePositions(feedMessage) {
  const entities = Array.isArray(feedMessage?.entity) ? feedMessage.entity : [];

  return entities
    .map((entity) => {
      const vehicle = entity?.vehicle;
      const position = vehicle?.position;
      if (!vehicle || !position) return null;

      const lat = Number(position.latitude);
      const lon = Number(position.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat === 0 && lon === 0) return null;

      const trip = vehicle.trip || {};
      const bearing = vehicle.position?.bearing ?? vehicle.bearing ?? null;
      const speedMps = vehicle.position?.speed ?? vehicle.speed ?? null;

      const occupancyStatusRaw =
        vehicle.occupancyStatus ??
        vehicle.occupancy_status ??
        null;
      const occupancyPercentageRaw =
        vehicle.occupancyPercentage ??
        vehicle.occupancy_percentage ??
        null;
      const occupancyStatusPresent =
        Object.hasOwnProperty.call(vehicle, 'occupancyStatus') ||
        Object.hasOwnProperty.call(vehicle, 'occupancy_status');
      const occupancyPercentagePresent =
        Object.hasOwnProperty.call(vehicle, 'occupancyPercentage') ||
        Object.hasOwnProperty.call(vehicle, 'occupancy_percentage');

      return {
        entityId: entity.id,
        vehicleId: vehicle.vehicle?.id || entity.id,
        label: vehicle.vehicle?.label || vehicle.vehicle?.id || entity.id,
        routeId: trip.routeId || trip.route_id || null,
        tripId: trip.tripId || trip.trip_id || null,
        directionId: trip.directionId ?? trip.direction_id ?? null,
        startTime: trip.startTime || trip.start_time || null,
        startDate: trip.startDate || trip.start_date || null,
        lat,
        lon,
        bearing,
        speedMps,
        currentStatus: vehicle.currentStatus ?? vehicle.current_status ?? null,
        stopId: vehicle.stopId || vehicle.stop_id || null,
        occupancyStatus: occupancyStatusRaw,
        occupancyStatusPresent,
        occupancyPercentage: occupancyPercentageRaw,
        occupancyPercentagePresent,
        timestampSec: protobufTimeToSec(vehicle.timestamp ?? entity.timestamp),
      };
    })
    .filter(Boolean);
}

/** Extract TripUpdate entities keyed by trip id. */
export function extractTripUpdates(feedMessage) {
  const entities = Array.isArray(feedMessage?.entity) ? feedMessage.entity : [];
  return entities
    .map((entity) => entity?.tripUpdate || null)
    .filter(Boolean);
}

/** Flatten 511.org SIRI VehicleMonitoring activities. */
export function flatten511Activities(body) {
  const serviceDelivery = body?.Siri?.ServiceDelivery || body?.ServiceDelivery;
  const deliveries = serviceDelivery?.VehicleMonitoringDelivery;
  const deliveryList = Array.isArray(deliveries) ? deliveries : deliveries ? [deliveries] : [];

  const activities = [];
  for (const delivery of deliveryList) {
    const rows = delivery?.VehicleActivity;
    if (Array.isArray(rows)) activities.push(...rows);
  }
  return activities;
}

/** Parse one SIRI MonitoredVehicleJourney into a normalized vehicle row. */
export function parse511VehicleActivity(activity) {
  const journey = activity?.MonitoredVehicleJourney;
  const location = journey?.VehicleLocation || journey?.vehicleLocation;
  const lat = Number(location?.Latitude ?? location?.latitude);
  const lon = Number(location?.Longitude ?? location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const lineRef = journey?.LineRef || journey?.PublishedLineName?.[0] || null;
  const vehicleRef = journey?.VehicleRef || journey?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef;
  const vehicleId = String(vehicleRef || lineRef || `${lat}:${lon}`).trim();

  return {
    vehicleId,
    label: String(journey?.VehicleRef || vehicleId).slice(0, 12),
    routeName: lineRef ? String(lineRef).replace(/^.*:/, '') : null,
    lat,
    lon,
    bearing: journey?.Bearing ?? journey?.bearing ?? null,
    speedMps: journey?.Velocity ?? journey?.velocity ?? null,
    tripId: journey?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef || null,
  };
}

export async function fetchGtfsRtPayload(url, options = {}) {
  const headers = {
    Accept: options.accept || '*/*',
    'User-Agent': USER_AGENT,
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const buffer = Buffer.from(await res.arrayBuffer());
  const transportError = isLikelyAuthOrTransportError(buffer);

  if (!res.ok) {
    const err = new Error(transportError || `GTFS-RT feed unavailable (${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (transportError) {
    throw new Error(transportError);
  }

  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('json') || buffer[0] === 0x7b) {
    const body = JSON.parse(buffer.toString('utf8'));
    return { format: 'json', message: normalizeFeedMessage(body), raw: body };
  }

  try {
    const message = decodeGtfsRtProtobuf(buffer);
    return { format: 'protobuf', message, raw: buffer };
  } catch (err) {
    throw new Error(transportError || err.message || 'GTFS-RT protobuf decode failed');
  }
}
