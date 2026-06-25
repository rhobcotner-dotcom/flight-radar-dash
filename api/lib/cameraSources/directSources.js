import {
  arcGisEnvelopeParams,
  fetchCachedJson,
  fetchCachedText,
  filterByBbox,
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
} from './helpers.js';

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

async function fetchModotCameras(bbox) {
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

async function fetchTravelMidwestCameras(bbox) {
  const params = new URLSearchParams({
    where: `x BETWEEN ${bbox.west} AND ${bbox.east} AND y BETWEEN ${bbox.south} AND ${bbox.north} AND SnapShot IS NOT NULL`,
    outFields: 'CameraLocation,SnapShot,x,y',
    returnGeometry: 'false',
    resultRecordCount: '2000',
    f: 'json',
  });
  const features = await queryArcGis(
    'https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0/query',
    params
  );
  const seen = new Set();
  const cameras = [];
  for (const feature of features) {
    const props = feature.attributes || {};
    const locationKey = String(props.CameraLocation || '')
      .replace(/\([^)]*\)/g, '')
      .trim()
      .toLowerCase();
    const dedupeKey = locationKey || `${roundCoord(props.y)}:${roundCoord(props.x)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const cam = normalizeCamera({
      id: `tm-${dedupeKey.slice(0, 40).replace(/\W+/g, '-')}-${roundCoord(props.y, 2)}`,
      description: props.CameraLocation,
      lat: props.y,
      lon: props.x,
      streamUrl: props.SnapShot,
      source: 'Travel Midwest',
      state: 'IL',
    });
    if (cam) cameras.push(cam);
  }
  return cameras;
}

async function fetchCaltransCameras(bbox) {
  const params = new URLSearchParams({
    where: `latitude BETWEEN ${bbox.south} AND ${bbox.north} AND longitude BETWEEN ${bbox.west} AND ${bbox.east} AND streamingVideoURL IS NOT NULL`,
    outFields: 'locationName,currentImageURL,streamingVideoURL,latitude,longitude',
    returnGeometry: 'false',
    resultRecordCount: '2000',
    f: 'json',
  });
  const features = await queryArcGis(
    'https://gisdata.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      return normalizeCamera({
        id: `ca-${props.locationName || props.OBJECTID}`,
        description: props.locationName,
        lat: props.latitude,
        lon: props.longitude,
        streamUrl: props.streamingVideoURL,
        liveUrl: props.streamingVideoURL,
        source: 'Caltrans',
        state: 'CA',
      });
    })
    .filter(Boolean);
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
      return normalizeCamera({
        id: `kyin-${roundCoord(props.latitude, 2)}-${roundCoord(props.longitude, 2)}`,
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

async function fetchWsdotCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: 'ImageURL IS NOT NULL',
    outFields: 'CameraTitle,ImageURL',
    resultRecordCount: '2000',
  });
  const features = await queryArcGis(
    'https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
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
    })
    .filter(Boolean);
}

async function fetchIowaCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: 'VideoURL IS NOT NULL',
    outFields: 'ImageName,VideoURL',
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
      return normalizeCamera({
        id: `ia-${props.ImageName || props.OBJECTID}`,
        description: props.ImageName,
        lat: coords?.y,
        lon: coords?.x,
        streamUrl: props.VideoURL,
        liveUrl: props.VideoURL,
        source: 'Iowa DOT',
        state: 'IA',
      });
    })
    .filter(Boolean);
}

async function fetchOhioCameras(bbox) {
  const rows = await fetchCachedJson('https://api.ohgo.com/roadmarkers/cameras', 'ohgo-cameras');
  if (!Array.isArray(rows)) return [];
  return filterByBbox(rows, bbox, (row) => row.Latitude, (row) => row.Longitude)
    .map((row) =>
      normalizeCamera({
        id: `oh-${row.Id}`,
        description: row.Location || row.Description,
        lat: row.Latitude,
        lon: row.Longitude,
        streamUrl: row.Cameras?.[0]?.LargeURL || row.Cameras?.[0]?.SmallURL,
        source: 'OHGO',
        state: 'OH',
      })
    )
    .filter(Boolean);
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

async function fetchNewMexicoCameras(bbox) {
  const body = await fetchCachedJson(
    'https://servicev4.nmroads.com/RealMapWAR//GetCameraInfo',
    'nmroads-cameras'
  );
  const rows = Array.isArray(body?.cameraInfo) ? body.cameraInfo : [];
  return rows
    .filter((row) => pointInBbox(row.lat, row.lon, bbox))
    .map((row) =>
      normalizeCamera({
        id: `nm-${row.name}`,
        description: row.title || row.name,
        lat: row.lat,
        lon: row.lon,
        streamUrl: `https://servicev4.nmroads.com/RealMapWAR/GetCameraImage?ts=0&cameraName=${encodeURIComponent(row.name)}`,
        source: 'NMRoads',
        state: 'NM',
      })
    )
    .filter(Boolean);
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

