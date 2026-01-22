import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeService } from './claude.service';
import { GeminiService } from './gemini.service';

@Module({
	imports: [ConfigModule],
	providers: [ClaudeService, GeminiService],
	exports: [ClaudeService, GeminiService],
})
export class AiModule {}
