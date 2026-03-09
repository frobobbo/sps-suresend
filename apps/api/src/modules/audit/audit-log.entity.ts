import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  actorEmail!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resourceType!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resourceId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: 'success' | 'failure';

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
