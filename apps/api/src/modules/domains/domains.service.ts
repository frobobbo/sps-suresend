import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Domain } from './domain.entity';
import { DomainAccess } from './domain-access.entity';
import { CreateDomainDto, DelegateAccessDto } from './domains.dto';

interface RequestUser {
  id: string;
  role: 'admin' | 'user';
}

@Injectable()
export class DomainsService {
  constructor(
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectRepository(DomainAccess)
    private readonly accessRepo: Repository<DomainAccess>,
  ) {}

  async findAllForUser(user: RequestUser): Promise<Domain[]> {
    if (user.role === 'admin') {
      return this.domainRepo.find({
        relations: ['delegatedAccess', 'delegatedAccess.user'],
        order: { createdAt: 'DESC' },
      });
    }
    // User sees domains they own or have delegated access to
    const owned = await this.domainRepo.find({
      where: { ownerId: user.id },
      relations: ['delegatedAccess', 'delegatedAccess.user'],
      order: { createdAt: 'DESC' },
    });
    const delegated = await this.accessRepo.find({
      where: { userId: user.id },
      relations: ['domain', 'domain.delegatedAccess', 'domain.delegatedAccess.user'],
    });
    const delegatedDomains = delegated.map((a) => a.domain);
    const seen = new Set(owned.map((d) => d.id));
    return [...owned, ...delegatedDomains.filter((d) => !seen.has(d.id))];
  }

  async findOne(id: string, user: RequestUser): Promise<Domain> {
    const domain = await this.domainRepo.findOne({
      where: { id },
      relations: ['delegatedAccess', 'delegatedAccess.user'],
    });
    if (!domain) throw new NotFoundException('Domain not found');
    this.assertAccess(domain, user);
    return domain;
  }

  async create(dto: CreateDomainDto, user: RequestUser): Promise<Domain> {
    const existing = await this.domainRepo.findOneBy({ name: dto.name });
    if (existing) throw new ConflictException('Domain already registered');
    const domain = this.domainRepo.create({ name: dto.name, ownerId: user.id });
    return this.domainRepo.save(domain);
  }

  async remove(id: string, user: RequestUser): Promise<void> {
    const domain = await this.domainRepo.findOneBy({ id });
    if (!domain) throw new NotFoundException('Domain not found');
    if (user.role !== 'admin' && domain.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner or an admin can delete this domain');
    }
    await this.domainRepo.remove(domain);
  }

  async delegateAccess(id: string, dto: DelegateAccessDto, user: RequestUser): Promise<DomainAccess> {
    const domain = await this.domainRepo.findOneBy({ id });
    if (!domain) throw new NotFoundException('Domain not found');
    if (user.role !== 'admin' && domain.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner or an admin can delegate access');
    }
    if (dto.userId === domain.ownerId) {
      throw new ConflictException('Owner already has access');
    }
    const existing = await this.accessRepo.findOneBy({ domainId: id, userId: dto.userId });
    if (existing) throw new ConflictException('User already has delegated access');
    const access = this.accessRepo.create({ domainId: id, userId: dto.userId });
    return this.accessRepo.save(access);
  }

  async revokeAccess(id: string, targetUserId: string, user: RequestUser): Promise<void> {
    const domain = await this.domainRepo.findOneBy({ id });
    if (!domain) throw new NotFoundException('Domain not found');
    if (user.role !== 'admin' && domain.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner or an admin can revoke access');
    }
    const access = await this.accessRepo.findOneBy({ domainId: id, userId: targetUserId });
    if (!access) throw new NotFoundException('Access record not found');
    await this.accessRepo.remove(access);
  }

  private assertAccess(domain: Domain, user: RequestUser): void {
    if (user.role === 'admin') return;
    if (domain.ownerId === user.id) return;
    const hasDelegate = domain.delegatedAccess?.some((a) => a.userId === user.id);
    if (!hasDelegate) throw new ForbiddenException('You do not have access to this domain');
  }
}
