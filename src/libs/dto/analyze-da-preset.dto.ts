import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for DA Reference Analysis endpoint
 * POST /api/da/analyze
 *
 * Image is uploaded via FormData:
 * - image (required): The reference photo of the room/scene
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
 * Props configuration with spatial split
 */
export interface DAPresetProps {
	left_side: string[];
	right_side: string[];
}

/**
 * Styling configuration
 */
export interface DAPresetStyling {
	pants: string;
	footwear: string;
}

/**
 * Lighting configuration
 */
export interface DAPresetLighting {
	type: string;
	temperature: string;
}

/**
 * Complete DA Preset Analysis Response
 * This structure matches the database DAPreset entity format
 */
export interface AnalyzeDAPresetResponse {
	da_name: string;
	background: DAPresetBackground;
	floor: DAPresetFloor;
	props: DAPresetProps;
	styling: DAPresetStyling;
	lighting: DAPresetLighting;
	mood: string;
	quality: string;
}
