import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeneratedImagesToProduct1706262000000 implements MigrationInterface {
    name = 'AddGeneratedImagesToProduct1706262000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "products" 
            ADD COLUMN IF NOT EXISTS "generated_images" jsonb
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "products" 
            DROP COLUMN IF EXISTS "generated_images"
        `);
    }
}
