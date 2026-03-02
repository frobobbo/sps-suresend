import { promises as dnsPromises } from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

// Minimal interface satisfied by both the global dns.promises module and a
// per-instance dns.promises.Resolver (which supports custom nameserver config).
interface DnsClient {
  resolve4(hostname: string): Promise<string[]>;
  resolveMx(hostname: string): Promise<{ exchange: string; priority: number }[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
  resolveNs(hostname: string): Promise<string[]>;
  resolveCaa(hostname: string): Promise<{ critical: number; issue?: string; issuewild?: string; iodef?: string }[]>;
  reverse(ip: string): Promise<string[]>;
}

interface BlacklistResult {
  list: string;
  listed: boolean;
  /** true when the RBL refused the query (public resolver blocked) — not a real listing */
  blocked?: boolean;
}

interface CheckDetails {
  mx: { pass: boolean; records: string[] };
  spf: {
    pass: boolean;
    record: string | null;
    policy?: 'hard_fail' | 'soft_fail' | 'permissive' | 'pass_all';
  };
  dmarc: {
    pass: boolean;
    record: string | null;
    policy?: 'reject' | 'quarantine' | 'none';
    hasRua?: boolean;
  };
  dkim: { pass: boolean; selector: string | null };
  https: { pass: boolean; statusCode: number | null };
  blacklists: BlacklistResult[];
  httpsRedirect?: { pass: boolean };
  ssl?: { pass: boolean; daysUntilExpiry: number | null; expiresAt: string | null };
  securityHeaders?: { hsts: boolean; xContentTypeOptions: boolean; xFrameOptions: boolean };
  mtaSts?: { pass: boolean; policy?: string };
  tlsRpt?: { pass: boolean; record: string | null };
  bimi?: { pass: boolean; record: string | null };
  caa?: { pass: boolean; records: string[] };
  nsCount?: { pass: boolean; count: number };
  ptr?: { pass: boolean; hostname: string | null };
  dbl?: { listed: boolean };
}

@Injectable()
export class ReputationService implements OnModuleInit {
  private readonly logger = new Logger(ReputationService.name);

  // Default: global dns.promises (system resolver).
  // Replaced in onModuleInit when DNS_RESOLVER_IP or DNS_RESOLVER_HOST is set.
  private dnsClient: DnsClient = dnsPromises as unknown as DnsClient;

  constructor(
    @InjectRepository(ReputationCheck)
    private readonly repo: Repository<ReputationCheck>,
  ) {}

  async onModuleInit(): Promise<void> {
    // DNS_RESOLVER_IP  — direct IP (Docker Compose: fixed IP of unbound container)
    // DNS_RESOLVER_HOST — hostname resolved via system DNS (Kubernetes: K8s service name)
    let resolverIp = process.env.DNS_RESOLVER_IP ?? null;

    if (!resolverIp && process.env.DNS_RESOLVER_HOST) {
      try {
        const { address } = await dnsPromises.lookup(process.env.DNS_RESOLVER_HOST);
        resolverIp = address;
      } catch (err) {
        this.logger.warn(
          `Could not resolve DNS_RESOLVER_HOST "${process.env.DNS_RESOLVER_HOST}": ${String(err)}. Falling back to system resolver.`,
        );
      }
    }

    if (resolverIp) {
      const resolver = new dnsPromises.Resolver();
      resolver.setServers([`${resolverIp}:53`]);
      this.dnsClient = resolver as unknown as DnsClient;
      const label = process.env.DNS_RESOLVER_HOST ? ` (${process.env.DNS_RESOLVER_HOST})` : '';
      this.logger.log(`Reputation DNS resolver: ${resolverIp}${label}`);
    } else {
      this.logger.log(
        'Reputation DNS resolver: system default — set DNS_RESOLVER_IP or DNS_RESOLVER_HOST for accurate RBL checks',
      );
    }
  }

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
    const [mx, spf, dmarc, dkim, httpsProps, httpsRedirect, blacklists, mtaSts, tlsRpt, bimi, caa, nsCount, dbl, ptr] =
      await Promise.all([
        this.checkMx(domain),
        this.checkSpf(domain),
        this.checkDmarc(domain),
        this.checkDkim(domain),
        this.checkHttpsProperties(domain),
        this.checkHttpRedirect(domain),
        this.checkBlacklists(domain),
        this.checkMtaSts(domain),
        this.checkTlsRpt(domain),
        this.checkBimi(domain),
        this.checkCaa(domain),
        this.checkNsCount(domain),
        this.checkDbl(domain),
        this.checkPtr(domain),
      ]);
    return {
      mx,
      spf,
      dmarc,
      dkim,
      https: httpsProps.https,
      ssl: httpsProps.ssl,
      securityHeaders: httpsProps.securityHeaders,
      httpsRedirect,
      blacklists,
      mtaSts,
      tlsRpt,
      bimi,
      caa,
      nsCount,
      dbl,
      ptr,
    };
  }

