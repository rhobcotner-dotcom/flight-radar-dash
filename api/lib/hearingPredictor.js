import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHearingPredictor } from '../../lib/hearingMath.js';

const configDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config');

const noiseModel = JSON.parse(readFileSync(path.join(configDir, 'noise-model.json'), 'utf8'));
const noiseCategories = JSON.parse(readFileSync(path.join(configDir, 'noise-categories.json'), 'utf8'));
const noiseProfiles = JSON.parse(readFileSync(path.join(configDir, 'aircraft-noise-profiles.json'), 'utf8'));

const predictor = createHearingPredictor({ noiseModel, noiseCategories, noiseProfiles });

export const bearingDegrees = predictor.bearingDegrees;
export const resolveNoiseCategory = predictor.resolveNoiseCategory;
export const classifyFlightPhase = predictor.classifyFlightPhase;
export const weatherPropagationDb = predictor.weatherPropagationDb;
export const estimateGroundLevelDb = predictor.estimateGroundLevelDb;
export const predictAudibleFlights = predictor.predictAudibleFlights;

export function getNoiseModel() {
  return noiseModel;
}

export function getNoiseCategories() {
  return noiseCategories;
}

export function getNoiseProfiles() {
  return noiseProfiles;
}