async function fetchNy511Cameras(bbox) {
  const rows = await fetchCachedJson(
    'https://511ny.org/api/getcameras?format=json&key=&start=0&length=5000',
    'ny511-cameras'
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(
      (row) =>
        !row.Disabled &&
        !row.Blocked &&
        row.VideoUrl &&
        pointInBbox(row.Latitude, row.Longitude, bbox)
    )
    .map((row) =>
      normalizeCamera({
        id: `ny-${row.ID}`,
        description: row.Name,
        lat: row.Latitude,
        lon: row.Longitude,
        streamUrl: row.VideoUrl,
        liveUrl: row.VideoUrl,
        source: '511NY',
        state: 'NY',
      })
    )
    .filter(Boolean);
}

async function fetchOregonCameras(bbox) {
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

async function fetchColoradoCotripCameras(bbox) {
  const rows = await fetchCachedJson(
    'https://cotg.carsprogram.org/cameras_v1/api/cameras',
    'cotrip-cameras-v1'
  );
  const cameras = Array.isArray(rows) ? rows : [];
  return cameras.flatMap((row) => {
    if (row.active === false || !row.location) return [];
    const lat = row.location.latitude ?? row.location.lat;
    const lon = row.location.longitude ?? row.location.lon;
    if (!pointInBbox(lat, lon, bbox)) return [];
    const view = (row.views || []).find((entry) => normalizeHlsUrl(entry.url)) || row.views?.[0];
    if (!view?.url) return [];
    const cam = normalizeCamera({
      id: `co-${row.id}`,
      description: view.name || row.name,
      lat,
      lon,
      streamUrl: view.url,
      liveUrl: view.url,
      source: 'CDOT',
      state: 'CO',
    });
    return cam ? [cam] : [];
  });
}

async function fetchColoradoCameras(bbox) {
  const params = new URLSearchParams({
    where: `Latitude BETWEEN ${bbox.south} AND ${bbox.north} AND Longitude BETWEEN ${bbox.west} AND ${bbox.east} AND URL_Cam IS NOT NULL`,
    outFields: 'CameraName,URL_Cam,Latitude,Longitude',
    returnGeometry: 'false',
    resultRecordCount: '2000',
    f: 'json',
  });
  const features = await queryArcGis(
    'https://services.arcgis.com/DO4gTjwJVIJ7O9Ca/arcgis/rest/services/CDOT_Traffic_Cameras_V2/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      return normalizeCamera({
        id: `co-${props.CameraName || props.CameraId}`,
        description: props.CameraName,
        lat: props.Latitude,
        lon: props.Longitude,
        streamUrl: httpsUrl(props.URL_Cam),
        source: 'CDOT',
        state: 'CO',
      });
    })
    .filter(Boolean);
}

