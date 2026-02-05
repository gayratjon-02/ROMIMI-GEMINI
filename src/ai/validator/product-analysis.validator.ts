
import { Logger } from '@nestjs/common';

// Interface - validation result
export interface ValidationFlag {
    field: string;
    issue: string;
    original: string;
    corrected?: string;
    confidence: 'auto_fixed' | 'needs_review' | 'critical';
}

export interface ValidatedResult<T> {
    data: T;
    flags: ValidationFlag[];
    was_modified: boolean;
}

export class ProductAnalysisValidator {
    private readonly logger = new Logger(ProductAnalysisValidator.name);

    /**
     * Main validation function
     * Validates Claude response and fixes errors
     */
    validate<T extends Record<string, any>>(parsed: T): ValidatedResult<T> {
        const flags: ValidationFlag[] = [];
        let data = JSON.parse(JSON.stringify(parsed)); // Deep clone

        // 1. Fabric Type validation
        data = this.validateFabricType(data, flags);

        // 2. Ankle Termination validation (for pants)
        data = this.validateAnkleTermination(data, flags);

        // 3. Patch Placement validation (Left/Right)
        data = this.validatePatchPlacement(data, flags);

        // 4. Back Pocket validation
        data = this.validateBackPocket(data, flags);

        // 5. Hex Color validation
        data = this.validateHexColor(data, flags);

        // 6. Check required fields when has_patch is true
        data = this.validatePatchFields(data, flags);

        // 7. Category validation (Pajama + zipper = Track Pants)
        data = this.validateCategory(data, flags);

        // Log
        if (flags.length > 0) {
            this.logger.warn(`⚠️ Validation: ${flags.length} issues found`);
            flags.forEach(f => this.logger.warn(`  - ${f.field}: ${f.issue}`));
        }

        return {
            data,
            flags,
            was_modified: flags.some(f => f.corrected !== undefined),
        };
    }

    /**
     * 1. FABRIC TYPE
     * If "corduroy" is mentioned but it might actually be ribbed jersey
     */
    private validateFabricType<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const texture = data.visual_specs?.fabric_texture?.toLowerCase() || '';

        if (texture.includes('corduroy')) {
            // Ribbed jersey indicators
            const ribbedSigns = ['fine', 'stretch', 'jersey', 'knit', 'lightweight', 'soft'];
            const hasRibbedSigns = ribbedSigns.some(s => texture.includes(s));

            // Corduroy indicators
            const corduroySigns = ['cord', 'wale', 'wide rib', 'thick'];
            const hasCorduroySigns = corduroySigns.some(s => texture.includes(s));

            if (hasRibbedSigns && !hasCorduroySigns) {
                const original = data.visual_specs.fabric_texture;
                // Auto-fix
                data.visual_specs.fabric_texture = original
                    .replace(/corduroy/gi, 'ribbed jersey')
                    .replace(/fine-?corduroy/gi, 'fine-ribbed jersey');

                flags.push({
                    field: 'visual_specs.fabric_texture',
                    issue: 'Changed Corduroy → Ribbed jersey (stretch/fine pattern detected)',
                    original,
                    corrected: data.visual_specs.fabric_texture,
                    confidence: 'auto_fixed',
                });
            }
        }

