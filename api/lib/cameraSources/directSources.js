import {
  arcGisEnvelopeParams,
  CACHE_MS,
  dedupeCameras,
  fetchCachedJson,
  fetchCachedText,
  filterByBbox,
  isModotRtplexStreamUrl,
  isSnapshotUrl,
  normalizeCamera,
  normalizeHlsUrl,
  pickMediaUrl,
  pickLiveFirst,
  pointInBbox,
  queryArcGis,
  regionsOverlap,
  roundCoord,
  stateFromCoords,
  STATE_BOUNDS,
  USER_AGENT,
} from './helpers.js';
import { fetchWeatherCameras } from './weatherCamSources.js';

const CONUS_BBOX = { west: -125, south: 24, east: -66, north: 50 };

function filterCamerasByBbox(cameras, bbox) {
  return cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

async function refreshCameraPoolCache(cacheRef, buildCameras) {
  const now = Date.now();
  if (cacheRef.cameras.length && now - cacheRef.fetchedAt < CACHE_MS) return;
  cacheRef.fetchedAt = now;
  cacheRef.cameras = dedupeCameras((await buildCameras()).filter(Boolean));
}

async function fetchCamerasFromPoolCache(cacheRef, bbox, buildCameras) {
  await refreshCameraPoolCache(cacheRef, buildCameras);
  return filterCamerasByBbox(cacheRef.cameras, bbox);
}

function httpsUrl(url) {
  return typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : url;
}

function skyvdnStreamUrl(iosUrl) {
  if (!iosUrl || typeof iosUrl !== 'string') return null;
  try {
    const url = new URL(iosUrl);
    if (!url.hostname.includes('skyvdn.com')) return httpsUrl(iosUrl);
    url.protocol = 'https:';
    url.port = '';
    return url.toString();
  } catch {
    return httpsUrl(iosUrl);
  }
}

function isBrokenWyoroadUrl(url) {
  return typeof url === 'string' && /wyoroad\.info/i.test(url);
}

function regionFor(...stateCodes) {
  const boxes = stateCodes.map((code) => STATE_BOUNDS[code]).filter(Boolean);
  if (!boxes.length) return null;
  return {
    west: Math.min(...boxes.map((b) => b.west)),
    south: Math.min(...boxes.map((b) => b.south)),
    east: Math.max(...boxes.map((b) => b.east)),
    north: Math.max(...boxes.map((b) => b.north)),
  };
}

async function fetchModotArcGisCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: "URL2 IS NOT NULL AND (STREAM_ERROR IS NULL OR STREAM_ERROR <> 'Y')",
    outFields: 'CAM_ID,DESCRIPTION,URL2,STREAM_ERROR',
  });
  const features = await queryArcGis(
    'https://mapping.modot.org/arcgis/rest/services/TravelerInformation/NWSDATA/MapServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || feature.properties || {};
      if (props.STREAM_ERROR === 'Y') return null;
      const coords = feature.geometry;
      return normalizeCamera({
        id: `modot-${props.CAM_ID || feature.id}`,
        description: props.DESCRIPTION,
        lat: coords?.y ?? coords?.coordinates?.[1],
        lon: coords?.x ?? coords?.coordinates?.[0],
        streamUrl: props.URL2,
        liveUrl: props.URL2,
        source: 'MoDOT',
        state: 'MO',
      });
    })
    .filter(Boolean);
}

async function fetchModotSnapshotCameras(bbox) {
  const data = await fetchCachedJson(
    'https://traveler.modot.org/map/js/snapshot.json',
    'modot-snapshot-cameras'
  );
  const cameras = Array.isArray(data?.cameras) ? data.cameras : [];
  return cameras
    .filter((cam) => pointInBbox(cam.location?.y, cam.location?.x, bbox))
    .map((cam) => {
      const imagePath = String(cam.url || '').startsWith('http')
        ? cam.url
        : `https://traveler.modot.org${cam.url}`;
      return normalizeCamera({
        id: `modot-snap-${cam.id}`,
        description: cam.caption,
        lat: cam.location?.y,
        lon: cam.location?.x,
        streamUrl: imagePath,
        liveUrl: imagePath,
        source: 'MoDOT snapshots',
        state: 'MO',
      });
    })
    .filter(Boolean);
}

async function fetchModotStreamingCameras(bbox) {
  const data = await fetchCachedJson(
    'https://traveler.modot.org/timconfig/feed/desktop/StreamingCams2.json',
    'modot-streaming-cams2'
  );
  const cameras = Array.isArray(data) ? data : [];
  return cameras
    .filter((cam) => pointInBbox(cam.y, cam.x, bbox) && cam.html)
    .map((cam) =>
      normalizeCamera({
        id: `modot-stream-${String(cam.location || 'cam')
          .slice(0, 36)
          .replace(/\W+/g, '-')}-${roundCoord(cam.y, 2)}`,
        description: cam.location,
        lat: cam.y,
        lon: cam.x,
        streamUrl: cam.html,
        liveUrl: cam.html,
        source: 'MoDOT streams',
        state: 'MO',
      })
    )
    .filter(Boolean);
}

async function fetchModotCameras(bbox) {
  const [arcgis, snapshots, streaming] = await Promise.all([
    fetchModotArcGisCameras(bbox),
    fetchModotSnapshotCameras(bbox),
    fetchModotStreamingCameras(bbox),
  ]);
  const merged = dedupeCameras([...arcgis, ...streaming, ...snapshots]);
  const seen = new Set();
  return merged.filter((cam) => {
    const key = `${roundCoord(cam.lat, 3)}:${roundCoord(cam.lon, 3)}:${cam.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const MO_TRAFFIC_ARCGIS =
  'https://mapping.modot.org/arcgis/rest/services/TravelerInformation/NWSDATA/MapServer/0/query';

/** True when a stream URL is served from MoDOT-owned hosts (excluded from Missouri inventory). */
export function isModotHostedStreamUrl(url) {
  if (typeof url !== 'string' || !url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/modot\.(mo\.gov|org)$/i.test(host) || host.endsWith('.modot.org')) return true;
    if (/traveler\.modot/i.test(host)) return true;
    if (/^sfs\d+-traveler\.modot\.mo\.gov$/i.test(host)) return true;
  } catch {
    return true;
  }
  return false;
}

/** Map one Missouri ArcGIS camera row. */
export function mapMissouriTrafficCamera(props, geometry) {
  if (props?.STREAM_ERROR === 'Y') return null;

  const lat = geometry?.y ?? geometry?.coordinates?.[1];
  const lon = geometry?.x ?? geometry?.coordinates?.[0];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const hls = normalizeHlsUrl(props?.URL2);
  if (!hls) return null;

  const thirdParty = !isModotHostedStreamUrl(hls);
  return normalizeCamera({
    id: thirdParty ? `mo-${props.CAM_ID}` : `mo-dot-${props.CAM_ID}`,
    description: props.DESCRIPTION,
    lat,
    lon,
    streamUrl: hls,
    liveUrl: hls,
    source: thirdParty ? 'Missouri Traffic' : 'Missouri DOT',
    state: 'MO',
  });
}

function mapMissouriSnapshotCamera(cam) {
  return normalizeCamera({
    id: `mo-snap-${cam.id}`,
    description: cam.caption,
    lat: cam.location?.y,
    lon: cam.location?.x,
    streamUrl: String(cam.url || '').startsWith('http') ? cam.url : `https://traveler.modot.org${cam.url}`,
    source: 'Missouri DOT',
    state: 'MO',
  });
}

function mapMissouriStreamingCamera(cam) {
  return normalizeCamera({
    id: `mo-stream-${String(cam.location || 'cam')
      .slice(0, 36)
      .replace(/\W+/g, '-')}-${roundCoord(cam.y, 2)}`,
    description: cam.location,
    lat: cam.y,
    lon: cam.x,
    streamUrl: cam.html,
    liveUrl: cam.html,
    source: 'Missouri DOT',
    state: 'MO',
  });
}

let missouriTrafficCache = { fetchedAt: 0, cameras: [] };

async function fetchMissouriSnapshotCameras(bbox) {
  const data = await fetchCachedJson(
    'https://traveler.modot.org/map/js/snapshot.json',
    'missouri-snapshot-cameras'
  );
  const cameras = Array.isArray(data?.cameras) ? data.cameras : [];
  return cameras
    .filter((cam) => pointInBbox(cam.location?.y, cam.location?.x, bbox))
    .map((cam) => mapMissouriSnapshotCamera(cam))
    .filter(Boolean);
}

async function fetchMissouriStreamingCameras(bbox) {
  const data = await fetchCachedJson(
    'https://traveler.modot.org/timconfig/feed/desktop/StreamingCams2.json',
    'missouri-streaming-cams2'
  );
  const cameras = Array.isArray(data) ? data : [];
  return cameras
    .filter((cam) => pointInBbox(cam.y, cam.x, bbox) && cam.html)
    .map((cam) => mapMissouriStreamingCamera(cam))
    .filter(Boolean);
}

async function queryMissouriTrafficArcGis(bbox) {
  const features = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const params = arcGisEnvelopeParams(bbox, {
      where: "URL2 IS NOT NULL AND (STREAM_ERROR IS NULL OR STREAM_ERROR <> 'Y')",
      outFields: 'CAM_ID,DESCRIPTION,URL2,STREAM_ERROR',
      resultRecordCount: pageSize,
    });
    params.set('resultOffset', String(offset));
    const batch = await queryArcGis(MO_TRAFFIC_ARCGIS, params);
    if (!batch.length) break;
    features.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize || offset >= 5000) break;
  }

  return features;
}

