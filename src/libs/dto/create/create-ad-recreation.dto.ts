import { IsString, IsOptional, IsInt, Min, Max, IsArray, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ValidationMessage } from '../../enums/common.enum';

export class CreateAdRecreationDto {
	@ApiProperty({
		description: 'URL of the competitor ad image to analyze and recreate',
		example: 'https://example.com/competitor-ad.jpg',
		format: 'url',
	})
	@IsUrl({}, { message: 'Competitor ad URL must be a valid URL' })
	competitor_ad_url: string;

	@ApiProperty({
		description: 'Brief description of your brand positioning and values',
		example: 'Premium athletic wear brand focusing on performance and style for urban millennials aged 22-35.',
		required: false,
	})
	@IsOptional()
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	brand_brief?: string;

	@ApiProperty({
		description: 'Array of brand reference image URLs',
		example: ['https://example.com/brand-ref-1.jpg', 'https://example.com/brand-ref-2.jpg'],
		type: [String],
		required: false,
	})
	@IsOptional()
	@IsArray({ message: 'Brand references must be an array' })
	brand_references?: string[];

	@ApiProperty({
		description: 'Number of ad variations to generate (1-10)',
		example: 3,
		minimum: 1,
		maximum: 10,
		default: 3,
		required: false,
	})
	@IsOptional()
	@IsInt({ message: 'Variations count must be an integer' })
	@Min(1, { message: 'Minimum 1 variation required' })
	@Max(10, { message: 'Maximum 10 variations allowed' })
	variations_count?: number = 3;
}