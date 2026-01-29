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
 */
export interface DesignFront {
	has_logo: boolean;
	logo_text: string;
	logo_type: string;
	logo_color: string;
	placement: string;
	description: string;
}

/**
 * Back design details
 */
export interface DesignBack {
	has_logo: boolean;
	has_patch: boolean;
	description: string;
	patch_color: string;
	patch_detail: string;
}

/**
 * Garment construction details (from reference images)
 */
export interface GarmentDetails {
	pockets: string;
	sleeves: string;
	bottom: string;
	neckline: string;
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
