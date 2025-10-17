/**
 * FastEffectivenessService.js
 *
 * Implements the improved fast effectiveness algorithm v1.5.
 * Partitions weight change into fat, true muscle, lean water, and other fluid.
 */

class FastEffectivenessService {
  constructor() {
    this.FAT_KCAL_PER_LB = 3500;
    this.GLYCOGEN_WATER_RATIO = 3.2; // water grams per gram glycogen
    this.GLYCOGEN_CAPACITY_RATIO = 0.015; // kg glycogen per kg lean mass
    this.DEFAULT_BODY_FAT = 20; // % used when missing
    this.LEAN_WATER_FRACTION = 0.75; // portion of wet lean that is water
  }

  /**
   * Estimate TDEE using Mifflin-St Jeor with midpoint fallback for sex.
   */
  estimateTDEE(weightLbs, heightCm = null, age = null, sex = null, activity = 'sedentary') {
    const kg = weightLbs / 2.2046;
    const sexConst = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
    const height = heightCm ?? 175;
    const ageValue = age ?? 35;
    const bmr = 10 * kg + 6.25 * height - 5 * ageValue + sexConst;
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const mult = activityMultipliers[activity] ?? 1.2;
    return bmr * mult;
  }

  /**
   * Metabolic adaptation reduces available energy after ~36h of fasting.
   */
  metabolicAdaptationFactor(hours, bodyFatPct) {
    const bf = bodyFatPct ?? this.DEFAULT_BODY_FAT;
    const d = Math.max(0, hours - 36);
    const baseDrop = Math.min(0.12, 0.02 + 0.0008 * d);
    const leannessAdj = Math.min(0.05, Math.max(-0.05, (15 - bf) * 0.003));
    const drop = Math.max(0, Math.min(0.15, baseDrop - leannessAdj));
    return 1 - drop;
  }

  /**
   * Ketosis factor used solely for muscle sparing in v1.5.
   */
  ketosisFactor(hours, { baselineKeto = 0, startInKetosis = false } = {}) {
    const h = Math.max(0, hours);
    if (h === 0) {
      return Math.max(startInKetosis ? 0.5 : 0, baselineKeto);
    }

    const startBoost = startInKetosis ? 0.5 : 0;
    const early = Math.max(startBoost, baselineKeto);

    const timeCurve = (t) => {
      if (t < 16) return 0;
      if (t < 24) return 0.2;
      if (t < 48) return 0.5;
      if (t < 72) return 0.7;
      return 0.8;
    };

    const blendEnd = Math.min(h, 48);
    let blendIntegral = 0;
    if (blendEnd > 0) {
      const integrateSegment = (t0, t1, value) => {
        const startW = Math.min(1, t0 / 48);
        const endW = Math.min(1, t1 / 48);
        const avgW = (startW + endW) / 2;
        const avgCurve = value;
        const avg = (1 - avgW) * early + avgW * avgCurve;
        return avg * (t1 - t0);
      };

      const segments = [
        { start: 0, end: Math.min(blendEnd, 16), value: 0 },
        { start: 16, end: Math.min(blendEnd, 24), value: 0.2 },
        { start: 24, end: Math.min(blendEnd, 48), value: 0.5 }
      ];

      blendIntegral = segments.reduce((acc, { start, end, value }) => {
        if (end <= start) {
          return acc;
        }
        return acc + integrateSegment(start, end, value);
      }, 0);
    }

    let plateauIntegral = 0;
    if (h > 48) {
      const plateauStart = 48;
      const plateauEnd = h;

      const clamp = (value) => Math.min(plateauEnd, Math.max(plateauStart, value));

      const segments = [
        { start: plateauStart, end: clamp(72), value: 0.7 },
        { start: clamp(72), end: plateauEnd, value: 0.8 }
      ];

      plateauIntegral = segments.reduce((acc, { start, end, value }) => {
        if (end <= start) {
          return acc;
        }
        return acc + value * (end - start);
      }, 0);
    }

    return (blendIntegral + plateauIntegral) / h;
  }

