import { Injectable, Logger } from '@nestjs/common';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze-product-direct.dto';
import { AnalyzeDAPresetResponse } from '../libs/dto/analyze-da-preset.dto';
import { DAPreset, DAPresetConfig } from '../database/entities/da-preset.entity';
import { Product } from '../database/entities/product.entity';
import { ShotOptions, createDefaultShotOptions } from '../common/interfaces/shot-options.interface';
import {
    MergedPrompts,
    MergedPromptObject,
    PromptCamera,
    PromptBackground,
    ProductDetailsInPrompt,
    DAElementsInPrompt,
} from '../common/interfaces/merged-prompts.interface';

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

interface MergeInput {
    product: AnalyzeProductDirectResponse;
    da: AnalyzeDAPresetResponse;
    options: {
        /** @deprecated Use shot_options instead */
        model_type?: 'adult' | 'kid';
        /** NEW: Per-shot control options */
        shot_options?: ShotOptions;
    };
}

/**
 * Input for building prompts from DB entities directly
 */
interface EntityMergeInput {
    product: Product;
    daPreset: DAPreset;
    /** @deprecated Use shotOptions instead */
    modelType?: 'adult' | 'kid';
    /** NEW: Per-shot control options */
    shotOptions?: ShotOptions;
}

/**
 * Shot type configuration with camera settings
 */
interface ShotTypeConfig {
    type: string;
    display_name: string;
    camera: PromptCamera;
}

/**
 * Full output matching client specification MergedPrompts interface
 */
export interface GeneratedPrompts {
    visual_id: string;
    prompts: MergedPrompts;
    negative_prompt: string;
}

// ═══════════════════════════════════════════════════════════
// SHOT TYPE CONFIGURATIONS (Camera Settings per Shot)
// ═══════════════════════════════════════════════════════════

const SHOT_CONFIGS: Record<string, ShotTypeConfig> = {
    duo: {
        type: 'duo',
        display_name: 'DUO (Father + Son)',
        camera: {
            focal_length_mm: 85,
            aperture: 2.8,
            focus: 'subjects',
            angle: 'eye-level',
        },
    },
    solo: {
        type: 'solo',
        display_name: 'SOLO Model',
        camera: {
            focal_length_mm: 85,
            aperture: 2.0,
            focus: 'subject',
            angle: 'eye-level',
        },
    },
    flatlay_front: {
        type: 'flatlay_front',
        display_name: 'Flat Lay Front',
        camera: {
            focal_length_mm: 50,
            aperture: 8.0,
            focus: 'entire garment',
            angle: 'overhead 90°',
        },
    },
    flatlay_back: {
        type: 'flatlay_back',
        display_name: 'Flat Lay Back',
        camera: {
            focal_length_mm: 50,
            aperture: 8.0,
            focus: 'entire garment',
            angle: 'overhead 90°',
        },
    },
    closeup_front: {
        type: 'closeup_front',
        display_name: 'Close-Up Front Detail',
        camera: {
            focal_length_mm: 100,
            aperture: 4.0,
            focus: 'logo/texture detail',
            angle: 'macro',
        },
    },
    closeup_back: {
        type: 'closeup_back',
        display_name: 'Close-Up Back Detail',
        camera: {
            focal_length_mm: 100,
            aperture: 4.0,
            focus: 'patch/branding detail',
            angle: 'macro',
        },
    },
};

// ═══════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════

@Injectable()
export class PromptBuilderService {
    private readonly logger = new Logger(PromptBuilderService.name);

