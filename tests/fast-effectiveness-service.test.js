/**
 * Unit tests for FastEffectivenessService
 * Tests helper functions, component estimators, and core API
 */

const FastEffectivenessService = require('../services/FastEffectivenessService');

const service = new FastEffectivenessService();

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual, expected, tolerance = 0.1, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`Assertion failed: ${message} (expected ${expected}, got ${actual}, diff ${diff})`);
  }
}

console.log('🧪 Testing FastEffectivenessService...\n');

// Test 1: TDEE Estimation
console.log('Test 1: TDEE Estimation');
{
  // Male, 180 lbs, 175cm, age 35, sedentary
  const tdee1 = service.estimateTDEE(180, 175, 35, 'male', 'sedentary');
  assertClose(tdee1, 2088, 100, 'Male TDEE calculation');

  // Female, 150 lbs, 165cm, age 30, sedentary
  const tdee2 = service.estimateTDEE(150, 165, 30, 'female', 'sedentary');
  assertClose(tdee2, 1620, 100, 'Female TDEE calculation');

  // Midpoint (no sex), with defaults
  const tdee3 = service.estimateTDEE(170, null, null, null, 'sedentary');
  assertClose(tdee3, 1934, 100, 'Midpoint TDEE with defaults');

  console.log('✅ TDEE estimation tests passed\n');
}

// Test 2: Metabolic Adaptation
console.log('Test 2: Metabolic Adaptation');
{
  // Minimal adaptation before 36h
  const adapt1 = service.metabolicAdaptationFactor(24, 20);
  assert(adapt1 > 0.95 && adapt1 <= 1.0, 'Minimal adaptation at 24h');

  // Adaptation after 36h
  const adapt2 = service.metabolicAdaptationFactor(48, 20);
  assert(adapt2 < 1.0 && adapt2 > 0.95, 'Adaptation at 48h should be 0.95-1.0');

  // Leaner people adapt less
  const adapt3 = service.metabolicAdaptationFactor(48, 10);
  const adapt4 = service.metabolicAdaptationFactor(48, 25);
  assert(adapt3 > adapt4, 'Leaner individuals should have less adaptation');

  console.log('✅ Metabolic adaptation tests passed\n');
}

// Test 3: Ketosis Factor
console.log('Test 3: Ketosis Factor');
{
  // No ketosis before 16h
  const keto1 = service.ketosisFactor(12, { baselineKeto: 0, startInKetosis: false });
  assertClose(keto1, 0, 0.01, 'No ketosis before 16h');

  // Starting in ketosis gives boost (blends over time)
  const keto2 = service.ketosisFactor(12, { baselineKeto: 0, startInKetosis: true });
  assert(keto2 > 0.3 && keto2 < 0.5, 'Start in ketosis gives boost at 12h');

  // Keto-adapted baseline (blends over time)
  const keto3 = service.ketosisFactor(12, { baselineKeto: 0.6, startInKetosis: false });
  assert(keto3 > 0.4 && keto3 < 0.6, 'Keto-adapted baseline at 12h');

  // Progression over time
  const keto4 = service.ketosisFactor(72, { baselineKeto: 0, startInKetosis: false });
  assertClose(keto4, 0.8, 0.05, 'Max ketosis at 72h');

  console.log('✅ Ketosis factor tests passed\n');
}

// Test 4: Protein Buffer Factor
console.log('Test 4: Protein Buffer Factor');
{
  // No protein = no protection
  const buf1 = service.proteinBufferFactor(12, 0);
  assertClose(buf1, 1.0, 0.01, 'No protection without protein');

  // High protein gives protection early (returns factor to multiply by, so lower is better)
  const buf2 = service.proteinBufferFactor(12, 80);
  assert(buf2 < 0.8, 'High protein gives protection early');

  // Protection fades by 48h
  const buf3 = service.proteinBufferFactor(48, 80);
  assertClose(buf3, 1.0, 0.01, 'Protection gone by 48h');

  // Saturation effect
  const buf4 = service.proteinBufferFactor(12, 100);
  const buf5 = service.proteinBufferFactor(12, 200);
  assertClose(buf4, buf5, 0.1, 'Saturation at ~100g protein');

  console.log('✅ Protein buffer factor tests passed\n');
}