        return data;
    }

    /**
     * 2. ANKLE TERMINATION
     * Zipper + Cuff = impossible combination
     */
    private validateAnkleTermination<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const category = data.general_info?.category?.toLowerCase() || '';
        const isPants = ['pant', 'jogger', 'track', 'trouser', 'pajama'].some(p => category.includes(p));

        if (!isPants) return data;

        const bottom = data.garment_details?.bottom_termination?.toLowerCase() || '';
        const hasZipper = bottom.includes('zipper') || bottom.includes('zip');
        const hasCuff = bottom.includes('cuff') || bottom.includes('elastic') || bottom.includes('ribbed');

        if (hasZipper && hasCuff) {
            const original = data.garment_details.bottom_termination;

            // Zipper is more specific, so keep zipper
            data.garment_details.bottom_termination = 'Straight hem with side ankle zipper';

            flags.push({
                field: 'garment_details.bottom_termination',
                issue: 'IMPOSSIBLE: Zipper + Cuff cannot coexist. Kept zipper.',
                original,
                corrected: data.garment_details.bottom_termination,
                confidence: 'auto_fixed',
            });
        }

        return data;
    }

    /**
     * 3. PATCH PLACEMENT
     * Add "wearer's" prefix to left/right for clarity
     */
    private validatePatchPlacement<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        if (!data.design_back?.placement) return data;

        let placement = data.design_back.placement;
        const hasWearer = /wearer'?s/i.test(placement);

        if (!hasWearer) {
            // "right hip" → "wearer's RIGHT hip"
            if (/\bright\s+(hip|side|pocket|area)/i.test(placement)) {
                const original = placement;
                placement = placement.replace(/\bright\s+(hip|side|pocket|area)/gi, "wearer's RIGHT $1");
                data.design_back.placement = placement;

                flags.push({
                    field: 'design_back.placement',
                    issue: 'Added "wearer\'s" prefix for orientation clarity',
                    original,
                    corrected: placement,
                    confidence: 'auto_fixed',
                });
            }

            // "left hip" → "wearer's LEFT hip"
            if (/\bleft\s+(hip|side|pocket|area)/i.test(placement)) {
                const original = placement;
                placement = placement.replace(/\bleft\s+(hip|side|pocket|area)/gi, "wearer's LEFT $1");
                data.design_back.placement = placement;

                flags.push({
                    field: 'design_back.placement',
                    issue: 'Added "wearer\'s" prefix for orientation clarity',
                    original,
                    corrected: placement,
                    confidence: 'auto_fixed',
                });
            }
        }

        return data;
    }

    /**
     * 4. BACK POCKET
     * Pants should have back pocket mentioned
     */
    private validateBackPocket<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const category = data.general_info?.category?.toLowerCase() || '';
        const isPants = ['pant', 'jogger', 'track', 'pajama'].some(p => category.includes(p));

        if (!isPants) return data;

        const pockets = data.garment_details?.pockets?.toLowerCase() || '';
        const hasBackPocket = ['back', 'welt', 'rear'].some(p => pockets.includes(p));

        if (!hasBackPocket) {
            flags.push({
                field: 'garment_details.pockets',
                issue: 'Back pocket not mentioned. Most joggers have back welt pocket - verify from image.',
                original: data.garment_details?.pockets || '',
                confidence: 'needs_review',
            });
        }

        return data;
    }

    /**
     * 5. HEX COLOR
     * Format must be correct
     */
    private validateHexColor<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const hex = data.visual_specs?.hex_code || '';

        if (hex && !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            // Add # if missing
            if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                const original = hex;
                data.visual_specs.hex_code = `#${hex}`;

                flags.push({
                    field: 'visual_specs.hex_code',
                    issue: 'Added # prefix',
                    original,
                    corrected: data.visual_specs.hex_code,
                    confidence: 'auto_fixed',
                });
            } else {
                flags.push({
                    field: 'visual_specs.hex_code',
                    issue: 'Invalid hex format',
                    original: hex,
                    confidence: 'needs_review',
                });
            }
        }

        return data;
    }

    /**
     * 6. PATCH FIELDS
     * If has_patch: true, required fields must be complete
     */
    private validatePatchFields<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        if (!data.design_back?.has_patch) return data;

        const required = ['patch_color', 'patch_detail', 'placement', 'size', 'technique'];
        const missing: string[] = [];

        for (const field of required) {
            const val = data.design_back[field];
            if (!val || val === 'N/A' || val === '') {
                missing.push(field);
            }
        }

        if (missing.length > 0) {
            flags.push({
                field: 'design_back',
                issue: `has_patch: true, but these fields are missing: ${missing.join(', ')}`,
                original: JSON.stringify(missing),
                confidence: 'critical',
            });
        }

        return data;
    }

    /**
     * 7. CATEGORY VALIDATION
     * Pajama + ankle zipper = Track Pants
     * Joggers + zipper = Track Pants
     */
    private validateCategory<T extends Record<string, any>>(data: T, flags: ValidationFlag[]): T {
        const category = data.general_info?.category?.toLowerCase() || '';
        const bottom = data.garment_details?.bottom_termination?.toLowerCase() || '';
        const hasZipper = bottom.includes('zipper') || bottom.includes('zip');
        const hasCuff = bottom.includes('cuff') || bottom.includes('elastic');

        // Pajama + zipper = Track Pants
        if (category.includes('pajama') && hasZipper) {
            const original = data.general_info.category;
            data.general_info.category = 'Track Pants';

            flags.push({
                field: 'general_info.category',
                issue: 'Changed Pajama + ankle zipper → Track Pants',
                original,
                corrected: data.general_info.category,
                confidence: 'auto_fixed',
            });
        }

        // Joggers + zipper (no cuff) = Track Pants
        if (category.includes('jogger') && hasZipper && !hasCuff) {
            const original = data.general_info.category;
            data.general_info.category = 'Track Pants';

            flags.push({
                field: 'general_info.category',
                issue: 'Changed Joggers + ankle zipper (no cuff) → Track Pants',
                original,
                corrected: data.general_info.category,
                confidence: 'auto_fixed',
            });
        }

        // Track Pants + cuff (no zipper) = Joggers
        if (category.includes('track') && hasCuff && !hasZipper) {
            const original = data.general_info.category;
            data.general_info.category = 'Joggers';

            flags.push({
                field: 'general_info.category',
                issue: 'Changed Track Pants + elastic cuff (no zipper) → Joggers',
                original,
                corrected: data.general_info.category,
                confidence: 'auto_fixed',
            });
        }

        return data;
    }
}

/**
 * Helper function - for quick usage
 */
export function validateProductAnalysis<T extends Record<string, any>>(parsed: T): ValidatedResult<T> {
    const validator = new ProductAnalysisValidator();
    return validator.validate(parsed);
}