async function fetchMissouriTrafficCameras(bbox) {
  const now = Date.now();
  if (!missouriTrafficCache.cameras.length || now - missouriTrafficCache.fetchedAt >= CACHE_MS) {
    const moBbox = STATE_BOUNDS.MO || bbox;
    const [features, snapshots, streaming] = await Promise.all([
      queryMissouriTrafficArcGis(moBbox),
      fetchMissouriSnapshotCameras(moBbox),
      fetchMissouriStreamingCameras(moBbox),
    ]);
    missouriTrafficCache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        [
          ...features
            .map((feature) => mapMissouriTrafficCamera(feature.attributes || {}, feature.geometry))
            .filter(Boolean),
          ...snapshots,
          ...streaming,
        ]
      ),
    };
  }

  return missouriTrafficCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

async function fetchTravelMidwestCameras(bbox) {
  const features = await queryTravelMidwestPaginated(bbox, {
    where: "SnapShot IS NOT NULL AND x IS NOT NULL AND y IS NOT NULL AND TooOld <> 'true'",
  });
  return features
    .map((feature) => mapTravelMidwestFeature(feature.attributes || {}))
    .filter((cam) => cam && cam.state !== 'IL' && cam.state !== 'IN');
}

const TM_SERVICE_URL =
  'https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0/query';

/** Assign GTIS cameras to IL vs IN in the Chicago overlap (shared Travel Midwest feed). */
export function travelMidwestStateCode(lat, lon) {
  const inBounds = STATE_BOUNDS.IN && pointInBbox(lat, lon, STATE_BOUNDS.IN);
  const ilBounds = STATE_BOUNDS.IL && pointInBbox(lat, lon, STATE_BOUNDS.IL);
  if (inBounds && ilBounds) return lon >= -87.52 ? 'IN' : 'IL';
  if (inBounds) return 'IN';
  if (ilBounds) return 'IL';
  return stateFromCoords(lat, lon) || 'IL';
}

/** Map one Travel Midwest GTIS camera row (each direction is its own view). */
export function mapTravelMidwestFeature(props) {
  const lat = Number(props.y);
  const lon = Number(props.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (String(props.TooOld || '').toLowerCase() === 'true') return null;
  const snap = pickMediaUrl(props.SnapShot);
  if (!snap || !isSnapshotUrl(httpsUrl(snap))) return null;

  const direction = String(props.CameraDirection || '').trim();
  const description = String(props.CameraLocation || 'Traffic camera').trim();
  const objectId = props.OBJECTID != null ? String(props.OBJECTID) : null;
  const id = objectId
    ? `tm-${objectId}`
    : `tm-${roundCoord(lat, 3)}:${roundCoord(lon, 3)}:${direction || 'view'}`;

  return normalizeCamera({
    id,
    description: direction ? `${description} (${direction})` : description,
    lat,
    lon,
    streamUrl: httpsUrl(snap),
    source: 'Travel Midwest',
    state: travelMidwestStateCode(lat, lon),
  });
}

async function queryTravelMidwestPaginated(bbox, { where = '1=1', pageSize = 1000 } = {}) {
  const features = [];
  let offset = 0;

  while (true) {
    const params = arcGisEnvelopeParams(bbox, {
      where,
      outFields: 'OBJECTID,CameraLocation,CameraDirection,SnapShot,x,y,TooOld',
      returnGeometry: 'false',
      resultRecordCount: pageSize,
    });
    params.set('resultOffset', String(offset));
    const batch = await queryArcGis(TM_SERVICE_URL, params);
    if (!batch.length) break;
    features.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize || offset >= 20_000) break;
  }

  return features;
}

let illinoisTmCache = { fetchedAt: 0, cameras: [] };

async function fetchIllinoisTravelMidwestCameras(bbox) {
  const now = Date.now();
  if (!illinoisTmCache.cameras.length || now - illinoisTmCache.fetchedAt >= CACHE_MS) {
    const ilBbox = STATE_BOUNDS.IL || bbox;
    const features = await queryTravelMidwestPaginated(ilBbox, {
      where: "SnapShot IS NOT NULL AND x IS NOT NULL AND y IS NOT NULL AND TooOld <> 'true'",
    });
    illinoisTmCache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        features
          .map((feature) => mapTravelMidwestFeature(feature.attributes || {}))
          .filter((cam) => cam && cam.state === 'IL')
      ),
    };
  }

  return illinoisTmCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

let indiana511Cache = { fetchedAt: 0, cameras: [] };

/** Map one Indiana 511 / CARS camera row (JPEG preview + optional HLS). */
export function mapIndiana511Camera(row) {
  if (!row || row.active === false || row.public === false) return null;
  const lat = row.location?.latitude ?? row.location?.lat;
  const lon = row.location?.longitude ?? row.location?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const views = Array.isArray(row.views) ? row.views : [];
  return views
    .map((view, index) => {
      const preview = httpsUrl(view?.videoPreviewUrl);
      const hls = normalizeHlsUrl(view?.url);
      if (!hls && !preview) return null;
      const name = String(view?.name || row.name || 'Traffic camera').trim();
      const viewKey = views.length > 1 ? `-view-${index + 1}` : '';
      return normalizeCamera({
        id: `in511-${row.id}${viewKey}`,
        description: name,
        lat,
        lon,
        streamUrl: hls || preview,
        liveUrl: hls || undefined,
        previewUrl: preview || undefined,
        source: '511IN',
        state: 'IN',
      });
    })
    .filter(Boolean);
}

async function fetchIndiana511Cameras(bbox) {
  const now = Date.now();
  if (!indiana511Cache.cameras.length || now - indiana511Cache.fetchedAt >= CACHE_MS) {
    const rows = await fetchCachedJson(
      'https://intg.carsprogram.org/cameras_v1/api/cameras',
      'indiana-511-cameras'
    );
    indiana511Cache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        (Array.isArray(rows) ? rows : []).flatMap((row) => mapIndiana511Camera(row)).filter(Boolean)
      ),
    };
  }

  return indiana511Cache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

let nebraska511Cache = { fetchedAt: 0, cameras: [] };

/** Map one Nebraska 511 / CARS camera row (JPEG snapshots via dot511.nebraska.gov). */
export function mapNebraska511Camera(row) {
  if (!row || row.active === false || row.public === false) return null;
  const lat = row.location?.latitude ?? row.location?.lat;
  const lon = row.location?.longitude ?? row.location?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const views = Array.isArray(row.views) ? row.views : [];
  return views
    .map((view, index) => {
      const preview = httpsUrl(view?.videoPreviewUrl);
      const hls = normalizeHlsUrl(view?.url);
      const still = httpsUrl(view?.url);
      const snapshot = preview || (still && isSnapshotUrl(still) ? still : null);
      if (!hls && !snapshot) return null;
      const name = String(view?.name || row.name || 'Traffic camera').trim();
      const viewKey = views.length > 1 ? `-view-${index + 1}` : '';
      return normalizeCamera({
        id: `ne511-${row.id}${viewKey}`,
        description: name,
        lat,
        lon,
        streamUrl: hls || snapshot,
        liveUrl: hls || undefined,
        previewUrl: snapshot || undefined,
        source: '511NE',
        state: 'NE',
      });
    })
    .filter(Boolean);
}

async function fetchNebraska511Cameras(bbox) {
  const now = Date.now();
  if (!nebraska511Cache.cameras.length || now - nebraska511Cache.fetchedAt >= CACHE_MS) {
    const rows = await fetchCachedJson(
      'https://netg.carsprogram.org/cameras_v1/api/cameras',
      'nebraska-511-cameras'
    );
    nebraska511Cache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        (Array.isArray(rows) ? rows : []).flatMap((row) => mapNebraska511Camera(row)).filter(Boolean)
      ),
    };
  }

  return nebraska511Cache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

let caltransCache = { fetchedAt: 0, cameras: [] };

async function fetchCaltransCameras(bbox) {
  return fetchCamerasFromPoolCache(caltransCache, bbox, async () => {
    const ca = STATE_BOUNDS.CA;
    const params = arcGisEnvelopeParams(ca, {
      where: 'streamingVideoURL IS NOT NULL',
      outFields: 'locationName,currentImageURL,streamingVideoURL,latitude,longitude',
      returnGeometry: 'false',
      resultRecordCount: '2000',
    });
    const features = await queryArcGis(
      'https://gisdata.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0/query',
      params
    );
    return features.map((feature) => {
      const props = feature.attributes || {};
      return normalizeCamera({
        id: `ca-${props.locationName || props.OBJECTID}`,
        description: props.locationName,
        lat: props.latitude,
        lon: props.longitude,
        streamUrl: props.streamingVideoURL,
        liveUrl: props.streamingVideoURL,
        previewUrl: props.currentImageURL,
        source: 'Caltrans',
        state: 'CA',
      });
    });
  });
}

function normalizeTrimarcState(props) {
  const raw = String(props.state || '').trim();
  if (/^IN$/i.test(raw) || /indiana/i.test(raw)) return 'IN';
  if (/^KY$/i.test(raw) || /kentucky/i.test(raw)) return 'KY';
  if (props.description?.includes('Indiana')) return 'IN';
  return 'KY';
}

