import { BadRequestException, Injectable } from '@nestjs/common';

const CF_BASE = 'https://api.cloudflare.com/client/v4';

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors: { message: string }[];
}

interface CfRecord {
  id: string;
  name: string;
  content?: string;
  type: string;
}

@Injectable()
export class CloudflareService {
  // ── HTTP helper ─────────────────────────────────────────────────────────────

  private async cfFetch<T>(
    token: string,
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${CF_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json()) as CfResponse<T>;
    if (!data.success) {
      throw new BadRequestException(
        data.errors?.[0]?.message ?? 'Cloudflare API error',
      );
    }
    return data.result;
  }

  // ── Zone lookup ─────────────────────────────────────────────────────────────

  async findZoneId(token: string, domain: string): Promise<string | null> {
    const result = await this.cfFetch<{ id: string; name: string }[]>(
      token,
      `/zones?name=${encodeURIComponent(domain)}`,
    );
    return result[0]?.id ?? null;
  }

  async validateToken(token: string, domain: string): Promise<string> {
    const zoneId = await this.findZoneId(token, domain);
    if (!zoneId) {
      throw new BadRequestException(
        `No Cloudflare zone found for "${domain}". Ensure the domain is added to your Cloudflare account and the token has Zone:DNS:Edit permission.`,
      );
    }
    return zoneId;
  }

  // ── CNAME record upsert ──────────────────────────────────────────────────────

  private async upsertCnameRecord(
    token: string,
    zoneId: string,
    name: string,
    content: string,
  ): Promise<void> {
    const existing = await this.cfFetch<CfRecord[]>(
      token,
      `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`,
    );
    if (existing.length > 0) {
      await this.cfFetch(
        token,
        `/zones/${zoneId}/dns_records/${existing[0].id}`,
        'PUT',
        { type: 'CNAME', name, content, ttl: 3600, proxied: false },
      );
    } else {
      await this.cfFetch(token, `/zones/${zoneId}/dns_records`, 'POST', {
        type: 'CNAME', name, content, ttl: 3600, proxied: false,
      });
    }
  }

  // ── TXT record upsert ────────────────────────────────────────────────────────

  private async upsertTxtRecord(
    token: string,
    zoneId: string,
    name: string,
    content: string,
  ): Promise<void> {
    const existing = await this.cfFetch<CfRecord[]>(
      token,
      `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`,
    );

    const quoted = `"${content}"`;

    if (existing.length > 0) {
      await this.cfFetch(
        token,
        `/zones/${zoneId}/dns_records/${existing[0].id}`,
        'PUT',
        { type: 'TXT', name, content: quoted, ttl: 3600 },
      );
    } else {
      await this.cfFetch(token, `/zones/${zoneId}/dns_records`, 'POST', {
        type: 'TXT',
        name,
        content: quoted,
        ttl: 3600,
      });
    }
  }

  // ── CAA record creation ──────────────────────────────────────────────────────

  private async createCaaRecords(
    token: string,
    zoneId: string,
    domain: string,
  ): Promise<void> {
    const existing = await this.cfFetch<CfRecord[]>(
      token,
      `/zones/${zoneId}/dns_records?type=CAA&name=${encodeURIComponent(domain)}`,
    );

    if (existing.length > 0) return; // Already has CAA records — don't overwrite

    const entries = [
      { tag: 'issue', value: 'letsencrypt.org' },
      { tag: 'issuewild', value: 'letsencrypt.org' },
      { tag: 'iodef', value: `mailto:security@${domain}` },
    ];

    for (const entry of entries) {
      await this.cfFetch(token, `/zones/${zoneId}/dns_records`, 'POST', {
        type: 'CAA',
        name: domain,
        data: { flags: 0, tag: entry.tag, value: entry.value },
        ttl: 3600,
      });
    }
  }

  // ── Public: apply fix ────────────────────────────────────────────────────────

  async applyFix(
    token: string,
    domain: string,
    check: string,
    payload?: Record<string, unknown>,
  ): Promise<{ record: string; action: string }> {
    const zoneId = await this.validateToken(token, domain);

    switch (check) {
      case 'spf': {
        const content = 'v=spf1 mx ~all';
        await this.upsertTxtRecord(token, zoneId, domain, content);
        return { record: content, action: 'TXT record upserted at ' + domain };
      }

      case 'dmarc': {
        const content = `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`;
        await this.upsertTxtRecord(token, zoneId, `_dmarc.${domain}`, content);
        return { record: content, action: `TXT record upserted at _dmarc.${domain}` };
      }

      case 'mtaSts': {
        // id must change when the policy changes, so use current timestamp
        const id = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
        const content = `v=STSv1; id=${id}`;
        await this.upsertTxtRecord(token, zoneId, `_mta-sts.${domain}`, content);
        return { record: content, action: `TXT record upserted at _mta-sts.${domain}` };
      }

      case 'tlsRpt': {
        const content = `v=TLSRPTv1; rua=mailto:tlsrpt@${domain}`;
        await this.upsertTxtRecord(token, zoneId, `_smtp._tls.${domain}`, content);
        return { record: content, action: `TXT record upserted at _smtp._tls.${domain}` };
      }

      case 'caa': {
        await this.createCaaRecords(token, zoneId, domain);
        return {
          record: '0 issue "letsencrypt.org", 0 issuewild "letsencrypt.org"',
          action: `CAA records created at ${domain}`,
        };
      }

      case 'dnssec': {
        await this.cfFetch(token, `/zones/${zoneId}/dnssec`, 'PATCH', { status: 'active' });
        return { record: 'status=active', action: `DNSSEC enabled for zone ${domain}` };
      }

      case 'dkim-google': {
        const record = payload?.record as string | undefined;
        const selector = (payload?.selector as string | undefined) || 'google';
        if (!record) throw new BadRequestException('record is required for dkim-google fix');
        await this.upsertTxtRecord(token, zoneId, `${selector}._domainkey.${domain}`, record);
        return { record, action: `TXT record created at ${selector}._domainkey.${domain}` };
      }

      case 'dkim-microsoft': {
        const tenantDomain = payload?.tenantDomain as string | undefined;
        if (!tenantDomain) throw new BadRequestException('tenantDomain is required for dkim-microsoft fix');
        const subdomain = domain.replace(/\./g, '-');
        const created: string[] = [];
        for (const sel of ['selector1', 'selector2']) {
          const name = `${sel}._domainkey.${domain}`;
          const content = `${sel}-${subdomain}._domainkey.${tenantDomain}`;
          await this.upsertCnameRecord(token, zoneId, name, content);
          created.push(`${name} → ${content}`);
        }
        return {
          record: created.join(' | '),
          action: `CNAME records created at selector1 and selector2._domainkey.${domain}`,
        };
      }

      default:
        throw new BadRequestException(
          `"${check}" cannot be auto-fixed via Cloudflare DNS`,
        );
    }
  }
}
