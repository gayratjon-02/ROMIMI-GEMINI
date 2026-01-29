import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeService } from './claude.service';
import { GeminiService } from './gemini.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
	imports: [ConfigModule],
	providers: [ClaudeService, GeminiService, PromptBuilderService],
	exports: [ClaudeService, GeminiService, PromptBuilderService],
})
export class AiModule { }
