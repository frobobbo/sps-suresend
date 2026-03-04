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
  'cbl.abuseat.org',
];

// Return codes that indicate the querying resolver is blocked by the RBL,
// not that the IP is actually listed.
const BLOCKED_RESOLVER_CODES = new Set(['127.255.255.254', '127.255.255.255']);

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
  blocked?: boolean;
}

interface CheckDetails {
  mx: { pass: boolean; records: string[]; mailProvider?: 'google' | 'microsoft' };
  spf: {
    pass: boolean;
    record: string | null;
    policy?: 'hard_fail' | 'soft_fail' | 'permissive' | 'pass_all';
    lookups?: number;
  };
  dmarc: {
    pass: boolean;
    record: string | null;
    policy?: 'reject' | 'quarantine' | 'none';
    hasRua?: boolean;
    hasRuf?: boolean;
    pct?: number;
  };
  dkim: { pass: boolean; selector: string | null };
  https: { pass: boolean; statusCode: number | null };
  blacklists: BlacklistResult[];
  httpsRedirect?: { pass: boolean };
  ssl?: { pass: boolean; daysUntilExpiry: number | null; expiresAt: string | null };
  securityHeaders?: {
    hsts: boolean;
    xContentTypeOptions: boolean;
    xFrameOptions: boolean;
    csp: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
  };
  tlsVersion?: { protocol: string | null; pass: boolean };
  mtaSts?: { pass: boolean; policy?: string };
  tlsRpt?: { pass: boolean; record: string | null };
  bimi?: { pass: boolean; record: string | null };
  caa?: { pass: boolean; records: string[] };
  nsCount?: { pass: boolean; count: number };
  ptr?: { pass: boolean; hostname: string | null };
  dbl?: { listed: boolean };
  domainExpiry?: { pass: boolean; daysUntilExpiry: number | null; expiresAt: string | null };
  dnssec?: { pass: boolean };
  wwwRedirect?: { pass: boolean; exists: boolean };
  observatory?: { pass: boolean; grade: string | null; score: number | null };
  safeBrowsing?: { pass: boolean; threats: string[] };
  sslLabs?: { pass: boolean; grade: string | null; pending: boolean };
}

@Injectable()
export class ReputationService implements OnModuleInit {
  private readonly logger = new Logger(ReputationService.name);

  private dnsClient: DnsClient = dnsPromises as unknown as DnsClient;

  constructor(
    @InjectRepository(ReputationCheck)
    private readonly repo: Repository<ReputationCheck>,
  ) {}

  async onModuleInit(): Promise<void> {
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
    const { score, emailScore, webScore, status } = this.score(details);
    const check = this.repo.create({ domainId, score, emailScore, webScore, status, details: details as unknown });
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
    const [
      mx, spf, dmarc, dkim,
      httpsProps, httpsRedirect,
      blacklists, mtaSts, tlsRpt, bimi,
      caa, nsCount, dbl, ptr,
      domainExpiry, dnssec, wwwRedirect,
      observatory, safeBrowsing, sslLabs,
    ] = await Promise.all([
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
      this.checkDomainExpiry(domain),
      this.checkDnssec(domain),
      this.checkWwwRedirect(domain),
      this.checkMozillaObservatory(domain),
      this.checkGoogleSafeBrowsing(domain),
      this.checkSslLabs(domain),
    ]);

    return {
      mx,
      spf,
      dmarc,
      dkim,
      https: httpsProps.https,
      ssl: httpsProps.ssl,
      securityHeaders: httpsProps.securityHeaders,
      tlsVersion: httpsProps.tlsVersion,
      httpsRedirect,
      blacklists,
      mtaSts,
      tlsRpt,
      bimi,
      caa,
      nsCount,
      dbl,
      ptr,
      domainExpiry,
      dnssec,
      wwwRedirect,
      observatory,
      safeBrowsing,
      sslLabs,
    };
  }

  // ── Individual checks ────────────────────────────────────────────────────────

  private async checkMx(domain: string) {
    try {
      const records = await this.dnsClient.resolveMx(domain);
      const exchanges = records.map((r) => r.exchange);
      let mailProvider: 'google' | 'microsoft' | undefined;
      for (const ex of exchanges) {
        if (/google|gmail/i.test(ex)) { mailProvider = 'google'; break; }
        if (/outlook\.com|protection\.outlook/i.test(ex)) { mailProvider = 'microsoft'; break; }
      }
      return { pass: exchanges.length > 0, records: exchanges, mailProvider };
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
      const lookups = await this.countSpfLookups(record, 0);
      return { pass: true, record, policy, lookups };
    } catch {
      return { pass: false, record: null };
    }
  }

