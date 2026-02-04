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

/** V5.3: Interior branding - neck tape, hanger loop, main label */
export interface InteriorBranding {
	/** Location: neck tape, hanger loop (NOT collar wings!) */
	embroidery_location?: string;
	embroidery_text?: string;
	embroidery_color?: string;
	/** V5.3: Is embroidery visible from front view? */
	embroidery_visible_from_front?: boolean;
	main_label?: {
		brand_name?: string;
		tagline?: string;
		size_shown?: string;
		/** V5.2: Material of the main label */
		label_material?: string;
		/** V5.2: Size of the label (e.g., "approx. 4×6cm") */
		label_size?: string;
		/** V5.3: Is label visible from front view? */
		visible_from_front?: boolean;
	};
}

/** @deprecated Use InteriorBranding instead */
export interface CollarBranding {
	inner_embroidery?: string;
	neck_label?: {
		brand_name?: string;
		tagline?: string;
		size_shown?: string;
	};
}

export interface DesignFront {
	has_logo: boolean;
	logo_text: string;
	font_family?: string;
	logo_type: string;
	logo_content: string;
	logo_color: string;
	placement: string;
	description: string;
	size?: string;
	size_relative_pct?: string;
	micro_details?: string;
	/** @deprecated use interior_branding */
	interior_label?: {
		brand_name?: string;
		tagline?: string;
		size_shown?: string;
	};
	/** @deprecated use interior_branding */
	collar_branding?: CollarBranding;
	/** V5: Correct interior branding with proper locations */
	interior_branding?: InteriorBranding;
}

/**
 * Back design details
 */
export interface DesignBack {
	has_logo: boolean;
	has_patch: boolean;
	description: string;
	technique: string;
	patch_shape?: string;
	patch_color: string;
	yoke_material?: string;
	patch_detail: string;
	artwork_shape?: string;
	font_family?: string;
	patch_edge?: string;
	patch_artwork_color?: string;
	patch_layout?: string;
	/** V5: Look for visible stitching around patch */
	patch_stitch?: string;
	patch_thickness?: string;
	placement?: string;
	size?: string;
	size_relative_pct?: string;
	micro_details?: string;
}

/** V5.3: Individual pocket with exact positioning */
export interface PocketItem {
	id: number;
	name: string;
	position: string;
	/** V5.3: Horizontal position from center placket */
	horizontal_position?: string;
	/** V5.3: Vertical position from landmark (hem, shoulder) */
	vertical_position?: string;
	/** V5.3: Orientation - front-facing vs side/slant */
	orientation?: string;
	type: string;
	/** V5.3: Style - patch, welt, slant etc */
	style?: string;
	material: string;
	color: string;
	shape: string;
	size: string;
	closure: string;
	special_features?: string;
}

/** Lower pockets detail (legacy) */
export interface LowerPockets {
	count: number;
	type: string;
	shape: string;
	material: string;
	size: string;
	closure: string;
	button_count?: number;
	button_details?: string;
}

/** Chest pocket detail (legacy) */
export interface ChestPocket {
	count: number;
	type: string;
	material: string;
	size: string;
	closure?: string;
}

/** Shoulder construction/overlay (V5.3 Enhanced) */
export interface ShoulderConstruction {
	has_overlay: boolean;
	/** V5.1: Type of overlay */
	overlay_type?: string;
	material?: string;
	width?: string;
	/** V5.2: Length of shoulder overlay */
	length?: string;
	/** V5.3: Proportion of shoulder width covered */
	proportion_of_shoulder?: string;
	extends_from?: string;
	extends_to?: string;
	/** V5.2: Is overlay on both shoulders? */
	both_shoulders?: boolean;
	/** V5.1: Is stitching visible on the overlay? */
	stitching_visible?: boolean;
	/** V5.1: Details of visible stitching */
	stitching_detail?: string;
	/** V5.1: Does it connect to the back yoke panel? */
	connects_to_yoke?: boolean;
	color_match?: string;
}

/** Sleeve details */
export interface SleeveDetails {
	length: string;
	construction: string;
	cuff_style: string;
	cuff_width?: string;
	special_features?: string;
}

/** V5: Button details with exact count */
export interface ButtonDetails {
	front_closure_count: number;
	/** V5: Total visible buttons (may differ from closure count if pocket buttons exist) */
	total_visible_buttons?: number;
	material: string;
	color: string;
	diameter: string;
	style: string;
	finish?: string;
}

/**
 * Garment construction details (V5 Enhanced)
 */
export interface GarmentDetails {
	/** Summary of all pockets */
	pockets: string;
	/** V5: Individual pocket array with detailed info for each */
	pockets_array?: PocketItem[];
	/** Legacy: lower pockets summary */
	lower_pockets?: LowerPockets;
	/** Legacy: chest pocket summary */
	chest_pocket?: ChestPocket;
	sleeves_or_legs: string;
	sleeve_details?: SleeveDetails;
	sleeve_branding?: string;
	shoulder_construction?: ShoulderConstruction;
	bottom_termination: string;
	bottom_branding?: string;
	closure_details?: string;
	/** V5: Detailed button info with exact count */
	buttons?: ButtonDetails;
	hardware_finish: string;
	/** V5: Describe collar material separately from leather elements */
	neckline: string;
	seam_architecture?: string;
}

/**
 * Complete response interface for product analysis (V5)
 */
export interface AnalyzeProductDirectResponse {
	general_info: GeneralInfo;
	visual_specs: VisualSpecs;
	design_front: DesignFront;
	design_back: DesignBack;
	garment_details: GarmentDetails;
}
