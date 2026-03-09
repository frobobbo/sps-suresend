import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { DomainAccess } from './domain-access.entity';
import { ReputationCheck } from '../reputation/reputation-check.entity';

@Entity('domains')
export class Domain {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @ManyToOne(() => User, (user) => user.domains, { eager: false })
  owner!: User;

  @Column()
  ownerId!: string;

  @OneToMany(() => DomainAccess, (access) => access.domain, { cascade: true })
  delegatedAccess!: DomainAccess[];

  @OneToMany(() => ReputationCheck, (check) => check.domain, { cascade: true })
  reputationChecks!: ReputationCheck[];

  // Scoped Cloudflare API token for auto-fix. select:false means it is
  // never included in normal queries — must be explicitly requested.
  @Column({ nullable: true, type: 'text', select: false })
  cloudflareToken!: string | null;

  @Column({ type: 'varchar', length: 64 })
  verificationToken!: string;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'int', nullable: true, default: 1440 })
  scanIntervalMinutes!: number | null;

  @Column({ type: 'boolean', default: true })
  alertsEnabled!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastScheduledScanAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