async function fetchTrimarcCameras(bbox) {
  const params = new URLSearchParams({
    where: `latitude BETWEEN ${bbox.south} AND ${bbox.north} AND longitude BETWEEN ${bbox.west} AND ${bbox.east} AND snapshot IS NOT NULL`,
    outFields: 'description,snapshot,latitude,longitude,state',
    returnGeometry: 'false',
    resultRecordCount: '2000',
    f: 'json',
  });
  const features = await queryArcGis(
    'https://services2.arcgis.com/CcI36Pduqd0OR4W9/arcgis/rest/services/trafficCamerasCur_Prd/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      const state = normalizeTrimarcState(props);
      const streamUrl = props.snapshot;
      if (!streamUrl || /pullover|trafficwise\.org\/pullover/i.test(streamUrl)) return null;
      const objectId = props.OBJECTID != null ? String(props.OBJECTID) : null;
      return normalizeCamera({
        id: objectId ? `trimarc-${objectId}` : `kyin-${roundCoord(props.latitude, 2)}-${roundCoord(props.longitude, 2)}`,
        description: props.description,
        lat: props.latitude,
        lon: props.longitude,
        streamUrl,
        source: 'KY/IN DOT',
        state,
      });
    })
    .filter(Boolean);
}

let wsdotCache = { fetchedAt: 0, cameras: [] };

async function fetchWsdotCameras(bbox) {
  return fetchCamerasFromPoolCache(wsdotCache, bbox, async () => {
    const params = arcGisEnvelopeParams(STATE_BOUNDS.WA, {
      where: 'ImageURL IS NOT NULL',
      outFields: 'CameraTitle,ImageURL',
      resultRecordCount: '2000',
    });
    const features = await queryArcGis(
      'https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer/0/query',
      params
    );
    return features.map((feature) => {
      const props = feature.attributes || {};
      const coords = feature.geometry;
      const lat = coords?.y;
      const lon = coords?.x;
      return normalizeCamera({
        id: `wsdot-${roundCoord(lat, 2)}-${roundCoord(lon, 2)}`,
        description: props.CameraTitle,
        lat,
        lon,
        streamUrl: httpsUrl(props.ImageURL),
        source: 'WSDOT',
        state: stateFromCoords(lat, lon) || 'WA',
      });
    });
  });
}

async function fetchIowaCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: 'ImageURL IS NOT NULL OR VideoURL IS NOT NULL',
    outFields: 'Desc_,ImageName,ImageURL,VideoURL,latitude,longitude,device_id',
    resultRecordCount: '2000',
  });
  const features = await queryArcGis(
    'https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      const coords = feature.geometry;
      const lat = props.latitude ?? coords?.y;
      const lon = props.longitude ?? coords?.x;
      const imageUrl = props.ImageURL ? httpsUrl(props.ImageURL) : null;
      const videoUrl = props.VideoURL ? httpsUrl(props.VideoURL) : null;
      const hls = normalizeHlsUrl(videoUrl);
      const snapshot = imageUrl && isSnapshotUrl(imageUrl) ? imageUrl : null;
      if (!hls && !snapshot) return null;
      return normalizeCamera({
        id: `ia-${props.device_id || props.ImageName || feature.attributes?.FID || lat}`,
        description: props.Desc_ || props.ImageName,
        lat,
        lon,
        streamUrl: hls || snapshot,
        liveUrl: hls || undefined,
        previewUrl: snapshot || undefined,
        source: 'Iowa DOT',
        state: 'IA',
      });
    })
    .filter(Boolean);
}

function mapOhgoSite(row) {
  const lat = Number(row.Latitude);
  const lon = Number(row.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  const siteId = String(row.Id || row.Location || `${lat}:${lon}`).trim();
  const location = String(row.Location || row.Description || 'Traffic camera').trim();
  const views = Array.isArray(row.Cameras) ? row.Cameras : [];
  if (!views.length) return [];

  return views
    .map((view, index) => {
      const streamUrl = view?.LargeURL || view?.SmallURL;
      if (!streamUrl || !isSnapshotUrl(httpsUrl(streamUrl))) return null;
      const direction = String(view?.Direction || '').trim();
      const viewKey = direction && !/^view$/i.test(direction) ? direction : `view-${index + 1}`;
      return normalizeCamera({
        id: `ohgo-${siteId}-${viewKey}`.replace(/\s+/g, '-').toLowerCase(),
        description: direction && !/^view$/i.test(direction) ? `${location} (${direction})` : location,
        lat,
        lon,
        streamUrl: httpsUrl(streamUrl),
        source: 'OHGO',
        state: 'OH',
      });
    })
    .filter(Boolean);
}

let ohgoCache = { fetchedAt: 0, cameras: [] };

async function fetchOhioCameras(bbox) {
  const now = Date.now();
  if (!ohgoCache.cameras.length || now - ohgoCache.fetchedAt >= CACHE_MS) {
    const rows = await fetchCachedJson('https://api.ohgo.com/roadmarkers/cameras', 'ohgo-cameras');
    const cameras = dedupeCameras(
      (Array.isArray(rows) ? rows : []).flatMap((row) => mapOhgoSite(row)).filter(Boolean)
    );
    ohgoCache = { fetchedAt: now, cameras };
  }

  return ohgoCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

async function fetchDelawareCameras(bbox) {
  const body = await fetchCachedJson('https://tmc.deldot.gov/json/videocamera.json', 'deldot-cameras');
  const rows = Array.isArray(body?.videoCameras) ? body.videoCameras : [];
  return rows
    .filter((row) => pointInBbox(row.lat, row.lon, bbox))
    .map((row) =>
      normalizeCamera({
        id: `de-${row.title}`,
        description: row.title,
        lat: row.lat,
        lon: row.lon,
        streamUrl: pickMediaUrl(row.urls?.m3u8s, row.urls?.m3u8),
        source: 'DelDOT',
        state: 'DE',
      })
    )
    .filter(Boolean);
}

let nmRoadsCache = { fetchedAt: 0, cameras: [] };

/** Map one NMRoads camera row (snapshot JPEG via GetCameraImage). */
export function mapNewMexicoCamera(row) {
  if (!row || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return null;
  return normalizeCamera({
    id: `nm-${row.name}`,
    description: row.title || row.name,
    lat: row.lat,
    lon: row.lon,
    streamUrl: `https://servicev4.nmroads.com/RealMapWAR/GetCameraImage?ts=0&cameraName=${encodeURIComponent(row.name)}`,
    source: 'NMRoads',
    state: 'NM',
  });
}

async function fetchNewMexicoCameras(bbox) {
  const now = Date.now();
  if (!nmRoadsCache.cameras.length || now - nmRoadsCache.fetchedAt >= CACHE_MS) {
    const body = await fetchCachedJson(
      'https://servicev4.nmroads.com/RealMapWAR//GetCameraInfo',
      'nmroads-cameras'
    );
    const rows = Array.isArray(body?.cameraInfo) ? body.cameraInfo : [];
    nmRoadsCache = {
      fetchedAt: now,
      cameras: dedupeCameras(rows.map((row) => mapNewMexicoCamera(row)).filter(Boolean)),
    };
  }

  return nmRoadsCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

async function fetchMichiganCameras(bbox) {
  const rows = await fetchCachedJson(
    'https://mdotjboss.state.mi.us/MiDrive//camera/list',
    'midrive-cameras'
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const lat = Number(row.county?.match(/lat=([\d.-]+)/)?.[1]);
      const lon = Number(row.county?.match(/lon=([\d.-]+)/)?.[1]);
      const streamUrl = row.image?.match(/src="([^"]+)"/)?.[1];
      if (!pointInBbox(lat, lon, bbox)) return null;
      return normalizeCamera({
        id: `mi-${row.route}-${row.location}`.slice(0, 48),
        description: `${row.route} ${row.location}`,
        lat,
        lon,
        streamUrl,
        source: 'MiDrive',
        state: 'MI',
      });
    })
    .filter(Boolean);
}

/** Map one 511NY camera row (skyvdn HLS + Url snapshot fallback). */
export function mapNy511Camera(row) {
  if (!row || row.Disabled || row.Blocked) return null;
  const lat = row.Latitude;
  const lon = row.Longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const hls = normalizeHlsUrl(row.VideoUrl);
  const preview = row.Url ? httpsUrl(row.Url) : null;
  if (!hls) return null;
  return normalizeCamera({
    id: `ny-${row.ID}`,
    description: row.Name,
    lat,
    lon,
    streamUrl: hls,
    liveUrl: hls,
    previewUrl: preview || undefined,
    source: '511NY',
    state: 'NY',
  });
}

async function fetchNy511Cameras(bbox) {
  const rows = await fetchCachedJson(
    'https://511ny.org/api/getcameras?format=json&key=&start=0&length=5000',
    'ny511-cameras'
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row.VideoUrl && pointInBbox(row.Latitude, row.Longitude, bbox))
    .map((row) => mapNy511Camera(row))
    .filter(Boolean);
}

async function fetchOregonCameras(bbox) {
  // TripCheck inventory is snapshot-only (RoadCams/cams/*.jpg). videoId is Portland-metro
  // TrafficLand metadata for pseudo-live 2s refresh — not a public HLS endpoint.
  const raw = await fetchCachedText(
    'https://www.tripcheck.com/Scripts/map/data/cctvinventory.js',
    'or-tripcheck-cameras'
  );
  const jsonText = raw.replace(/^var\s+\w+\s*=\s*/, '').replace(/;\s*$/, '');
  const body = JSON.parse(jsonText);
  const features = Array.isArray(body?.features) ? body.features : [];
  return features
    .filter((feature) => {
      const attrs = feature.attributes || {};
      return pointInBbox(attrs.latitude, attrs.longitude, bbox);
    })
    .map((feature) => {
      const attrs = feature.attributes || {};
      const streamUrl = attrs.filename
        ? `https://tripcheck.com/RoadCams/cams/${attrs.filename}`
        : null;
      return normalizeCamera({
        id: `or-${attrs.cameraId || attrs.filename}`,
        description: attrs.title || attrs.route,
        lat: attrs.latitude,
        lon: attrs.longitude,
        streamUrl,
        source: 'TripCheck',
        state: 'OR',
      });
    })
    .filter(Boolean);
}

async function fetchMarylandCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: 'url IS NOT NULL',
    outFields: 'location,url,lat,long',
    resultRecordCount: '2000',
  });
  const features = await queryArcGis(
    'https://mdgeodata.md.gov/imap/rest/services/Transportation/MD_TrafficCameras/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      return normalizeCamera({
        id: `md-${props.location || props.OBJECTID}`,
        description: props.location,
        lat: props.lat ?? feature.geometry?.y,
        lon: props.long ?? feature.geometry?.x,
        streamUrl: props.url,
        source: 'MDOT',
        state: 'MD',
      });
    })
    .filter(Boolean);
}