  /**
   * Recursively count the number of DNS lookups caused by an SPF record.
   * RFC 7208 §4.6.4 allows a maximum of 10.
   */
  private async countSpfLookups(record: string, depth: number): Promise<number> {
    if (depth > 3) return 0;
    const tokens = record.split(/\s+/);
    let count = 0;
    const subPromises: Promise<number>[] = [];

    for (const token of tokens) {
      // Mechanisms that cost exactly 1 lookup: a, mx, ptr, exists
      if (/^[+-~?]?(a|mx|ptr|exists)(:|$)/i.test(token)) {
        count++;
      }
      // include: costs 1 + the lookups inside the included record
      if (/^[+-~?]?include:/i.test(token)) {
        count++;
        const target = token.replace(/^[+-~?]?include:/i, '');
        subPromises.push(
          this.dnsClient.resolveTxt(target)
            .then((txt) => {
              const flat = txt.map((r) => r.join(''));
              const spf = flat.find((r) => r.startsWith('v=spf1'));
              return spf ? this.countSpfLookups(spf, depth + 1) : 0;
            })
            .catch(() => 0),
        );
      }
      // redirect= costs 1 + replaces the record — count it but don't recurse for simplicity
      if (/^redirect=/i.test(token)) {
        count++;
      }
    }

    const subCounts = await Promise.all(subPromises);
    return count + subCounts.reduce((a, b) => a + b, 0);
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
      const hasRuf = /\bruf=/.test(record);
      const pctMatch = /\bpct=(\d+)/.exec(record);
      const pct = pctMatch ? parseInt(pctMatch[1], 10) : 100;
      return { pass: true, record, policy, hasRua, hasRuf, pct };
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
    securityHeaders: {
      hsts: boolean;
      xContentTypeOptions: boolean;
      xFrameOptions: boolean;
      csp: boolean;
      referrerPolicy: boolean;
      permissionsPolicy: boolean;
    };
    tlsVersion: { protocol: string | null; pass: boolean };
  }> {
    const fail = {
      https: { pass: false, statusCode: null },
      ssl: { pass: false, daysUntilExpiry: null, expiresAt: null },
      securityHeaders: {
        hsts: false, xContentTypeOptions: false, xFrameOptions: false,
        csp: false, referrerPolicy: false, permissionsPolicy: false,
      },
      tlsVersion: { protocol: null, pass: false },
    };
    return new Promise((resolve) => {
      const req = https.get(
        { hostname: domain, path: '/', timeout: 5000 },
        (res) => {
          // Reaching here means Node.js already verified the TLS cert
          // (hostname, chain of trust, expiry). SSL is valid — read metadata for display only.
          let daysUntilExpiry: number | null = null;
          let expiresAt: string | null = null;
          let protocol: string | null = null;
          try {
            const sock = res.socket as tls.TLSSocket;
            protocol = sock.getProtocol?.() ?? null;
            const cert = sock.getPeerCertificate();
            if (cert?.valid_to) {
              const expiry = new Date(cert.valid_to);
              if (!isNaN(expiry.getTime())) {
                daysUntilExpiry = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
                expiresAt = expiry.toISOString();
              }
            }
          } catch { /* cert metadata unavailable — TLS still valid */ }
          resolve({
            https: { pass: true, statusCode: res.statusCode ?? null },
            ssl: { pass: true, daysUntilExpiry, expiresAt },
            securityHeaders: {
              hsts: !!res.headers['strict-transport-security'],
              xContentTypeOptions: String(res.headers['x-content-type-options'] ?? '').toLowerCase().includes('nosniff'),
              xFrameOptions: !!res.headers['x-frame-options'],
              csp: !!res.headers['content-security-policy'],
              referrerPolicy: !!res.headers['referrer-policy'],
              permissionsPolicy: !!res.headers['permissions-policy'],
            },
            tlsVersion: {
              protocol,
              pass: protocol === 'TLSv1.2' || protocol === 'TLSv1.3',
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
    return this.fetchMtaStsPolicy(`https://mta-sts.${domain}/.well-known/mta-sts.txt`, false);
  }

  private fetchMtaStsPolicy(url: string, followed: boolean): Promise<{ pass: boolean; policy?: string }> {
    return new Promise((resolve) => {
      const req = https.get(url, { timeout: 5000 }, (res) => {
        const sc = res.statusCode ?? 0;
        // Follow one redirect (common with Cloudflare setups)
        if (sc >= 300 && sc < 400 && !followed && res.headers.location) {
          res.resume(); // drain
          resolve(this.fetchMtaStsPolicy(res.headers.location, true));
          return;
        }
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          if (sc !== 200) { resolve({ pass: false }); return; }
          const m = /^mode:\s*(\S+)/m.exec(body);
          const policy = m?.[1]?.trim();
          resolve({ pass: policy === 'enforce', policy });
        });
      });
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
      const ptrs = await this.dnsClient.reverse(addresses[0]);
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
          if (BLOCKED_RESOLVER_CODES.has(returnCode)) return { list, listed: false, blocked: true };
          return { list, listed: true };
        } catch {
          return { list, listed: false };
        }
      }),
    );
  }

  // ── New checks ───────────────────────────────────────────────────────────────

  /**
   * Domain registration expiry via RDAP (no API key needed).
   * Warns at 90 days, fails at 30 days.
   */
  private checkDomainExpiry(domain: string): Promise<{
    pass: boolean;
    daysUntilExpiry: number | null;
    expiresAt: string | null;
  }> {
    const unknown = { pass: true, daysUntilExpiry: null, expiresAt: null };
    return new Promise((resolve) => {
      const req = https.get(
        {
          hostname: 'rdap.org',
          path: `/domain/${encodeURIComponent(domain)}`,
          timeout: 8000,
          headers: { Accept: 'application/json', 'User-Agent': 'SureSend-Monitor/1.0' },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              const expiryEvent = (data.events as { eventAction: string; eventDate: string }[])
                ?.find((e) => e.eventAction === 'expiration');
              if (!expiryEvent?.eventDate) { resolve(unknown); return; }
              const expiry = new Date(expiryEvent.eventDate);
              const daysUntilExpiry = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
              resolve({
                pass: daysUntilExpiry > 30,
                daysUntilExpiry,
                expiresAt: expiry.toISOString(),
              });
            } catch {
              resolve(unknown);
            }
          });
        },
      );
      req.on('error', () => resolve(unknown));
      req.on('timeout', () => { req.destroy(); resolve(unknown); });
    });
  }

