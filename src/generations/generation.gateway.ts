import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const ROOM_PREFIX = 'gen:';

@WebSocketGateway({
	cors: { origin: '*' },
	namespace: '/generations',
})
export class GenerationGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
	@WebSocketServer()
	server!: Server;

	private readonly logger = new Logger(GenerationGateway.name);
	private isInitialized = false;

	afterInit(server: Server) {
		this.server = server;
		this.isInitialized = true;
		this.logger.log(`✅ [Socket] Gateway initialized for namespace /generations`);

		// Verify server structure
		if (this.server && this.server.sockets) {
			this.logger.log(`✅ [Socket] Server sockets available`);
		} else {
			this.logger.warn(`⚠️ [Socket] Server sockets not immediately available (will retry on emit)`);
		}
	}

	handleConnection(client: any) {
		this.logger.log(`🔌 [Socket] Client connected: ${client.id}`);
	}

	handleDisconnect(client: any) {
		this.logger.log(`🔌 [Socket] Client disconnected: ${client.id}`);
	}

	@SubscribeMessage('subscribe')
	handleSubscribe(client: any, payload: { generationId: string }) {
		const { generationId } = payload || {};
		if (!generationId) {
			this.logger.warn(`⚠️ [Socket] Subscribe without generationId from ${client.id}`);
			return;
		}
		const room = ROOM_PREFIX + generationId;
		client.join(room);
		this.logger.log(`✅ [Socket] Client ${client.id} joined room ${room}`);
	}

	@SubscribeMessage('unsubscribe')
	handleUnsubscribe(client: any, payload: { generationId: string }) {
		const { generationId } = payload || {};
		if (!generationId) return;
		client.leave(ROOM_PREFIX + generationId);
	}

	/** Emit to all clients watching this generation. Call from processor. */
	emitToGeneration(generationId: string, event: string, data: any) {
		if (!this.server) {
			this.logger.warn(`⚠️ [Socket] Cannot emit '${event}': server not available`);
			return;
		}

		try {
			const room = ROOM_PREFIX + generationId;

			// Try to get client count for logging (non-blocking)
			let clientCount = '?';
			try {
				// Access adapter safely - it might not be available immediately
				const adapter = (this.server as any).sockets?.adapter || (this.server as any).adapter;
				if (adapter && adapter.rooms && typeof adapter.rooms.get === 'function') {
					const clients = adapter.rooms.get(room);
					clientCount = clients ? String(clients.size) : '0';
				}
			} catch (adapterError) {
				// Ignore - adapter check is optional
			}

			this.logger.log(`📡 [Socket] Emitting '${event}' to room ${room} (${clientCount} clients)`);

			// Emit to room - this should work even if adapter check failed
			this.server.to(room).emit(event, data);
		} catch (error: any) {
			// Log error but don't throw - generation should continue
			this.logger.error(`❌ [Socket] Failed to emit '${event}' to room ${ROOM_PREFIX + generationId}:`, error?.message || error);
		}
	}

	/** Visual started processing – show loading state on card */
	emitVisualProcessing(
		generationId: string,
		payload: {
			type: string;
			index: number;
			status: 'processing';
		},
	) {
		this.emitToGeneration(generationId, 'visual_processing', payload);
	}

	/** Visual completed – real-time card update */
	emitVisualCompleted(
		generationId: string,
		payload: {
			type: string;
			index: number;
			image_url: string;
			generated_at: string;
			prompt?: string;
			status: 'completed' | 'failed';
			error?: string;
		},
	) {
		this.emitToGeneration(generationId, 'visual_completed', payload);
	}

	/** Progress update – elapsed, remaining, percent, counts */
	emitProgress(
		generationId: string,
		payload: {
			progress_percent: number;
			completed: number;
			total: number;
			elapsed_seconds: number;
			estimated_remaining_seconds?: number;
		},
	) {
		this.emitToGeneration(generationId, 'generation_progress', payload);
	}

	/** Generation finished */
	emitComplete(
		generationId: string,
		payload: {
			status: 'completed' | 'failed';
			completed: number;
			total: number;
			visuals: any[];
		},
	) {
		this.emitToGeneration(generationId, 'generation_complete', payload);
	}
}
