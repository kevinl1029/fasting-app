/**
 * FastEffectivenessService.js
 *
 * Implements the improved fast effectiveness algorithm v1.4
 * Three-component model: Fat Loss + Muscle Loss + Fluid Loss
 *
 * Based on: improved_fast_effectiveness_algorithm_v1.4.md
 */

class FastEffectivenessService {
  constructor() {
    // Algorithm constants
    this.FAT_KCAL_PER_KG = 7700;
    this.MUSCLE_KCAL_PER_KG = 1000;
    this.FAT_OXIDATION_CAP_PER_KG = 69; // kcal/kg-fat/day
    this.GLYCOGEN_WATER_RATIO = 3.2; // grams of water per gram of glycogen
    this.GLYCOGEN_CAPACITY_RATIO = 0.015; // kg glycogen per kg LBM
  }

  /**
   * Helper Functions
   */

  /**
   * Estimate TDEE using Mifflin-St Jeor equation with fallbacks
   * @param {number} weightLbs - Weight in pounds
   * @param {number} heightCm - Height in cm (defaults to 175 if null)
   * @param {number} age - Age in years (defaults to 35 if null)
   * @param {string} sex - 'male', 'female', or null (uses midpoint if null)
   * @param {string} activity - Activity level: 'sedentary', 'light', 'moderate', 'active'
   * @returns {number} Estimated TDEE in kcal/day
   */
  estimateTDEE(weightLbs, heightCm = null, age = null, sex = null, activity = 'sedentary') {
    const kg = weightLbs / 2.2046;

    // Sex constant: male = +5, female = -161, midpoint = -78
    const sexConst = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;

    // Use fallbacks for missing data
    const height = heightCm ?? 175;
    const ageValue = age ?? 35;

    // Mifflin-St Jeor: BMR = 10*weight(kg) + 6.25*height(cm) - 5*age + sexConst
    const bmr = 10 * kg + 6.25 * height - 5 * ageValue + sexConst;

    // Activity multipliers
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725
    };

    const mult = activityMultipliers[activity] ?? 1.2;

