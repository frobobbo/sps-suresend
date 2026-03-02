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
  id: string;

  @Column({ unique: true })
  name: string;

  @ManyToOne(() => User, (user) => user.domains, { eager: false })
  owner: User;

  @Column()
  ownerId: string;

  @OneToMany(() => DomainAccess, (access) => access.domain, { cascade: true })
  delegatedAccess: DomainAccess[];

  @OneToMany(() => ReputationCheck, (check) => check.domain, { cascade: true })
  reputationChecks: ReputationCheck[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