// Test 5: Muscle Loss Estimation
console.log('Test 5: Muscle Loss Estimation');
{
  // 24h fast, 180 lbs, 20% BF, no ketosis
  const muscle1 = service.estimateMuscleLossLbs(24, 180, 20, {
    baselineKeto: 0,
    startInKetosis: false,
    preFastProteinGrams: 0
  });
  assert(muscle1 > 0 && muscle1 < 1, '24h muscle loss should be 0-1 lbs');

  // Ketosis reduces muscle loss
  const muscle2 = service.estimateMuscleLossLbs(24, 180, 20, {
    baselineKeto: 0.6,
    startInKetosis: false,
    preFastProteinGrams: 0
  });
  assert(muscle2 < muscle1, 'Ketosis should reduce muscle loss');

  // Pre-fast protein reduces muscle loss
  const muscle3 = service.estimateMuscleLossLbs(24, 180, 20, {
    baselineKeto: 0,
    startInKetosis: false,
    preFastProteinGrams: 80
  });
  assert(muscle3 < muscle1, 'Pre-fast protein should reduce muscle loss');

  console.log('✅ Muscle loss estimation tests passed\n');
}

// Test 6: Fat Loss Estimation
console.log('Test 6: Fat Loss Estimation');
{
  const tdee = 2000;

  // 24h fast, reasonable fat loss
  const fat1 = service.estimateFatLossLbs(24, tdee, 180, 20, {
    baselineKeto: 0,
    startInKetosis: false
  });
  assert(fat1 > 0 && fat1 < 1, '24h fat loss should be 0-1 lbs');

  // Ketosis increases fat loss
  const fat2 = service.estimateFatLossLbs(24, tdee, 180, 20, {
    baselineKeto: 0.6,
    startInKetosis: false
  });
  assert(fat2 > fat1, 'Ketosis should increase fat access');

  // Very lean individuals hit oxidation cap
  const fat3 = service.estimateFatLossLbs(72, tdee, 150, 8, {
    baselineKeto: 0,
    startInKetosis: false
  });
  assert(fat3 < 3, 'Very lean should be limited by oxidation cap');

  console.log('✅ Fat loss estimation tests passed\n');
}

// Test 7: Glycogen and Bound Water
console.log('Test 7: Glycogen and Bound Water');
{
  const result1 = service.estimateGlycogenAndBoundWater(24, 180, 20, 'normal');

  assert(result1.glycogenLostLbs > 0, 'Glycogen should be lost');
  assert(result1.boundWaterLostLbs > 0, 'Bound water should be lost');
  assert(result1.boundWaterLostLbs > result1.glycogenLostLbs * 2, 'Water > 2x glycogen mass');

  // High carb status increases initial glycogen
  const result2 = service.estimateGlycogenAndBoundWater(24, 180, 20, 'high');
  assert(result2.glycogenLostLbs > result1.glycogenLostLbs, 'High carb = more glycogen lost');

  // Low carb status decreases initial glycogen
  const result3 = service.estimateGlycogenAndBoundWater(24, 180, 20, 'low');
  assert(result3.glycogenLostLbs < result1.glycogenLostLbs, 'Low carb = less glycogen lost');

  console.log('✅ Glycogen estimation tests passed\n');
}

// Test 8: Gut Content Loss
console.log('Test 8: Gut Content Loss');
{
  // Progressive clearance
  const gut1 = service.estimateGutContentLoss(8, 180);
  const gut2 = service.estimateGutContentLoss(24, 180);
  const gut3 = service.estimateGutContentLoss(36, 180);

  assert(gut1 < gut2, 'More clearance at 24h than 8h');
  assert(gut2 < gut3, 'More clearance at 36h than 24h');
  assert(gut3 > gut2 * 1.05, 'Significant increase from 24h to 36h');

  // Reasonable ranges
  assert(gut1 > 0 && gut1 < 2, 'Gut loss at 8h: 0-2 lbs');
  assert(gut3 > 1 && gut3 < 4, 'Gut loss at 36h: 1-4 lbs');

  console.log('✅ Gut content estimation tests passed\n');
}