    return bmr * mult;
  }

  /**
   * Calculate metabolic adaptation factor (TDEE reduction over time)
   * @param {number} hours - Hours of fasting
   * @param {number} bodyFatPct - Body fat percentage
   * @returns {number} Adaptation factor (0.85 to 1.0, where 1.0 = no adaptation)
   */
  metabolicAdaptationFactor(hours, bodyFatPct) {
    // Base adaptation starts after 36 hours
    const d = Math.max(0, hours - 36);

    // Base drop: 2% at 36h, increasing by 0.08% per hour, max 12%
    const baseDrop = Math.min(0.12, 0.02 + 0.0008 * d);

    // Leanness adjustment: leaner people adapt less (have more protection)
    // At 15% BF: no adjustment. Below 15%: reduce drop. Above 15%: increase drop.
    const leannessAdj = Math.min(0.05, Math.max(-0.05, (15 - bodyFatPct) * 0.003));

    // Total drop (limited to 0-15%)
    const drop = Math.max(0, Math.min(0.15, baseDrop - leannessAdj));

    return 1 - drop;
  }

  /**
   * Calculate dynamic ketosis factor (fat access and muscle sparing)
   * @param {number} hours - Hours of fasting
   * @param {Object} options - { baselineKeto: number (0-0.6), startInKetosis: boolean }
   * @returns {number} Ketosis factor (0 to 0.8)
   */
  ketosisFactor(hours, { baselineKeto = 0, startInKetosis = false } = {}) {
    // Time-based ketosis progression
    let timeCurve;
    if (hours < 16) {
      timeCurve = 0;
    } else if (hours < 24) {
      timeCurve = 0.2;
    } else if (hours < 48) {
      timeCurve = 0.5;
    } else if (hours < 72) {
      timeCurve = 0.7;
    } else {
      timeCurve = 0.8;
    }

    // Starting in ketosis gives 0.5 boost
    const startBoost = startInKetosis ? 0.5 : 0.0;

    // Early ketosis is max of baseline (from keto-adapted status) and start boost
    const early = Math.max(startBoost, baselineKeto);

    // Blend from early to time-based over 48 hours
    const w = Math.min(1, hours / 48);

    return (1 - w) * early + w * timeCurve;
  }

  /**
   * Calculate protein buffer factor (muscle protection from pre-fast protein)
   * @param {number} hours - Hours of fasting
   * @param {number} preFastProteinGrams - Grams of protein in last meal before fast
   * @returns {number} Protein buffer factor (0.65 to 1.0, where 1.0 = no protection)
   */
  proteinBufferFactor(hours, preFastProteinGrams = 0) {
    const maxProtect = 0.35; // Up to 35% reduction in muscle loss

    // Saturation curve: saturates around 80-100g protein
    const sat = 1 - Math.exp(-preFastProteinGrams / 80);
    const level = maxProtect * sat;

    // Strong effect in first 24h, fades by 48h
    if (hours <= 24) {
      return 1 - level; // Full protection
    } else if (hours >= 48) {
      return 1; // No protection
    } else {
      // Linear fade from 24h to 48h
      const t = (hours - 24) / 24;
      return 1 - level * (1 - t);
    }
  }

  /**
   * Component Estimators
   */

  /**
   * Estimate muscle (lean tissue) loss
   * @param {number} hours - Hours of fasting
   * @param {number} startWeightLbs - Starting weight in lbs
   * @param {number} bodyFatPct - Body fat percentage
   * @param {Object} options - { baselineKeto, startInKetosis, preFastProteinGrams }
   * @returns {number} Muscle loss in lbs
   */
  estimateMuscleLossLbs(hours, startWeightLbs, bodyFatPct, { baselineKeto = 0, startInKetosis = false, preFastProteinGrams = 0 } = {}) {
    // Calculate lean body mass
    const lbmLbs = startWeightLbs * (1 - bodyFatPct / 100);
    const lbmKg = lbmLbs / 2.2046;

    // Ketosis factor (higher = more muscle sparing)
    const keto = this.ketosisFactor(hours, { baselineKeto, startInKetosis });

    // Base protein loss rate: 0.5 g/kg-LBM/day
    const baseProteinRate = 0.5;

    // Ketosis multiplier: up to 60% reduction in protein loss
    const ketoMult = 1 - keto * 0.6;

    // Protein buffer from pre-fast meal
    const protBuf = this.proteinBufferFactor(hours, preFastProteinGrams);

    // Calculate protein loss
    const days = hours / 24;
    const proteinLoss_g = baseProteinRate * ketoMult * protBuf * lbmKg * days;

    // Muscle is ~20% protein by weight
    const muscleLossKg = (proteinLoss_g / 0.20) / 1000;

    return muscleLossKg * 2.2046;
  }

  /**
   * Estimate fat loss
   * @param {number} hours - Hours of fasting
   * @param {number} tdee - Total daily energy expenditure (kcal/day)
   * @param {number} weightLbs - Current weight in lbs
   * @param {number} bodyFatPct - Body fat percentage
   * @param {Object} options - { baselineKeto, startInKetosis }
   * @returns {number} Fat loss in lbs
   */
  estimateFatLossLbs(hours, tdee, weightLbs, bodyFatPct, { baselineKeto = 0, startInKetosis = false } = {}) {
    const days = hours / 24;

    // Metabolic adaptation reduces TDEE over time
    const adapt = this.metabolicAdaptationFactor(hours, bodyFatPct);

    // Ketosis increases fat access
    const keto = this.ketosisFactor(hours, { baselineKeto, startInKetosis });

    // Daily energy deficit
    const dailyDeficit = tdee * adapt;

    // Fat oxidation cap for lean individuals
    const fatMassLbs = weightLbs * (bodyFatPct / 100);
    const fatMassKg = fatMassLbs / 2.2046;
    const maxFatKcalPerDay = 69 * fatMassKg;
    const maxFatLbsPerDay = maxFatKcalPerDay / 3500; // 3500 kcal per lb of fat

    // Ketosis improves fat access by up to 20%
    const accessMult = 1 + keto * 0.2;

    // Allowed fat loss per day (lesser of deficit or oxidation limit)
    const allowedPerDay = Math.min(dailyDeficit / 3500, maxFatLbsPerDay) * accessMult;

    return Math.max(0, allowedPerDay * days);
  }

  /**
   * Estimate glycogen and bound water loss
   * @param {number} hours - Hours of fasting
   * @param {number} weightLbs - Weight in lbs
   * @param {number} bodyFatPct - Body fat percentage
   * @param {string} carbStatus - 'low', 'normal', or 'high'
   * @returns {Object} { glycogenLostLbs, boundWaterLostLbs, startGlycogenLbs }
   */
  estimateGlycogenAndBoundWater(hours, weightLbs, bodyFatPct, carbStatus = 'normal') {
    // Calculate lean body mass
    const lbmLbs = weightLbs * (1 - bodyFatPct / 100);
    const lbmKg = lbmLbs / 2.2046;

    // Glycogen capacity: 1.5% of LBM
    const glycCapKg = lbmKg * this.GLYCOGEN_CAPACITY_RATIO;

    // Carb status affects initial glycogen fill level
    const carbMult = carbStatus === 'high' ? 1.1 : carbStatus === 'low' ? 0.6 : 1.0;
    const startFillKg = glycCapKg * carbMult;

    // Depletion curve: exponential with 24h half-life
    const deplFrac = 1 - Math.exp(-hours / 24);
    const glycUsedKg = Math.min(startFillKg, startFillKg * deplFrac);

    // Bound water: 3.2g water per 1g glycogen
    const boundWaterKg = glycUsedKg * this.GLYCOGEN_WATER_RATIO;

    return {
      glycogenLostLbs: glycUsedKg * 2.2046,
      boundWaterLostLbs: boundWaterKg * 2.2046,
      startGlycogenLbs: startFillKg * 2.2046
    };
  }

  /**
   * Estimate gut content loss
   * @param {number} hours - Hours of fasting
   * @param {number} weightLbs - Weight in lbs
   * @returns {number} Gut content loss in lbs
   */
  estimateGutContentLoss(hours, weightLbs) {
    // Peak gut content: 0.8% of body weight (1-4 lbs typical range)
    const peak = Math.min(4.0, Math.max(1.0, weightLbs * 0.008));

    // Progressive clearance over 36 hours
    let frac;
    if (hours < 8) {
      frac = 0.1 * (hours / 8); // 10% by 8h
    } else if (hours < 24) {
      frac = 0.1 + 0.75 * ((hours - 8) / 16); // 85% by 24h
    } else if (hours < 36) {
      frac = 0.85 + 0.10 * ((hours - 24) / 12); // 95% by 36h
    } else {
      frac = 0.95; // Plateau at 95%
    }

    return peak * frac;
  }

  /**
   * Estimate total fluid loss (assembler function)
   * @param {number} hours - Hours of fasting
   * @param {number} startWeightLbs - Starting weight in lbs
   * @param {number} totalWeightLostLbs - Total weight lost in lbs
   * @param {number} fatLossLbs - Fat loss in lbs
   * @param {number} muscleLossLbs - Muscle loss in lbs
   * @param {Object} options - { bodyFatPct, carbStatus }
   * @returns {Object} { totalFluidLoss, breakdown: { glycogenMass, glycogenBoundWater, gutContent, residualWaterShift } }
   */
  estimateFluidLoss(hours, startWeightLbs, totalWeightLostLbs, fatLossLbs, muscleLossLbs, { bodyFatPct, carbStatus = 'normal' } = {}) {
    // Glycogen and bound water
    const { glycogenLostLbs, boundWaterLostLbs } = this.estimateGlycogenAndBoundWater(
      hours,
      startWeightLbs,
      bodyFatPct,
      carbStatus
    );

    // Gut content
    const gutLossLbs = this.estimateGutContentLoss(hours, startWeightLbs);

    // Residual water shift (whatever's left over)
    const residualWaterShift = totalWeightLostLbs - fatLossLbs - muscleLossLbs
                               - glycogenLostLbs - boundWaterLostLbs - gutLossLbs;

    return {
      totalFluidLoss: glycogenLostLbs + boundWaterLostLbs + gutLossLbs + residualWaterShift,
      breakdown: {
        glycogenMass: glycogenLostLbs,
        glycogenBoundWater: boundWaterLostLbs,
        gutContent: gutLossLbs,
        residualWaterShift
      }
    };
  }

  /**
   * Core API
   */

  /**
   * Calculate fast effectiveness with detailed breakdown
   * @param {Object} params - Calculation parameters
   * @returns {Object} Detailed effectiveness breakdown
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

    // Validate required parameters
    if (!startWeight || !postWeight || !fastDurationHours) {
      return {
        status: 'error',
        message: 'Missing required parameters: startWeight, postWeight, fastDurationHours'
      };
    }

    const totalWeightLost = startWeight - postWeight;

    // Convert keto-adapted status to baseline ketosis level
    const baselineKeto = ketoAdapted === 'consistent' ? 0.6
                       : ketoAdapted === 'sometimes' ? 0.3
                       : 0.0;

    let fatLoss, muscleLoss, fluidLoss, breakdownSource, fluidBreakdown;

    // MEASURED MODE: Use body fat % if available (preferred)
    if (startBodyFat != null && postBodyFat != null) {
      // Direct calculation from body composition
      const startFatMass = startWeight * (startBodyFat / 100);
      const postFatMass = postWeight * (postBodyFat / 100);
      fatLoss = Math.max(0, startFatMass - postFatMass);

      const startLean = startWeight - startFatMass;
      const postLean = postWeight - postFatMass;
      const totalLeanLoss = Math.max(0, startLean - postLean);

      // Estimate muscle loss from protein loss model
      muscleLoss = this.estimateMuscleLossLbs(fastDurationHours, startWeight, startBodyFat, {
        baselineKeto,
        startInKetosis,
        preFastProteinGrams
      });

      // Fluid is whatever's left of lean loss after muscle
      const fluidResult = this.estimateFluidLoss(
        fastDurationHours,
        startWeight,
        totalLeanLoss,
        0,
        muscleLoss,
        { bodyFatPct: startBodyFat, carbStatus }
      );

      fluidLoss = fluidResult.totalFluidLoss;
      fluidBreakdown = fluidResult.breakdown;
      breakdownSource = 'measured';

    }
    // ESTIMATED MODE: Use TDEE-based calculation
    else {
      // Calculate or use provided TDEE
      const tdeeUse = tdee ?? this.estimateTDEE(startWeight, heightCm, age, sex, activity);

      // Estimate fat loss from energy deficit
      fatLoss = this.estimateFatLossLbs(fastDurationHours, tdeeUse, startWeight, startBodyFat ?? 20, {
        baselineKeto,
        startInKetosis
      });

      // Estimate muscle loss
      muscleLoss = this.estimateMuscleLossLbs(fastDurationHours, startWeight, startBodyFat ?? 20, {
        baselineKeto,
        startInKetosis,
        preFastProteinGrams
      });

      // Fluid is remainder
      const fluidResult = this.estimateFluidLoss(
        fastDurationHours,
        startWeight,
        totalWeightLost,
        fatLoss,
        muscleLoss,
        { bodyFatPct: startBodyFat ?? 20, carbStatus }
      );

      fluidLoss = fluidResult.totalFluidLoss;
      fluidBreakdown = fluidResult.breakdown;
      breakdownSource = 'estimated';
    }

    // Round to 1 decimal place
    const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

    return {
      status: 'ok',
      startWeight: round(startWeight),
      postWeight: round(postWeight),
      totalWeightLost: round(totalWeightLost),
      fatLoss: round(fatLoss),
      muscleLoss: round(muscleLoss),
      fluidLoss: round(fluidLoss),
      fluidBreakdown: {
        glycogenMass: round(fluidBreakdown.glycogenMass),
        glycogenBoundWater: round(fluidBreakdown.glycogenBoundWater),
        gutContent: round(fluidBreakdown.gutContent),
        residualWaterShift: round(fluidBreakdown.residualWaterShift)
      },
      breakdownSource,
      waterLoss: round(muscleLoss + fluidLoss),
      weightDelta: round(postWeight - startWeight)
    };
  }
}

module.exports = FastEffectivenessService;
