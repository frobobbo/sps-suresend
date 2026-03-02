import { promises as dns } from 'dns';
import * as https from 'https';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReputationCheck } from './reputation-check.entity';

const DKIM_SELECTORS = ['default', 'google', 'mail', 'dkim', 'k1', 'selector1', 'selector2'];
const RBLS = [
  'zen.spamhaus.org',
  'bl.spamcop.net',
  'dnsbl.sorbs.net',
  'b.barracuda.com',
];

// Return codes that indicate the querying resolver is blocked by the RBL,
// not that the IP is actually listed. Spamhaus (and others) return these
// when queries arrive through public resolvers like 8.8.8.8 or 1.1.1.1.
const BLOCKED_RESOLVER_CODES = new Set(['127.255.255.254', '127.255.255.255']);

interface BlacklistResult {
  list: string;
  listed: boolean;
  /** true when the RBL refused the query (public resolver blocked) — not a real listing */
  blocked?: boolean;
}

interface CheckDetails {
  mx: { pass: boolean; records: string[] };
  spf: { pass: boolean; record: string | null };
  dmarc: { pass: boolean; record: string | null };
  dkim: { pass: boolean; selector: string | null };
  https: { pass: boolean; statusCode: number | null };
  blacklists: BlacklistResult[];
}

@Injectable()
export class ReputationService {
  constructor(
    @InjectRepository(ReputationCheck)
    private readonly repo: Repository<ReputationCheck>,
  ) {}

  async runCheck(domainId: string, domainName: string): Promise<ReputationCheck> {
    const details = await this.gatherDetails(domainName);
    const { score, status } = this.score(details);
    const check = this.repo.create({ domainId, score, status, details: details as unknown });
    return this.repo.save(check) as Promise<ReputationCheck>;
  }

  findForDomain(domainId: string): Promise<ReputationCheck[]> {
    return this.repo.find({
      where: { domainId },
      order: { checkedAt: 'DESC' },
      take: 10,
    });
  }

  private async gatherDetails(domain: string): Promise<CheckDetails> {
    const [mx, spf, dmarc, dkim, httpsResult, blacklists] = await Promise.all([
      this.checkMx(domain),
      this.checkSpf(domain),
      this.checkDmarc(domain),
      this.checkDkim(domain),
      this.checkHttps(domain),
      this.checkBlacklists(domain),
    ]);
    return { mx, spf, dmarc, dkim, https: httpsResult, blacklists };
  }

  private async checkMx(domain: string) {
    try {
      const records = await dns.resolveMx(domain);
      const exchanges = records.map((r) => r.exchange);
      return { pass: exchanges.length > 0, records: exchanges };
    } catch {
      return { pass: false, records: [] };
    }
  }

  private async checkSpf(domain: string) {
    try {
      const txt = await dns.resolveTxt(domain);
      const flat = txt.map((r) => r.join(''));
      const record = flat.find((r) => r.startsWith('v=spf1')) ?? null;
      return { pass: record !== null, record };
    } catch {
      return { pass: false, record: null };
    }
  }

  private async checkDmarc(domain: string) {
    try {
      const txt = await dns.resolveTxt(`_dmarc.${domain}`);
      const flat = txt.map((r) => r.join(''));
      const record = flat.find((r) => r.startsWith('v=DMARC1')) ?? null;
      return { pass: record !== null, record };
    } catch {
      return { pass: false, record: null };
    }
  }

  private async checkDkim(domain: string) {
    for (const selector of DKIM_SELECTORS) {
      try {
        const txt = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
        if (txt.length > 0) return { pass: true, selector };
      } catch {
        // not found, try next selector
      }
    }
    return { pass: false, selector: null };
  }

  private checkHttps(domain: string): Promise<{ pass: boolean; statusCode: number | null }> {
    return new Promise((resolve) => {
      const req = https.get(
        { hostname: domain, path: '/', timeout: 5000 },
        (res) => resolve({ pass: true, statusCode: res.statusCode ?? null }),
      );
      req.on('error', () => resolve({ pass: false, statusCode: null }));
      req.on('timeout', () => { req.destroy(); resolve({ pass: false, statusCode: null }); });
    });
  }

  private async checkBlacklists(domain: string): Promise<BlacklistResult[]> {
    let ip: string;
    try {
      const addresses = await dns.resolve4(domain);
      if (!addresses.length) return RBLS.map((list) => ({ list, listed: false }));
      ip = addresses[0];
    } catch {
      return RBLS.map((list) => ({ list, listed: false }));
    }

    const reversed = ip.split('.').reverse().join('.');
    return Promise.all(
      RBLS.map(async (list) => {
        try {
          const results = await dns.resolve4(`${reversed}.${list}`);
          const returnCode = results[0];
          // Spamhaus and some other RBLs return 127.255.255.254 / 127.255.255.255
          // when the query comes from a public resolver (e.g. 8.8.8.8, 1.1.1.1).
          // This is not a real listing — treat it as indeterminate and don't penalise.
          if (BLOCKED_RESOLVER_CODES.has(returnCode)) {
            return { list, listed: false, blocked: true };
          }
          return { list, listed: true };
        } catch {
          return { list, listed: false };
        }
      }),
    );
  }

  private score(details: CheckDetails): { score: number; status: 'clean' | 'warning' | 'blacklisted' } {
    let score = 100;
    if (!details.mx.pass) score -= 30;
    if (!details.spf.pass) score -= 15;
    if (!details.dmarc.pass) score -= 15;
    if (!details.dkim.pass) score -= 10;
    if (!details.https.pass) score -= 10;
    for (const bl of details.blacklists) {
      if (bl.listed) score -= 20;
    }
    score = Math.max(0, score);
    const status = score >= 80 ? 'clean' : score >= 50 ? 'warning' : 'blacklisted';
    return { score, status };
  }
}
