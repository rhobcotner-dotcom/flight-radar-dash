import { createHearingPredictor } from '../../../lib/hearingMath.js';
import noiseModel from '../../../config/noise-model.json';
import noiseCategories from '../../../config/noise-categories.json';
import noiseProfiles from '../../../config/aircraft-noise-profiles.json';

const predictor = createHearingPredictor({
  noiseModel,
  noiseCategories,
  noiseProfiles,
});

export const classifyFlightPhase = predictor.classifyFlightPhase;
export const estimateGroundLevelDb = predictor.estimateGroundLevelDb;
export const predictAudibleFlights = predictor.predictAudibleFlights;
export const resolveNoiseCategory = predictor.resolveNoiseCategory;
