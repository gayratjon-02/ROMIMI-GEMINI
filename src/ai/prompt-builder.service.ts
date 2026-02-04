import { Injectable, Logger } from '@nestjs/common';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze/analyze-product-direct.dto';
import { AnalyzeDAPresetResponse } from '../libs/dto/analyze/analyze-da-preset.dto';
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
        /** Resolution for prompt quality suffix: "4K" | "2K" */
        resolution?: string;
        /** Aspect ratio for output images: "4:5" | "1:1" | "9:16" | "16:9" */
        aspect_ratio?: string;
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
    /** Resolution for prompt quality suffix: "4K" | "2K" */
    resolution?: string;
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
        display_name: 'DUO (Two Models)',
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
            // V2: Convert legacy props to ground structure
            ground: {
                left_items: (daConfig.props?.left_side || []).map((name: string) => ({
                    name,
                    surface: 'on_floor',
                    height_level: 'middle',
                    color: 'N/A',
                    material: 'N/A',
                })),
                right_items: (daConfig.props?.right_side || []).map((name: string) => ({
                    name,
                    surface: 'on_floor',
                    height_level: 'middle',
                    color: 'N/A',
                    material: 'N/A',
                })),
            },
            // V2: adult/kid styling
            styling: {
                adult_bottom: daConfig.styling.pants,
                adult_feet: daConfig.styling.footwear,
                pants: daConfig.styling.pants,
                footwear: daConfig.styling.footwear,
            },
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
                resolution: input.resolution,
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
        const logoTextFront = this.checkLogoRule(
            product.design_front.has_logo,
            product.design_front.logo_text,
            product.design_front.logo_type,
            product.design_front.font_family,
            product.design_front.size_relative_pct
        );

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
        // 3. COMMON PROMPT FRAGMENTS (quality = lighting only; resolution appended at END)
        // Resolution keywords are force-appended at the very end of each prompt (see step 6).
        // ═══════════════════════════════════════════════════════════

        const resolution = (options.resolution && String(options.resolution).trim().toUpperCase()) || '4K';
        const resolutionSuffix = this.getResolutionQualitySuffix(resolution);
        this.logger.log(`📐 Resolution for prompts: "${resolution}" → force-append suffix (${resolutionSuffix.length} chars)`);
        const qualitySuffix = `, ${da.quality}, ${da.lighting.type}, ${da.lighting.temperature}`;

        // 🚀 DEFAULT TOP RULE: If product is a Bottom, model must wear a white t-shirt (Anti-Nudity)
        let baseAttire = `Wearing ${product.visual_specs.color_name} ${product.general_info.product_name}`;
        if (isProductBottom) {
            baseAttire = `Wearing a plain white t-shirt on upper body, fully clothed top. ${baseAttire}`;
            this.logger.log(`👕 Anti-Nudity: Product is BOTTOM → Prepending 'White T-Shirt' to positive prompt`);
        }

        // SMART STYLING: If product IS a bottom → only footwear, no DA pants
        // If product is NOT a bottom (top/jacket) → include both pants and footwear
        const styling = isProductBottom
            ? footwear  // Product is pants/shorts → just footwear
            : `Wearing ${pants}, ${footwear}`;  // Product is top → include DA pants + footwear
        // Solo shot: use solo-safe footwear (no "Child"/"father") to avoid Vertex RAI child filter
        const footwearSolo = this.getSoloSafeFootwear(footwear);
        const stylingSolo = isProductBottom
            ? footwearSolo
            : `Wearing ${pants}, ${footwearSolo}`;

        if (isProductBottom) {
            this.logger.log(`👖 Category Detection: Product "${product.general_info.category}" is a BOTTOM → skipping DA pants`);
        }

        // V2: Ground items (handle both legacy props and new ground structure)
        const leftItems = da.ground?.left_items || [];
        const rightItems = da.ground?.right_items || [];
        const leftProps = leftItems.length > 0
            ? leftItems.map((item: any) => typeof item === 'string' ? item : item.name).join(', ')
            : 'minimal decor';
        const rightProps = rightItems.length > 0
            ? rightItems.map((item: any) => typeof item === 'string' ? item : item.name).join(', ')
            : 'minimal decor';
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

        const GLOBAL_NEGATIVE_PROMPT = 'collage, split screen, inset image, picture in picture, multiple views, overlay, montage, composite image, promotional material, text blocks, watermarks, border, frame, padding, white background';
        let negativePrompt = `${GLOBAL_NEGATIVE_PROMPT}, text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face, deformed hands, extra fingers`;

        // 🚀 ANTI-NUDITY SHIELD: ALWAYS block shirtless for human model shots (duo, solo)
        negativePrompt += ', shirtless, naked torso, bare chest, bare skin, abs showing, muscles exposed, underwear model, swimwear, skin showing, topless, navel, exposed torso, no shirt';

        // ═══════════════════════════════════════════════════════════
        // 6. GENERATE 6 SHOT PROMPTS (MergedPromptObject format)
        // ═══════════════════════════════════════════════════════════

        // 6.1 DUO (Father + Son) — Client requirement: matching outfits on father and son
        // Gemini API allows father/son terminology (no need for Vertex RAI workaround)
        const duoStyling = styling; // Use original styling, no workaround needed for Gemini
        const duoPrompt = this.buildDuoPrompt(product, da, baseAttire, duoStyling, scene, zipperText, qualitySuffix);
        const duoFinalPrompt = duoPrompt + resolutionSuffix;
        const duo: MergedPromptObject = {
            visual_id: `visual_1_duo_family`,
            shot_type: 'duo',
            model_type: 'adult',
            gemini_prompt: duoFinalPrompt,
            prompt: duoFinalPrompt, // Backward compat
            negative_prompt: negativePrompt,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: 'DUO (Father + Son)',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: productDetails,
            da_elements: daElements
        } as MergedPromptObject;

        // ═══════════════════════════════════════════════════════════
        // 🆕 SHOT OPTIONS: Derive per-shot settings from options
        // ═══════════════════════════════════════════════════════════
        // If shot_options provided, use per-shot settings
        // Otherwise, fall back to legacy model_type (backward compatible)

        // 🔍 DEBUG: Log raw options received
        this.logger.log(`🔍 DEBUG options.shot_options RAW: ${JSON.stringify(options.shot_options)}`);
        this.logger.log(`🔍 DEBUG options.model_type: ${options.model_type}`);

        const shotOptions = options.shot_options || createDefaultShotOptions(options.model_type || 'adult');

        // 🔍 DEBUG: Log resolved shotOptions
        this.logger.log(`🔍 DEBUG resolved shotOptions: ${JSON.stringify(shotOptions)}`);
        this.logger.log(`🔍 DEBUG shotOptions.solo: ${JSON.stringify(shotOptions.solo)}`);

        // SOLO: Get subject from shot_options.solo.subject
        const soloSubject = shotOptions.solo?.subject || options.model_type || 'adult';
        this.logger.log(`🎯 Prompt Builder Resolved SOLO Subject: "${soloSubject}" (from shotOptions.solo.subject: ${shotOptions.solo?.subject}, fallback model_type: ${options.model_type})`);

        // FLAT LAY: Get size from shot_options.flatlay_front.size / flatlay_back.size
        const flatLayFrontSize = shotOptions.flatlay_front?.size || options.model_type || 'adult';
        const flatLayBackSize = shotOptions.flatlay_back?.size || options.model_type || 'adult';

        this.logger.log(`🎯 Shot Settings: SOLO=${soloSubject}, FlatLayFront=${flatLayFrontSize}, FlatLayBack=${flatLayBackSize}`);

        // 6.2 SOLO (uses soloSubject - can be different from flat lay)
        const soloPrompt = this.buildSoloPrompt(product, da, soloSubject, baseAttire, stylingSolo, scene, zipperText, logoTextFront, qualitySuffix);
        const soloFinalPrompt = soloPrompt + resolutionSuffix;

        // 🚀 STRICT NEGATIVE PROMPTING FOR SOLO
        let soloNegative = negativePrompt;
        const TWO_PEOPLE_NEGATIVES = ', two people, two subjects, father and son, parent, family, group, couple, second person, crowd, background people, multiple people, holding hands, looking at each other, double body, twin, clone';

        if (soloSubject === 'kid') {
            // For KID solo: Block adults/fathers AND second person
            soloNegative += `${TWO_PEOPLE_NEGATIVES}, adult, man, father, male model, beard, stubble, mustache, facial hair, mature man, wrinkles, tall, muscular, hairy chest`;
        } else {
            // For ADULT solo: Block kids AND second person
            soloNegative += `${TWO_PEOPLE_NEGATIVES}, child, kid, toddler, baby, small size, son, daughter`;
        }

        const solo: MergedPromptObject = {
            visual_id: `visual_2_solo_${soloSubject}`,
            shot_type: 'solo',
            model_type: soloSubject,
            gemini_prompt: soloFinalPrompt,
            prompt: soloFinalPrompt, // Backward compat
            negative_prompt: soloNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: soloSubject === 'adult' ? 'SOLO Adult Model' : 'SOLO Kid Model',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: productDetails,
            da_elements: daElements
        } as MergedPromptObject;

        // 6.3 FLAT LAY FRONT — FORCE: resolution suffix at very end
        const flatLayFrontPrompt = this.buildFlatLayFrontPrompt(product, da, flatLayFrontSize, logoTextFront, qualitySuffix);
        const flatLayFrontFinal = flatLayFrontPrompt + resolutionSuffix;
        const flatLayFrontNegative = this.buildShotNegativePrompt('flatlay_front', product);
        const flatlay_front: MergedPromptObject = {
            visual_id: `visual_3_flatlay_front_${flatLayFrontSize}`,
            shot_type: 'flatlay_front',
            model_type: flatLayFrontSize,
            gemini_prompt: flatLayFrontFinal,
            prompt: flatLayFrontFinal, // Backward compat
            negative_prompt: flatLayFrontNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: flatLayFrontSize === 'adult' ? 'Flat Lay Front (Adult Size)' : 'Flat Lay Front (Kid Size)',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: {
                ...productDetails,
                size: flatLayFrontSize === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements
        } as MergedPromptObject;

        // 6.4 FLAT LAY BACK — FORCE: resolution suffix at very end
        const flatLayBackPrompt = this.buildFlatLayBackPrompt(product, da, flatLayBackSize, qualitySuffix);
        const flatLayBackFinal = flatLayBackPrompt + resolutionSuffix;
        const flatLayBackNegative = this.buildShotNegativePrompt('flatlay_back', product);
        const flatlay_back: MergedPromptObject = {
            visual_id: `visual_4_flatlay_back_${flatLayBackSize}`,
            shot_type: 'flatlay_back',
            model_type: flatLayBackSize,
            gemini_prompt: flatLayBackFinal,
            prompt: flatLayBackFinal, // Backward compat
            negative_prompt: flatLayBackNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: flatLayBackSize === 'adult' ? 'Flat Lay Back (Adult Size)' : 'Flat Lay Back (Kid Size)',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: {
                ...productDetails,
                size: flatLayBackSize === 'adult' ? 'Adult Size' : 'Kid Size',
            },
            da_elements: daElements
        } as MergedPromptObject;

        // 6.5 CLOSE UP FRONT — FORCE: resolution suffix at very end
        const closeUpFrontPrompt = this.buildCloseUpFrontPrompt(product, da, qualitySuffix);
        const closeUpFrontFinal = closeUpFrontPrompt + resolutionSuffix;
        // Force strict no-human negative prompt for closeups
        const closeUpFrontNegative = this.buildShotNegativePrompt('closeup_front', product) + ', face, head, hands, legs, person, human, body, street scene, walking, distance shot';
        const closeup_front: MergedPromptObject = {
            visual_id: `visual_5_closeup_front_product`,
            shot_type: 'closeup_front',
            model_type: 'product',
            gemini_prompt: closeUpFrontFinal,
            prompt: closeUpFrontFinal, // Backward compat
            negative_prompt: closeUpFrontNegative,
            output: {
                resolution: resolution,
                aspect_ratio: (options as any).aspect_ratio || '4:5'
            },
            display_name: 'Close Up Front',
            editable: true,
            last_edited_at: null,
            background: background,
            product_details: productDetails,
            da_elements: daElements
        } as MergedPromptObject;

        // 6.6 CLOSE UP BACK — FORCE: resolution suffix at very end
        const closeUpBackPrompt = this.buildCloseUpBackPrompt(product, da, qualitySuffix);
        const closeUpBackFinal = closeUpBackPrompt + resolutionSuffix;
        // Force strict no-human negative prompt for closeups
        let closeUpBackNegative = this.buildShotNegativePrompt('closeup_back', product) + ', face, head, hands, legs, person, human, body, street scene, walking, distance shot';

        // 🚀 ANTI-ROUND SHIELD: If patch is square/rectangular, blocking round shapes
        const patchDetail = product.design_back?.patch_detail || '';
        const backDesc = product.design_back?.description || '';
        const backText = (patchDetail + ' ' + backDesc).toLowerCase();

        if (backText.includes('square') || backText.includes('rectang')) {
            closeUpBackNegative += ', circular patch, round patch, oval patch, curved edges, rounded corners, sphere shaped patch';
        }

        const closeup_back: MergedPromptObject = {
            visual_id: `visual_6_closeup_back_product`,
            shot_type: 'closeup_back',
            model_type: 'product',
            gemini_prompt: closeUpBackFinal,
            prompt: closeUpBackFinal, // Backward compat
            negative_prompt: closeUpBackNegative,
            output: {
                resolution: resolution,
                aspect_ratio: options['aspect_ratio'] || '4:5' // Default to 4:5 if not passed
            },
            // Legacy/Helper fields
            camera: undefined, // Cleared to reduce noise
            background: background,
            product_details: productDetails,
            da_elements: daElements,
            editable: true,
            display_name: 'Close Up Back',
            last_edited_at: null,
        };

        // BACKFILLING OTHER OBJECTS WITH NEW STRUCTURE
        // DUO
        // The `duo` object is already defined above, no need for `duo_final`
        // SOLO
        // The `solo` object is already defined above, no need for `solo_final`
        // FLAT LAY FRONT
        // The `flatlay_front` object is already defined above, no need for `flatlay_front_final`
        // FLAT LAY BACK
        // The `flatlay_back` object is already defined above, no need for `flatlay_back_final`
        // CLOSE UP FRONT
        // The `closeup_front` object is already defined above, no need for `closeup_front_final`

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
     * Solo-safe footwear: Vertex RAI blocks prompts that mention "Child" or "father" even for solo shots.
     * When DA footwear is duo-style (e.g. "Child in white sneakers, father in black leather dress shoes"),
     * return a single-adult phrasing so solo prompts pass safety.
     */
    private getSoloSafeFootwear(footwear: string): string {
        const lower = (footwear || '').toLowerCase();
        if (lower.includes('child') || lower.includes('father') || lower.includes('son')) {
            // Prefer "black leather dress shoes" for editorial; keep it neutral
            const soloFootwear = 'black leather dress shoes';
            this.logger.log(`👟 Solo-safe footwear: DA had duo phrasing → "${soloFootwear}"`);
            return soloFootwear;
        }
        return footwear;
    }

    /**
     * Duo-safe styling: Vertex RAI blocks prompts that mention "Child", "father", "son" in DUO shots.
     * When DA styling is father/son style (e.g. "Child in white sneakers, father in black leather dress shoes"),
     * rephrase to two-adult wording so the DUO prompt passes safety.
     */
    private getDuoSafeStyling(styling: string): string {
        if (!styling || typeof styling !== 'string') return styling;
        const lower = styling.toLowerCase();
        if (!lower.includes('child') && !lower.includes('father') && !lower.includes('son')) return styling;
        // Rephrase "Child in X, father in Y" → "One model in X, one in Y" (keep footwear detail, remove child/father)
        let out = styling
            .replace(/\bChild\s+in\s+/gi, 'One model in ')
            .replace(/\bfather\s+in\s+/gi, 'one in ')
            .replace(/\bson\s+in\s+/gi, 'one in ');
        this.logger.log(`👟 Duo-safe styling: DA had father/son phrasing → "${out.slice(0, 120)}..."`);
        return out;
    }

    /**
     * Public method to apply resolution keywords to an existing prompt string.
     * Useful for applying resolution settings at generation time.
     */
    applyResolutionKeywords(prompt: string, resolution: string): string {
        const suffix = this.getResolutionQualitySuffix(resolution);
        if (!suffix) return prompt;
        // Avoid double applying if already present (basic check)
        if (prompt.includes('8k resolution') && suffix.includes('8k resolution')) return prompt;
        return `${prompt}${suffix}`;
    }

    /**
     * Resolution-based quality suffix — force-appended at the very end of each prompt.
     * 4K -> high-fidelity; else -> standard. Do NOT put aspect ratio in prompt text.
     */
    private getResolutionQualitySuffix(resolution?: string): string {
        const r = (resolution && String(resolution).trim().toUpperCase()) || '4K';
        if (r === '4K') {
            return ', 8k resolution, ultra-sharp focus, highly detailed texture, wallpaper quality, hasselblad x2d photography';
        }
        return ', high quality, professional photography';
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

    private checkLogoRule(hasLogo: boolean, text: string, type: string, fontFamily?: string, sizeRelative?: string): string {
        if (!hasLogo) {
            return '';
        }
        let out = `Visible logo: ${text} (${type})`;
        if (fontFamily) out += `, ${fontFamily} font`;
        if (sizeRelative) out += `. Size: ${sizeRelative}`;
        return out + '.';
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
        // Base negative prompt - ALWAYS START WITH GLOBAL ANTI-COLLAGE PROTOCOL
        const GLOBAL_NEGATIVE_PROMPT = 'collage, split screen, inset image, picture in picture, multiple views, overlay, montage, composite image, promotional material, text blocks, watermarks, border, frame, padding, white background';

        let negativePrompt = `${GLOBAL_NEGATIVE_PROMPT}, text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face, deformed hands, extra fingers`;

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

            // 🚀 ANTI-GHOSTING SHIELD (Close-Ups)
            if (shotType.includes('closeup')) {
                negativePrompt += ', double logo, duplicate text, blurry details, distorted letters, extra branding, messy stitching, bad focus, ghosting, motion blur';
            }
        }

        return negativePrompt;
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT BUILDERS (6 Shot Types)
    // ═══════════════════════════════════════════════════════════

    /**
     * DUO PROMPT - Subject-First Architecture
     * 
     * 🎯 CRITICAL: SUBJECT must be FIRST in prompt!
     * Vertex Imagen RAI blocks "father/son" and "younger male" (child inference).
     * Use two-adults-only wording so RAI does not filter.
     */
    private buildDuoPrompt(
        product: AnalyzeProductDirectResponse,
        da: AnalyzeDAPresetResponse,
        baseAttire: string,
        styling: string,
        scene: string,
        zipperText: string,
        qualitySuffix: string
    ): string {
        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 1: SUBJECT FIRST (Father + Son — Client Requirement)
        // Now using Gemini API which allows father/son terminology
        // ═══════════════════════════════════════════════════════════
        const subjectPart = 'Father and son wearing matching outfits. Adult male in his 30s (athletic build, light stubble beard) with his 5-year-old son. Both smiling naturally, relaxed family pose. Fashion editorial. Both looking at camera. BOTH FULLY CLOTHED, NEVER SHIRTLESS.';

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 2: APPAREL (What they're wearing) - USE baseAttire (includes t-shirt when product is bottom!)
        // ═══════════════════════════════════════════════════════════
        const detailsPart = [
            product.design_front.micro_details ? `Details: ${product.design_front.micro_details}` : '',
            product.garment_details.seam_architecture ? `Construction: ${product.garment_details.seam_architecture}` : ''
        ].filter(Boolean).join('. ');

        const apparelPart = `Both ${baseAttire}. Fabric: ${product.visual_specs.fabric_texture}. ${product.design_front.description}. ${detailsPart}. ${zipperText}. Fully clothed, shirts on, no bare chest.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 3: ENVIRONMENT (Where)
        // ═══════════════════════════════════════════════════════════
        const environmentPart = `${styling}. ${scene}.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 4: TECHNICAL (Camera/Quality)
        // ═══════════════════════════════════════════════════════════
        const technicalPart = `Editorial fashion photography. Medium shot. Real human skin texture, natural poses. ${qualitySuffix}`;

        // 🚀 SUBJECT FIRST - This is the key fix!
        return `${subjectPart} ${apparelPart} ${environmentPart} ${technicalPart}`;
    }

    /**
     * SOLO PROMPT - Subject-First Architecture
     * 
     * 🎯 CRITICAL: SUBJECT (KID/ADULT) must be FIRST in prompt!
     * Gemini gives highest weight to early tokens.
     * 
     * Prompt Order:
     * 1. SUBJECT (who) - KID or ADULT description FIRST
     * 2. APPAREL (what) - Product wearing
     * 3. ENVIRONMENT (where) - DA background/props
     * 4. TECHNICAL (how) - Camera/quality
     */
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
        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 1: SUBJECT FIRST (Most Important!)
        // ═══════════════════════════════════════════════════════════
        let subjectPart = '';
        if (modelType === 'kid') {
            // KID: 5-year-old boy - specific age as per client requirement
            subjectPart = 'KIDS FASHION. Subject: SINGLE 5-YEAR-OLD BOY. Small child size. (NO ADULTS, NO OLDER KIDS). Playful editorial expression, natural child pose.';
        } else {
            // ADULT: Very explicit adult description with negative enforcement in positive prompt
            subjectPart = 'Subject: SINGLE ADULT MALE MODEL. Age 30s. Full adult size. (NO KIDS). Athletic build, confident gaze, light stubble beard.';
        }

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 2: APPAREL (What they're wearing)
        // ═══════════════════════════════════════════════════════════
        const detailsPart = [
            product.design_front.micro_details ? `Details: ${product.design_front.micro_details}` : '',
            product.garment_details.seam_architecture ? `Construction: ${product.garment_details.seam_architecture}` : ''
        ].filter(Boolean).join('. ');

        const apparelPart = `${baseAttire}. ` +
            `Fabric: ${product.visual_specs.fabric_texture}. ${product.design_front.description}. ${detailsPart}. ${logoTextFront}. ${zipperText}. Fully clothed, never shirtless.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 3: ENVIRONMENT (Where)
        // ═══════════════════════════════════════════════════════════
        const environmentPart = `${styling}. ${scene}. Standing naturally.`;

        // ═══════════════════════════════════════════════════════════
        // 🎯 PRIORITY 4: TECHNICAL (Camera/Quality)
        // ═══════════════════════════════════════════════════════════
        const technicalPart = modelType === 'kid'
            ? `Kids fashion photography. Medium shot. Soft lighting, natural child pose. ${qualitySuffix}`
            : `Editorial fashion photography. Medium shot. Real human skin texture, natural pose. ${qualitySuffix}`;

        // 🚀 SUBJECT FIRST - This is the key fix!
        return `${subjectPart} ${apparelPart} ${environmentPart} ${technicalPart}`;
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
            : '5-year-old child-size garment with small, compact proportions for a young boy';

        // 🎨 COLOR WEIGHTING: Apply high weight (1.5) to color for product-only shots
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'flatlay_front');

        // 🎨 TEXTURE REINFORCEMENT: Ensure correct material appearance
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        // Priority 1: Client Data
        const productData = `Product: ${weightedColor} ${product.general_info.product_name}. Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ` +
            `${product.design_front.description}. ${logoTextFront}.`;

        // Priority 2: Shot
        const shotAction = `Professional overhead flat lay photography. ${sizeDescription}. Laid flat on ${da.floor.type} surface.`;

        // Priority 4: Helpers
        const helpers = `NO PEOPLE, NO HANDS, PERFECTLY FOLDED, pristine condition. ${qualitySuffix}`;

        return `${productData} ${shotAction} ${helpers}`;
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
            : '5-year-old child-size garment with small, compact proportions for a young boy';

        // 🎨 COLOR WEIGHTING (1.5)
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'flatlay_back');

        // 🎨 TEXTURE REINFORCEMENT
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `, ${textureReinforcement}` : '';

        // Priority 1: Client Data
        const productData = `Product: BACK of ${weightedColor} ${product.general_info.product_name}. Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ` +
            `${product.design_back.description}. ${patchDetail}${technique}`;

        // Priority 2: Shot
        const shotAction = `Professional overhead flat lay photography. ${sizeDescription}. showing rear details clearly.`;

        // Priority 4: Helpers
        const helpers = `NO PEOPLE, NO HANDS. ${qualitySuffix}`;

        return `${productData} ${shotAction} ${helpers}`;
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
        const parts: string[] = [];
        if (product.garment_details.closure_details) parts.push(`closure: ${product.garment_details.closure_details}`);
        if (product.garment_details.hardware_finish) parts.push(`hardware: ${product.garment_details.hardware_finish}`);
        const hardwareText = parts.length > 0 ? `, ${parts.join('; ')}` : '';

        // 🎨 COLOR WEIGHTING
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'closeup_front');

        // Priority 1: Client Data
        const productData = `Product: ${weightedColor} ${product.general_info.product_name}. Fabric: ${product.visual_specs.fabric_texture}. ` +
            `${product.design_front.description}.${hardwareText}`;

        // Priority 2: Shot
        const shotAction = `Macro extreme close-up detail shot of texture. Focus on fabric weave and stitching details.`;

        // Priority 4: Helpers
        const helpers = `NO PEOPLE, NO HANDS, MACRO LENS. ${qualitySuffix}`;

        return `${productData} ${shotAction} ${helpers}`;
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

        // 🎨 COLOR WEIGHTING
        const weightedColor = this.applyColorWeighting(product.visual_specs.color_name, 'closeup_back');

        // 🎨 TEXTURE REINFORCEMENT
        const textureReinforcement = this.getTextureReinforcement(
            product.visual_specs.fabric_texture,
            product.visual_specs.fabric_texture
        );
        const texturePhrase = textureReinforcement ? `. ${textureReinforcement}` : '';

        // 🚀 GEOMETRY ENFORCEMENT: Detect explicit shape keywords
        const combinedText = (patchDetail + ' ' + (product.design_back.description || '')).toLowerCase();
        let geometryPhrase = '';

        if (combinedText.includes('square')) {
            geometryPhrase = 'Macro focus on the sharply DEFINED SQUARE geometric shape of the leather patch, featuring four distinct sharp corners and straight edges. Contained within this square boundary is ';
        } else if (combinedText.includes('rectang')) { // matches rectangle, rectangular
            geometryPhrase = 'Macro focus on the sharply DEFINED RECTANGULAR geometric shape of the leather patch, featuring four distinct sharp corners and straight edges. Contained within this rectangular boundary is ';
        }

        const focusPhrase = geometryPhrase ? `${geometryPhrase}${patchDetail}` : `Focus on ${patchDetail}`;

        // Priority 1: Client Data
        const productData = `Product: ${weightedColor} rear brand patch. Fabric: ${product.visual_specs.fabric_texture}${texturePhrase}. ${techniqueText}.`;

        // Priority 2: Shot
        const shotAction = `Macro detail shot. ${focusPhrase}.`;

        // Priority 4: Helpers
        const helpers = `Emphasizing craftsmanship and quality. ${qualitySuffix}`;

        return `${productData} ${shotAction} ${helpers}`;
    }
}
