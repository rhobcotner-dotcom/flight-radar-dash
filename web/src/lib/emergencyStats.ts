/** Active emergency event counts shown in the tracking banner. */
export interface EmergencyActiveCounts {
  emsCalls: number;
  fireZones: number;
  wildfirePoints: number;
  nwsAlerts: number;
  femaAreas: number;
  ipawsAlerts: number;
}

export function emergencySummaryToActive(summary?: {
  cityEms?: number;
  wildfirePerimeters?: number;
  wildfireIncidents?: number;
  nwsAlerts?: number;
  femaCounties?: number;
  ipawsAlerts?: number;
} | null): EmergencyActiveCounts | null {
  if (!summary) return null;
  return {
    emsCalls: summary.cityEms ?? 0,
    fireZones: summary.wildfirePerimeters ?? 0,
    wildfirePoints: summary.wildfireIncidents ?? 0,
    nwsAlerts: summary.nwsAlerts ?? 0,
    femaAreas: summary.femaCounties ?? 0,
    ipawsAlerts: summary.ipawsAlerts ?? 0,
  };
}