  /**
   * DNSSEC — checks for DNSKEY records via Google DNS-over-HTTPS.
   * Returns pass if DNSKEY records are found for the domain.
   */
  private checkDnssec(domain: string): Promise<{ pass: boolean }> {
    return new Promise((resolve) => {
      const req = https.get(
        {
          hostname: 'dns.google',
          path: `/resolve?name=${encodeURIComponent(domain)}&type=DNSKEY`,
          timeout: 5000,
          headers: { Accept: 'application/dns-json' },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              const hasDnskey =
                data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
              resolve({ pass: hasDnskey });
            } catch {
              resolve({ pass: false });
            }
          });
        },
      );
      req.on('error', () => resolve({ pass: false }));
      req.on('timeout', () => { req.destroy(); resolve({ pass: false }); });
    });
  }

  /**
   * www redirect consistency — checks that http://www.domain redirects to HTTPS.
   * Returns exists:false if the www subdomain doesn't resolve.
   */
  private checkWwwRedirect(domain: string): Promise<{ pass: boolean; exists: boolean }> {
    return new Promise((resolve) => {
      const req = http.get(
        { hostname: `www.${domain}`, path: '/', port: 80, timeout: 5000 },
        (res) => {
          const sc = res.statusCode ?? 0;
          const loc = res.headers.location ?? '';
          resolve({ pass: sc >= 300 && sc < 400 && loc.startsWith('https://'), exists: true });
        },
      );
      req.on('error', (err: NodeJS.ErrnoException) => {
        const notFound = err.code === 'ENOTFOUND' || err.code === 'EAI_NONAME';
        resolve({ pass: false, exists: !notFound });
      });
      req.on('timeout', () => { req.destroy(); resolve({ pass: false, exists: true }); });
    });
  }

  // ── External security assessments ────────────────────────────────────────────

  private httpsGetJson(hostname: string, path: string): Promise<{ status: number; json: unknown }> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        { hostname, path, timeout: 8000, headers: { 'User-Agent': 'SureSend-Monitor/1.0', Accept: 'application/json' } },
        (res) => {
          let body = '';
          res.on('data', (c: Buffer) => { body += c.toString(); });
          res.on('end', () => {
            try { resolve({ status: res.statusCode ?? 0, json: JSON.parse(body) }); }
            catch { resolve({ status: res.statusCode ?? 0, json: {} }); }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  private httpsPostJson(hostname: string, path: string, body: string): Promise<{ status: number; json: unknown }> {
    return new Promise((resolve, reject) => {
      const buf = Buffer.from(body, 'utf8');
      const req = https.request(
        { method: 'POST', hostname, path, timeout: 8000, headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length, 'User-Agent': 'SureSend-Monitor/1.0' } },
        (res) => {
          let resp = '';
          res.on('data', (c: Buffer) => { resp += c.toString(); });
          res.on('end', () => {
            try { resolve({ status: res.statusCode ?? 0, json: JSON.parse(resp) }); }
            catch { resolve({ status: res.statusCode ?? 0, json: {} }); }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(buf);
      req.end();
    });
  }

  /**
   * Mozilla Observatory v2 — grades HTTP security header configuration.
   * The v1 API was shut down Oct 31 2024; v2 is synchronous (no polling needed).
   * Grade A/A+ = pass.
   */
  private async checkMozillaObservatory(
    domain: string,
  ): Promise<{ pass: boolean; grade: string | null; score: number | null }> {
    const fail = { pass: false, grade: null as string | null, score: null as number | null };
    try {
      const res = await this.httpsPostJson(
        'observatory-api.mdn.mozilla.net',
        `/api/v2/scan?host=${encodeURIComponent(domain)}`,
        '',
      );
      if (res.status !== 200) return fail;
      const data = res.json as { grade?: string; score?: number; error?: string };
      if (data.error || !data.grade) return fail;
      const grade = data.grade;
      return { pass: grade.startsWith('A'), grade, score: data.score ?? null };
    } catch {
      return fail;
    }
  }

  /**
   * Google Safe Browsing v4 — checks for malware / phishing.
   * Skipped (returns pass) when GOOGLE_SAFE_BROWSING_API_KEY is not set.
   */
  private async checkGoogleSafeBrowsing(
    domain: string,
  ): Promise<{ pass: boolean; threats: string[] }> {
    const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!apiKey) return { pass: true, threats: [] };
    try {
      const body = JSON.stringify({
        client: { clientId: 'suresend-monitor', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: `https://${domain}/` }],
        },
      });
      const res = await this.httpsPostJson(
        'safebrowsing.googleapis.com',
        `/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
        body,
      );
      if (res.status !== 200) return { pass: true, threats: [] };
      const data = res.json as { matches?: { threatType: string }[] };
      const threats = (data.matches ?? []).map((m) => m.threatType);
      return { pass: threats.length === 0, threats };
    } catch {
      return { pass: true, threats: [] }; // fail open — don't penalise on API error
    }
  }

  /**
   * Qualys SSL Labs v4 — deep SSL/TLS grading.
   * Tries the cache first; if no cached result, kicks off a background scan and
   * returns pending=true. The next run (60-90s later) will hit the cache.
   * v3 was deprecated Dec 31 2023; now uses v4.
   */
  private async checkSslLabs(
    domain: string,
  ): Promise<{ pass: boolean; grade: string | null; pending: boolean }> {
    const fail = { pass: false, grade: null as string | null, pending: false };

    const extractGrade = (data: Record<string, unknown>): string | null =>
      ((data.endpoints as { grade?: string }[] | undefined)?.[0]?.grade) ?? null;

    try {
      // 1. Try cache (v4 endpoint)
      const cached = await this.httpsGetJson(
        'api.ssllabs.com',
        `/api/v4/analyze?host=${encodeURIComponent(domain)}&fromCache=on&maxAge=24&all=done`,
      );
      const cachedData = cached.json as Record<string, unknown>;
      if (cachedData.status === 'READY') {
        const grade = extractGrade(cachedData);
        if (grade) return { pass: !grade.startsWith('F') && grade !== 'T', grade, pending: false };
      }

      // 2. Not cached — kick off scan in the background and return pending.
      //    SSL Labs takes 60-90s minimum; the next scan run will hit the cache.
      this.httpsGetJson(
        'api.ssllabs.com',
        `/api/v4/analyze?host=${encodeURIComponent(domain)}&startNew=on&all=done`,
      ).catch(() => {});
      return { pass: false, grade: null, pending: true };
    } catch {
      return fail;
    }
  }

  // ── Scoring ──────────────────────────────────────────────────────────────────

  /**
   * Email reputation score (0–100).
   * Covers: MX, SPF (+ lookup count), DMARC (+ pct), DKIM, MTA-STS,
   *         TLS-RPT, PTR, IP blacklists, DBL.
   */
  private calcEmailScore(details: CheckDetails): number {
    let score = 100;

    if (!details.mx.pass) score -= 30;

    if (!details.spf.pass) {
      score -= 15;
    } else {
      if (details.spf.policy === 'pass_all') score -= 5;
      else if (details.spf.policy === 'permissive') score -= 5;
      else if (details.spf.policy === 'soft_fail') score -= 3;
      // SPF lookup count (RFC limit = 10)
      const lookups = details.spf.lookups ?? 0;
      if (lookups > 10) score -= 8;       // permerror — SPF fails for all senders
      else if (lookups >= 8) score -= 3;  // approaching limit
    }

    if (!details.dmarc.pass) {
      score -= 15;
    } else {
      if (details.dmarc.policy === 'none') score -= 5;
      else if (details.dmarc.policy === 'quarantine') score -= 2;
      if (details.dmarc.hasRua === false) score -= 2;
      if (details.dmarc.pct !== undefined && details.dmarc.pct < 100) score -= 3;
    }

    if (!details.dkim.pass) score -= 10;

    if (details.mtaSts && !details.mtaSts.pass) score -= 5;
    if (details.tlsRpt && !details.tlsRpt.pass) score -= 3;

    if (details.ptr && !details.ptr.pass) score -= 5;

    for (const bl of details.blacklists) {
      if (bl.listed) score -= 20;
    }
    if (details.dbl?.listed) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Web reputation score (0–100).
   * Covers: HTTPS, redirect, SSL, security headers (HSTS, CSP, Referrer,
   *         Permissions), TLS version, NS count, CAA, DNSSEC,
   *         www redirect, domain expiry.
   */
  private calcWebScore(details: CheckDetails): number {
    let score = 100;

    if (!details.https.pass) {
      score -= 30;
    } else {
      if (details.httpsRedirect && !details.httpsRedirect.pass) score -= 5;

      if (details.ssl) {
        if (!details.ssl.pass) score -= 20;
        else if (details.ssl.daysUntilExpiry !== null) {
          if (details.ssl.daysUntilExpiry < 14) score -= 10;
          else if (details.ssl.daysUntilExpiry < 30) score -= 3;
        }
      }

      if (details.tlsVersion && !details.tlsVersion.pass) score -= 8;

      if (details.securityHeaders) {
        if (!details.securityHeaders.hsts) score -= 5;
        if (!details.securityHeaders.csp) score -= 5;
        if (!details.securityHeaders.xContentTypeOptions) score -= 3;
        if (!details.securityHeaders.xFrameOptions) score -= 3;
        if (!details.securityHeaders.referrerPolicy) score -= 2;
        if (!details.securityHeaders.permissionsPolicy) score -= 2;
      }

      if (details.wwwRedirect?.exists && !details.wwwRedirect.pass) score -= 3;
    }

    if (details.nsCount && !details.nsCount.pass) score -= 8;
    if (details.caa && !details.caa.pass) score -= 5;
    if (details.dnssec && !details.dnssec.pass) score -= 8;

    // External assessments
    if (details.safeBrowsing && !details.safeBrowsing.pass) score -= 25;
    if (details.observatory?.grade) {
      const g = details.observatory.grade;
      if (g.startsWith('F')) score -= 10;
      else if (g.startsWith('D')) score -= 5;
      else if (g.startsWith('C')) score -= 3;
    }

    if (details.domainExpiry?.daysUntilExpiry !== null && details.domainExpiry?.daysUntilExpiry !== undefined) {
      const days = details.domainExpiry.daysUntilExpiry;
      if (days <= 0) score -= 25;
      else if (days <= 7) score -= 20;
      else if (days <= 30) score -= 12;
      else if (days <= 90) score -= 5;
    }

    return Math.max(0, score);
  }

  private score(details: CheckDetails): {
    score: number;
    emailScore: number;
    webScore: number;
    status: 'clean' | 'warning' | 'critical';
  } {
    const emailScore = this.calcEmailScore(details);
    const webScore = this.calcWebScore(details);
    const score = Math.max(0, Math.round(emailScore * 0.6 + webScore * 0.4));
    const status = score >= 80 ? 'clean' : score >= 50 ? 'warning' : 'critical';
    return { score, emailScore, webScore, status };
  }
}
