import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Resolver } from 'dns';
import { promisify } from 'util';
import { Domain } from './domain.entity';
import { DomainAccess } from './domain-access.entity';
import { CloudflareService } from './cloudflare.service';
import { CreateDomainDto, DelegateAccessDto, UpdateMonitoringDto } from './domains.dto';
import { UsersService } from '../users/users.service';
import { SecretCipherService } from '../security/secret-cipher.service';

// Use public DNS resolvers instead of the system/container resolver, which is
// unreliable for external TXT lookups in Docker/Kubernetes environments.
const dnsResolver = new Resolver();
dnsResolver.setServers(['1.1.1.1', '8.8.8.8']);
const resolveTxt = promisify(dnsResolver.resolveTxt.bind(dnsResolver));

interface RequestUser {
  id: string;
  role: 'admin' | 'user';
  tier: 'free' | 'plus' | 'pro';
}

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

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
    const normalizedName = dto.name.toLowerCase().trim();
    const existing = await this.domainRepo.findOneBy({ name: normalizedName });
    if (existing) throw new ConflictException('Domain already registered');
    const domain = this.domainRepo.create({
      name: normalizedName,
      ownerId: user.id,
      verificationToken: randomBytes(16).toString('hex'),
      verifiedAt: null,
      scanIntervalMinutes: 1440,
      alertsEnabled: true,
      lastScheduledScanAt: null,
    });
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

  async getVerificationDetails(id: string, user: RequestUser): Promise<{
    host: string;
    value: string;
    verifiedAt: Date | null;
  }> {
    const domain = await this.findOne(id, user);
    return {
      host: `_suresend-verification.${domain.name}`,
      value: domain.verificationToken,
      verifiedAt: domain.verifiedAt,
    };
  }

  async verifyOwnership(id: string, user: RequestUser): Promise<{ verified: boolean; verifiedAt: Date | null }> {
    const domain = await this.findOne(id, user);
    if (user.role !== 'admin' && domain.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner or an admin can verify this domain');
    }
    if (domain.verifiedAt) {
      return { verified: true, verifiedAt: domain.verifiedAt };
    }

    const host = `_suresend-verification.${domain.name}`;
    try {
      const records = await resolveTxt(host);
      const flat = records.map((r) => r.join(''));
      this.logger.debug(`TXT lookup ${host}: [${flat.join(', ')}] expected=${domain.verificationToken}`);
      const found = flat.includes(domain.verificationToken);
      if (!found) return { verified: false, verifiedAt: null };
    } catch (err: any) {
      this.logger.warn(`TXT lookup failed for ${host}: ${err?.code} ${err?.message}`);
      return { verified: false, verifiedAt: null };
    }

    const verifiedAt = new Date();
    await this.domainRepo.update({ id: domain.id }, { verifiedAt });
    return { verified: true, verifiedAt };
  }

  async updateMonitoringSettings(
    id: string,
    dto: UpdateMonitoringDto,
    user: RequestUser,
  ): Promise<Pick<Domain, 'scanIntervalMinutes' | 'alertsEnabled'>> {
    const domain = await this.findOne(id, user);
    if (user.role !== 'admin' && domain.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner or an admin can update monitoring settings');
    }

    await this.domainRepo.update(
      { id: domain.id },
      {
        scanIntervalMinutes: dto.scanIntervalMinutes ?? null,
        alertsEnabled: dto.alertsEnabled ?? domain.alertsEnabled,
      },
    );

    const updated = await this.domainRepo.findOneByOrFail({ id: domain.id });
    return {
      scanIntervalMinutes: updated.scanIntervalMinutes,
      alertsEnabled: updated.alertsEnabled,
    };
  }

  async markScheduledScanQueued(id: string, at: Date): Promise<void> {
    await this.domainRepo.update({ id }, { lastScheduledScanAt: at });
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

  async findVerifiedDomainsDue(now: Date): Promise<Domain[]> {
    const domains = await this.domainRepo.find({
      where: {},
      relations: ['owner'],
    });
    return domains.filter((domain) => {
      if (!domain.verifiedAt) return false;
      if (!domain.scanIntervalMinutes) return false;
      const last = domain.lastScheduledScanAt?.getTime() ?? 0;
      return !last || now.getTime() - last >= domain.scanIntervalMinutes * 60 * 1000;
    });
  }
}
