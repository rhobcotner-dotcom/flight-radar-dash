import type { HearingPrediction } from '../types';
import noiseModel from '../../../config/noise-model.json';
import { carrierName } from './airlineNames';
import { flightLabel, routeLabel } from './flightUtils';

const NOTIFY_SKIP_REASONS = new Set(['not_closing', 'too_far', 'beyond_horizon', 'too_high_and_far']);

/** Notify only when the noise model says you should hear it soon — no manual radius. */
export function shouldNotifyHearingAlert(prediction: HearingPrediction) {
  if (NOTIFY_SKIP_REASONS.has(prediction.reason)) return false;

  const { audibleDb, soonDb } = noiseModel.thresholds;

  if (prediction.audibleNow && prediction.estimatedDb >= audibleDb) {
    return true;
  }

  if (prediction.secondsUntilAudible == null || prediction.estimatedDb < soonDb) {
    return false;
  }

  const { notifyLeadSecondsMax, notifyLeadSecondsMin } = noiseModel.timing;
  return (
    prediction.secondsUntilAudible <= notifyLeadSecondsMax
    && prediction.secondsUntilAudible >= notifyLeadSecondsMin
  );
}

export function hearingAlertLeadLabel(prediction: HearingPrediction) {
  if (prediction.audibleNow) return 'Audible now';
  if (prediction.secondsUntilAudible == null) return 'Approaching';
  if (prediction.secondsUntilAudible < 60) return `In about ${prediction.secondsUntilAudible} seconds`;
  const minutes = Math.max(1, Math.round(prediction.secondsUntilAudible / 60));
  return `In about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function hearingPhaseLabel(phase: string) {
  switch (phase) {
    case 'approach_low':
      return 'On approach';
    case 'takeoff_climb':
      return 'Climbing';
    case 'descent':
      return 'Descending';
    case 'level_low':
      return 'Low altitude';
    case 'cruise_overhead':
      return 'Overhead cruise';
    default:
      return phase.replace(/_/g, ' ');
  }
}

export function hearingAlertTitle(prediction: HearingPrediction) {
  return prediction.audibleNow
    ? 'You should be hearing this flight!'
    : "You'll hear this flight soon!";
}

export function hearingAlertBody(prediction: HearingPrediction) {
  const flight = prediction.flight;
  return `${flightLabel(flight)} · ${routeLabel(flight)} · ${hearingAlertLeadLabel(prediction)}`;
}

export function hearingAlertStats(prediction: HearingPrediction) {
  const flight = prediction.flight;
  const parts = [
    prediction.categoryLabel,
    hearingPhaseLabel(prediction.phase),
    `${prediction.horizontalMiles.toFixed(1)} mi`,
    `${flight.alt ?? '—'} ft`,
    `${flight.gspeed ?? '—'} kt`,
    `~${prediction.estimatedDb} dBA indoor est.`,
  ];
  return parts.join(' · ');
}

export function hearingAlertCarrier(prediction: HearingPrediction) {
  return prediction.flight.carrierName || carrierName(prediction.flight);
}

export function getToastAutoDismissMs() {
  return noiseModel.timing.toastAutoDismissMs ?? 14000;
}
