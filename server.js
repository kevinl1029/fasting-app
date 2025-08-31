const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

app.get('/api/time', (req, res) => {
  res.json({ 
    currentTime: new Date().toISOString(),
    message: 'Current server time'
  });
});

// Fasting forecast calculation endpoint
app.post('/api/calculate', (req, res) => {
  try {
    const { weight, weightUnit, bodyFat, activityLevel, tdeeOverride, fastingBlocks, ketosisStates, weeks, 
            insulinSensitivity, fastingExperience, bodyFatPercentage } = req.body;
    
    // Validate inputs
    if (!weight || !bodyFat || !activityLevel || !fastingBlocks) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Individualization factors (with defaults)
    const insulinSensitivityFactor = insulinSensitivity || 'normal'; // 'low', 'normal', 'high'
    const fastingExperienceFactor = fastingExperience || 'beginner'; // 'beginner', 'intermediate', 'advanced'
    const bodyFatFactor = bodyFatPercentage || bodyFat; // Use bodyFat if not specified
    
    // Calculate personalized ketosis timing adjustments
    const getKetosisTimingAdjustment = () => {
      let adjustment = 0;
      
      // Insulin sensitivity adjustments
      switch(insulinSensitivityFactor) {
        case 'low': adjustment += 4; break;      // Slower ketosis
        case 'high': adjustment -= 4; break;     // Faster ketosis
        default: break;                          // No adjustment
      }
      
      // Fasting experience adjustments
      switch(fastingExperienceFactor) {
        case 'beginner': adjustment += 6; break;     // Slower ketosis
        case 'intermediate': adjustment += 2; break; // Slight delay
        case 'advanced': adjustment -= 6; break;     // Faster ketosis
        default: break;
      }
      
      // Body fat adjustments (higher body fat = faster ketosis)
      if (bodyFatFactor > 25) adjustment -= 2;      // Faster ketosis
      else if (bodyFatFactor < 15) adjustment += 2; // Slower ketosis
      
      return adjustment;
    };
    
    const ketosisAdjustment = getKetosisTimingAdjustment();
    
    // Convert weight to kg if needed
    const weightKg = weightUnit === 'lb' ? weight * 0.453592 : weight;
    const numWeeks = weeks || 12; // Default to 12 weeks if not specified
    
    // Calculate initial values
    let currentWeight = weightKg;
    let currentBodyFat = bodyFat;
    let currentFatMass = currentWeight * (currentBodyFat / 100);
    let currentFFM = currentWeight - currentFatMass;
    
    // Calculate BMR using Katch-McArdle equation
    const bmr = 370 + (21.6 * currentFFM);
    
    // Calculate TDEE
    const tdee = tdeeOverride || (bmr * activityLevel);
    const hourlyTDEE = tdee / 24;
    
    // Constants
    const FAT_KCAL_PER_KG = 7700;
    const FFM_KCAL_PER_KG = 1000;
    const FAT_OXIDATION_CAP_KCAL_PER_KG_FAT_PER_DAY = 69;
    
    // Multi-phase ketosis parameters
    const GLYCOGEN_DEPLETION_HOURS = 16;      // Hours to deplete liver glycogen
    const EARLY_KETOSIS_HOURS = 24;           // Hours to reach early ketosis
    const FULL_KETOSIS_HOURS = 48;            // Hours to reach full ketosis
    const OPTIMAL_KETOSIS_HOURS = 72;         // Hours to reach optimal ketosis
    
    // Protein maintenance rates by phase (kcal/day)
    const PROTEIN_MAINTENANCE_PHASES = {
      glycogenDepletion: 160,    // Phase 1: 0-16h
      earlyKetosis: 120,         // Phase 2: 16-24h
      fullKetosis: 50,           // Phase 3: 24-48h
      optimalKetosis: 40         // Phase 4: 48h+
    };
    
    // FFM preservation rates by phase
    const FFM_PRESERVATION_PHASES = {
      glycogenDepletion: 0.0,    // Phase 1: 0% preservation
      earlyKetosis: 0.15,        // Phase 2: 15% preservation
      fullKetosis: 0.30,         // Phase 3: 30% preservation
      optimalKetosis: 0.40       // Phase 4: 40% preservation
    };
    
    // Weekly simulation results
    const weeklyResults = [];
    
    for (let week = 1; week <= numWeeks; week++) {
      let weeklyFatLoss = 0;
      let weeklyFFMLoss = 0;
      
              // Track ketosis state for each fasting block
        let cumulativeFastingHours = 0;
        let currentFastingBlock = -1;
        let hoursIntoCurrentBlock = 0;
        let dominantPhase = 'glycogenDepletion'; // Track the most common phase for the week
        let phaseHours = {
          glycogenDepletion: 0,
          earlyKetosis: 0,
          fullKetosis: 0,
          optimalKetosis: 0
        };
        
        // Simulate each hour of the week
        for (let hour = 0; hour < 168; hour++) { // 168 hours in a week
          const dayOfWeek = Math.floor(hour / 24);
          const hourOfDay = hour % 24;
          
          // Check if this hour is during a fasting period and which block
          let isFasting = false;
          let fastingBlockStart = 0;
          
          for (let i = 0; i < fastingBlocks.length; i++) {
            if (hour >= fastingBlockStart && hour < fastingBlockStart + fastingBlocks[i]) {
              isFasting = true;
              
              // Check if we're starting a new fasting block
              if (i !== currentFastingBlock) {
                currentFastingBlock = i;
                hoursIntoCurrentBlock = 0;
                // Reset cumulative hours if starting fresh (not already in ketosis)
                if (!ketosisStates[i]) {
                  cumulativeFastingHours = 0;
                }
              }
              
              break;
            }
            fastingBlockStart += fastingBlocks[i];
          }
          
          if (isFasting) {
            hoursIntoCurrentBlock++;
            
            // If already in ketosis at start of block, use full ketosis benefits
            if (ketosisStates[currentFastingBlock] && hoursIntoCurrentBlock === 1) {
              cumulativeFastingHours = FULL_KETOSIS_HOURS;
            } else {
              cumulativeFastingHours++;
            }
            
            // Determine ketosis phase and calculate personalized parameters
            let currentPhase = 'glycogenDepletion';
            let proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.glycogenDepletion;
            let ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.glycogenDepletion;
            
            // Apply personalized ketosis timing adjustments
            const adjustedGlycogenHours = Math.max(8, GLYCOGEN_DEPLETION_HOURS + ketosisAdjustment);
            const adjustedEarlyHours = Math.max(16, EARLY_KETOSIS_HOURS + ketosisAdjustment);
            const adjustedFullHours = Math.max(32, FULL_KETOSIS_HOURS + ketosisAdjustment);
            const adjustedOptimalHours = Math.max(56, OPTIMAL_KETOSIS_HOURS + ketosisAdjustment);
            
            // Determine ketosis phase based on cumulative fasting hours
            if (cumulativeFastingHours >= adjustedOptimalHours) {
              // Phase 4: Optimal Ketosis (48h+ adjusted)
              currentPhase = 'optimalKetosis';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.optimalKetosis;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.optimalKetosis;
            } else if (cumulativeFastingHours >= adjustedFullHours) {
              // Phase 3: Full Ketosis (24-48h adjusted)
              currentPhase = 'fullKetosis';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.fullKetosis;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.fullKetosis;
            } else if (cumulativeFastingHours >= adjustedEarlyHours) {
              // Phase 2: Early Ketosis (16-24h adjusted)
              currentPhase = 'earlyKetosis';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.earlyKetosis;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.earlyKetosis;
            } else {
              // Phase 1: Glycogen Depletion (0-16h adjusted)
              currentPhase = 'glycogenDepletion';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.glycogenDepletion;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.glycogenDepletion;
            }
            
            // Calculate smooth transitions between phases
            const getPhaseProgress = (currentHours, phaseStart, phaseEnd) => {
              if (currentHours <= phaseStart) return 0;
              if (currentHours >= phaseEnd) return 1;
              return (currentHours - phaseStart) / (phaseEnd - phaseStart);
            };
            
            // Apply smooth transitions for protein maintenance and FFM preservation
            if (currentPhase === 'earlyKetosis') {
              const progress = getPhaseProgress(cumulativeFastingHours, adjustedGlycogenHours, adjustedEarlyHours);
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.glycogenDepletion - 
                ((PROTEIN_MAINTENANCE_PHASES.glycogenDepletion - PROTEIN_MAINTENANCE_PHASES.earlyKetosis) * progress);
              ffmPreservationFactor = 1.0 - (FFM_PRESERVATION_PHASES.glycogenDepletion + 
                ((FFM_PRESERVATION_PHASES.earlyKetosis - FFM_PRESERVATION_PHASES.glycogenDepletion) * progress));
            } else if (currentPhase === 'fullKetosis') {
              const progress = getPhaseProgress(cumulativeFastingHours, adjustedEarlyHours, adjustedFullHours);
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.earlyKetosis - 
                ((PROTEIN_MAINTENANCE_PHASES.earlyKetosis - PROTEIN_MAINTENANCE_PHASES.fullKetosis) * progress);
              ffmPreservationFactor = 1.0 - (FFM_PRESERVATION_PHASES.earlyKetosis + 
                ((FFM_PRESERVATION_PHASES.fullKetosis - FFM_PRESERVATION_PHASES.earlyKetosis) * progress));
            } else if (currentPhase === 'optimalKetosis') {
              const progress = getPhaseProgress(cumulativeFastingHours, adjustedFullHours, adjustedOptimalHours);
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.fullKetosis - 
                ((PROTEIN_MAINTENANCE_PHASES.fullKetosis - PROTEIN_MAINTENANCE_PHASES.optimalKetosis) * progress);
              ffmPreservationFactor = 1.0 - (FFM_PRESERVATION_PHASES.fullKetosis + 
                ((FFM_PRESERVATION_PHASES.optimalKetosis - FFM_PRESERVATION_PHASES.fullKetosis) * progress));
            }
            
            // Track hours spent in each phase for weekly summary
            if (isFasting) {
              phaseHours[currentPhase]++;
            }
            
            // Calculate fuel partitioning based on ketosis state
            if (currentBodyFat > 10) {
              // Default mode (BF% > 10)
              
              // Calculate FFM loss based on protein maintenance requirement
              const hourlyProteinMaintenance = proteinMaintenanceKcal / 24;
              const ffmKcalBurned = hourlyProteinMaintenance;
              const ffmBurned = ffmKcalBurned / FFM_KCAL_PER_KG;
              
              // Apply ketosis preservation factor to FFM loss
              const adjustedFFMBurned = ffmBurned * ffmPreservationFactor;
              weeklyFFMLoss += adjustedFFMBurned;
              
              // Calculate fat loss (remainder of TDEE after FFM)
              const adjustedFFMKcalBurned = adjustedFFMBurned * FFM_KCAL_PER_KG;
              const remainingKcal = hourlyTDEE - adjustedFFMKcalBurned;
              
              if (remainingKcal > 0) {
                const fatBurned = remainingKcal / FAT_KCAL_PER_KG;
                weeklyFatLoss += fatBurned;
              }
              
            } else {
              // Advanced mode (BF% ≤ 10) - fat oxidation cap applies
              const fatOxidationCap = (FAT_OXIDATION_CAP_KCAL_PER_KG_FAT_PER_DAY / 24) * currentFatMass;
              
              // Calculate FFM loss based on protein maintenance requirement
              const hourlyProteinMaintenance = proteinMaintenanceKcal / 24;
              const ffmKcalBurned = hourlyProteinMaintenance;
              const ffmBurned = ffmKcalBurned / FFM_KCAL_PER_KG;
              
              // Apply ketosis preservation factor to FFM loss
              const adjustedFFMBurned = ffmBurned * ffmPreservationFactor;
              weeklyFFMLoss += adjustedFFMBurned;
              
              // Calculate fat loss (capped by oxidation limit)
              const adjustedFFMKcalBurned = adjustedFFMBurned * FFM_KCAL_PER_KG;
              const remainingKcal = hourlyTDEE - adjustedFFMKcalBurned;
              
              if (remainingKcal > 0) {
                const fatKcalBurned = Math.min(fatOxidationCap, remainingKcal);
                const fatBurned = fatKcalBurned / FAT_KCAL_PER_KG;
                weeklyFatLoss += fatBurned;
                
                // If fat oxidation cap reached, additional energy comes from FFM
                if (fatKcalBurned < remainingKcal) {
                  const additionalFFMKcal = remainingKcal - fatKcalBurned;
                  const additionalFFMBurned = additionalFFMKcal / FFM_KCAL_PER_KG;
                  weeklyFFMLoss += additionalFFMBurned;
                }
              }
            }
          } else {
            // Not fasting - reset fasting block tracking
            currentFastingBlock = -1;
            hoursIntoCurrentBlock = 0;
            // Note: cumulativeFastingHours is only reset when starting a new fasting block
          }
                }
        
        // Determine dominant phase for the week (phase with most hours)
        const maxPhaseHours = Math.max(...Object.values(phaseHours));
        for (const [phase, hours] of Object.entries(phaseHours)) {
          if (hours === maxPhaseHours) {
            dominantPhase = phase;
            break;
          }
        }
        
        // Update body composition for next week
        currentFatMass -= weeklyFatLoss;
        currentFFM -= weeklyFFMLoss;
        currentWeight = currentFatMass + currentFFM;
        currentBodyFat = (currentFatMass / currentWeight) * 100;
      
      // Ensure values don't go below reasonable limits
      currentFatMass = Math.max(currentFatMass, 0);
      currentFFM = Math.max(currentFFM, 0);
      currentWeight = Math.max(currentWeight, 0);
      currentBodyFat = Math.max(Math.min(currentBodyFat, 100), 0);
      
              weeklyResults.push({
          week,
          weight: currentWeight,
          bodyFat: currentBodyFat,
          fatMass: currentFatMass,
          fatFreeMass: currentFFM,
          weeklyFatLoss: weeklyFatLoss,
          weeklyFFMLoss: weeklyFFMLoss,
          totalWeightLoss: weeklyFatLoss + weeklyFFMLoss,
          ketosisPhase: dominantPhase,
          proteinMaintenance: PROTEIN_MAINTENANCE_PHASES[dominantPhase] || 160,
          ffmPreservation: FFM_PRESERVATION_PHASES[dominantPhase] * 100 || 0
        });
    }
    
    res.json({
      initialStats: {
        weight: weightKg,
        bodyFat: bodyFat,
        fatMass: weightKg * (bodyFat / 100),
        fatFreeMass: weightKg * (1 - bodyFat / 100),
        bmr: bmr,
        dailyTDEE: tdee
      },
      weeklyResults: weeklyResults,
      summary: {
        totalWeeks: numWeeks,
        finalWeight: currentWeight,
        finalBodyFat: currentBodyFat,
        totalFatLost: weightKg * (bodyFat / 100) - currentFatMass,
        totalFFMLost: weightKg * (1 - bodyFat / 100) - currentFFM,
        totalWeightLost: weightKg - currentWeight
      }
    });
    
  } catch (error) {
    console.error('Calculation error:', error);
    res.status(500).json({ error: 'Calculation failed' });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on 
    http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api/hello`);
});
