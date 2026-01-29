import { Injectable, Logger } from '@nestjs/common';
import { AnalyzeProductDirectResponse } from '../libs/dto/analyze-product-direct.dto';
import { AnalyzeDAPresetResponse } from '../libs/dto/analyze-da-preset.dto';

interface MergeInput {
    product: AnalyzeProductDirectResponse;
    da: AnalyzeDAPresetResponse;
    options: {
        model_type: 'adult' | 'kid';
    };
}

export interface GeneratedPrompts {
    visual_id: string;
    prompts: {
        duo: string;
        solo: string;
        flat_lay_front: string;
        flat_lay_back: string;
        close_up_front: string;
        close_up_back: string;
    };
    negative_prompt: string;
}

@Injectable()
export class PromptBuilderService {
    private readonly logger = new Logger(PromptBuilderService.name);

    buildPrompts(input: MergeInput): GeneratedPrompts {
        this.logger.log(`🏗️ Building prompts for product: ${input.product.general_info.product_name} with DA: ${input.da.da_name}`);

        const { product, da, options } = input;
        const visualId = crypto.randomUUID();

        // 1. HALLUCINATION CHECKS & DATA PREP
        const zipperText = this.checkZipperRule(product);
        const logoTextFront = this.checkLogoRule(product.design_front.has_logo, product.design_front.logo_text, product.design_front.logo_type);

        // Common prompt fragments
        const qualitySuffix = `, ${da.quality}, ${da.lighting.type}, ${da.lighting.temperature}`;
        const baseAttire = `Wearing ${product.visual_specs.color_name} ${product.general_info.product_name}`;
        const styling = `Wearing ${da.styling.pants}, ${da.styling.footwear}`;
        const scene = `${da.background.type}, ${da.floor.type}. Surrounded by ${da.props.left_side.join(', ')} on the left and ${da.props.right_side.join(', ')} on the right`;

        // 2. GENERATE TEMPLATES

        // DUO (Father + Son)
        const duo = `Father and Son standing together in a ${da.mood} moment. Both wearing matching ${baseAttire}. ${styling}. ${scene}. ${product.design_front.description}.${zipperText}${qualitySuffix}`;

        // SOLO
        let subject = '';
        if (options.model_type === 'adult') {
            subject = 'Handsome 30s male model, Mediterranean features';
        } else {
            subject = 'Cute young boy (age 5-7)';
        }
        const solo = `${subject}. ${baseAttire}. ${product.design_front.description}. ${logoTextFront}. ${styling}. ${scene}.${zipperText}${qualitySuffix}`;

        // FLAT LAY FRONT
        const flatLayFront = `Professional overhead flat lay photography of ${product.general_info.product_name}. ${product.design_front.description}. ${logoTextFront}. Laid flat on ${da.floor.type} or ${da.background.type}. NO PEOPLE, NO HANDS, PERFECTLY FOLDED${qualitySuffix}`;

        // FLAT LAY BACK
        // Note: Using design_back.description and patch_detail
        const patchDetail = product.design_back.has_patch ? `Visible patch: ${product.design_back.patch_detail}` : '';
        const flatLayBack = `Professional overhead flat lay photography of the BACK of ${product.general_info.product_name}. ${product.design_back.description}. ${patchDetail}. Showing rear details, NO PEOPLE${qualitySuffix}`;

        // CLOSE UP FRONT
        const hardwareText = product.garment_details.hardware_finish ? `, hardware: ${product.garment_details.hardware_finish}` : '';
        const closeUpFront = `Macro detail shot of ${product.visual_specs.fabric_texture}. Focus on ${product.design_front.logo_type}${hardwareText}. Hard side lighting to emphasize texture${qualitySuffix}`;

        // CLOSE UP BACK
        const techniqueText = product.design_back.technique ? `, technique: ${product.design_back.technique}` : '';
        const closeUpBack = `Macro detail shot of the rear brand patch. Focus on ${product.design_back.patch_detail}${techniqueText}${qualitySuffix}`;

        // 3. NEGATIVE PROMPT
        const negativePrompt = 'text, watermark, blurry, low quality, distorted, extra limbs, bad anatomy, mannequin, ghost mannequin, floating clothes, 3d render, artificial face';

        return {
            visual_id: visualId,
            prompts: {
                duo,
                solo,
                flat_lay_front: flatLayFront,
                flat_lay_back: flatLayBack,
                close_up_front: closeUpFront,
                close_up_back: closeUpBack,
            },
            negative_prompt: negativePrompt,
        };
    }

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
}
