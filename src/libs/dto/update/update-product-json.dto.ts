import { IsObject, IsOptional } from 'class-validator';
import { AnalyzedProductJSON } from '../../../common/interfaces/product-json.interface';

export class UpdateProductJsonDto {
	@IsObject()
	@IsOptional()
	manual_overrides?: Partial<AnalyzedProductJSON>;
}