async function fetchAlabamaCameras(bbox) {
  const params = new URLSearchParams({
    where: `Latitude BETWEEN ${bbox.south} AND ${bbox.north} AND Longitude BETWEEN ${bbox.west} AND ${bbox.east} AND StreamUrl IS NOT NULL`,
    outFields: 'Name,StreamUrl,ImageUrl,Latitude,Longitude,Id,DeviceId,ObjectId',
    returnGeometry: 'false',
    resultRecordCount: '2000',
    f: 'json',
  });
  const features = await queryArcGis(
    'https://services7.arcgis.com/33Tmvrm3G2UZLFK9/arcgis/rest/services/ALDOT_TC_HLS_Public/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      return normalizeCamera({
        id: `al-${props.Id ?? props.DeviceId ?? props.ObjectId ?? props.Name}`,
        description: props.Name || props.PrimaryRoad,
        lat: props.Latitude,
        lon: props.Longitude,
        streamUrl: props.StreamUrl,
        liveUrl: props.StreamUrl,
        source: 'ALDOT',
        state: 'AL',
      });
    })
    .filter(Boolean);
}

async function fetchTennesseeCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: 'httpsVideoUrl IS NOT NULL',
    outFields: 'title,httpsVideoUrl,thumbnailUrl,location__coordinates__lat,location__coordinates__lng,route',
    returnGeometry: 'false',
    resultRecordCount: '2000',
  });
  const features = await queryArcGis(
    'https://services8.arcgis.com/hkhKI6Qq7rjvBjZU/arcgis/rest/services/RoadwayCameras/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      return normalizeCamera({
        id: `tn-${props.id || props.title}`,
        description: props.title || props.route,
        lat: props.location__coordinates__lat,
        lon: props.location__coordinates__lng,
        streamUrl: props.httpsVideoUrl,
        liveUrl: props.httpsVideoUrl,
        source: 'TDOT',
        state: 'TN',
      });
    })
    .filter(Boolean);
}

async function fetchHawaiiCameras(bbox) {
  const body = await fetchCachedJson(
    'https://services.arcgis.com/6I1ysurtNWNxkuwd/arcgis/rest/services/HawaiiTrafficCameras/FeatureServer/0/query?where=1%3D1&outFields=Camera_Description,URL&returnGeometry=true&outSR=4326&resultRecordCount=200&f=json',
    'hi-traffic-cameras'
  );
  const features = Array.isArray(body?.features) ? body.features : [];
  return features
    .filter((feature) => {
      const coords = feature.geometry;
      return pointInBbox(coords?.y, coords?.x, bbox);
    })
    .map((feature) => {
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
    })
    .filter(Boolean);
}

async function fetchMapIcons511Cameras(bbox, { baseUrl, stateCode, cacheKey, sourceLabel, assignStateFromCoords = false }) {
  const body = await fetchCachedJson(`${baseUrl}/map/mapIcons/Cameras`, cacheKey);
  const items = Array.isArray(body?.item2) ? body.item2 : [];
  return items
    .filter((item) => {
      const coords = item.location;
      if (!Array.isArray(coords) || coords.length < 2) return false;
      return pointInBbox(coords[0], coords[1], bbox);
    })
    .map((item) => {
      const lat = item.location[0];
      const lon = item.location[1];
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
    })
    .filter(Boolean);
}

async function fetchAlaskaCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    where: "Status='Enabled'",
    outFields: 'Id,Name,Latitude,Longitude',
    returnGeometry: 'false',
    resultRecordCount: '2000',
  });
  const features = await queryArcGis(
    'https://services.arcgis.com/fX5IGselyy1TirdY/arcgis/rest/services/511_Cameras/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
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
    })
    .filter(Boolean);
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

