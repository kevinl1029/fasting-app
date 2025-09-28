/**
 * BenefitsCalculator Service
 * Real-time calculation of meals skipped, money/time saved
 * Integration with meal timing system
 * Milestone detection and progress tracking
 */

class BenefitsCalculator {
    constructor(options = {}) {
        this.options = {
            defaultMealCost: 10.00,
            defaultMealDuration: 30, // minutes
            defaultMealtimes: {
                breakfast: '08:00',
                lunch: '12:00',
                dinner: '18:00'
            },
            milestoneThresholds: {
                money: [25, 50, 100, 200, 500, 1000], // Dollar amounts
                time: [120, 360, 720, 1440, 2880], // Minutes (2h, 6h, 12h, 24h, 48h)
                meals: [5, 10, 25, 50, 100] // Number of meals
            },
            ...options
        };

        this.userPreferences = {
            avgMealCost: this.options.defaultMealCost,
            avgMealDuration: this.options.defaultMealDuration,
            benefitsEnabled: true
        };

        this.userMealtimes = this.options.defaultMealtimes;
        this.achievedMilestones = new Set();
    }

    /**
     * Initialize the benefits calculator
     */
    async init(userPreferences = null, userMealtimes = null) {
        try {
            if (userPreferences) {
                this.updatePreferences(userPreferences);
            }

            if (userMealtimes) {
                this.updateMealtimes(userMealtimes);
            }

            console.log('BenefitsCalculator initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize BenefitsCalculator:', error);
            return false;
        }
    }

    /**
     * Update user preferences for calculations
     */
    updatePreferences(preferences) {
        this.userPreferences = {
            ...this.userPreferences,
            ...preferences
        };

        // Validate preferences
        if (this.userPreferences.avgMealCost < 0) {
            this.userPreferences.avgMealCost = this.options.defaultMealCost;
        }

        if (this.userPreferences.avgMealDuration < 5) {
            this.userPreferences.avgMealDuration = this.options.defaultMealDuration;
        }

        console.log('Updated preferences:', this.userPreferences);
    }

    /**
     * Update user meal times
     */
    updateMealtimes(mealtimes) {
        this.userMealtimes = { ...mealtimes };
        console.log('Updated meal times:', this.userMealtimes);
    }

    /**
     * Calculate current fast benefits in real-time
     */
    calculateCurrentFastBenefits(fastStartTime, currentTime = null) {
        if (!fastStartTime) {
            return null;
        }

        try {
            const now = currentTime || new Date();
            const fastStart = new Date(fastStartTime);

            // Validate fast times
            if (fastStart > now) {
                console.warn('Fast start time is in the future');
                return null;
            }

            const fastDurationMs = now - fastStart;
            const fastDurationHours = fastDurationMs / (1000 * 60 * 60);
            const fastDurationMinutes = Math.floor(fastDurationMs / (1000 * 60));

            // Calculate meals skipped
            const mealsSkipped = this.calculateMealsSkippedInPeriod(fastStart, now);

            // Calculate benefits
            const moneySaved = this.calculateMoneySaved(mealsSkipped);
            const timeReclaimed = this.calculateTimeReclaimed(mealsSkipped);

            // Detect new milestones
            const newMilestones = this.detectMilestones(moneySaved, timeReclaimed, mealsSkipped);

            return {
                fastStartTime: fastStart.toISOString(),
                currentTime: now.toISOString(),
                fastDurationHours: Math.round(fastDurationHours * 100) / 100,
                fastDurationMinutes,
                mealsSkipped,
                moneySaved: Math.round(moneySaved * 100) / 100,
                timeReclaimed, // in minutes
                timeReclaimedFormatted: this.formatTimeReclaimed(timeReclaimed),
                newMilestones,
                nextMilestone: this.getNextMilestone(moneySaved, timeReclaimed, mealsSkipped),
                preferences: this.userPreferences
            };

        } catch (error) {
            console.error('Error calculating current fast benefits:', error);
            return null;
        }
    }

    /**
     * Calculate meals skipped between two time points
     */
    calculateMealsSkippedInPeriod(startTime, endTime) {
        if (!this.userMealtimes) {
            return 0;
        }

        let mealsSkipped = 0;
        const current = new Date(startTime);
        current.setHours(0, 0, 0, 0); // Start from beginning of start day

        // Get array of meal times sorted by time
        const mealTimes = Object.entries(this.userMealtimes)
            .filter(([_, time]) => time)
            .map(([mealType, time]) => {
                const [hours, minutes] = time.split(':').map(Number);
                return {
                    mealType,
                    time,
                    hours,
                    minutes,
                    totalMinutes: hours * 60 + minutes
                };
            })
            .sort((a, b) => a.totalMinutes - b.totalMinutes);

        // Iterate through each day in the fast period
        while (current <= endTime) {
            // Check each meal time for this day
            mealTimes.forEach(meal => {
                const mealDateTime = new Date(current);
                mealDateTime.setHours(meal.hours, meal.minutes, 0, 0);

                // If meal time is after fast start and before current time, count it
                if (mealDateTime >= startTime && mealDateTime <= endTime) {
                    mealsSkipped++;
                }
            });

            // Move to next day
            current.setDate(current.getDate() + 1);
        }

        return mealsSkipped;
    }

