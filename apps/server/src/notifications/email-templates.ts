type EmailTone = 'info' | 'success' | 'warning' | 'danger';

type EmailDetail = {
  label: string;
  value: string;
};

type EmailCta = {
  label: string;
  url: string;
};

const TONE_STYLES: Record<
  EmailTone,
  {
    accent: string;
    accentSoft: string;
    badgeText: string;
    badgeBg: string;
  }
> = {
  info: {
    accent: '#0f766e',
    accentSoft: 'rgba(15, 118, 110, 0.12)',
    badgeText: '#115e59',
    badgeBg: '#ccfbf1',
  },
  success: {
    accent: '#15803d',
    accentSoft: 'rgba(21, 128, 61, 0.12)',
    badgeText: '#166534',
    badgeBg: '#dcfce7',
  },
  warning: {
    accent: '#b45309',
    accentSoft: 'rgba(180, 83, 9, 0.12)',
    badgeText: '#92400e',
    badgeBg: '#fef3c7',
  },
  danger: {
    accent: '#be123c',
    accentSoft: 'rgba(190, 18, 60, 0.12)',
    badgeText: '#9f1239',
    badgeBg: '#ffe4e6',
  },
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDetails(details: EmailDetail[]) {
  if (details.length === 0) {
    return '';
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;border-collapse:separate;border-spacing:0 10px;">
      ${details
        .map(
          (detail) => `
        <tr>
          <td style="width:38%;padding:0 14px 0 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;vertical-align:top;">
            ${escapeHtml(detail.label)}
          </td>
          <td style="padding:0;font-size:14px;line-height:1.7;color:#0f172a;font-weight:600;vertical-align:top;">
            ${escapeHtml(detail.value)}
          </td>
        </tr>`,
        )
        .join('')}
    </table>
  `;
}

export function buildBaseEmailTemplate(options: {
  eyebrow: string;
  title: string;
  intro: string;
  tone?: EmailTone;
  details?: EmailDetail[];
  cta?: EmailCta;
  note?: string;
}) {
  const tone = options.tone ?? 'info';
  const styles = TONE_STYLES[tone];
  const ctaHtml = options.cta
    ? `
      <p style="margin:26px 0 0;">
        <a href="${escapeHtml(options.cta.url)}" style="display:inline-block;background:${styles.accent};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;letter-spacing:0.01em;">
          ${escapeHtml(options.cta.label)}
        </a>
      </p>
    `
    : '';
  const note = options.note ?? 'If you did not request this action, you can safely ignore this email.';

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:28px;background:#eef2ff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #dbeafe;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(15, 23, 42, 0.08);">
            <tr>
              <td style="padding:0;">
                <div style="padding:28px 32px;background:linear-gradient(135deg, #eff6ff 0%, #ffffff 58%, ${styles.accentSoft} 100%);border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 14px;">
                    <span style="display:inline-flex;align-items:center;border-radius:999px;padding:7px 12px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;color:${styles.badgeText};background:${styles.badgeBg};">
                      ${escapeHtml(options.eyebrow)}
                    </span>
                  </p>
                  <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.24em;text-transform:uppercase;color:#475569;font-weight:800;">
                    TradePilot
                  </p>
                  <h1 style="margin:0;font-size:32px;line-height:1.1;letter-spacing:-0.03em;color:#0f172a;">
                    ${escapeHtml(options.title)}
                  </h1>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 34px;">
                <p style="margin:0;font-size:15px;line-height:1.9;color:#334155;">
                  ${escapeHtml(options.intro)}
                </p>
                ${renderDetails(options.details ?? [])}
                ${ctaHtml}
                <p style="margin:28px 0 0;font-size:12px;line-height:1.8;color:#64748b;border-top:1px solid #e2e8f0;padding-top:18px;">
                  ${escapeHtml(note)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildEmailChangeVerificationTemplate(verificationUrl: string) {
  return buildBaseEmailTemplate({
    eyebrow: 'Account Security',
    title: 'Confirm your new email',
    intro:
      'A request was made to change the email address on your TradePilot account. Confirm the new address to finish the update securely.',
    tone: 'info',
    details: [
      { label: 'Action', value: 'Email address change requested' },
      { label: 'Verification', value: 'Open the secure confirmation link below' },
    ],
    cta: {
      label: 'Confirm email change',
      url: verificationUrl,
    },
  });
}

export function buildPasswordResetTemplate(resetUrl: string) {
  return buildBaseEmailTemplate({
    eyebrow: 'Account Security',
    title: 'Reset your TradePilot password',
    intro:
      'Use the secure link below to reset your password. For your protection, the link expires automatically.',
    tone: 'warning',
    details: [
      { label: 'Action', value: 'Password reset requested' },
      { label: 'Security', value: 'Link expires automatically after a short window' },
    ],
    cta: {
      label: 'Reset password',
      url: resetUrl,
    },
  });
}

export function buildAlertTemplate(
  title: string,
  message: string,
  options?: {
    tone?: EmailTone;
    eyebrow?: string;
    details?: EmailDetail[];
  },
) {
  return buildBaseEmailTemplate({
    eyebrow: options?.eyebrow ?? 'Trading Alert',
    title,
    intro: message,
    tone: options?.tone ?? 'info',
    details: options?.details ?? [],
    note: 'You are receiving this because the matching notification event is enabled in your TradePilot settings.',
  });
}