let colorado511Cache = { fetchedAt: 0, cameras: [] };

/** Map one CDOT / CARS camera row (cotrip.org HLS + carsprogram snapshot previews). */
export function mapColorado511Camera(row) {
  if (!row || row.active === false || row.public === false) return null;
  const lat = row.location?.latitude ?? row.location?.lat;
  const lon = row.location?.longitude ?? row.location?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const views = Array.isArray(row.views) ? row.views : [];
  return views
    .map((view, index) => {
      const preview = httpsUrl(view?.videoPreviewUrl);
      const hls = normalizeHlsUrl(view?.url);
      const streamUrl = hls || preview;
      if (!streamUrl) return null;
      const name = String(view?.name || row.name || 'Traffic camera').trim();
      const viewKey = views.length > 1 ? `-view-${index + 1}` : '';
      return normalizeCamera({
        id: `co511-${row.id}${viewKey}`,
        description: name,
        lat,
        lon,
        streamUrl: hls || preview,
        liveUrl: hls || undefined,
        previewUrl: preview || undefined,
        source: 'CDOT',
        state: 'CO',
      });
    })
    .filter(Boolean);
}

async function fetchColorado511Cameras(bbox) {
  const now = Date.now();
  if (!colorado511Cache.cameras.length || now - colorado511Cache.fetchedAt >= CACHE_MS) {
    const rows = await fetchCachedJson(
      'https://cotg.carsprogram.org/cameras_v1/api/cameras',
      'cotrip-cameras-v1'
    );
    colorado511Cache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        (Array.isArray(rows) ? rows : []).flatMap((row) => mapColorado511Camera(row)).filter(Boolean)
      ),
    };
  }

  return colorado511Cache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

const ALDOT_ARCGIS =
  'https://services7.arcgis.com/33Tmvrm3G2UZLFK9/arcgis/rest/services/ALDOT_TC_HLS_Public/FeatureServer/0/query';

/** Map one ALDOT ArcGIS camera row (Wowza HLS + ALGO snapshot). */
export function mapAlabamaCamera(props) {
  if (!props) return null;
  const lat = Number(props.Latitude);
  const lon = Number(props.Longitude);
  const hls = normalizeHlsUrl(props.StreamUrl);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !hls) return null;

  const preview = httpsUrl(props.ImageUrl);
  return normalizeCamera({
    id: `al-${props.Id ?? props.DeviceId ?? props.ObjectId ?? props.Name}`,
    description: props.Name || props.PrimaryRoad || `Camera ${props.Id ?? props.DeviceId ?? props.ObjectId}`,
    lat,
    lon,
    streamUrl: hls,
    liveUrl: hls,
    previewUrl: preview && isSnapshotUrl(preview) ? preview : undefined,
    source: 'ALDOT',
    state: 'AL',
  });
}

let alabamaCache = { fetchedAt: 0, cameras: [] };

async function queryAlabamaArcGis(bbox) {
  const features = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const params = arcGisEnvelopeParams(bbox, {
      where: 'StreamUrl IS NOT NULL AND Latitude IS NOT NULL AND Longitude IS NOT NULL',
      outFields: 'Name,StreamUrl,ImageUrl,Latitude,Longitude,Id,DeviceId,ObjectId,PrimaryRoad',
      returnGeometry: 'false',
      resultRecordCount: pageSize,
    });
    params.set('resultOffset', String(offset));
    const batch = await queryArcGis(ALDOT_ARCGIS, params);
    if (!batch.length) break;
    features.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize || offset >= 5000) break;
  }

  return features;
}

async function fetchAlabama511Cameras(bbox) {
  const now = Date.now();
  if (!alabamaCache.cameras.length || now - alabamaCache.fetchedAt >= CACHE_MS) {
    const alBbox = STATE_BOUNDS.AL || bbox;
    const features = await queryAlabamaArcGis(alBbox);
    alabamaCache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        features.map((feature) => mapAlabamaCamera(feature.attributes || {})).filter(Boolean)
      ),
    };
  }

  return alabamaCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

const MS_TRAFFIC_BASE = 'https://www.mdottraffic.com';
const MS_LOAD_CAMERAS_URL = `${MS_TRAFFIC_BASE}/default.aspx/LoadCameraData`;

/** Build MDOT Traffic HLS + snapshot URLs from a camerasite switchImage row. */
export function parseMississippiTrafficStream(thumbnailUrl, streamId) {
  if (typeof streamId !== 'string' || !streamId) return null;
  const thumb = httpsUrl(thumbnailUrl);
  const hostMatch = String(thumbnailUrl || '').match(/(streaming[a-z0-9]+\.mdottraffic\.com)/i);
  if (!hostMatch) return null;
  const streamName = streamId.endsWith('.stream') ? streamId : `${streamId}.stream`;
  return {
    previewUrl: thumb,
    liveUrl: `https://${hostMatch[1]}/rtplive/${streamName}/playlist.m3u8`,
  };
}

/** Map one MDOT Traffic stream at a camera site. */
export function mapMississippiTrafficCamera(site, stream) {
  if (!site || !stream?.liveUrl) return null;
  return normalizeCamera({
    id: `ms-${stream.id}`,
    description: stream.description || site.tooltip || `Camera ${stream.id}`,
    lat: site.lat,
    lon: site.lon,
    streamUrl: stream.liveUrl,
    liveUrl: stream.liveUrl,
    previewUrl: stream.previewUrl,
    source: 'MDOT Traffic',
    state: 'MS',
  });
}

let mississippiTrafficCache = { fetchedAt: 0, cameras: [] };

async function fetchMississippiCameraSites() {
  const res = await fetch(MS_LOAD_CAMERAS_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`MDOT Traffic camera list unavailable (${res.status})`);
  const body = await res.json();
  const rows = Array.isArray(body?.d) ? body.d : [];
  return rows
    .map((row) => {
      const siteId = String(row?.markerid || '').replace(/^camsite_/i, '');
      const lat = Number(row?.lat);
      const lon = Number(row?.lon);
      if (!siteId || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        siteId,
        tooltip: String(row?.tooltip || '').trim() || `Camera site ${siteId}`,
        lat,
        lon,
      };
    })
    .filter(Boolean);
}

async function fetchMississippiSiteStreams(siteId) {
  const html = await fetchCachedText(
    `${MS_TRAFFIC_BASE}/mapbubbles/camerasite.aspx?site=${encodeURIComponent(siteId)}`,
    `ms-traffic-site-${siteId}`
  );
  const streams = [];
  const pattern =
    /switchImage\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'/g;
  let match;
  while ((match = pattern.exec(html))) {
    const [, thumbUrl, streamId, title, description] = match;
    const urls = parseMississippiTrafficStream(thumbUrl, streamId);
    if (!urls) continue;
    const label = [title, description].filter(Boolean).join(' — ').trim();
    streams.push({
      id: streamId,
      description: label,
      previewUrl: urls.previewUrl,
      liveUrl: urls.liveUrl,
    });
  }
  return streams;
}

async function buildMississippiTrafficPool(sites) {
  const cameras = [];
  const batchSize = 24;
  for (let start = 0; start < sites.length; start += batchSize) {
    const batch = sites.slice(start, start + batchSize);
    const batchCameras = await Promise.all(
      batch.map(async (site) => {
        const streams = await fetchMississippiSiteStreams(site.siteId);
        return streams
          .map((stream) => mapMississippiTrafficCamera(site, stream))
          .filter(Boolean);
      })
    );
    cameras.push(...batchCameras.flat());
  }
  return dedupeCameras(cameras);
}

