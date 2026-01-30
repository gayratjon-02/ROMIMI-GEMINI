import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Brand } from './brand.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password_hash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  // Settings fields
  @Column({ type: 'text', nullable: true })
  brand_brief: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  api_key_openai: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  api_key_anthropic: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  api_key_gemini: string;

  /** Override Claude model (e.g. claude-sonnet-4-20250514). Null = use system default. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  claude_model: string;

  /** Override Gemini model (e.g. gemini-3-pro-image-preview). Null = use system default. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  gemini_model: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'en' })
  language: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'light' })
  theme: string;

  @Column({ type: 'boolean', default: true })
  notifications_enabled: boolean;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @OneToMany(() => Brand, (brand) => brand.user)
  brands: Brand[];
}
