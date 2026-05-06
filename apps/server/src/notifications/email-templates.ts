export function buildBaseEmailTemplate(title: string, intro: string, cta?: {
  label: string;
  url: string;
}) {
  const ctaHtml = cta
    ? `<p style="margin:24px 0;">
        <a href="${cta.url}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">${cta.label}</a>
      </p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;color:#0369a1;text-transform:uppercase;font-weight:700;">TradePilot</p>
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;">${title}</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155;">${intro}</p>
                ${ctaHtml}
                <p style="margin:20px 0 0;font-size:12px;color:#64748b;">If you did not request this action, you can ignore this email.</p>
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
  const title = 'Confirm your new email';
  const intro =
    'A request was made to change your TradePilot account email. Confirm the new address to finalize the update.';

  return buildBaseEmailTemplate(title, intro, {
    label: 'Confirm email change',
    url: verificationUrl,
  });
}

export function buildPasswordResetTemplate(resetUrl: string) {
  const title = 'Reset your TradePilot password';
  const intro =
    'Use this secure link to reset your password. The link expires automatically for your security.';

  return buildBaseEmailTemplate(title, intro, {
    label: 'Reset password',
    url: resetUrl,
  });
}

export function buildAlertTemplate(title: string, message: string) {
  return buildBaseEmailTemplate(title, message);
}