    /**
     * 🆕 Build prompts from DB entities directly (Phase 3)
     * This is the main method for the new workflow
     * Supports both legacy modelType and new shotOptions
     */
    buildPromptsFromEntities(input: EntityMergeInput): GeneratedPrompts {
        const { product, daPreset, modelType, shotOptions } = input;

        this.logger.log(`🏗️ Building prompts from entities: Product=${product.name}, DA=${daPreset.name}`);

        // Get product JSON (final or analyzed)
        const productJson = (product.final_product_json || product.analyzed_product_json) as AnalyzeProductDirectResponse;
        if (!productJson) {
            throw new Error('Product must be analyzed first (no product JSON found)');
        }

        // Convert DAPreset entity to config format
        const daConfig = daPreset.toPresetConfig();

        // Build DA response format from config
        const da: AnalyzeDAPresetResponse = {
            da_name: daConfig.da_name,
            background: daConfig.background,
            floor: daConfig.floor,
            props: daConfig.props,
            styling: daConfig.styling,
            lighting: daConfig.lighting,
            mood: daConfig.mood,
            quality: daConfig.quality,
        };

        // Use the standard buildPrompts method with shotOptions OR legacy modelType
        return this.buildPrompts({
            product: productJson,
            da,
            options: {
                model_type: modelType,
                shot_options: shotOptions,
            },
        });
    }

