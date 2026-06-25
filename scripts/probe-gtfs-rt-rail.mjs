const feeds = [
  ['MBTA', 'https://cdn.mbta.com/realtime/VehiclePositions.json'],
  ['LA Metro Rail', 'https://api.metro.net/RealTime/RailVehiclePositions/'],
  ['NJT Rail', 'https://raildata.njtransit.com/api/TrainData/getTrainData'],
  ['CTA', 'https://www.transitchicago.com/api/1.0/vehicles.aspx?format=json'],
  ['SEPTA', 'https://www3.septa.org/gtfsrt/septamessages.json'],
  ['SunRail', 'https://sunrail.com/gtfs-realtime/vehiclepositions.json'],
  ['DART', 'https://dart.org/transitdata/gtfsrealtime/vehiclepositions.json'],
  ['Brightline', 'https://api.gobrightline.com/gtfs-realtime/vehiclepositions.json'],
  ['Tri-Rail', 'https://www.tri-rail.com/gtfsrealtime/vehiclepositions.json'],
  ['Metrolink CA', 'https://metrolinktrains.com/gtfs-realtime/vehiclepositions.json'],
  ['Sound Transit', 'https://api.pugetsound.onebusaway.org/api/gtfs_realtime/for/agency/40/vehicle-positions'],
  ['RTD Denver', 'https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.json'],
  ['Caltrain', 'https://www.caltrain.com/gtfs-realtime/vehiclepositions.json'],
  ['MARC', 'https://feeds.mta.maryland.gov/gtfs-realtime/vehiclepositions.json'],
  ['Sounder', 'https://www.soundtransit.org/GTFS-realtime/vehiclepositions.json'],
];

for (const [name, url] of feeds) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'flight-radar-dash-probe/1.0' },
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    let extra = `bytes=${text.length} ct=${ct.slice(0, 40)}`;
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        const body = JSON.parse(text);
        extra += ` entity=${body.entity?.length ?? '?'} vehicles=${body.vehicles?.length ?? body.data?.length ?? '?'}`;
      } catch {
        extra += ' json-parse-fail';
      }
    }
    console.log(`${res.status}\t${name}\t${extra}`);
  } catch (err) {
    console.log(`ERR\t${name}\t${err.message}`);
  }
}
