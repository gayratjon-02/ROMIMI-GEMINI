import { IsObject, IsOptional } from 'class-validator';
import { MergedPrompts } from '../../../common/interfaces/merged-prompts.interface';

export class UpdateMergedPromptsDto {
	@IsObject()
	@IsOptional()
	prompts?: Partial<MergedPrompts>;
}