async function fetchVirginiaCameras(bbox) {
  return fetchArcGisBboxCameras(bbox, {
    serviceUrl:
      'https://services.arcgis.com/hRUr1F8lE8Jq2uJo/arcgis/rest/services/CameraLocationVDOT/FeatureServer/0',
    where: 'ios_url IS NOT NULL OR image_url IS NOT NULL',
    outFields: 'descriptio,route,latitude,longitude,ios_url,image_url,id',
    mapFeature: (props) =>
      normalizeCamera({
        id: `va-${props.id || props.deviceid}`,
        description: props.descriptio || props.route,
        lat: props.latitude,
        lon: props.longitude,
        streamUrl: skyvdnStreamUrl(props.ios_url),
        source: 'VDOT',
        state: 'VA',
      }),
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
      });
    },
  }).catch(() => []);

  return [...cheyenne, ...teton];
}

async function fetchIdahoCameras(bbox) {
  const params = arcGisEnvelopeParams(bbox, {
    outFields: 'UniqueID,LocationName,Latitude,Longitude',
    resultRecordCount: '2000',
  });
  const features = await queryArcGis(
    'https://gisp.itd.idaho.gov/server/rest/services/GDWarehouse/IntelligentTransportationSystems/FeatureServer/0/query',
    params
  );
  return features
    .map((feature) => {
      const props = feature.attributes || {};
      const lat = props.Latitude ?? feature.geometry?.y;
      const lon = props.Longitude ?? feature.geometry?.x;
      const cameraId = encodeURIComponent(props.UniqueID || '');
      return normalizeCamera({
        id: `id-${props.UniqueID}`,
        description: props.LocationName,
        lat,
        lon,
        streamUrl: cameraId ? `https://511.idaho.gov/map/Cctv/${cameraId}` : null,
        source: 'Idaho DOT',
        state: 'ID',
      });
    })
    .filter(Boolean);
}

async function fetchIterisCameras(bbox, stateCode, cacheKey, url) {
  const body = await fetchCachedJson(url, cacheKey);
  const features = Array.isArray(body?.features) ? body.features : [];
  return features
    .filter((feature) => {
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return false;
      return pointInBbox(coords[1], coords[0], bbox);
    })
    .map((feature) => {
      const props = feature.properties || {};
      const [lon, lat] = feature.geometry.coordinates;
      const liveUrl = pickLiveFirst(props.https_url, props.stream_url, props.video_url);
      if (!liveUrl) return null;
      return normalizeCamera({
        id: `${stateCode.toLowerCase()}-${props.id || props.description || lat}`,
        description: props.description || props.name,
        lat,
        lon,
        streamUrl: liveUrl,
        liveUrl,
        source: `${stateCode} DOT`,
        state: stateCode,
      });
    })
    .filter(Boolean);
}

