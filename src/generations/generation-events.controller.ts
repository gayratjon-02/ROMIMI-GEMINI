import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../database/entities/user.entity';
import { GenerationsService } from './generations.service';

@Controller('generations/events')
@UseGuards(JwtAuthGuard)
export class GenerationEventsController {
	constructor(private readonly generationsService: GenerationsService) {}

	@Get(':id/stream')
	async streamGenerationProgress(
		@Param('id') generationId: string,
		@CurrentUser() user: User,
		@Res() res: Response
	) {
		// Set SSE headers
		res.set({
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Cache-Control'
		});

		// Verify user has access to this generation
		try {
			const generation = await this.generationsService.findOne(generationId, user.id);
			if (!generation) {
				res.status(404).end();
				return;
			}
		} catch (error) {
			res.status(404).end();
			return;
		}

		// Send initial connection event
		res.write(`data: ${JSON.stringify({
			type: 'connected',
			generationId,
			timestamp: new Date().toISOString()
		})}\n\n`);

		// Set up the SSE stream
		const cleanup = this.generationsService.subscribeToGenerationUpdates(
			generationId,
			(event) => {
				try {
					res.write(`data: ${JSON.stringify(event)}\n\n`);
				} catch (error) {
					// Connection closed, clean up
					cleanup();
				}
			}
		);

		// Handle client disconnect
		res.on('close', () => {
			cleanup();
		});

		// Keep connection alive
		const keepAlive = setInterval(() => {
			try {
				res.write(`: keepalive\n\n`);
			} catch (error) {
				clearInterval(keepAlive);
				cleanup();
			}
		}, 30000); // Send keepalive every 30 seconds

		// Clean up keepalive on close
		res.on('close', () => {
			clearInterval(keepAlive);
		});
	}
}