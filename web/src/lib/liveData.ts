export interface LiveDashboardPayload {
  fetchedAt: string;
  miso: {
    totalMw: number;
    hubLmp: number | null;
    hubName: string;
    carbonIntensityScore: number | null;
    carbonLabel: string;
    fuels: Array<{ category: string; mw: number }>;
    interval: string | null;
  } | null;
  sports: {
    tonight: Array<{
      league: string;
      team: string;
      opponent: string;
      startTime: string;
      venue: string;
      status: string;
    }>;
    trafficNote: string;
  } | null;
  nas: {
    summary: string;
    count: number;
    airports: Array<{ code: string; delays: Array<{ reason: string; minDelay: string | null }> }>;
  } | null;
  aurora: { kp: number | null; message: string };
  goldenHour: {
    phase: string;
    sunriseApprox: string;
    sunsetApprox: string;
    milkyWayNote: string;
  };
  drought: { homeLabel: string; homeLevel: number | null };
  outages: { enabled: boolean; message: string };
  pulsepoint: { enabled: boolean; message: string };
  pollen: { enabled: boolean; message: string };
}
