import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Domain } from '../domains/domain.entity';

@Entity('scan_jobs')
export class ScanJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Domain, { onDelete: 'CASCADE' })
  domain!: Domain;

  @Column()
  domainId!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: 'queued' | 'running' | 'completed' | 'failed';

  @Column({ type: 'varchar', length: 32 })
  trigger!: 'manual' | 'scheduled';

  @Column({ type: 'varchar', length: 36, nullable: true })
  requestedByUserId!: string | null;

  @Column({ type: 'timestamp' })
  runAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  resultCheckId!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