async function fetchMississippiTrafficCameras(bbox) {
  const now = Date.now();
  if (!mississippiTrafficCache.cameras.length || now - mississippiTrafficCache.fetchedAt >= CACHE_MS) {
    const sites = await fetchMississippiCameraSites();
    mississippiTrafficCache = {
      fetchedAt: now,
      cameras: await buildMississippiTrafficPool(sites),
    };
  }

  return mississippiTrafficCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

async function fetchTennesseeCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: 'httpsVideoUrl IS NOT NULL OR thumbnailUrl IS NOT NULL',
    outFields: 'title,httpsVideoUrl,httpVideoUrl,thumbnailUrl,location__coordinates__lat,location__coordinates__lng,route,id,active',
    returnGeometry: 'false',
    resultRecordCount: '2000',
  });
  const features = await queryArcGis(
    'https://services8.arcgis.com/hkhKI6Qq7rjvBjZU/arcgis/rest/services/RoadwayCameras/FeatureServer/0/query',
    params
  );
  return features.map((feature) => mapTennesseeCamera(feature.attributes || {})).filter(Boolean);
}

/** Map one TDOT ArcGIS camera row (mcleansfs skyvdn HLS + thumbnailUrl snapshots). */
export function mapTennesseeCamera(props) {
  if (!props || props.active === false) return null;
  const lat = props.location__coordinates__lat;
  const lon = props.location__coordinates__lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const snapshot = httpsUrl(props.thumbnailUrl);
  const hls = normalizeHlsUrl(props.httpsVideoUrl || props.httpVideoUrl);
  if (!hls && !snapshot) return null;

  return normalizeCamera({
    id: `tn-${props.id || props.title}`,
    description: props.title || props.route,
    lat,
    lon,
    streamUrl: hls || snapshot,
    liveUrl: hls || undefined,
    previewUrl: snapshot || undefined,
    source: 'TDOT',
    state: 'TN',
  });
}

let hawaiiCache = { fetchedAt: 0, cameras: [] };

async function fetchHawaiiCameras(bbox) {
  return fetchCamerasFromPoolCache(hawaiiCache, bbox, async () => {
    const body = await fetchCachedJson(
      'https://services.arcgis.com/6I1ysurtNWNxkuwd/arcgis/rest/services/HawaiiTrafficCameras/FeatureServer/0/query?where=1%3D1&outFields=Camera_Description,URL&returnGeometry=true&outSR=4326&resultRecordCount=2000&f=json',
      'hi-traffic-cameras'
    );
    const features = Array.isArray(body?.features) ? body.features : [];
    return features.map((feature) => {
      const props = feature.attributes || {};
      const lat = feature.geometry?.y;
      const lon = feature.geometry?.x;
      return normalizeCamera({
        id: `hi-${props.Camera_Description || props.OBJECTID}`,
        description: props.Camera_Description,
        lat,
        lon,
        streamUrl: httpsUrl(props.URL),
        source: 'HDOT',
        state: 'HI',
      });
    });
  });
}

const WI511_BASE = 'https://511wi.gov';
const FL511_BASE = 'https://www.fl511.com';
const GA511_BASE = 'https://511ga.org';
const AZ511_BASE = 'https://www.az511.gov';
const NV511_BASE = 'https://www.nvroads.com';
const UT511_BASE = 'https://www.udottraffic.utah.gov';
const ID511_BASE = 'https://511.idaho.gov';
const NC511_BASE = 'https://www.drivenc.gov';
const KS_CARS_CAMERAS_URL = 'https://kstg.carsprogram.org/cameras_v1/api/cameras';
const LIST511_CAMERAS_PATH = '/list/getdata/cameras';

/** Parse `POINT (lon lat)` from 511 list DataTables feed. */
export function parse511ListWktPoint(wkt) {
  if (typeof wkt !== 'string') return null;
  const match = wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/** @deprecated use parse511ListWktPoint */
export function parseWi511WktPoint(wkt) {
  return parse511ListWktPoint(wkt);
}

/** Map one 511 list row to normalized cameras (one per enabled view). */
export function map511ListRow(row, { baseUrl, state, source, idPrefix }) {
  const coords = parse511ListWktPoint(row?.latLng?.geography?.wellKnownText);
  if (!coords) return [];

  const description =
    String(row.location || '').trim() ||
    [row.roadway, row.direction].filter(Boolean).join(' ').trim() ||
    `Camera ${row.id}`;

  const views = Array.isArray(row.images) ? row.images : [];
  const cameras = [];
  for (const view of views) {
    if (view.disabled || view.blocked || view.videoDisabled) continue;
    const imagePath = typeof view.imageUrl === 'string' ? view.imageUrl : null;
    const previewUrl = imagePath
      ? httpsUrl(imagePath.startsWith('http') ? imagePath : `${baseUrl}${imagePath}`)
      : null;
    const videoUrl =
      !view.isVideoAuthRequired && !view.videoDisabled
        ? normalizeHlsUrl(view.videoUrl)
        : null;
    if (!videoUrl && !previewUrl) continue;

    const cam = normalizeCamera({
      id: `${idPrefix}-${view.id || row.id}`,
      description,
      lat: coords.lat,
      lon: coords.lon,
      streamUrl: videoUrl || previewUrl,
      liveUrl: videoUrl || undefined,
      previewUrl: previewUrl || undefined,
      source,
      state,
    });
    if (cam) cameras.push(cam);
  }
  return cameras;
}

/** Map one 511WI list row to normalized cameras (one per enabled view). */
export function mapWi511ListRow(row) {
  return map511ListRow(row, { baseUrl: WI511_BASE, state: 'WI', source: '511WI', idPrefix: 'wi' });
}

/** Map one FL511 list row (auth-gated DIVAS HLS → snapshot previews on fl511.com). */
export function mapFl511ListRow(row) {
  return map511ListRow(row, { baseUrl: FL511_BASE, state: 'FL', source: 'FL511', idPrefix: 'fl' });
}

/** Map one 511GA list row (auth-gated SKYLINE HLS → snapshot previews on 511ga.org). */
export function mapGa511ListRow(row) {
  return map511ListRow(row, { baseUrl: GA511_BASE, state: 'GA', source: '511GA', idPrefix: 'ga' });
}

/** Map one AZ511 list row (snapshot previews on az511.gov). */
export function mapAz511ListRow(row) {
  return map511ListRow(row, { baseUrl: AZ511_BASE, state: 'AZ', source: 'AZ511', idPrefix: 'az' });
}

/** Map one NVRoads list row (public its.nv.gov HLS + nvroads.com snapshots). */
export function mapNv511ListRow(row) {
  return map511ListRow(row, { baseUrl: NV511_BASE, state: 'NV', source: 'NVRoads', idPrefix: 'nv' });
}

/** Map one UDOT 511 list row (snapshot previews on udottraffic.utah.gov). */
export function mapUt511ListRow(row) {
  return map511ListRow(row, { baseUrl: UT511_BASE, state: 'UT', source: 'UDOT 511', idPrefix: 'ut' });
}

/** Map one Idaho 511 list row (snapshot previews on 511.idaho.gov). */
export function mapId511ListRow(row) {
  return map511ListRow(row, { baseUrl: ID511_BASE, state: 'ID', source: 'Idaho 511', idPrefix: 'id' });
}

/** Map one DriveNC / NCDOT 511 list row (snapshot previews; SKYLINE HLS is auth-gated). */
export function mapNc511ListRow(row) {
  return map511ListRow(row, { baseUrl: NC511_BASE, state: 'NC', source: 'DriveNC', idPrefix: 'nc' });
}

/** Map one KanDrive / KDOT CARS camera row (skyvdn HLS + kscam.carsprogram.org snapshots). */
export function mapKansasCarsCamera(row) {
  if (!row || row.active === false || row.public === false) return null;
  const lat = row.location?.latitude ?? row.location?.lat;
  const lon = row.location?.longitude ?? row.location?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const views = Array.isArray(row.views) ? row.views : [];
  return views
    .map((view, index) => {
      const preview = httpsUrl(view?.videoPreviewUrl);
      const hls = normalizeHlsUrl(view?.url);
      const still = httpsUrl(view?.url);
      const snapshot = preview || (still && isSnapshotUrl(still) ? still : null);
      const streamUrl = hls || snapshot;
      if (!streamUrl) return null;
      const name = String(view?.name || row.name || 'Traffic camera').trim();
      const viewKey = views.length > 1 ? `-view-${index + 1}` : '';
      return normalizeCamera({
        id: `ks-${row.id}${viewKey}`,
        description: name,
        lat,
        lon,
        streamUrl: hls || snapshot,
        liveUrl: hls || undefined,
        previewUrl: snapshot || undefined,
        source: 'KanDrive',
        state: 'KS',
      });
    })
    .filter(Boolean);
}

async function fetch511ListPage(listUrl, start, length, attempt = 0) {
  const res = await fetch(listUrl, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      draw: '1',
      start: String(start),
      length: String(length),
    }).toString(),
  });
  if (res.ok) return res.json();
  if (res.status >= 500 && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    return fetch511ListPage(listUrl, start, length, attempt + 1);
  }
  throw new Error(`511 camera list unavailable (${res.status})`);
}

async function fetchAll511ListRows(baseUrl, { pageSize = 100 } = {}) {
  const listUrl = `${baseUrl}${LIST511_CAMERAS_PATH}`;
  const firstBody = await fetch511ListPage(listUrl, 0, 1);
  const total = Number(firstBody.recordsTotal) || 0;
  if (!total) return [];

  const rows = Array.isArray(firstBody.data) ? [...firstBody.data] : [];
  for (let start = rows.length; start < total; start += pageSize) {
    const body = await fetch511ListPage(listUrl, start, Math.min(pageSize, total - start));
    if (Array.isArray(body.data)) rows.push(...body.data);
  }
  return rows;
}