    /**
     * Original method - Build prompts from DTO interfaces
     * Returns full MergedPrompts format with camera, background, product_details, da_elements
     */
    buildPrompts(input: MergeInput): GeneratedPrompts {
        this.logger.log(`🏗️ Building prompts for product: ${input.product.general_info.product_name} with DA: ${input.da.da_name}`);

        const { product, da, options } = input;
        const visualId = crypto.randomUUID();

        // ═══════════════════════════════════════════════════════════
        // 1. HALLUCINATION CHECKS & DATA PREP
        // ═══════════════════════════════════════════════════════════

        const zipperText = this.checkZipperRule(product);
        const logoTextFront = this.checkLogoRule(product.design_front.has_logo, product.design_front.logo_text, product.design_front.logo_type);

        // ═══════════════════════════════════════════════════════════
        // 2. BRAND GUARDIAN RULES
        // ═══════════════════════════════════════════════════════════

        // 🆕 SMART FOOTWEAR: Match footwear to product category (no more barefoot forcing)
        const footwear = this.applySmartFootwearMatching(da.styling.footwear, product.general_info.category);

        // PANTS RULE: Default to Black chino pants if not specified
        const pants = this.applyPantsRule(da.styling.pants);

        // CATEGORY DETECTION: Check if product is a bottom garment
        const isProductBottom = this.isBottomGarment(product.general_info.category);

        // ═══════════════════════════════════════════════════════════
        // 3. COMMON PROMPT FRAGMENTS
        // ═══════════════════════════════════════════════════════════

        const qualitySuffix = `, ${da.quality}, ${da.lighting.type}, ${da.lighting.temperature}`;
        const baseAttire = `Wearing ${product.visual_specs.color_name} ${product.general_info.product_name}`;

        // SMART STYLING: If product IS a bottom → only footwear, no DA pants
        // If product is NOT a bottom (top/jacket) → include both pants and footwear
        const styling = isProductBottom
            ? footwear  // Product is pants/shorts → just footwear
            : `Wearing ${pants}, ${footwear}`;  // Product is top → include DA pants + footwear

        if (isProductBottom) {
            this.logger.log(`👖 Category Detection: Product "${product.general_info.category}" is a BOTTOM → skipping DA pants`);
        }

        // Props (handle empty arrays gracefully)
        const leftProps = da.props.left_side.length > 0 ? da.props.left_side.join(', ') : 'minimal decor';
        const rightProps = da.props.right_side.length > 0 ? da.props.right_side.join(', ') : 'minimal decor';
        const scene = `${da.background.type}, ${da.floor.type}. Props: ${leftProps} on the left, ${rightProps} on the right`;
        const propsText = `${leftProps}, ${rightProps}`;

        // ═══════════════════════════════════════════════════════════
        // 4. BUILD COMMON OBJECTS FOR MergedPromptObject
        // ═══════════════════════════════════════════════════════════

        const background: PromptBackground = {
            wall: da.background.type,
            floor: da.floor.type,
        };

        const productDetails: ProductDetailsInPrompt = {
            type: product.general_info.category,
            color: product.visual_specs.color_name,
            logos: logoTextFront || undefined,
            zip: zipperText || undefined,
        };

        const daElements: DAElementsInPrompt = {
            background: da.background.type,
            props: propsText,
            mood: da.mood,
        };

        // ═══════════════════════════════════════════════════════════
        // 5. NEGATIVE PROMPT (shared across all shots)
        // ═══════════════════════════════════════════════════════════

        const negativePrompt = 'text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face, deformed hands, extra fingers';

        // ═══════════════════════════════════════════════════════════
        // 6. GENERATE 6 SHOT PROMPTS (MergedPromptObject format)
        // ═══════════════════════════════════════════════════════════

        // 6.1 DUO (Father + Son)
        const duoPrompt = this.buildDuoPrompt(product, da, baseAttire, styling, scene, zipperText, qualitySuffix);
        const duo: MergedPromptObject = {
            ...SHOT_CONFIGS.duo,
            prompt: duoPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // ═══════════════════════════════════════════════════════════
        // 🆕 SHOT OPTIONS: Derive per-shot settings from options
        // ═══════════════════════════════════════════════════════════
        // If shot_options provided, use per-shot settings
        // Otherwise, fall back to legacy model_type (backward compatible)
        const shotOptions = options.shot_options || createDefaultShotOptions(options.model_type || 'adult');

        // SOLO: Get subject from shot_options.solo.subject
        const soloSubject = shotOptions.solo?.subject || options.model_type || 'adult';

        // FLAT LAY: Get size from shot_options.flatlay_front.size / flatlay_back.size
        const flatLayFrontSize = shotOptions.flatlay_front?.size || options.model_type || 'adult';
        const flatLayBackSize = shotOptions.flatlay_back?.size || options.model_type || 'adult';

        this.logger.log(`🎯 Shot Settings: SOLO=${soloSubject}, FlatLayFront=${flatLayFrontSize}, FlatLayBack=${flatLayBackSize}`);

        // 6.2 SOLO (uses soloSubject - can be different from flat lay)
        const soloPrompt = this.buildSoloPrompt(product, da, soloSubject, baseAttire, styling, scene, zipperText, logoTextFront, qualitySuffix);
        const solo: MergedPromptObject = {
            ...SHOT_CONFIGS.solo,
            display_name: soloSubject === 'adult' ? 'SOLO Adult Model' : 'SOLO Kid Model',
            prompt: soloPrompt,
            negative_prompt: negativePrompt,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.3 FLAT LAY FRONT (uses flatLayFrontSize - independent from solo and flat lay back)
        const flatLayFrontPrompt = this.buildFlatLayFrontPrompt(product, da, flatLayFrontSize, logoTextFront, qualitySuffix);
        const flatLayFrontNegative = this.buildShotNegativePrompt('flatlay_front', product);
        const flatlay_front: MergedPromptObject = {
            ...SHOT_CONFIGS.flatlay_front,
            display_name: flatLayFrontSize === 'adult' ? 'Flat Lay Front (Adult Size)' : 'Flat Lay Front (Kid Size)',
            prompt: flatLayFrontPrompt,
            negative_prompt: flatLayFrontNegative,
            background,
            product_details: {
                ...productDetails,
                size: flatLayFrontSize === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.4 FLAT LAY BACK (uses flatLayBackSize - can be different from front)
        const flatLayBackPrompt = this.buildFlatLayBackPrompt(product, da, flatLayBackSize, qualitySuffix);
        const flatLayBackNegative = this.buildShotNegativePrompt('flatlay_back', product);
        const flatlay_back: MergedPromptObject = {
            ...SHOT_CONFIGS.flatlay_back,
            display_name: flatLayBackSize === 'adult' ? 'Flat Lay Back (Adult Size)' : 'Flat Lay Back (Kid Size)',
            prompt: flatLayBackPrompt,
            negative_prompt: flatLayBackNegative,
            background,
            product_details: {
                ...productDetails,
                size: flatLayBackSize === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.5 CLOSE UP FRONT (with shot-specific negative prompt)
        const closeUpFrontPrompt = this.buildCloseUpFrontPrompt(product, da, qualitySuffix);
        const closeUpFrontNegative = this.buildShotNegativePrompt('closeup_front', product);
        const closeup_front: MergedPromptObject = {
            ...SHOT_CONFIGS.closeup_front,
            prompt: closeUpFrontPrompt,
            negative_prompt: closeUpFrontNegative,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        // 6.6 CLOSE UP BACK (with shot-specific negative prompt)
        const closeUpBackPrompt = this.buildCloseUpBackPrompt(product, da, qualitySuffix);
        const closeUpBackNegative = this.buildShotNegativePrompt('closeup_back', product);
        const closeup_back: MergedPromptObject = {
            ...SHOT_CONFIGS.closeup_back,
            prompt: closeUpBackPrompt,
            negative_prompt: closeUpBackNegative,
            background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            last_edited_at: null,
        };

        return {
            visual_id: visualId,
            prompts: {
                duo,
                solo,
                flatlay_front,
                flatlay_back,
                closeup_front,
                closeup_back,
            },
            negative_prompt: negativePrompt,
        };
    }

    // ═══════════════════════════════════════════════════════════
    // BRAND GUARDIAN RULES
    // ═══════════════════════════════════════════════════════════

    /**
     * 🆕 SMART FOOTWEAR MATCHING
     * 
     * Assigns stylish footwear based on product category instead of forcing barefoot.
     * Models should always wear appropriate shoes matching the outfit style.
     * 
     * @param daFootwear - Footwear from DA preset (may be null/empty)
     * @param productCategory - Product category (e.g., 'Joggers', 'Jacket')
     * @returns Appropriate footwear string
     */
    private applySmartFootwearMatching(daFootwear: string, productCategory: string): string {
        const category = (productCategory || '').toLowerCase();
        const existingFootwear = (daFootwear || '').toLowerCase().trim();

        // If DA has specific footwear (not barefoot or empty), use it
        if (existingFootwear && existingFootwear !== 'barefoot' && existingFootwear !== '') {
            this.logger.log(`👟 Smart Footwear: Using DA footwear → "${daFootwear}"`);
            return daFootwear;
        }

        // 🏃 SPORTY/ATHLETIC Categories → Clean white sneakers
        const sportyKeywords = ['sweatpant', 'jogger', 'tracksuit', 'track pant', 'athletic', 'sport', 'hoodie'];
        if (sportyKeywords.some(keyword => category.includes(keyword))) {
            const footwear = 'Clean white premium leather sneakers';
            this.logger.log(`👟 Smart Footwear: Sporty category "${productCategory}" → "${footwear}"`);
            return footwear;
        }

        // 🧥 OUTERWEAR/FORMAL Categories → Stylish boots
        const outerwearKeywords = ['jacket', 'coat', 'outerwear', 'blazer', 'parka', 'bomber', 'trucker', 'leather'];
        if (outerwearKeywords.some(keyword => category.includes(keyword))) {
            const footwear = 'Stylish leather Chelsea boots in matching tones';
            this.logger.log(`👟 Smart Footwear: Outerwear category "${productCategory}" → "${footwear}"`);
            return footwear;
        }

        // 👖 CASUAL PANTS Categories → Casual sneakers
        const casualPantsKeywords = ['chino', 'trouser', 'pant', 'jean', 'denim'];
        if (casualPantsKeywords.some(keyword => category.includes(keyword))) {
            const footwear = 'Minimalist white leather sneakers';
            this.logger.log(`👟 Smart Footwear: Casual pants "${productCategory}" → "${footwear}"`);
            return footwear;
        }

        // 👕 DEFAULT: Fashionable footwear for any other category
        const defaultFootwear = 'Fashionable footwear matching the outfit style';
        this.logger.log(`👟 Smart Footwear: Default for "${productCategory}" → "${defaultFootwear}"`);
        return defaultFootwear;
    }

    /**
     * PANTS RULE: Default to Black chino pants
     */
    private applyPantsRule(pants: string): string {
        if (!pants || pants.trim() === '') {
            return 'Black chino pants (#1A1A1A)';
        }
        return pants;
    }

    /**
     * CATEGORY DETECTION: Check if product is a bottom garment
     *
     * Bottom garments include: pants, trousers, jeans, joggers, shorts, leggings, skirts, etc.
     * When product IS a bottom, we should NOT add DA's default pants styling
     * to avoid conflicts like "Wearing Track Pants. Wearing Black chino pants..."
     *
     * @param category - Product category from general_info.category
     * @returns true if product is a bottom garment
     */
    private isBottomGarment(category: string): boolean {
        if (!category) return false;

        const normalizedCategory = category.toLowerCase().trim();

        // Keywords that indicate a bottom garment
        const bottomKeywords = [
            'pant',      // pants, track pants, cargo pants
            'trouser',   // trousers
            'jean',      // jeans
            'jogger',    // joggers
            'short',     // shorts
            'leg',       // leggings
            'bottom',    // bottoms
            'skirt',     // skirts
            'chino',     // chinos
            'sweatpant', // sweatpants
            'cargo',     // cargo (if standalone)
        ];

        // Check if category contains any bottom keyword
        const isBottom = bottomKeywords.some(keyword => normalizedCategory.includes(keyword));

        return isBottom;
    }

    // ═══════════════════════════════════════════════════════════
    // HALLUCINATION CHECKS
    // ═══════════════════════════════════════════════════════════

    private checkZipperRule(product: AnalyzeProductDirectResponse): string {
        const bottom = product.garment_details.bottom_termination?.toLowerCase() || '';
        if (bottom.includes('zipper') || bottom.includes('zip')) {
            return ' Straight leg fit, visible ankle zippers.';
        }
        return '';
    }

    private checkLogoRule(hasLogo: boolean, text: string, type: string): string {
        if (!hasLogo) {
            return '';
        }
        return `Visible logo: ${text} (${type}).`;
    }

    // ═══════════════════════════════════════════════════════════
    // 🎨 COLOR WEIGHTING SYSTEM (Anti-Hallucination for Flat Lay/Closeup)
    // ═══════════════════════════════════════════════════════════

    /**
     * Apply color weighting for product-only shots (no human model)
     * This forces the AI to respect the specific color instead of defaulting
     * 
     * @param colorName - Product color name (e.g., "DEEP BURGUNDY SUEDE")
     * @param shotType - Type of shot (flatlay_front, flatlay_back, closeup_front, closeup_back)
     * @returns Weighted color string like "(DEEP BURGUNDY SUEDE:1.5)"
     */
    private applyColorWeighting(colorName: string, shotType: string): string {
        const productOnlyShots = ['flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];

        if (productOnlyShots.includes(shotType)) {
            // Apply high weight (1.5) to color for product-only shots
            return `(${colorName}:1.5)`;
        }

        return colorName;
    }

    /**
     * Generate material-specific negative prompts to prevent color bias
     * Suede tends to generate as beige/tan by default - we need to block these
     * 
     * @param material - Product material (e.g., "Suede", "Leather")
     * @param actualColor - The actual product color to avoid blocking
     * @returns Additional negative prompt terms
     */
    private getMaterialNegativePrompt(material: string, actualColor: string): string {
        const materialLower = material?.toLowerCase() || '';
        const colorLower = actualColor?.toLowerCase() || '';

        // Check if material is Suede or Nubuck
        if (materialLower.includes('suede') || materialLower.includes('nubuck')) {
            const suedeBiasColors = ['beige', 'tan', 'camel', 'sand', 'khaki', 'cream', 'ivory'];

            // Filter out colors that match the actual product color
            const colorsToBlock = suedeBiasColors.filter(biasColor => {
                // Don't block if actual color contains this bias color
                return !colorLower.includes(biasColor);
            });

            if (colorsToBlock.length > 0) {
                this.logger.log(`🎨 Suede Material Detected → Blocking bias colors: ${colorsToBlock.join(', ')}`);
                return `, ${colorsToBlock.join(', ')} color, wrong color`;
            }
        }

        // Check if material is Leather (tends to look shiny/black)
        if (materialLower.includes('leather') && !colorLower.includes('black')) {
            this.logger.log(`🎨 Leather Material Detected → Blocking black leather bias`);
            return ', black leather, dark leather, shiny leather';
        }

        return '';
    }

    /**
     * Build texture reinforcement string for materials
     * Ensures the AI generates correct material appearance
     * 
     * @param material - Product material
     * @param fabricTexture - Fabric texture from analysis
     * @returns Texture reinforcement phrase
     */
    private getTextureReinforcement(material: string, fabricTexture: string): string {
        const materialLower = material?.toLowerCase() || '';
        const textureLower = fabricTexture?.toLowerCase() || '';

        // Suede: matte, light-absorbing, napped
        if (materialLower.includes('suede') || materialLower.includes('nubuck')) {
            if (!textureLower.includes('matte') && !textureLower.includes('napped')) {
                return 'matte finish, soft napped texture, light-absorbing surface';
            }
        }

        // Velvet: plush, light-absorbing
        if (materialLower.includes('velvet') || materialLower.includes('velour')) {
            return 'plush velvet texture, light-absorbing, soft sheen';
        }

        // Corduroy: vertical ridges
        if (materialLower.includes('corduroy')) {
            return 'vertical corduroy ridges, matte cotton texture';
        }

        return '';
    }

    /**
     * Build shot-specific negative prompt with material bias blocking
     * 
     * @param shotType - Type of shot
     * @param product - Product data
     * @returns Complete negative prompt for this shot
     */
    private buildShotNegativePrompt(shotType: string, product: AnalyzeProductDirectResponse): string {
        // Base negative prompt
        let negativePrompt = 'text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face, deformed hands, extra fingers';

        // Get material from fabric texture (analyze for material keywords)
        const fabricTexture = product.visual_specs.fabric_texture || '';
        const colorName = product.visual_specs.color_name || '';

        // Add material-specific negative prompts for product-only shots
        const productOnlyShots = ['flatlay_front', 'flatlay_back', 'closeup_front', 'closeup_back'];
        if (productOnlyShots.includes(shotType)) {
            const materialNegative = this.getMaterialNegativePrompt(fabricTexture, colorName);
            negativePrompt += materialNegative;

            // Also add color consistency blockers
            negativePrompt += ', wrong color, color shift, faded color, washed out';
        }

        return negativePrompt;
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDERS (6 Shot Types)
    // ═══════════════════════════════════════════════════════════

    private buildDuoPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        baseAttire: string,
        styling: string,
        scene: string,
        zipperText: string,
        qualitySuffix: string
    ): string {
        return `Photorealistic editorial fashion photography. Father and Son standing together in a ${da.mood} moment. ` +
            `Both wearing matching ${baseAttire}. ${styling}. ${scene}. ` +
            `${product.design_front.description}.${zipperText} ` +
            `Real human skin texture, natural poses, editorial quality.${qualitySuffix}`;
    }

    private buildSoloPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        baseAttire: string,
        styling: string,
        scene: string,
        zipperText: string,
        logoTextFront: string,
        qualitySuffix: string
    ): string {
        let subject = '';
        if (modelType === 'adult') {
            subject = 'Handsome 30s male model, Mediterranean features, natural confident pose';
        } else {
            subject = 'Cute young boy (age 5-7), playful natural pose';
        }

        return `Photorealistic editorial fashion photography. ${subject}. ` +
            `${baseAttire}. ${product.design_front.description}. ${logoTextFront}. ` +
            `${styling}. ${scene}.${zipperText} ` +
            `Real human skin texture, editorial quality.${qualitySuffix}`;
    }

    /**
     * FLAT LAY FRONT with Size Variation + Color Weighting
     * Adult: "Adult-size garment" - larger proportions
     * Kid: "Child-size garment" - smaller, compact proportions
     * 
     * 🎨 COLOR WEIGHTING: Applied to prevent AI defaulting to beige/tan for suede
     */
    private buildFlatLayFrontPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        logoTextFront: string,
        qualitySuffix: string
    ): string {
        // SIZE VARIATION: Different size descriptions for adult vs kid
        const sizeDescription = modelType === 'adult'
            ? 'Adult-size garment with standard adult proportions'
            : 'Child-size garment with smaller, compact proportions';

        // 🎨 COLOR WEIGHTING: Apply high weight (1.5) to color for product-only shots
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'flatlay_front');

        // 🎨 TEXTURE REINFORCEMENT: Ensure correct material appearance
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        return `Professional overhead flat lay photography of ${weightedColor} ${product.general_info.product_name}. ` +
            `${sizeDescription}. ` +
            `${product.design_front.description}. ${logoTextFront}. ` +
            `Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ` +
            `Laid flat on ${da.floor.type} surface. ` +
            `NO PEOPLE, NO HANDS, PERFECTLY FOLDED, pristine condition.${qualitySuffix}`;
    }

    /**
     * FLAT LAY BACK with Size Variation + Color Weighting
     * Adult: "Adult-size garment" - larger proportions
     * Kid: "Child-size garment" - smaller, compact proportions
     * 
     * 🎨 COLOR WEIGHTING: Applied to prevent AI defaulting to beige/tan for suede
     */
    private buildFlatLayBackPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        modelType: 'adult' | 'kid',
        qualitySuffix: string
    ): string {
        const patchDetail = product.design_back.has_patch
            ? `Visible patch: ${product.design_back.patch_detail}. `
            : '';
        const technique = product.design_back.technique
            ? `Technique: ${product.design_back.technique}. `
            : '';

        // SIZE VARIATION: Different size descriptions for adult vs kid
        const sizeDescription = modelType === 'adult'
            ? 'Adult-size garment with standard adult proportions'
            : 'Child-size garment with smaller, compact proportions';

        // 🎨 COLOR WEIGHTING: Apply high weight (1.5) to color for product-only shots
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'flatlay_back');

        // 🎨 TEXTURE REINFORCEMENT: Ensure correct material appearance
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        return `Professional overhead flat lay photography of the BACK of ${weightedColor} ${product.general_info.product_name}. ` +
            `${sizeDescription}. ` +
            `${product.design_back.description}. ${patchDetail}${technique}` +
            `Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ` +
            `Showing rear details clearly. NO PEOPLE, NO HANDS.${qualitySuffix}`;
    }

    /**
     * CLOSE UP FRONT with Color Weighting
     * Macro detail shot of front texture and logo
     * 
     * 🎨 COLOR WEIGHTING: Applied to prevent color bias in macro shots
     */
    private buildCloseUpFrontPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        qualitySuffix: string
    ): string {
        const hardwareText = product.garment_details.hardware_finish
            ? `, hardware: ${product.garment_details.hardware_finish}`
            : '';

        // 🎨 COLOR WEIGHTING: Apply high weight (1.5) to color for product-only shots
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'closeup_front');

        // 🎨 TEXTURE REINFORCEMENT: Ensure correct material appearance
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `. ${textureReinforcement}` : '';

        return `Macro detail shot of ${weightedColor} ${product.visual_specs.fabric_texture}. ` +
            `Focus on ${product.design_front.logo_type}${hardwareText}${texturePhrase}. ` +
            `Hard side lighting to emphasize texture and details.${qualitySuffix}`;
    }

    /**
     * CLOSE UP BACK with Color Weighting
     * Macro detail shot of back patch and branding
     * 
     * 🎨 COLOR WEIGHTING: Applied to prevent color bias in macro shots
     */
    private buildCloseUpBackPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        qualitySuffix: string
    ): string {
        const techniqueText = product.design_back.technique
            ? `, technique: ${product.design_back.technique}`
            : '';
        const patchDetail = product.design_back.patch_detail || 'rear branding';

        // 🎨 COLOR WEIGHTING: Apply high weight (1.5) to color for product-only shots
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'closeup_back');

        // 🎨 TEXTURE REINFORCEMENT: Ensure correct material appearance
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `. ${textureReinforcement}` : '';

        return `Macro detail shot of ${weightedColor} rear brand patch. ` +
            `Focus on ${patchDetail}${techniqueText}${texturePhrase}. ` +
            `Emphasizing craftsmanship and quality.${qualitySuffix}`;
    }
}
