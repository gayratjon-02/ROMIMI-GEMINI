import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ValidationMessage } from '../../enums';

export class CreateBrandDto {
	@ApiProperty({
		description: 'Brand name',
		example: 'Nike Sportswear',
		minLength: 1,
	})
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsNotEmpty({ message: ValidationMessage.FIELD_REQUIRED })
	name: string;

	@ApiProperty({
		description: 'Brand brief description and positioning',
		example: 'Premium athletic wear brand focusing on performance and style for urban millennials.',
		required: false,
	})
	@IsString({ message: ValidationMessage.FIELD_INVALID })
	@IsOptional()
	brand_brief?: string;
}
