import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Domain } from '../domains/domain.entity';

@Entity('reputation_checks')
export class ReputationCheck {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Domain, (domain) => domain.reputationChecks, {
    onDelete: 'CASCADE',
  })
  domain!: Domain;

  @Column()
  domainId!: string;

  @Column({ type: 'int' })
  score!: number;

  @Column({ type: 'int', default: 0 })
  emailScore!: number;

  @Column({ type: 'int', default: 0 })
  webScore!: number;

  @Column({ type: 'varchar' })
  status!: 'clean' | 'warning' | 'blacklisted';

  @Column({ type: 'jsonb' })
  details!: unknown;

  @CreateDateColumn()
  checkedAt!: Date;
}
