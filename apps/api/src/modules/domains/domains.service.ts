import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Domain } from './domain.entity';
import { DomainAccess } from './domain-access.entity';
import { CloudflareService } from './cloudflare.service';
import { CreateDomainDto, DelegateAccessDto } from './domains.dto';
import { UsersService } from '../users/users.service';
import { SecretCipherService } from '../security/secret-cipher.service';

interface RequestUser {
  id: string;
  role: 'admin' | 'user';
  tier: 'free' | 'plus' | 'pro';
}

@Injectable()
export class DomainsService {
  constructor(
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectRepository(DomainAccess)
    private readonly accessRepo: Repository<DomainAccess>,
    private readonly cloudflareService: CloudflareService,
    private readonly usersService: UsersService,
    private readonly secretCipherService: SecretCipherService,
  ) {}

  async findAllForUser(user: RequestUser): Promise<Domain[]> {
    if (user.role === 'admin') {
      return this.domainRepo.find({
        relations: ['delegatedAccess', 'delegatedAccess.user'],
        order: { createdAt: 'DESC' },
      });
    }
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
    const targetUserId = await this.resolveDelegateUserId(dto);
    if (targetUserId === domain.ownerId) {
      throw new ConflictException('Owner already has access');
    }
    const existing = await this.accessRepo.findOneBy({ domainId: id, userId: targetUserId });
    if (existing) throw new ConflictException('User already has delegated access');
    const access = this.accessRepo.create({ domainId: id, userId: targetUserId });
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

  // ── Cloudflare ─────────────────────────────────────────────────────────────

  async setCloudflareToken(
    id: string,
    token: string,
    user: RequestUser,
  ): Promise<{ cloudflareConnected: boolean }> {
    const domain = await this.domainRepo.findOneBy({ id });
    if (!domain) throw new NotFoundException('Domain not found');
    if (user.role !== 'admin' && domain.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner or an admin can connect Cloudflare');
    }
    // Validate token by confirming the zone exists
    await this.cloudflareService.validateToken(token, domain.name);
    // Persist using a raw update so we don't pull other columns into memory
    await this.domainRepo
      .createQueryBuilder()
      .update(Domain)
      .set({ cloudflareToken: this.secretCipherService.encrypt(token) })
      .where('id = :id', { id })
      .execute();
    return { cloudflareConnected: true };
  }

  async removeCloudflareToken(id: string, user: RequestUser): Promise<void> {
    const domain = await this.domainRepo.findOneBy({ id });
    if (!domain) throw new NotFoundException('Domain not found');
    if (user.role !== 'admin' && domain.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner or an admin can disconnect Cloudflare');
    }
    await this.domainRepo
      .createQueryBuilder()
      .update(Domain)
      .set({ cloudflareToken: null })
      .where('id = :id', { id })
      .execute();
  }

  async applyFix(
    id: string,
    check: string,
    user: RequestUser,
    payload?: Record<string, unknown>,
  ): Promise<{ record: string; action: string }> {
    // Explicitly select cloudflareToken (excluded by default)
    const domain = await this.domainRepo
      .createQueryBuilder('domain')
      .addSelect('domain.cloudflareToken')
      .where('domain.id = :id', { id })
      .getOne();

    if (!domain) throw new NotFoundException('Domain not found');
    this.assertAccess(domain, user);

    if (user.role !== 'admin' && user.tier === 'free') {
      throw new ForbiddenException('Upgrade to Plus to use auto-fix features');
    }

    if (!domain.cloudflareToken) {
      throw new BadRequestException('No Cloudflare token configured for this domain');
    }

    return this.cloudflareService.applyFix(
      this.secretCipherService.decryptMaybeLegacy(domain.cloudflareToken),
      domain.name,
      check,
      payload,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Whether a domain has a Cloudflare token set (without loading the token itself). */
  async hasCloudflareToken(id: string): Promise<boolean> {
    const count = await this.domainRepo
      .createQueryBuilder('domain')
      .addSelect('domain.cloudflareToken')
      .where('domain.id = :id AND domain.cloudflareToken IS NOT NULL', { id })
      .getCount();
    return count > 0;
  }

  /** Returns the set of domain IDs (from the given list) that have a CF token. */
  async getCfConnectedIds(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.domainRepo
      .createQueryBuilder('d')
      .addSelect('d.cloudflareToken')
      .select('d.id', 'id')
      .where('d.id IN (:...ids)', { ids })
      .andWhere('d.cloudflareToken IS NOT NULL')
      .getRawMany<{ id: string }>();
    return new Set(rows.map((r) => r.id));
  }

  private assertAccess(domain: Domain, user: RequestUser): void {
    if (user.role === 'admin') return;
    if (domain.ownerId === user.id) return;
    const hasDelegate = domain.delegatedAccess?.some((a) => a.userId === user.id);
    if (!hasDelegate) throw new ForbiddenException('You do not have access to this domain');
  }

  private async resolveDelegateUserId(dto: DelegateAccessDto): Promise<string> {
    if (dto.userId) return dto.userId;
    if (!dto.email) throw new BadRequestException('userId or email is required');
    const targetUser = await this.usersService.findByEmail(dto.email);
    if (!targetUser) throw new NotFoundException('User not found');
    return targetUser.id;
  }
}
