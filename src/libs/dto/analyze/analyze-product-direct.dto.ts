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

export interface GeneralInfo {
	product_name: string;
	category: string;
	fit_type: string;
	gender_target: string;
}

export interface VisualSpecs {
	color_name: string;
	hex_code: string;
	fabric_texture: string;
}

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
	/** Edge treatment when visible */
	patch_edge?: string;
	/** Color of text/graphic INSIDE patch */
	patch_artwork_color?: string;
	/** Layout of elements when multiple */
	patch_layout?: string;
	/** Stitch color/type when sewn */
	patch_stitch?: string;
	/** Raised vs flat profile */
	patch_thickness?: string;
	placement?: string;
	size?: string;
	/** Relative to garment */
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
	/** For tops: logo/patch/stripe on sleeve—color, size, placement; or "No sleeve branding". N/A for pants. */
	sleeve_branding?: string;
	bottom_termination: string;
	/** Stripes/text at hem—colors, sizes; or "No stripes or text at hem". */
	bottom_branding?: string;
	/** Front closure: zipper/buttons—type, color, material, puller shape, teeth size. N/A for pullovers. */
	closure_details?: string;
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