    /**
     * Calculate money saved based on meals skipped
     */
    calculateMoneySaved(mealsSkipped) {
        return mealsSkipped * this.userPreferences.avgMealCost;
    }

    /**
     * Calculate time reclaimed based on meals skipped
     */
    calculateTimeReclaimed(mealsSkipped) {
        return mealsSkipped * this.userPreferences.avgMealDuration;
    }

    /**
     * Format time reclaimed into readable format
     */
    formatTimeReclaimed(minutes) {
        if (minutes < 60) {
            return `${minutes} min`;
        }

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (remainingMinutes === 0) {
            return `${hours}h`;
        }

        return `${hours}h ${remainingMinutes}m`;
    }

    /**
     * Calculate cumulative benefits for a timeframe
     */
    calculateCumulativeBenefits(fasts, timeframe = 'all') {
        if (!fasts || fasts.length === 0) {
            return {
                totalMoneySaved: 0,
                totalTimeReclaimed: 0,
                totalMealsSkipped: 0,
                totalFasts: 0,
                averageFastDuration: 0,
                timeframe
            };
        }

        try {
            let filteredFasts = [...fasts];

            // Filter by timeframe
            if (timeframe !== 'all') {
                const now = new Date();
                let cutoffDate;

                switch (timeframe) {
                    case 'week':
                        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case 'month':
                        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        break;
                    case 'year':
                        cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                        break;
                    default:
                        cutoffDate = new Date(0); // All time
                }

                filteredFasts = fasts.filter(fast => new Date(fast.start_time) >= cutoffDate);
            }

            let totalMoneySaved = 0;
            let totalTimeReclaimed = 0;
            let totalMealsSkipped = 0;
            let totalDurationHours = 0;

            filteredFasts.forEach(fast => {
                if (!fast.start_time) {
                    return;
                }

                const startTime = new Date(fast.start_time);
                const endTime = fast.end_time ? new Date(fast.end_time) : new Date();

                if (Number.isNaN(startTime.getTime())) {
                    return;
                }

                const mealsSkipped = this.calculateMealsSkippedInPeriod(startTime, endTime);
                const moneySaved = this.calculateMoneySaved(mealsSkipped);
                const timeReclaimed = this.calculateTimeReclaimed(mealsSkipped);

                totalMealsSkipped += mealsSkipped;
                totalMoneySaved += moneySaved;
                totalTimeReclaimed += timeReclaimed;

                // Use stored duration when available, otherwise derive it from timestamps
                if (typeof fast.duration_hours === 'number' && fast.duration_hours >= 0) {
                    totalDurationHours += fast.duration_hours;
                } else {
                    const derivedDuration = (endTime - startTime) / (1000 * 60 * 60);
                    if (!Number.isNaN(derivedDuration) && derivedDuration > 0) {
                        totalDurationHours += derivedDuration;
                    }
                }
            });

            return {
                totalMoneySaved: Math.round(totalMoneySaved * 100) / 100,
                totalTimeReclaimed,
                totalTimeReclaimedFormatted: this.formatTimeReclaimed(totalTimeReclaimed),
                totalMealsSkipped,
                totalFasts: filteredFasts.length,
                averageFastDuration: filteredFasts.length > 0 ?
                    Math.round((totalDurationHours / filteredFasts.length) * 100) / 100 : 0,
                timeframe,
                equivalences: this.generateEquivalences(totalMoneySaved, totalTimeReclaimed)
            };

        } catch (error) {
            console.error('Error calculating cumulative benefits:', error);
            return {
                totalMoneySaved: 0,
                totalTimeReclaimed: 0,
                totalMealsSkipped: 0,
                totalFasts: 0,
                averageFastDuration: 0,
                timeframe
            };
        }
    }

    /**
     * Detect milestones achieved
     */
    detectMilestones(moneySaved, timeReclaimed, mealsSkipped) {
        const newMilestones = [];

        // Money milestones
        this.options.milestoneThresholds.money.forEach(threshold => {
            const key = `money_${threshold}`;
            if (moneySaved >= threshold && !this.achievedMilestones.has(key)) {
                newMilestones.push({
                    type: 'money',
                    threshold,
                    value: moneySaved,
                    description: `Saved $${threshold}!`,
                    key
                });
                this.achievedMilestones.add(key);
            }
        });

        // Time milestones
        this.options.milestoneThresholds.time.forEach(threshold => {
            const key = `time_${threshold}`;
            if (timeReclaimed >= threshold && !this.achievedMilestones.has(key)) {
                newMilestones.push({
                    type: 'time',
                    threshold,
                    value: timeReclaimed,
                    description: `Reclaimed ${this.formatTimeReclaimed(threshold)}!`,
                    key
                });
                this.achievedMilestones.add(key);
            }
        });

        // Meal milestones
        this.options.milestoneThresholds.meals.forEach(threshold => {
            const key = `meals_${threshold}`;
            if (mealsSkipped >= threshold && !this.achievedMilestones.has(key)) {
                const mealText = threshold === 1 ? 'meal' : 'meals';
                newMilestones.push({
                    type: 'meals',
                    threshold,
                    value: mealsSkipped,
                    description: `Skipped ${threshold} ${mealText}!`,
                    key
                });
                this.achievedMilestones.add(key);
            }
        });

        return newMilestones;
    }

