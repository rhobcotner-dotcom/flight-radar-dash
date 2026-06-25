import vesselTypePhotos from '../../../config/vessel-type-photos.json';
import type { AisVessel } from './mapLayers';
import {
  GENERIC_VESSEL_PHOTO_TYPES,
  inferVesselPhotoType,
  pickVariantPhotoUrl,
  vesselPhotoTypeLabel,
} from '../../../lib/vesselPhotoType.js';

type PhotoEntry = string | string[];

const TYPE_PHOTOS = vesselTypePhotos as Record<string, PhotoEntry>;

export function resolveVesselPhotoType(vessel: AisVessel) {
  return vessel.photoType || inferVesselPhotoType(vessel);
}

export function vesselTypeLabel(vessel: AisVessel) {
  const photoType = resolveVesselPhotoType(vessel);
  if (photoType) return vesselPhotoTypeLabel(photoType);

  return vessel.typeLabel?.trim() || vessel.rawVesselType?.replace(/_/g, ' ') || 'Ship';
}

export function vesselSizeLabel(vessel: AisVessel) {
  if (vessel.lengthMeters != null) {
    const meters = vessel.lengthMeters > 150 ? vessel.lengthMeters / 10 : vessel.lengthMeters;
    return `${Math.round(meters)} m`;
  }
  return vesselTypeLabel(vessel);
}

export function curatedVesselTypePhotoUrl(vessel: AisVessel) {
  const photoType = resolveVesselPhotoType(vessel);
  if (!photoType || GENERIC_VESSEL_PHOTO_TYPES.has(photoType)) return null;

  return pickVariantPhotoUrl(photoType, vessel.mmsi || vessel.name, TYPE_PHOTOS);
}

export function vesselPhotoProxyUrl(vessel: AisVessel) {
  const name = vessel.name?.trim();
  if (!name || /^unknown/i.test(name)) return null;

  const params = new URLSearchParams({ name });
  const photoType = resolveVesselPhotoType(vessel);
  const type = vessel.typeLabel?.trim();
  const rawType = vessel.rawVesselType?.trim();
  if (photoType) params.set('photoType', photoType);
  if (type) params.set('type', type);
  if (rawType) params.set('rawType', rawType);
  return `/api/images/vessel?${params.toString()}`;
}

export function vesselTypePhotoProxyUrl(vessel: AisVessel) {
  const photoType = resolveVesselPhotoType(vessel);
  const type = vessel.typeLabel?.trim();
  const rawType = vessel.rawVesselType?.trim();
  if (!photoType && !type && !rawType) return null;

  const params = new URLSearchParams();
  if (photoType) params.set('photoType', photoType);
  if (type) params.set('type', type);
  if (rawType) params.set('rawType', rawType);
  if (vessel.mmsi) params.set('seed', vessel.mmsi);
  return `/api/images/vessel-type?${params.toString()}`;
}

export type VesselVisualCandidate =
  | { kind: 'photo' | 'type-photo'; url: string; label: string };

export function vesselImageCandidates(vessel: AisVessel): VesselVisualCandidate[] {
  const candidates: VesselVisualCandidate[] = [];
  const label = vesselTypeLabel(vessel);

  if (vessel.photoUrl) {
    candidates.push({ kind: 'photo', url: vessel.photoUrl, label: vessel.name });
  }

  const namePhoto = vesselPhotoProxyUrl(vessel);
  if (namePhoto && resolveVesselPhotoType(vessel) !== 'towboat') {
    candidates.push({ kind: 'photo', url: namePhoto, label: vessel.name });
  }

  const curated = curatedVesselTypePhotoUrl(vessel);
  if (curated) {
    candidates.push({ kind: 'type-photo', url: curated, label });
  }

  const typePhoto = vesselTypePhotoProxyUrl(vessel);
  if (typePhoto) {
    candidates.push({ kind: 'type-photo', url: typePhoto, label });
  }

  return candidates;
}
