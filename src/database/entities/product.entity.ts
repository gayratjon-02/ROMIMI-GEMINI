import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Collection } from './collection.entity';
import { Generation } from './generation.entity';



@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  //relations
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid', nullable: true })
  collection_id: string;

  @ManyToOne(() => Collection, (collection) => collection.products, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'collection_id' })
  collection: Collection;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;


  @Column({ type: 'varchar', length: 500, nullable: true })
  front_image_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  back_image_url: string;

  @Column({ type: 'jsonb', nullable: true })
  reference_images: string[];


  @Column({ type: 'jsonb', nullable: true })
  analyzed_product_json: Record<string, any>;

  // manual product overrides
  @Column({ type: 'jsonb', nullable: true })
  manual_product_overrides: Record<string, any>;


  @Column({ type: 'jsonb', nullable: true })
  final_product_json: Record<string, any>;


  @Column({ type: 'jsonb', nullable: true })
  extracted_variables: Record<string, any>;


  @Column({ type: 'jsonb', nullable: true })
  manual_overrides: Record<string, any>;


  @Column({ type: 'uuid', nullable: true })
  brand_id: string;


  @Column({ type: 'jsonb', nullable: true })
  generated_images: Record<string, string>;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @OneToMany(() => Generation, (generation) => generation.product)
  generations: Generation[];
}
