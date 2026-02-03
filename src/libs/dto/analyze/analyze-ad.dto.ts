import { IsOptional, IsString, IsArray } from 'class-validator';

export class AnalyzeAdDto {
	@IsOptional()
	@IsString({ message: 'Additional context must be a string' })
	additional_context?: string;

	@IsOptional()
	@IsArray({ message: 'Focus areas must be an array' })
	@IsString({ each: true, message: 'Each focus area must be a string' })
	focus_areas?: string[]; // e.g., ['color_scheme', 'typography', 'layout', 'messaging']

	@IsOptional()
	@IsString({ message: 'Target audience must be a string' })
	target_audience?: string;

	@IsOptional()
	@IsString({ message: 'Brand positioning must be a string' })
	brand_positioning?: string;
}