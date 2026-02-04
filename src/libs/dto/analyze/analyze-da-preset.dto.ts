import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for DA Reference Analysis endpoint
 * POST /api/da/analyze
 */
export class AnalyzeDAPresetDto {
	@IsOptional()
	@IsString()
	preset_name?: string;
}

/**
 * Background configuration
 */
export interface DAPresetBackground {
	type: string;
	hex: string;
}

/**
 * Floor configuration
 */
export interface DAPresetFloor {
	type: string;
	hex: string;
}

/**
 * V2: Individual ground item with exact position
 */
export interface GroundItem {
	name: string;
	surface: 'on_shelf' | 'on_floor' | 'on_table' | string;
	height_level: 'upper' | 'middle' | 'lower' | string;
	color?: string;
	material?: string;
}

/**
 * V2: Ground configuration with detailed items
 */
export interface DAPresetGround {
	left_items: GroundItem[];
	right_items: GroundItem[];
}

/**
 * V2: Styling with adult/kid split
 */
export interface DAPresetStyling {
	/** V2: Adult pants description */
	adult_bottom?: string;
	/** V2: Adult footwear */
	adult_feet?: string;
	/** V2: Kid pants description */
	kid_bottom?: string;
	/** V2: Kid footwear */
	kid_feet?: string;
	/** Legacy: combined pants field */
	pants?: string;
	/** Legacy: combined footwear field */
	footwear?: string;
}

/**
 * Lighting configuration
 */
export interface DAPresetLighting {
	type: string;
	temperature: string;
}

/**
 * V2: Complete DA Preset Analysis Response
 */
export interface AnalyzeDAPresetResponse {
	da_name: string;
	background: DAPresetBackground;
	floor: DAPresetFloor;
	/** V2: Ground items with exact positions */
	ground: DAPresetGround;
	styling: DAPresetStyling;
	lighting: DAPresetLighting;
	mood: string;
	quality: string;
}

/**
 * Legacy: Props configuration (for backward compatibility)
 * @deprecated Use DAPresetGround instead
 */
export interface DAPresetProps {
	left_side: string[];
	right_side: string[];
}
