import { IsArray, IsString, IsOptional, ArrayMinSize } from 'class-validator';

export class AnalyzeImagesDto {
	@IsArray()
	@ArrayMinSize(1)
	@IsString({ each: true })
	images: string[];

	@IsOptional()
	@IsString()
	productName?: string;

	@IsOptional()
	@IsString()
	brandBrief?: string;
}