  private async checkMx(domain: string) {
    try {
      const records = await this.dnsClient.resolveMx(domain);
      const exchanges = records.map((r) => r.exchange);
      return { pass: exchanges.length > 0, records: exchanges };
    } catch {
      return { pass: false, records: [] };
    }
  }

  private async checkSpf(domain: string) {
    try {
      const txt = await this.dnsClient.resolveTxt(domain);
      const flat = txt.map((r) => r.join(''));
      const record = flat.find((r) => r.startsWith('v=spf1')) ?? null;
      if (!record) return { pass: false, record: null };
      let policy: 'hard_fail' | 'soft_fail' | 'permissive' | 'pass_all';
      if (record.includes('-all')) policy = 'hard_fail';
      else if (record.includes('~all')) policy = 'soft_fail';
      else if (record.includes('+all')) policy = 'pass_all';
      else policy = 'permissive';
      return { pass: true, record, policy };
    } catch {
      return { pass: false, record: null };
    }
  }

  private async checkDmarc(domain: string) {
    try {
      const txt = await this.dnsClient.resolveTxt(`_dmarc.${domain}`);
      const flat = txt.map((r) => r.join(''));
      const record = flat.find((r) => r.startsWith('v=DMARC1')) ?? null;
      if (!record) return { pass: false, record: null };
      const policyMatch = /\bp=(\w+)/.exec(record);
      const policy = (policyMatch?.[1] as 'reject' | 'quarantine' | 'none') ?? undefined;
      const hasRua = /\brua=/.test(record);
      return { pass: true, record, policy, hasRua };
    } catch {
      return { pass: false, record: null };
    }
  }

  private async checkDkim(domain: string) {
    for (const selector of DKIM_SELECTORS) {
      try {
        const txt = await this.dnsClient.resolveTxt(`${selector}._domainkey.${domain}`);
        if (txt.length > 0) return { pass: true, selector };
      } catch {
        // not found, try next selector
      }
    }
    return { pass: false, selector: null };
  }

  private checkHttpsProperties(domain: string): Promise<{
    https: { pass: boolean; statusCode: number | null };
    ssl: { pass: boolean; daysUntilExpiry: number | null; expiresAt: string | null };
    securityHeaders: { hsts: boolean; xContentTypeOptions: boolean; xFrameOptions: boolean };
  }> {
    const fail = {
      https: { pass: false, statusCode: null },
      ssl: { pass: false, daysUntilExpiry: null, expiresAt: null },
      securityHeaders: { hsts: false, xContentTypeOptions: false, xFrameOptions: false },
    };
    return new Promise((resolve) => {
      const req = https.get(
        { hostname: domain, path: '/', timeout: 5000 },
        (res) => {
          let daysUntilExpiry: number | null = null;
          let expiresAt: string | null = null;
          let sslPass = false;
          try {
            const cert = (res.socket as tls.TLSSocket).getPeerCertificate();
            if (cert?.valid_to) {
              const expiry = new Date(cert.valid_to);
              const now = new Date();
              daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              expiresAt = expiry.toISOString();
              sslPass = daysUntilExpiry > 0;
            }
          } catch { /* cert unavailable */ }
          resolve({
            https: { pass: true, statusCode: res.statusCode ?? null },
            ssl: { pass: sslPass, daysUntilExpiry, expiresAt },
            securityHeaders: {
              hsts: !!res.headers['strict-transport-security'],
              xContentTypeOptions: (res.headers['x-content-type-options'] ?? '').toLowerCase().includes('nosniff'),
              xFrameOptions: !!res.headers['x-frame-options'],
            },
          });
        },
      );
      req.on('error', () => resolve(fail));
      req.on('timeout', () => { req.destroy(); resolve(fail); });
    });
  }