    /**
     * Get next milestone to achieve
     */
    getNextMilestone(moneySaved, timeReclaimed, mealsSkipped) {
        const nextMilestones = [];

        // Find next money milestone
        const nextMoneyThreshold = this.options.milestoneThresholds.money
            .find(threshold => moneySaved < threshold);
        if (nextMoneyThreshold) {
            nextMilestones.push({
                type: 'money',
                threshold: nextMoneyThreshold,
                progress: moneySaved / nextMoneyThreshold,
                remaining: nextMoneyThreshold - moneySaved,
                description: `$${nextMoneyThreshold - moneySaved} until next milestone`
            });
        }

        // Find next time milestone
        const nextTimeThreshold = this.options.milestoneThresholds.time
            .find(threshold => timeReclaimed < threshold);
        if (nextTimeThreshold) {
            nextMilestones.push({
                type: 'time',
                threshold: nextTimeThreshold,
                progress: timeReclaimed / nextTimeThreshold,
                remaining: nextTimeThreshold - timeReclaimed,
                description: `${this.formatTimeReclaimed(nextTimeThreshold - timeReclaimed)} until next milestone`
            });
        }

        // Find next meal milestone
        const nextMealThreshold = this.options.milestoneThresholds.meals
            .find(threshold => mealsSkipped < threshold);
        if (nextMealThreshold) {
            const remaining = nextMealThreshold - mealsSkipped;
            const mealText = remaining === 1 ? 'meal' : 'meals';
            nextMilestones.push({
                type: 'meals',
                threshold: nextMealThreshold,
                progress: mealsSkipped / nextMealThreshold,
                remaining,
                description: `${remaining} ${mealText} until next milestone`
            });
        }

        // Return the closest milestone
        return nextMilestones.sort((a, b) => b.progress - a.progress)[0] || null;
    }

    /**
     * Generate tangible equivalences for benefits
     */
    generateEquivalences(moneySaved, timeReclaimed) {
        const equivalences = [];

        // Money equivalences
        if (moneySaved >= 500) {
            equivalences.push(`Enough for a weekend getaway ($${Math.round(moneySaved)})`);
        } else if (moneySaved >= 200) {
            equivalences.push(`Perfect for a nice dinner out ($${Math.round(moneySaved)})`);
        } else if (moneySaved >= 100) {
            equivalences.push(`Great for some quality groceries ($${Math.round(moneySaved)})`);
        } else if (moneySaved >= 50) {
            equivalences.push(`Enough for a gym membership ($${Math.round(moneySaved)})`);
        } else if (moneySaved >= 20) {
            equivalences.push(`Perfect for a coffee date ($${Math.round(moneySaved)})`);
        }

        // Time equivalences
        const hours = timeReclaimed / 60;
        if (hours >= 24) {
            equivalences.push(`A full day reclaimed (${Math.round(hours)}h)`);
        } else if (hours >= 8) {
            equivalences.push(`A full work day's worth of time (${Math.round(hours)}h)`);
        } else if (hours >= 4) {
            equivalences.push(`Time for a good workout and relaxation (${Math.round(hours)}h)`);
        } else if (hours >= 2) {
            equivalences.push(`Perfect for a movie and popcorn (${Math.round(hours)}h)`);
        } else if (hours >= 1) {
            equivalences.push(`Time for meditation and journaling (${Math.round(hours)}h)`);
        }

        return equivalences;
    }

    /**
     * Reset achieved milestones (for testing or new periods)
     */
    resetMilestones() {
        this.achievedMilestones.clear();
    }

    /**
     * Get current preferences
     */
    getPreferences() {
        return { ...this.userPreferences };
    }

    /**
     * Get current meal times
     */
    getMealtimes() {
        return { ...this.userMealtimes };
    }

    /**
     * Validate user input preferences
     */
    validatePreferences(preferences) {
        const errors = [];

        if (preferences.avgMealCost !== undefined) {
            if (typeof preferences.avgMealCost !== 'number' || preferences.avgMealCost < 0 || preferences.avgMealCost > 1000) {
                errors.push('Average meal cost must be between $0 and $1000');
            }
        }

        if (preferences.avgMealDuration !== undefined) {
            if (typeof preferences.avgMealDuration !== 'number' || preferences.avgMealDuration < 5 || preferences.avgMealDuration > 240) {
                errors.push('Average meal duration must be between 5 and 240 minutes');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BenefitsCalculator;
} else {
    window.BenefitsCalculator = BenefitsCalculator;
}
