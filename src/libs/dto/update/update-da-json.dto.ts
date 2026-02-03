import { IsObject, IsOptional } from 'class-validator';
import { AnalyzedDAJSON, FixedElements } from '../../../common/interfaces/da-json.interface';

export class UpdateDAJsonDto {
	@IsObject()
	@IsOptional()
	analyzed_da_json?: Partial<AnalyzedDAJSON>;

	@IsObject()
	@IsOptional()
	fixed_elements?: Partial<FixedElements>;
}
