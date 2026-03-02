import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Domain } from './domain.entity';

@Entity('domain_access')
@Unique(['domainId', 'userId'])
export class DomainAccess {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Domain, (domain) => domain.delegatedAccess, {
    onDelete: 'CASCADE',
  })
  domain!: Domain;

  @Column()
  domainId!: string;

  @ManyToOne(() => User, (user) => user.delegatedAccess)
  user!: User;

  @Column()
  userId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
