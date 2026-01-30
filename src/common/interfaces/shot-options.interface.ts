/**
 * Shot Options Interface
 * 
 * Defines per-shot control options for generation.
 * Replaces the global model_type with granular settings.
 * 
 * Shot Types:
 * - DUO: Always Father + Son (fixed, no selection needed)
 * - SOLO: User selects Adult OR Kid
 * - FLAT LAY: User selects Adult Size OR Kid Size
 * - CLOSE UP: Neutral (no selection needed)
 */

/**
 * Base shot option - just enabled/disabled
 */
export interface ShotOption {
    enabled: boolean;
}

/**
 * SOLO shot option - includes subject selection
 * Subject determines which model anatomy to use
 */
export interface SoloShotOption extends ShotOption {
    subject: 'adult' | 'kid';
}

/**
 * FLAT LAY shot option - includes size selection
 * Size determines garment proportions
 */
export interface FlatlayOption extends ShotOption {
    size: 'adult' | 'kid';
}

/**
 * Complete shot options for all 6 shot types
 * 
 * @example
 * {
 *   duo: { enabled: true },
 *   solo: { enabled: true, subject: 'kid' },
 *   flatlay_front: { enabled: true, size: 'adult' },
 *   flatlay_back: { enabled: true, size: 'kid' },
 *   closeup_front: { enabled: true },
 *   closeup_back: { enabled: false }
 * }
 */
export interface ShotOptions {
    /** DUO: Always Father + Son - no subject selection */
    duo?: ShotOption;

    /** SOLO: Select Adult OR Kid model */
    solo?: SoloShotOption;

    /** FLAT LAY FRONT: Select Adult Size OR Kid Size */
    flatlay_front?: FlatlayOption;

    /** FLAT LAY BACK: Select Adult Size OR Kid Size */
    flatlay_back?: FlatlayOption;

    /** CLOSE UP FRONT: Neutral - no size/model selection */
    closeup_front?: ShotOption;

    /** CLOSE UP BACK: Neutral - no size/model selection */
    closeup_back?: ShotOption;
}

/**
 * Helper function to create default shot options from legacy model_type
 * Used for backward compatibility
 * 
 * @param modelType - Legacy 'adult' or 'kid' global setting
 * @returns ShotOptions with all shots enabled using the specified model type
 */
export function createDefaultShotOptions(modelType: 'adult' | 'kid' = 'adult'): ShotOptions {
    return {
        duo: { enabled: true },
        solo: { enabled: true, subject: modelType },
        flatlay_front: { enabled: true, size: modelType },
        flatlay_back: { enabled: true, size: modelType },
        closeup_front: { enabled: true },
        closeup_back: { enabled: true },
    };
}

/**
 * Get enabled shot types from shot options
 * 
 * @param options - Shot options object
 * @returns Array of enabled shot type keys
 */
export function getEnabledShots(options: ShotOptions): string[] {
    const allShots = ['duo', 'solo', 'flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'] as const;
    return allShots.filter(shot => options[shot]?.enabled !== false);
}