// Test 9: Fluid Loss Assembly
console.log('Test 9: Fluid Loss Assembly');
{
  const result = service.estimateFluidLoss(24, 180, 5, 1.5, 0.5, {
    bodyFatPct: 20,
    carbStatus: 'normal'
  });

  assert(result.totalFluidLoss > 0, 'Total fluid should be positive');
  assert(result.breakdown.glycogenMass > 0, 'Glycogen mass should be positive');
  assert(result.breakdown.glycogenBoundWater > 0, 'Bound water should be positive');
  assert(result.breakdown.gutContent > 0, 'Gut content should be positive');

  // Residual is remainder
  const calculated = result.breakdown.glycogenMass + result.breakdown.glycogenBoundWater +
                     result.breakdown.gutContent + result.breakdown.residualWaterShift;
  assertClose(calculated, result.totalFluidLoss, 0.01, 'Components should sum to total');

  console.log('✅ Fluid assembly tests passed\n');
}

// Test 10: Full Calculation - Measured Mode
console.log('Test 10: Full Calculation - Measured Mode');
{
  const result = service.calculateFastEffectiveness({
    startWeight: 180,
    postWeight: 175,
    startBodyFat: 20,
    postBodyFat: 19.5,
    fastDurationHours: 48,
    ketoAdapted: 'sometimes',
    startInKetosis: false,
    preFastProteinGrams: 50,
    carbStatus: 'normal'
  });

  assert(result.status === 'ok', 'Calculation should succeed');
  assert(result.breakdownSource === 'measured', 'Should use measured mode');
  assertClose(result.totalWeightLost, 5, 0.1, 'Total weight lost should be 5 lbs');
  assert(result.fatLoss > 0, 'Should have fat loss');
  assert(result.muscleLoss >= 0, 'Should have muscle loss >= 0');
  assert(result.fluidLoss > 0, 'Should have fluid loss');

  // Components should sum to total
  const sum = result.fatLoss + result.muscleLoss + result.fluidLoss;
  assertClose(sum, result.totalWeightLost, 0.2, 'Components should sum to total weight lost');

  // Fluid breakdown should be detailed
  assert(result.fluidBreakdown.glycogenMass !== undefined, 'Should have glycogen breakdown');
  assert(result.fluidBreakdown.glycogenBoundWater !== undefined, 'Should have bound water');
  assert(result.fluidBreakdown.gutContent !== undefined, 'Should have gut content');
  assert(result.fluidBreakdown.residualWaterShift !== undefined, 'Should have residual');

  console.log('✅ Full calculation (measured mode) tests passed\n');
}

// Test 11: Full Calculation - Estimated Mode
console.log('Test 11: Full Calculation - Estimated Mode');
{
  const result = service.calculateFastEffectiveness({
    startWeight: 180,
    postWeight: 175,
    fastDurationHours: 48,
    heightCm: 175,
    age: 35,
    sex: 'male',
    activity: 'sedentary',
    ketoAdapted: 'none',
    startInKetosis: false,
    preFastProteinGrams: 0,
    carbStatus: 'normal'
  });

  assert(result.status === 'ok', 'Calculation should succeed');
  assert(result.breakdownSource === 'estimated', 'Should use estimated mode');
  assertClose(result.totalWeightLost, 5, 0.1, 'Total weight lost should be 5 lbs');
  assert(result.fatLoss > 0, 'Should have fat loss estimate');
  assert(result.muscleLoss >= 0, 'Should have muscle loss estimate');
  assert(result.fluidLoss > 0, 'Should have fluid loss estimate');

  console.log('✅ Full calculation (estimated mode) tests passed\n');
}

// Test 12: Edge Cases and Validation
console.log('Test 12: Edge Cases and Validation');
{
  // Missing required params
  const result1 = service.calculateFastEffectiveness({});
  assert(result1.status === 'error', 'Should error on missing params');

  // Very short fast
  const result2 = service.calculateFastEffectiveness({
    startWeight: 180,
    postWeight: 179.5,
    fastDurationHours: 4,
    startBodyFat: 20,
    postBodyFat: 20
  });
  assert(result2.status === 'ok', 'Should handle very short fasts');
  assert(result2.fatLoss >= 0, 'Fat loss should be non-negative');

  // Very long fast
  const result3 = service.calculateFastEffectiveness({
    startWeight: 180,
    postWeight: 170,
    fastDurationHours: 168, // 7 days
    startBodyFat: 20,
    postBodyFat: 17
  });
  assert(result3.status === 'ok', 'Should handle very long fasts');
  assert(result3.fatLoss > 0, 'Should have significant fat loss');

  console.log('✅ Edge cases tests passed\n');
}

console.log('✅ All FastEffectivenessService tests passed!\n');
process.exit(0);