  /**
   * Protein buffer from pre-fast protein intake, fading by 48h.
   */
  proteinBufferFactor(hours, preFastProteinGrams = 0) {
    const h = Math.max(0, hours);
    if (h === 0) {
      return 1;
    }

    const maxProtect = 0.35;
    const sat = 1 - Math.exp(-(preFastProteinGrams / 80));
    const level = maxProtect * sat;

    const segment1 = Math.min(h, 24);
    const segment2 = Math.min(Math.max(h - 24, 0), 24);
    const segment3 = Math.max(h - 48, 0);

    const integralSegment1 = (1 - level) * segment1;
    const integralSegment2 = segment2 === 0
      ? 0
      : (1 - level) * segment2 + (level * (segment2 ** 2)) / 48;
    const integralSegment3 = segment3;

    const totalIntegral = integralSegment1 + integralSegment2 + integralSegment3;
    return totalIntegral / h;
  }

  /**
   * Compute protein loss in grams over the fast.
   */
  estimateProteinLossGrams(hours, lbmKg, { baselineKeto = 0, startInKetosis = false, preFastProteinGrams = 0 } = {}) {
    const keto = this.ketosisFactor(hours, { baselineKeto, startInKetosis });
    const baseProteinRate = 0.5; // g protein per kg LBM per day
    const ketoMult = 1 - 0.6 * keto;
    const protBuf = this.proteinBufferFactor(hours, preFastProteinGrams);
    const days = hours / 24;
    return baseProteinRate * ketoMult * protBuf * lbmKg * days;
  }

  /**
   * Split wet lean loss into muscle vs intracellular water.
   */
  decomposeLeanLoss(wetLeanLb, waterFraction = this.LEAN_WATER_FRACTION) {
    const water = wetLeanLb * waterFraction;
    const muscle = wetLeanLb - water;
    return { water, muscle };
  }

  /**
   * Estimate lean loss (protein driven) components.
   */
  estimateLeanLossComponents(hours, startWeightLbs, bodyFatPct, options = {}) {
    const bf = bodyFatPct ?? this.DEFAULT_BODY_FAT;
    const lbmLbs = startWeightLbs * (1 - bf / 100);
    const lbmKg = Math.max(0, lbmLbs / 2.2046);
    if (lbmKg <= 0 || hours <= 0) {
      return {
        proteinLossGrams: 0,
        wetLeanLossLb: 0,
        leanWaterLossLb: 0,
        muscleLossLb: 0
      };
    }

    const proteinLossGrams = this.estimateProteinLossGrams(hours, lbmKg, options);
    const wetLeanLossLb = (proteinLossGrams / 453.592) * 4; // 1 g protein ≈ 4 g wet lean
    const { water: leanWaterLossLb, muscle: muscleLossLb } = this.decomposeLeanLoss(wetLeanLossLb);

    return {
      proteinLossGrams,
      wetLeanLossLb,
      leanWaterLossLb,
      muscleLossLb
    };
  }

  /**
   * Fat oxidation capped by available fat mass and energy demand.
   */
  estimateFatLossLbs(hours, tdee, startWeightLbs, bodyFatPct) {
    if (!hours || hours <= 0 || !tdee || tdee <= 0) {
      return 0;
    }

    const bf = Math.max(0, bodyFatPct ?? this.DEFAULT_BODY_FAT);
    const days = hours / 24;
    const adapt = this.metabolicAdaptationFactor(hours, bf);
    const dailyEnergyNeed = tdee * adapt;
    const deficitLbPerDay = dailyEnergyNeed / this.FAT_KCAL_PER_LB;

    const fatMassLbs = Math.max(0, startWeightLbs * (bf / 100));
    const fatMassKg = fatMassLbs / 2.2046;
    const maxFatKcalPerDay = 69 * fatMassKg;
    const maxFatLbPerDay = maxFatKcalPerDay / this.FAT_KCAL_PER_LB;

    const allowedPerDay = Math.max(0, Math.min(deficitLbPerDay, maxFatLbPerDay));
    const totalFatLoss = allowedPerDay * days;

    return Math.min(totalFatLoss, fatMassLbs);
  }