/** Live HLS + verified snapshot fetchers. */
export const DIRECT_FETCHERS = [
  { id: 'modot', region: regionFor('MO'), states: ['MO'], fetch: fetchModotCameras },
  { id: 'caltrans', region: regionFor('CA'), states: ['CA'], fetch: fetchCaltransCameras },
  { id: 'ny511', region: regionFor('NY'), states: ['NY'], fetch: fetchNy511Cameras },
  { id: 'tdot', region: regionFor('TN'), states: ['TN'], fetch: fetchTennesseeCameras },
  { id: 'deldot', region: regionFor('DE'), states: ['DE'], fetch: fetchDelawareCameras },
  { id: 'iowa', region: regionFor('IA'), states: ['IA'], fetch: fetchIowaCameras },
  { id: 'cotrip', region: regionFor('CO'), states: ['CO'], fetch: fetchColoradoCotripCameras },
  {
    id: 'scdot',
    region: regionFor('SC'),
    states: ['SC'],
    fetch: (bbox) =>
      fetchIterisCameras(
        bbox,
        'SC',
        'iteris-sc-cameras',
        'https://sc.cdn.iteris-atis.com/geojson/icons/metadata/icons.cameras.geojson'
      ),
  },
  {
    id: 'fl511',
    region: regionFor('FL'),
    states: ['FL'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://www.fl511.com',
        stateCode: 'FL',
        cacheKey: 'fl511-cameras',
        sourceLabel: 'FL511',
      }),
  },
  {
    id: 'ut511',
    region: regionFor('UT'),
    states: ['UT'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://www.udottraffic.utah.gov',
        stateCode: 'UT',
        cacheKey: 'ut511-cameras',
        sourceLabel: 'UDOT 511',
      }),
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
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://www.az511.gov',
        stateCode: 'AZ',
        cacheKey: 'az511-cameras',
        sourceLabel: 'AZ511',
      }),
  },
  {
    id: 'nv511',
    region: regionFor('NV'),
    states: ['NV'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://www.nvroads.com',
        stateCode: 'NV',
        cacheKey: 'nv511-cameras',
        sourceLabel: 'NVRoads',
      }),
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
  { id: 'idaho', region: regionFor('ID'), states: ['ID'], fetch: fetchIdahoCameras },
  { id: 'tx-local', region: regionFor('TX'), states: ['TX'], fetch: fetchTexasCameras },
  {
    id: 'ga511',
    region: regionFor('GA'),
    states: ['GA'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://511ga.org',
        stateCode: 'GA',
        cacheKey: 'ga511-cameras',
        sourceLabel: '511GA',
      }),
  },
  {
    id: 'wi511',
    region: regionFor('WI'),
    states: ['WI'],
    fetch: (bbox) =>
      fetchMapIcons511Cameras(bbox, {
        baseUrl: 'https://511wi.gov',
        stateCode: 'WI',
        cacheKey: 'wi511-cameras',
        sourceLabel: '511WI',
      }),
  },
  { id: 'ak511', region: regionFor('AK'), states: ['AK'], fetch: fetchAlaskaCameras },
  { id: 'midrive', region: regionFor('MI'), states: ['MI'], fetch: fetchMichiganCameras },
  { id: 'nmroads', region: regionFor('NM'), states: ['NM'], fetch: fetchNewMexicoCameras },
  { id: 'travelmidwest', region: regionFor('IL', 'MN'), states: ['IL', 'MN'], fetch: fetchTravelMidwestCameras },
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
  AL: 'ALDOT Wowza HLS feeds fail manifest validation from public networks',
  DC: 'DDOT publishes CCTV locations in ArcGIS but no free snapshot/stream URLs',
  HI: 'Hawaii DOT ArcGIS URLs are snapshot JPGs only',
  IL: 'Travel Midwest snapshots may be sparse outside Chicagoland corridor',
  KS: 'KanDrive has no public camera JSON feed',
  MD: 'CHART ArcGIS camera video.php feeds return 404 (legacy DIVAS snapshot URLs)',
  MI: 'MiDrive camera list exposes HTML snapshot URLs only',
  MN: '511MN mapIcons endpoint unavailable; Travel Midwest covers some MN corridor cameras',
  MS: 'MDOT map app has no mapIcons API; no public ArcGIS media layer found',
  MT: 'Iteris MT geojson serves snapshot images only',
  NC: 'NCDOT retired camera image API (May 2026); ArcGIS links are stale duplicates',
  ND: 'ND Roads has no public camera JSON feed',
  NE: '511 Nebraska has no public camera JSON feed',
  NJ: '511NJ mapIcons blocked; Turnpike ArcGIS layers are not publicly queryable',
  NM: 'NMRoads GetCameraInfo serves snapshot images only',
  OK: 'OKTraffic has no public camera JSON feed',
  SD: 'Iteris SD geojson serves snapshot images only',
  VA: 'VDOT ArcGIS skyvdn HLS endpoints time out / unreachable from public networks',
  WI: '511WI mapIcons serve PNG snapshots only',
  WV: 'WV511 uses dynamic CameraListing page with no public JSON/snapshot pattern',
  WY: 'WYDOT ArcGIS Camera_Link fields are snapshot JPEGs only',
};
