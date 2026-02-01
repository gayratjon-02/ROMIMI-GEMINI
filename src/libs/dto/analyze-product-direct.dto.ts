import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for direct product image analysis endpoint
 * POST /api/products/analyze
 *
 * Images are uploaded via FormData:
 * - front_images[] (required, up to 5)
 * - back_images[] (required, up to 5)
 * - reference_images[] (optional, max 10) - for texture, fit, and detail analysis
 */
export class AnalyzeProductDirectDto {
	@IsOptional()
	@IsString()
	product_name?: string;
}

/**
 * General product information
 */
export interface GeneralInfo {
	product_name: string;
	category: string;
	fit_type: string;
	gender_target: string;
}

/**
 * Visual specifications
 */
export interface VisualSpecs {
	color_name: string;
	hex_code: string;
	fabric_texture: string;
}

/**
 * Front design details
 * Includes anti-hallucination fields for accurate logo detection
 */
export interface DesignFront {
	has_logo: boolean;
	logo_text: string;
	/** Exact font name when logo_text exists (e.g. Didot, Helvetica, Futura) */
	font_family?: string;
	logo_type: string;
	logo_content: string;
	logo_color: string;
	placement: string;
	description: string;
	/** Size estimate with cm (e.g. 'Small discrete, approx. 5cm wide') */
	size?: string;
	/** Relative to garment: e.g. 'Occupies ~12% of chest width, ~8% of front panel height' */
	size_relative_pct?: string;
	micro_details?: string;
}

/**
 * Back design details
 * Includes technique field to distinguish embroidery vs embossed
 */
export interface DesignBack {
	has_logo: boolean;
	has_patch: boolean;
	description: string;
	technique: string;
	patch_color: string;
	patch_detail: string;
	patch_shape?: string;
	artwork_shape?: string;
	/** Exact font name when patch contains text */
	font_family?: string;
	placement?: string;
	size?: string;
	/** Relative to garment (e.g. 'Occupies ~15% of back yoke width') */
	size_relative_pct?: string;
	micro_details?: string;
}

/**
 * Garment construction details (from reference images)
 * Uses micro-detail scanning protocol
 */
export interface GarmentDetails {
	pockets: string;
	sleeves_or_legs: string;
	bottom_termination: string;
	hardware_finish: string;
	neckline: string;
	seam_architecture?: string;
}

/**
 * Complete response interface for product analysis
 * This structure is returned by Claude after analyzing all images
 */
export interface AnalyzeProductDirectResponse {
	general_info: GeneralInfo;
	visual_specs: VisualSpecs;
	design_front: DesignFront;
	design_back: DesignBack;
	garment_details: GarmentDetails;
}