  /**
   * Glycogen depletion and associated bound water.
   */
  estimateGlycogenAndBoundWater(hours, weightLbs, bodyFatPct, carbStatus = 'normal') {
    const bf = bodyFatPct ?? this.DEFAULT_BODY_FAT;
    const lbmLbs = weightLbs * (1 - bf / 100);
    const lbmKg = Math.max(0, lbmLbs / 2.2046);
    const glycCapKg = lbmKg * this.GLYCOGEN_CAPACITY_RATIO;

    const carbMult = carbStatus === 'high' ? 1.1 : carbStatus === 'low' ? 0.6 : 1.0;
    const startFillKg = glycCapKg * carbMult;

    const depletionFraction = 1 - Math.exp(-Math.max(0, hours) / 24);
    const glycogenUsedKg = Math.min(startFillKg, startFillKg * depletionFraction);
    const boundWaterKg = glycogenUsedKg * this.GLYCOGEN_WATER_RATIO;

    return {
      glycogenLostLbs: glycogenUsedKg * 2.2046,
      boundWaterLostLbs: boundWaterKg * 2.2046,
      startGlycogenLbs: startFillKg * 2.2046
    };
  }

  /**
   * Gut content reduction over the course of the fast.
   */
  estimateGutContentLoss(hours, weightLbs) {
    if (!hours || hours <= 0) {
      return 0;
    }

    const peak = Math.min(4, Math.max(1, weightLbs * 0.008));
    let fraction;
    if (hours < 8) {
      fraction = 0.1 * (hours / 8);
    } else if (hours < 24) {
      fraction = 0.1 + 0.75 * ((hours - 8) / 16);
    } else if (hours < 36) {
      fraction = 0.85 + 0.1 * ((hours - 24) / 12);
    } else {
      fraction = 0.95;
    }
    return peak * fraction;
  }

  /**
   * Assemble non-lean fluid components and residual shift.
   */
  assembleFluidLoss(hours, startWeightLbs, totalWeightLostLbs, fatLossLbs, muscleLossLbs, leanWaterLossLbs, { bodyFatPct, carbStatus = 'normal' } = {}) {
    const { glycogenLostLbs, boundWaterLostLbs } = this.estimateGlycogenAndBoundWater(
      hours,
      startWeightLbs,
      bodyFatPct,
      carbStatus
    );

    const gutContentLossLbs = this.estimateGutContentLoss(hours, startWeightLbs);

    const baselineOther = glycogenLostLbs + boundWaterLostLbs + gutContentLossLbs;
    const otherFluidRaw = totalWeightLostLbs - fatLossLbs - muscleLossLbs - leanWaterLossLbs;
    const availableOther = Math.max(0, otherFluidRaw);

    let glycogenScaled = 0;
    let boundScaled = 0;
    let gutScaled = 0;

    if (baselineOther > 0 && availableOther > 0) {
      const scale = Math.min(1, availableOther / baselineOther);
      glycogenScaled = glycogenLostLbs * scale;
      boundScaled = boundWaterLostLbs * scale;
      gutScaled = gutContentLossLbs * scale;
    }

    const residualWaterShift = Math.max(0, availableOther - (glycogenScaled + boundScaled + gutScaled));

    return {
      otherFluidLossLbs: availableOther,
      breakdown: {
        glycogenMass: glycogenScaled,
        glycogenBoundWater: boundScaled,
        gutContent: gutScaled,
        residualWaterShift
      }
    };
  }