  private checkHttpRedirect(domain: string): Promise<{ pass: boolean }> {
    return new Promise((resolve) => {
      const req = http.get(
        { hostname: domain, path: '/', port: 80, timeout: 5000 },
        (res) => {
          const sc = res.statusCode ?? 0;
          const loc = res.headers.location ?? '';
          resolve({ pass: sc >= 300 && sc < 400 && loc.startsWith('https://') });
        },
      );
      req.on('error', () => resolve({ pass: false }));
      req.on('timeout', () => { req.destroy(); resolve({ pass: false }); });
    });
  }

  private async checkMtaSts(domain: string): Promise<{ pass: boolean; policy?: string }> {
    try {
      const txt = await this.dnsClient.resolveTxt(`_mta-sts.${domain}`);
      const flat = txt.map((r) => r.join(''));
      if (!flat.some((r) => r.startsWith('v=STSv1'))) return { pass: false };
    } catch {
      return { pass: false };
    }
    return new Promise((resolve) => {
      const req = https.get(
        { hostname: `mta-sts.${domain}`, path: '/.well-known/mta-sts.txt', timeout: 5000 },
        (res) => {
          if ((res.statusCode ?? 0) !== 200) { resolve({ pass: false }); return; }
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            const m = /^mode:\s*(.+)$/m.exec(body);
            resolve({ pass: true, policy: m?.[1]?.trim() });
          });
        },
      );
      req.on('error', () => resolve({ pass: false }));
      req.on('timeout', () => { req.destroy(); resolve({ pass: false }); });
    });
  }

  private async checkTlsRpt(domain: string): Promise<{ pass: boolean; record: string | null }> {
    try {
      const txt = await this.dnsClient.resolveTxt(`_smtp._tls.${domain}`);
      const flat = txt.map((r) => r.join(''));
      const record = flat.find((r) => r.startsWith('v=TLSRPTv1')) ?? null;
      return { pass: record !== null, record };
    } catch {
      return { pass: false, record: null };
    }
  }

  private async checkBimi(domain: string): Promise<{ pass: boolean; record: string | null }> {
    try {
      const txt = await this.dnsClient.resolveTxt(`default._bimi.${domain}`);
      const flat = txt.map((r) => r.join(''));
      const record = flat.find((r) => r.startsWith('v=BIMI1')) ?? null;
      return { pass: record !== null, record };
    } catch {
      return { pass: false, record: null };
    }
  }

  private async checkCaa(domain: string): Promise<{ pass: boolean; records: string[] }> {
    try {
      const records = await this.dnsClient.resolveCaa(domain);
      const issuers = records.map((r) => r.issue ?? r.issuewild ?? '').filter(Boolean);
      return { pass: records.length > 0, records: issuers };
    } catch {
      return { pass: false, records: [] };
    }
  }

  private async checkNsCount(domain: string): Promise<{ pass: boolean; count: number }> {
    try {
      const records = await this.dnsClient.resolveNs(domain);
      return { pass: records.length >= 2, count: records.length };
    } catch {
      return { pass: false, count: 0 };
    }
  }

  private async checkDbl(domain: string): Promise<{ listed: boolean }> {
    try {
      const results = await this.dnsClient.resolve4(`${domain}.dbl.spamhaus.org`);
      const returnCode = results[0];
      if (BLOCKED_RESOLVER_CODES.has(returnCode)) return { listed: false };
      return { listed: true };
    } catch {
      return { listed: false };
    }
  }

  private async checkPtr(domain: string): Promise<{ pass: boolean; hostname: string | null }> {
    try {
      const mxRecords = await this.dnsClient.resolveMx(domain);
      if (!mxRecords.length) return { pass: false, hostname: null };
      const mxHost = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;
      const addresses = await this.dnsClient.resolve4(mxHost);
      if (!addresses.length) return { pass: false, hostname: null };
      const ip = addresses[0];
      const ptrs = await this.dnsClient.reverse(ip);
      return { pass: ptrs.length > 0, hostname: ptrs[0] ?? null };
    } catch {
      return { pass: false, hostname: null };
    }
  }

  private async checkBlacklists(domain: string): Promise<BlacklistResult[]> {
    let ip: string;
    try {
      const addresses = await this.dnsClient.resolve4(domain);
      if (!addresses.length) return RBLS.map((list) => ({ list, listed: false }));
      ip = addresses[0];
    } catch {
      return RBLS.map((list) => ({ list, listed: false }));
    }

    const reversed = ip.split('.').reverse().join('.');
    return Promise.all(
      RBLS.map(async (list) => {
        try {
          const results = await this.dnsClient.resolve4(`${reversed}.${list}`);
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

    // Core email authentication
    if (!details.mx.pass) score -= 30;

    if (!details.spf.pass) score -= 15;
    else {
      if (details.spf.policy === 'pass_all') score -= 5;    // "+all" allows everyone — very dangerous
      else if (details.spf.policy === 'permissive') score -= 5; // no "all" mechanism
      else if (details.spf.policy === 'soft_fail') score -= 3;  // "~all" is weak
      // hard_fail: no deduction
    }

    if (!details.dmarc.pass) score -= 15;
    else {
      if (details.dmarc.policy === 'none') score -= 5;       // monitoring only, no enforcement
      else if (details.dmarc.policy === 'quarantine') score -= 2;
      if (details.dmarc.hasRua === false) score -= 2;        // no aggregate reporting
    }

    if (!details.dkim.pass) score -= 10;

    // Web security — only penalise sub-checks if HTTPS is reachable
    if (!details.https.pass) score -= 10;
    else {
      if (details.httpsRedirect && !details.httpsRedirect.pass) score -= 3;

      if (details.ssl) {
        if (!details.ssl.pass) score -= 20;
        else if (details.ssl.daysUntilExpiry !== null) {
          if (details.ssl.daysUntilExpiry < 14) score -= 10;
          else if (details.ssl.daysUntilExpiry < 30) score -= 3;
        }
      }

      if (details.securityHeaders) {
        if (!details.securityHeaders.hsts) score -= 3;
        if (!details.securityHeaders.xContentTypeOptions) score -= 1;
        if (!details.securityHeaders.xFrameOptions) score -= 1;
      }
    }

    // Email transport security
    if (details.mtaSts && !details.mtaSts.pass) score -= 3;
    if (details.tlsRpt && !details.tlsRpt.pass) score -= 1;
    // BIMI: no score impact — it's a brand enhancement, not a security requirement

    // DNS health
    if (details.caa && !details.caa.pass) score -= 3;
    if (details.nsCount && !details.nsCount.pass) score -= 5;
    if (details.ptr && !details.ptr.pass) score -= 3;

    // Blacklists
    for (const bl of details.blacklists) {
      if (bl.listed) score -= 20;
    }
    if (details.dbl?.listed) score -= 20;

    score = Math.max(0, score);
    const status = score >= 80 ? 'clean' : score >= 50 ? 'warning' : 'blacklisted';
    return { score, status };
  }
}
