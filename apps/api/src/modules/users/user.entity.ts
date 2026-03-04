import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Domain } from '../domains/domain.entity';
import { DomainAccess } from '../domains/domain-access.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column({ type: 'varchar', default: 'user' })
  role!: 'admin' | 'user';

  @Column({ type: 'varchar', default: 'free' })
  tier!: 'free' | 'plus' | 'pro';

  @OneToMany(() => Domain, (domain) => domain.owner)
  domains!: Domain[];

  @OneToMany(() => DomainAccess, (access) => access.user)
  delegatedAccess!: DomainAccess[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