let wi511ListCache = { fetchedAt: 0, rows: [] };
let fl511ListCache = { fetchedAt: 0, rows: [] };
let ga511ListCache = { fetchedAt: 0, rows: [] };
let az511ListCache = { fetchedAt: 0, rows: [] };
let nv511ListCache = { fetchedAt: 0, rows: [] };
let ut511ListCache = { fetchedAt: 0, rows: [] };
let id511ListCache = { fetchedAt: 0, rows: [] };
let nc511ListCache = { fetchedAt: 0, rows: [] };
let kansasCarsCache = { fetchedAt: 0, cameras: [] };

async function fetch511ListCameras(bbox, cache, baseUrl, mapRow, listOptions = {}) {
  const now = Date.now();
  if (!cache.rows.length || now - cache.fetchedAt >= CACHE_MS) {
    cache.fetchedAt = now;
    cache.rows = await fetchAll511ListRows(baseUrl, listOptions);
  }

  const cameras = [];
  for (const row of cache.rows) {
    for (const cam of mapRow(row)) {
      if (pointInBbox(cam.lat, cam.lon, bbox)) cameras.push(cam);
    }
  }
  return cameras;
}

async function fetchWisconsin511Cameras(bbox) {
  return fetch511ListCameras(bbox, wi511ListCache, WI511_BASE, mapWi511ListRow);
}

async function fetchFlorida511Cameras(bbox) {
  return fetch511ListCameras(bbox, fl511ListCache, FL511_BASE, mapFl511ListRow);
}

async function fetchGeorgia511Cameras(bbox) {
  return fetch511ListCameras(bbox, ga511ListCache, GA511_BASE, mapGa511ListRow, { pageSize: 50 });
}

async function fetchArizona511Cameras(bbox) {
  return fetch511ListCameras(bbox, az511ListCache, AZ511_BASE, mapAz511ListRow);
}

async function fetchNevada511Cameras(bbox) {
  return fetch511ListCameras(bbox, nv511ListCache, NV511_BASE, mapNv511ListRow);
}

async function fetchUtah511Cameras(bbox) {
  return fetch511ListCameras(bbox, ut511ListCache, UT511_BASE, mapUt511ListRow);
}

async function fetchIdaho511Cameras(bbox) {
  return fetch511ListCameras(bbox, id511ListCache, ID511_BASE, mapId511ListRow);
}

async function fetchNorthCarolina511Cameras(bbox) {
  return fetch511ListCameras(bbox, nc511ListCache, NC511_BASE, mapNc511ListRow);
}

async function fetchKansasCarsCameras(bbox) {
  const now = Date.now();
  if (!kansasCarsCache.cameras.length || now - kansasCarsCache.fetchedAt >= CACHE_MS) {
    const rows = await fetchCachedJson(KS_CARS_CAMERAS_URL, 'kansas-cars-cameras');
    kansasCarsCache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        (Array.isArray(rows) ? rows : []).flatMap((row) => mapKansasCarsCamera(row)).filter(Boolean)
      ),
    };
  }

  return kansasCarsCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

const OKTRAFFIC_API = 'https://oktraffic.org/api/cameraPoles';
const OKTRAFFIC_POLES_FILTER = JSON.stringify({
  include: [
    {
      relation: 'mapCameras',
      scope: {
        include: 'streamDictionary',
        where: { status: { neq: 'Out Of Service' }, type: 'Web', blockAtis: { neq: '1' } },
      },
    },
  ],
});

/** Map one OKTraffic mapCamera row (with streamDictionary) to a normalized camera. */
export function mapOkTrafficMapCamera(row) {
  if (!row || row.type !== 'Web' || row.status === 'Out Of Service' || String(row.blockAtis) === '1') {
    return null;
  }
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const hls = normalizeHlsUrl(row.streamDictionary?.streamSrc);
  if (!hls) return null;

  const description =
    String(row.location || row.streamDictionary?.streamName || 'Traffic camera').trim() ||
    `Camera ${row.id}`;

  return normalizeCamera({
    id: `ok-${row.id}`,
    description,
    lat,
    lon,
    streamUrl: hls,
    liveUrl: hls,
    source: 'OKTraffic',
    state: 'OK',
  });
}

let okTrafficCache = { fetchedAt: 0, cameras: [] };

