import { Injectable, Logger } from '@nestjs/common';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { SettingsService } from '../settings/settings.service';

export interface ReportPayload {
  domainName: string;
  score: number;
  emailScore: number;
  webScore: number;
  status: 'clean' | 'warning' | 'critical';
  checkedAt: Date;
  details: Record<string, unknown>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly settingsService: SettingsService) {}

  private async getConfig(): Promise<{ apiKey: string; domain: string; from: string } | null> {
    const cfg = await this.settingsService.getEmailConfig();
    const apiKey = cfg.apiKey ?? process.env.MAILGUN_API_KEY ?? null;
    const domain = cfg.domain ?? process.env.MAILGUN_DOMAIN ?? null;
    if (!apiKey || !domain) return null;
    const from = cfg.from ?? process.env.MAILGUN_FROM ?? `noreply@${domain}`;
    return { apiKey, domain, from };
  }

  async sendReputationReport(toEmail: string, report: ReportPayload): Promise<void> {
    const config = await this.getConfig();
    if (!config) {
      this.logger.debug('Mailgun not configured — skipping email report');
      return;
    }

    const mg = new Mailgun(FormData).client({ username: 'api', key: config.apiKey });

    try {
      await mg.messages.create(config.domain, {
        from: config.from,
        to: [toEmail],
        subject: `SureSend Report — ${report.domainName} (${report.status})`,
        html: buildReportHtml(report),
      });
      this.logger.log(`Report sent to ${toEmail} for ${report.domainName}`);
    } catch (err) {
      this.logger.error(`Failed to send report to ${toEmail}: ${String(err)}`);
    }
  }
}

// ── HTML builder ─────────────────────────────────────────────────────────────

function statusColor(s: string): string {
  return s === 'clean' ? '#10b981' : s === 'warning' ? '#f59e0b' : '#ef4444';
}

function row(label: string, pass: boolean, detail?: string): string {
  const icon = pass ? '✓' : '✗';
  const color = pass ? '#10b981' : '#ef4444';
  const detail_html = detail ? ` <span style="color:#94a3b8;font-size:12px;">(${detail})</span>` : '';
  return `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;">
    <span style="color:${color};font-weight:700;margin-right:8px;">${icon}</span>${label}${detail_html}
  </td></tr>`;
}

function section(title: string, rows: string): string {
  if (!rows) return '';
  return `
    <h3 style="margin:24px 0 8px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">${title}</h3>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <tbody>${rows}</tbody>
    </table>`;
}

function buildReportHtml(r: ReportPayload): string {
  const d = r.details as {
    mx?: { pass: boolean; records: string[] };
    spf?: { pass: boolean; policy?: string };
    dmarc?: { pass: boolean; policy?: string };
    dkim?: { pass: boolean; selector?: string | null };
    mtaSts?: { pass: boolean };
    tlsRpt?: { pass: boolean };
    https?: { pass: boolean; statusCode?: number | null };
    ssl?: { pass: boolean; daysUntilExpiry?: number | null };
    securityHeaders?: { hsts: boolean; csp: boolean; xFrameOptions: boolean; xContentTypeOptions: boolean };
    tlsVersion?: { pass: boolean; protocol?: string | null };
    blacklists?: { list: string; listed: boolean }[];
    dbl?: { listed: boolean };
    observatory?: { pass: boolean; grade: string | null; score: number | null };
    safeBrowsing?: { pass: boolean; threats: string[] };
    sslLabs?: { pass: boolean; grade: string | null; pending: boolean };
  };

  const emailRows = [
    d.mx ? row('MX Records', d.mx.pass) : '',
    d.spf ? row('SPF', d.spf.pass, d.spf.policy) : '',
    d.dmarc ? row('DMARC', d.dmarc.pass, d.dmarc.policy) : '',
    d.dkim ? row('DKIM', d.dkim.pass, d.dkim.selector ?? undefined) : '',
    d.mtaSts ? row('MTA-STS', d.mtaSts.pass) : '',
    d.tlsRpt ? row('TLS-RPT', d.tlsRpt.pass) : '',
  ].join('');

  const webRows = [
    d.https ? row('HTTPS', d.https.pass, d.https.statusCode?.toString() ?? undefined) : '',
    d.ssl ? row('SSL Certificate', d.ssl.pass, d.ssl.daysUntilExpiry != null ? `${d.ssl.daysUntilExpiry}d remaining` : undefined) : '',
    d.securityHeaders ? row('HSTS', d.securityHeaders.hsts) : '',
    d.securityHeaders ? row('Content Security Policy', d.securityHeaders.csp) : '',
    d.securityHeaders ? row('X-Frame-Options', d.securityHeaders.xFrameOptions) : '',
    d.securityHeaders ? row('X-Content-Type-Options', d.securityHeaders.xContentTypeOptions) : '',
    d.tlsVersion ? row('TLS Version', d.tlsVersion.pass, d.tlsVersion.protocol ?? undefined) : '',
  ].join('');

  const allClean = d.blacklists?.every((bl) => !bl.listed) && !d.dbl?.listed;
  const blacklistRows = allClean
    ? '<tr><td style="padding:6px 12px;font-size:14px;color:#10b981;">✓ Not listed on any blacklist</td></tr>'
    : [
        ...(d.blacklists ?? []).filter((bl) => bl.listed).map((bl) => row(bl.list, false, 'listed')),
        d.dbl?.listed ? row('Spamhaus DBL', false, 'listed') : '',
      ].join('');

  const externalRows = [
    d.observatory
      ? row('Mozilla Observatory', d.observatory.pass, d.observatory.grade ?? 'unavailable')
      : '',
    d.safeBrowsing
      ? row('Google Safe Browsing', d.safeBrowsing.pass, d.safeBrowsing.threats.length ? d.safeBrowsing.threats.join(', ') : 'clean')
      : '',
    d.sslLabs
      ? row('SSL Labs', d.sslLabs.pass, d.sslLabs.grade ?? (d.sslLabs.pending ? 'scan in progress — re-run to update' : 'unavailable'))
      : '',
  ].join('');

  const color = statusColor(r.status);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
<div style="max-width:600px;margin:0 auto;">

  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#0f172a;font-size:22px;margin:0 0 4px;">SureSend Security Report</h1>
    <p style="color:#64748b;margin:0;font-size:15px;">${r.domainName}</p>
  </div>

  <div style="background:${color};border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
    <div style="font-size:52px;font-weight:700;color:#fff;line-height:1;">${r.score}</div>
    <div style="color:rgba(255,255,255,0.9);font-size:13px;margin-top:6px;">
      ${r.status.toUpperCase()} &nbsp;·&nbsp; Email: ${r.emailScore} &nbsp;·&nbsp; Web: ${r.webScore}
    </div>
  </div>

  ${section('Email Reputation', emailRows)}
  ${section('Web Reputation', webRows)}
  ${section('Blacklists', blacklistRows)}
  ${externalRows ? section('External Assessments', externalRows) : ''}

  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:32px;">
    Generated by SureSend &nbsp;·&nbsp; ${new Date(r.checkedAt).toLocaleString()}
  </p>
</div>
</body></html>`;
}