  round(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null;
    }
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  /**
   * Core API: calculate fast effectiveness breakdown.
   */
  calculateFastEffectiveness(params) {
    const {
      startWeight,
      postWeight,
      startBodyFat,
      postBodyFat,
      fastDurationHours,
      tdee,
      heightCm,
      age,
      sex,
      activity = 'sedentary',
      ketoAdapted = 'none',
      startInKetosis = false,
      preFastProteinGrams = 0,
      carbStatus = 'normal'
    } = params;

    if (!startWeight || !postWeight || !fastDurationHours) {
      return {
        status: 'error',
        message: 'Missing required parameters: startWeight, postWeight, fastDurationHours'
      };
    }

    const totalWeightLost = startWeight - postWeight;
    const baselineKeto = ketoAdapted === 'consistent' ? 0.6
      : ketoAdapted === 'sometimes' ? 0.3
        : 0;

    const bodyFatForModel = startBodyFat ?? this.DEFAULT_BODY_FAT;
    const leanEstimate = this.estimateLeanLossComponents(
      fastDurationHours,
      startWeight,
      bodyFatForModel,
      { baselineKeto, startInKetosis, preFastProteinGrams }
    );

    let fatLossLbs;
    let breakdownSource;
    let muscleLossLbs = leanEstimate.muscleLossLb;
    let leanWaterLossLbs = leanEstimate.leanWaterLossLb;

    // Measured mode if both body fat values provided
    if (startBodyFat != null && postBodyFat != null) {
      const startFatMass = startWeight * (startBodyFat / 100);
      const postFatMass = postWeight * (postBodyFat / 100);
      fatLossLbs = Math.max(0, startFatMass - postFatMass);

      // Measured fat loss overrides the modeled fat component,
      // but lean/muscle stays driven by the physiology model in v1.5.

      breakdownSource = 'measured';
    } else {
      const tdeeUse = tdee ?? this.estimateTDEE(startWeight, heightCm, age, sex, activity);
      fatLossLbs = this.estimateFatLossLbs(fastDurationHours, tdeeUse, startWeight, bodyFatForModel);
      breakdownSource = 'estimated';
    }

    const fluidAssembly = this.assembleFluidLoss(
      fastDurationHours,
      startWeight,
      totalWeightLost,
      fatLossLbs,
      muscleLossLbs,
      leanWaterLossLbs,
      { bodyFatPct: bodyFatForModel, carbStatus }
    );

    const otherFluidLossLbs = fluidAssembly.otherFluidLossLbs;
    const fluidBreakdown = fluidAssembly.breakdown;
    const otherFluidComponentsTotal = fluidBreakdown.glycogenMass
      + fluidBreakdown.glycogenBoundWater
      + fluidBreakdown.gutContent
      + fluidBreakdown.residualWaterShift;

    const totalTransientLoss = leanWaterLossLbs + otherFluidLossLbs;
    const totalMuscle = Math.max(0, muscleLossLbs);

    const round = (value) => this.round(value);

    return {
      status: 'ok',
      startWeight: round(startWeight),
      postWeight: round(postWeight),
      totalWeightLost: round(totalWeightLost),
      fatLoss: round(fatLossLbs),
      muscleLoss: round(totalMuscle),
      leanWater: round(leanWaterLossLbs),
      fluidLoss: round(totalTransientLoss),
      otherFluidLoss: round(otherFluidLossLbs),
      transientLoss: round(totalTransientLoss),
      fluidBreakdown: {
        leanWater: round(leanWaterLossLbs),
        glycogenMass: round(fluidBreakdown.glycogenMass),
        glycogenBoundWater: round(fluidBreakdown.glycogenBoundWater),
        gutContent: round(fluidBreakdown.gutContent),
        residualWaterShift: round(fluidBreakdown.residualWaterShift),
        otherFluidTotal: round(otherFluidComponentsTotal)
      },
      breakdownSource,
      waterLoss: round(totalTransientLoss),
      weightDelta: round(postWeight - startWeight)
    };
  }
}

module.exports = FastEffectivenessService;