async function fetchOklahomaTrafficCameras(bbox) {
  const now = Date.now();
  if (!okTrafficCache.cameras.length || now - okTrafficCache.fetchedAt >= CACHE_MS) {
    const poles = await fetchCachedJson(
      `${OKTRAFFIC_API}?filter=${encodeURIComponent(OKTRAFFIC_POLES_FILTER)}`,
      'oktraffic-camera-poles'
    );
    const rows = Array.isArray(poles) ? poles : [];
    okTrafficCache = {
      fetchedAt: now,
      cameras: dedupeCameras(
        rows.flatMap((pole) =>
          (Array.isArray(pole.mapCameras) ? pole.mapCameras : [])
            .map((cam) => mapOkTrafficMapCamera(cam))
            .filter(Boolean)
        )
      ),
    };
  }

  return okTrafficCache.cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

const mapIconsPoolCaches = new Map();

async function fetchMapIcons511Cameras(bbox, { baseUrl, stateCode, cacheKey, sourceLabel, assignStateFromCoords = false }) {
  const poolKey = cacheKey;
  let cache = mapIconsPoolCaches.get(poolKey);
  if (!cache) {
    cache = { fetchedAt: 0, cameras: [] };
    mapIconsPoolCaches.set(poolKey, cache);
  }

  await refreshCameraPoolCache(cache, async () => {
    const body = await fetchCachedJson(`${baseUrl}/map/mapIcons/Cameras`, cacheKey);
    const items = Array.isArray(body?.item2) ? body.item2 : [];
    return items.map((item) => {
      const lat = item.location?.[0];
      const lon = item.location?.[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const state = assignStateFromCoords ? stateFromCoords(lat, lon) : stateCode;
      if (!state) return null;
      return normalizeCamera({
        id: `${state.toLowerCase()}-${item.itemId}`,
        description: item.title || `Camera ${item.itemId}`,
        lat,
        lon,
        streamUrl: `${baseUrl}/map/Cctv/${item.itemId}`,
        source: sourceLabel || `${state} 511`,
        state,
      });
    });
  });

  return filterCamerasByBbox(cache.cameras, bbox);
}

let alaska511Cache = { fetchedAt: 0, cameras: [] };

async function fetchAlaskaCameras(bbox) {
  return fetchCamerasFromPoolCache(alaska511Cache, bbox, async () => {
    const params = arcGisEnvelopeParams(STATE_BOUNDS.AK, {
      where: "Status='Enabled'",
      outFields: 'Id,Name,Latitude,Longitude',
      returnGeometry: 'false',
      resultRecordCount: '2000',
    });
    const features = await queryArcGis(
      'https://services.arcgis.com/fX5IGselyy1TirdY/arcgis/rest/services/511_Cameras/FeatureServer/0/query',
      params
    );
    return features.map((feature) => {
      const props = feature.attributes || {};
      const lat = Number(props.Latitude);
      const lon = Number(props.Longitude);
      return normalizeCamera({
        id: `ak-${props.Id}`,
        description: props.Name,
        lat,
        lon,
        streamUrl: `https://511.alaska.gov/map/Cctv/${props.Id}`,
        source: '511 Alaska',
        state: 'AK',
      });
    });
  });
}

async function fetchArcGisBboxCameras(
  bbox,
  { serviceUrl, where = '1=1', outFields, resultRecordCount = 120, returnGeometry = 'false', mapFeature }
) {
  const params = arcGisEnvelopeParams(bbox, {
    where,
    outFields,
    returnGeometry,
    resultRecordCount,
  });
  if (returnGeometry === 'true') params.set('outSR', '4326');
  const features = await queryArcGis(`${serviceUrl}/query`, params);
  return features.map((feature) => mapFeature(feature.attributes || {}, feature)).filter(Boolean);
}

let virginiaCache = { fetchedAt: 0, cameras: [] };

/** Map one 511 Virginia / VDOT camera feature (vdotcameras.com HLS + snapshot thumbs). */
export function mapVirginia511Camera(feature) {
  const props = feature?.properties || {};
  if (props.active === false) return null;
  const coords = feature?.geometry?.coordinates;
  const lon = coords?.[0];
  const lat = coords?.[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const snapshot = httpsUrl(props.image_url);
  const hls = normalizeHlsUrl(props.https_url || props.preroll_url || props.ios_url);
  if (!snapshot && !hls) return null;
  const description = String(props.description || props.name || 'Traffic camera').trim();
  return normalizeCamera({
    id: `va511-${props.id || props.guid || props.name}`,
    description,
    lat,
    lon,
    streamUrl: hls || snapshot,
    liveUrl: hls || undefined,
    previewUrl: snapshot || undefined,
    source: '511VA',
    state: 'VA',
  });
}

async function fetchVirginiaCameras(bbox) {
  return fetchCamerasFromPoolCache(virginiaCache, bbox, async () => {
    const data = await fetchCachedJson(
      'https://511.vdot.virginia.gov/services/map/layers/map/cams',
      'va511-cameras'
    );
    const features = Array.isArray(data?.features) ? data.features : [];
    return features.map((feature) => mapVirginia511Camera(feature)).filter(Boolean);
  });
}

async function fetchTexasCameras(bbox) {
  const austin = await fetchArcGisBboxCameras(bbox, {
    serviceUrl:
      'https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/TRANSPORTATION_traffic_cameras/FeatureServer/0',
    where: 'SCREENSHOT_ADDRESS IS NOT NULL',
    outFields: 'CAMERA_ID,LOCATION_NAME,PRIMARY_ST,CROSS_ST,SCREENSHOT_ADDRESS',
    returnGeometry: 'true',
    mapFeature: (props, feature) => {
      const screenshot = props.SCREENSHOT_ADDRESS;
      if (!screenshot || /cctv\.austinmobility\.io/i.test(screenshot)) return null;
      return normalizeCamera({
        id: `tx-aus-${props.CAMERA_ID || props.OBJECTID}`,
        description: props.LOCATION_NAME || `${props.PRIMARY_ST} @ ${props.CROSS_ST}`,
        lat: feature.geometry?.y,
        lon: feature.geometry?.x,
        streamUrl: screenshot,
        source: 'Austin Mobility',
        state: 'TX',
      });
    },
  });

  const arlington = await fetchArcGisBboxCameras(bbox, {
    serviceUrl:
      'https://services.arcgis.com/jXi5GuMZwfCYtZP9/arcgis/rest/services/Traffic_Camera_Updates_view/FeatureServer/0',
    where: 'Pic_URL IS NOT NULL',
    outFields: 'ObjectId,Camera_Location,Description,Pic_URL',
    returnGeometry: 'true',
    mapFeature: (props, feature) =>
      normalizeCamera({
        id: `tx-arl-${props.ObjectId}`,
        description: props.Description || props.Camera_Location,
        lat: feature.geometry?.y,
        lon: feature.geometry?.x,
        streamUrl: props.Pic_URL,
        source: 'Arlington TX',
        state: 'TX',
      }),
  });

  return [...austin, ...arlington];
}

async function fetchWyomingCameras(bbox) {
  const cheyenne = await fetchArcGisBboxCameras(bbox, {
    serviceUrl:
      'https://services.arcgis.com/hRUr1F8lE8Jq2uJo/arcgis/rest/services/Wyoming_Traffic_Cameras_Cheyenne/FeatureServer/0',
    where: 'Camera_Link IS NOT NULL',
    outFields: 'Name,Location,Latitude,Longitude,Camera_Link',
    mapFeature: (props) =>
      normalizeCamera({
        id: `wy-${props.Name || props.FID}`,
        description: props.Name || props.Location,
        lat: props.Latitude,
        lon: props.Longitude,
        streamUrl: props.Camera_Link,
        source: 'WYDOT',
        state: 'WY',
      }),
  });

  const teton = await fetchArcGisBboxCameras(bbox, {
    serviceUrl:
      'https://services9.arcgis.com/6ukHJ1QHS9lvQoRO/arcgis/rest/services/Teton_County_WY_Webcams_Images/FeatureServer/0',
    where: "url IS NOT NULL AND url LIKE '%wyoroad.info%'",
    outFields: 'OBJECTID,view_area,url',
    returnGeometry: 'true',
    mapFeature: (props, feature) => {
      const streamUrl = httpsUrl(props.url);
      if (!streamUrl || isBrokenWyoroadUrl(streamUrl)) return null;
      return normalizeCamera({
        id: `wy-teton-${props.OBJECTID}`,
        description: props.view_area || 'WY webcam',
        lat: feature.geometry?.y,
        lon: feature.geometry?.x,
        streamUrl,
        source: 'WYDOT',
        state: 'WY',
        camKind: 'weather',
      });
    },
  }).catch(() => []);

  return [...cheyenne, ...teton];
}

const iterisPoolCaches = new Map();

/** Map one Iteris ATIS geojson camera feature. */
export function mapIterisCameraFeature(feature, stateCode, sourceLabel = `${stateCode} DOT`) {
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  const snapshot = httpsUrl(props.image_url || props.snapshot_url || props.icon_url);
  const hls = normalizeHlsUrl(pickLiveFirst(props.https_url, props.stream_url, props.video_url, props.ios_url));
  if (!snapshot && !hls) return null;
  return normalizeCamera({
    id: `${stateCode.toLowerCase()}-${props.id || props.description || `${lat}-${lon}`}`,
    description: props.description || props.name,
    lat,
    lon,
    streamUrl: hls || snapshot,
    liveUrl: hls || undefined,
    previewUrl: snapshot || undefined,
    source: sourceLabel,
    state: stateCode,
  });
}

/** SD Iteris sites expose nested camera views under properties.cameras[]. */
export function mapSouthDakotaIterisFeature(feature) {
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  const views = Array.isArray(props.cameras) ? props.cameras : [];
  return views
    .map((view) => {
      const snapshot = httpsUrl(view.image);
      if (!snapshot) return null;
      return normalizeCamera({
        id: `sd-${feature.id || props.name}-${view.id}`,
        description: view.description || `${props.route || props.name} ${view.name || ''}`.trim(),
        lat,
        lon,
        streamUrl: snapshot,
        source: 'SD DOT',
        state: 'SD',
      });
    })
    .filter(Boolean);
}

let southDakotaIterisCache = { fetchedAt: 0, cameras: [] };

async function fetchSouthDakotaCameras(bbox) {
  return fetchCamerasFromPoolCache(southDakotaIterisCache, bbox, async () => {
    const body = await fetchCachedJson(
      'https://sd.cdn.iteris-atis.com/geojson/icons/metadata/icons.cameras.geojson',
      'iteris-sd-cameras'
    );
    const features = Array.isArray(body?.features) ? body.features : [];
    return features.flatMap((feature) => mapSouthDakotaIterisFeature(feature));
  });
}

async function fetchIterisCameras(bbox, stateCode, cacheKey, url, sourceLabel) {
  const poolKey = `${stateCode}:${cacheKey}`;
  let cache = iterisPoolCaches.get(poolKey);
  if (!cache) {
    cache = { fetchedAt: 0, cameras: [] };
    iterisPoolCaches.set(poolKey, cache);
  }

  await refreshCameraPoolCache(cache, async () => {
    const body = await fetchCachedJson(url, cacheKey);
    const features = Array.isArray(body?.features) ? body.features : [];
    return features.map((feature) => mapIterisCameraFeature(feature, stateCode, sourceLabel));
  });

  return filterCamerasByBbox(cache.cameras, bbox);
}

/** Live HLS + verified snapshot fetchers. */
export const DIRECT_FETCHERS = [
  { id: 'missouri-traffic', region: regionFor('MO'), states: ['MO'], fetch: fetchMissouriTrafficCameras },
  { id: 'aldot', region: regionFor('AL'), states: ['AL'], fetch: fetchAlabama511Cameras },
  { id: 'mississippi-traffic', region: regionFor('MS'), states: ['MS'], fetch: fetchMississippiTrafficCameras },
  { id: 'caltrans', region: regionFor('CA'), states: ['CA'], fetch: fetchCaltransCameras },
  { id: 'hdot', region: regionFor('HI'), states: ['HI'], fetch: fetchHawaiiCameras },
  { id: 'vdot', region: regionFor('VA'), states: ['VA'], fetch: fetchVirginiaCameras },
  { id: 'ny511', region: regionFor('NY'), states: ['NY'], fetch: fetchNy511Cameras },
  { id: 'tdot', region: regionFor('TN'), states: ['TN'], fetch: fetchTennesseeCameras },
  { id: 'deldot', region: regionFor('DE'), states: ['DE'], fetch: fetchDelawareCameras },
  { id: 'iowa', region: regionFor('IA'), states: ['IA'], fetch: fetchIowaCameras },
  { id: 'cotrip', region: regionFor('CO'), states: ['CO'], fetch: fetchColorado511Cameras },
  {
    id: 'scdot',
    region: regionFor('SC'),
    states: ['SC'],
    fetch: (bbox) =>
      fetchIterisCameras(
        bbox,
        'SC',
        'iteris-sc-cameras',
        'https://sc.cdn.iteris-atis.com/geojson/icons/metadata/icons.cameras.geojson',
        'SC DOT'
      ),
  },
  {
    id: 'sddot',
    region: regionFor('SD'),
    states: ['SD'],
    fetch: fetchSouthDakotaCameras,
  },
  {
    id: 'fl511',
    region: regionFor('FL'),
    states: ['FL'],
    fetch: fetchFlorida511Cameras,
  },
  {
    id: 'ut511',
    region: regionFor('UT'),
    states: ['UT'],
    fetch: fetchUtah511Cameras,
  },
  {
    id: 'pa511',
    region: regionFor('PA'),
    states: ['PA'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://www.511pa.com',
        stateCode: 'PA',
        cacheKey: 'pa511-cameras',
        sourceLabel: '511PA',
      }),
  },
  {
    id: 'az511',
    region: regionFor('AZ'),
    states: ['AZ'],
    fetch: fetchArizona511Cameras,
  },
  {
    id: 'nv511',
    region: regionFor('NV'),
    states: ['NV'],
    fetch: fetchNevada511Cameras,
  },
  {
    id: 'la511',
    region: regionFor('LA'),
    states: ['LA'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://www.511la.org',
        stateCode: 'LA',
        cacheKey: 'la511-cameras',
        sourceLabel: '511LA',
      }),
  },
  {
    id: 'ct511',
    region: regionFor('CT'),
    states: ['CT'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://www.ctroads.org',
        stateCode: 'CT',
        cacheKey: 'ct511-cameras',
        sourceLabel: 'CTroads',
      }),
  },
  {
    id: 'ne511',
    region: regionFor('MA', 'RI', 'VT', 'NH', 'ME'),
    states: ['MA', 'RI', 'VT', 'NH', 'ME'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://newengland511.org',
        stateCode: 'MA',
        cacheKey: 'ne511-cameras',
        sourceLabel: 'New England 511',
        assignStateFromCoords: true,
      }),
  },
  { id: 'ohgo', region: regionFor('OH'), states: ['OH'], fetch: fetchOhioCameras },
  { id: 'or-dot', region: regionFor('OR'), states: ['OR'], fetch: fetchOregonCameras },
  { id: 'wsdot', region: regionFor('WA'), states: ['WA'], fetch: fetchWsdotCameras },
  { id: 'trimarc', region: regionFor('KY', 'IN'), states: ['KY', 'IN'], fetch: fetchTrimarcCameras },
  { id: 'idaho', region: regionFor('ID'), states: ['ID'], fetch: fetchIdaho511Cameras },
  { id: 'tx-local', region: regionFor('TX'), states: ['TX'], fetch: fetchTexasCameras },
  {
    id: 'ga511',
    region: regionFor('GA'),
    states: ['GA'],
    fetch: fetchGeorgia511Cameras,
  },
  {
    id: 'wi511',
    region: regionFor('WI'),
    states: ['WI'],
    fetch: fetchWisconsin511Cameras,
  },
  {
    id: 'nc511',
    region: regionFor('NC'),
    states: ['NC'],
    fetch: fetchNorthCarolina511Cameras,
  },
  {
    id: 'kansas-cars',
    region: regionFor('KS'),
    states: ['KS'],
    fetch: fetchKansasCarsCameras,
  },
  {
    id: 'oktraffic',
    region: regionFor('OK'),
    states: ['OK'],
    fetch: fetchOklahomaTrafficCameras,
  },
  { id: 'ak511', region: regionFor('AK'), states: ['AK'], fetch: fetchAlaskaCameras },
  { id: 'midrive', region: regionFor('MI'), states: ['MI'], fetch: fetchMichiganCameras },
  { id: 'nmroads', region: regionFor('NM'), states: ['NM'], fetch: fetchNewMexicoCameras },
  {
    id: 'illinois-tm',
    region: regionFor('IL'),
    states: ['IL'],
    fetch: fetchIllinoisTravelMidwestCameras,
  },
  {
    id: 'indiana-511',
    region: regionFor('IN'),
    states: ['IN'],
    fetch: fetchIndiana511Cameras,
  },
  {
    id: 'nebraska-511',
    region: regionFor('NE'),
    states: ['NE'],
    fetch: fetchNebraska511Cameras,
  },
  {
    id: 'travelmidwest',
    region: regionFor('IL', 'MO', 'IA', 'IN', 'WI', 'KY', 'MN'),
    states: ['IL', 'MO', 'IA', 'IN', 'WI', 'KY', 'MN'],
    fetch: fetchTravelMidwestCameras,
  },
  { id: 'wyoming', region: regionFor('WY'), states: ['WY'], fetch: fetchWyomingCameras },
  {
    id: 'alertwest',
    region: CONUS_BBOX,
    states: ['CA', 'NV', 'OR', 'WA', 'AZ', 'UT', 'CO', 'NM', 'WY', 'MT', 'ID'],
    fetch: fetchWeatherCameras,
  },
].filter((entry) => entry.region);

export function fetchDirectCameras(bbox) {
  const active = DIRECT_FETCHERS.filter(({ region }) => regionsOverlap(region, bbox));
  return Promise.allSettled(active.map(({ fetch }) => fetch(bbox))).then((results) => {
    const sourceCounts = {};
    let cameras = [];
    results.forEach((result, index) => {
      const sourceId = active[index].id;
      if (result.status !== 'fulfilled') return;
      sourceCounts[sourceId] = result.value.length;
      cameras.push(...result.value);
    });
    return { cameras, sourceCounts, sources: active.map(({ id }) => id) };
  });
}

export const DIRECT_STATE_COVERAGE = [
  ...new Set(DIRECT_FETCHERS.flatMap(({ states }) => states)),
].sort();

/** States with no working free public feed found after exhaustive probing. */
export const STATE_FEED_GAPS = {
  AR: 'iDrive Arkansas has no public mapIcons/getcameras API',
  AL: 'ALDOT ArcGIS serves ~560 Wowza HLS views (cdn3.wowza.com) plus api.algotraffic.com snapshots',
  DC: 'DDOT publishes CCTV locations in ArcGIS but no free snapshot/stream URLs',
  DE: 'DelDOT videocamera.json serves 356 Wowza HLS views on video.deldot.gov (100% probe success)',
  CA: 'Caltrans ArcGIS serves live HLS (streamingVideoURL) plus currentImageURL snapshots statewide',
  WA: 'WSDOT TravelInfoCamerasWeather serves snapshot images statewide (images.wsdot.wa.gov)',
  OR: 'TripCheck cctvinventory serves ~1,125 RoadCams snapshot JPGs; videoId is TrafficLand pseudo-live only (no public HLS)',
  AK: '511 Alaska ArcGIS serves snapshot previews on 511.alaska.gov/map/Cctv statewide',
  SC: 'SC DOT Iteris geojson serves ~760 skyvdn HLS views with scdotsnap snapshot thumbs',
  PA: '511PA mapIcons serves snapshot previews on 511pa.com/map/Cctv statewide',
  ME: 'New England 511 mapIcons serves ME snapshot previews (newengland511.org)',
  VT: 'New England 511 mapIcons serves VT snapshot previews (newengland511.org)',
  TX: 'Austin Mobility + Arlington ArcGIS serve local snapshot feeds (no statewide TxDOT pool yet)',
  KY: 'Trimarc/KY-IN DOT corridor snapshots plus Travel Midwest on some routes',
  HI: 'HDOT ArcGIS serves snapshot JPG URLs statewide',
  IL: 'Travel Midwest GTIS serves ~3,500 IL snapshot views (all directions); live HLS not published',
  IN: '511IN CARS serves ~740 INDOT HLS views on trafficwise.org plus carsprogram snapshot previews',
  OH: 'OHGO serves ~1,160 ODOT snapshot views (all directions at multi-view sites)',
  MO: 'Missouri DOT ArcGIS (~700+ views statewide) plus Springfield Ozarks HLS; MoDOT rtplive uses browser-direct playback',
  KS: 'KanDrive CARS feed serves ~500 views with skyvdn HLS plus kscam.carsprogram.org snapshots (kstg.carsprogram.org)',
  MD: 'MDOT ArcGIS lists cameras but chart.maryland.gov video.php snapshot/stream URLs return 404',
  MI: 'MiDrive camera list exposes HTML snapshot URLs only',
  MN: '511MN mapIcons endpoint unavailable; Travel Midwest covers some MN corridor cameras',
  MS: 'MDOTtraffic LoadCameraData + regional Wowza servers (~1,030 HLS views on streaming*.mdottraffic.com)',
  MT: 'Iteris MT geojson serves snapshot images only',
  NC: 'DriveNC list feed serves ~1,100 snapshot views statewide (drivenc.gov/map/Cctv; SKYLINE HLS is auth-gated)',
  ND: 'ND Roads has no public camera JSON feed',
  NE: '511NE CARS serves ~1,078 NDOR snapshot views statewide (dot511.nebraska.gov STILL_IMAGE URLs)',
  NY: '511NY getcameras serves ~1,550 skyvdn HLS views with Url snapshot fallback (~95% HLS reachability)',
  NJ: '511NJ mapIcons blocked; Turnpike ArcGIS layers are not publicly queryable',
  NM: 'NMRoads GetCameraInfo serves ~180 snapshot images statewide (servicev4.nmroads.com)',
  OK: 'OKTraffic cameraPoles API serves ~388 live HLS views via stream.oktraffic.org',
  AZ: 'AZ511 list feed serves ~640 snapshot views statewide (az511.gov/map/Cctv)',
  NV: 'NVRoads list feed serves ~650 views with public its.nv.gov HLS plus nvroads.com snapshots',
  UT: 'UDOT 511 list feed serves ~2,050 snapshot views statewide (udottraffic.utah.gov/map/Cctv)',
  CO: 'CDOT CARS cotrip.org serves ~1,030 live HLS views with carsprogram snapshot previews',
  ID: 'Idaho 511 list feed serves ~460 snapshot views statewide (511.idaho.gov/map/Cctv)',
  FL: 'FL511 list feed serves ~4,800 snapshot views statewide (DIVAS HLS is auth-gated on fl511.com)',
  GA: '511GA list feed serves ~4,000 snapshot views statewide (SKYLINE HLS is auth-gated on 511ga.org)',
  SD: 'Iteris SD geojson serves snapshot images statewide (sd.cdn.iteris-atis.com)',
  TN: 'TDOT ArcGIS serves ~570 mcleansfs skyvdn HLS views with thumbnailUrl snapshots statewide',
  VA: '511 Virginia serves ~1,670 vdotcameras.com HLS views with snapshot thumbs (ArcGIS skyvdn ios_url is stale/unreachable)',
  WI: '511WI list feed provides live HLS (cctv.dot.wi.gov) plus view snapshots; developer API key optional for v2',
  WV: 'WV511 uses dynamic CameraListing page with no public JSON/snapshot pattern',
  WY: 'WYDOT ArcGIS Camera_Link fields are snapshot JPEGs only',
};
