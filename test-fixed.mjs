import { Resend } from 'resend';

const apiKey = process.argv[2];
const resend = new Resend(apiKey);

const stripePortalUrl = 'https://billing.stripe.com/p/session/test_1234567890';
const unsubscribeUrl = 'https://maitreo.com/email-preferences';

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Maitreo Activation</title>
</head>
<body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f2f2f0; margin: 0; padding: 40px 20px;">
<div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">

<!-- HEADER WITH LOGO -->
<div style="padding: 60px 40px 50px; text-align: center; border-bottom: 1px solid #e5e5e5;">
<svg width="48" height="48" viewBox="0 0 1000 1000" style="margin: 0 auto 16px; display: block;">
<path fill="#000000" d="M500,999.94C224.3,999.94,0,775.65,0,499.95S224.3-.05,500-.05s500,224.3,500,500-224.3,500-500,500ZM500,71.92c-236.01,0-428.02,192.01-428.02,428.02s192.01,428.02,428.02,428.02,428.02-192.01,428.02-428.02S736.02,71.92,500,71.92Z"/>
<rect fill="#000000" x="679.07" y="244.75" width="71.98" height="510.39"/>
<rect fill="#000000" x="175.33" y="463.96" width="649.33" height="71.98"/>
<rect fill="#000000" x="472.05" y="293.72" width="71.97" height="349.04"/>
<rect fill="#000000" x="265.02" y="244.75" width="71.98" height="510.39"/>
</svg>
<div style="font-size: 11px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; color: #1a1a1a;">Maitreo</div>
</div>

<!-- MAIN CONTENT -->
<div style="padding: 60px 40px;">

<h1 style="font-size: 28px; font-weight: 300; color: #1a1a1a; margin: 0 0 40px; line-height: 1.3;">Maitreo is now active for your restaurant.</h1>

<p style="font-size: 15px; color: #4a4a4a; line-height: 1.7; margin: 0 0 24px;">Your Google Business Profile is now being monitored. Every new review will be analyzed instantly, and you'll receive an SMS alert with a drafted response ready for your approval.</p>

<p style="font-size: 15px; color: #4a4a4a; line-height: 1.7; margin: 0 0 48px;">No dashboard. No logins. Just a text when something needs attention.</p>

<div style="height: 1px; background: #e5e5e5; margin: 0 0 48px;"></div>

<h2 style="font-size: 11px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: #999; margin: 0 0 32px;">When a review arrives</h2>

<table style="width: 100%; border-collapse: collapse; margin: 0 0 48px;">
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">APPROVE</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Post the reply instantly</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">EDIT</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Revise before posting</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">IGNORE</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Mark as handled</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">PAUSE</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Temporarily stop monitoring</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">RESUME</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Restart monitoring</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">STATUS</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Check system status</td>
</tr>
<tr style="border-bottom: 1px solid #f0f0f0;">
<td style="padding: 14px 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; width: 100px;">BILLING</td>
<td style="padding: 14px 0 14px 24px; font-size: 13px; color: #666;">Manage subscription</td>
</tr>
</table>

<div style="height: 1px; background: #e5e5e5; margin: 0 0 48px;"></div>

<h2 style="font-size: 11px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; color: #999; margin: 0 0 16px;">Your Subscription</h2>

<p style="font-size: 14px; color: #4a4a4a; line-height: 1.7; margin: 0 0 20px;">Your subscription is active. To manage billing, update your card, or cancel at any time, simply reply <span style="font-family: 'Courier New', monospace; font-weight: 700;">BILLING</span> to any Maitreo message.</p>

<a href="${stripePortalUrl}" style="display: inline-block; font-size: 12px; color: #1a1a1a; text-decoration: none; border-bottom: 1px solid #1a1a1a; padding-bottom: 4px; margin-top: 16px;">Manage or cancel your subscription →</a>

<div style="text-align: center; margin-top: 60px; padding-top: 48px; border-top: 1px solid #e5e5e5;">
<div style="font-family: 'Playfair Display', serif; font-style: italic; font-size: 24px; color: #1a1a1a; margin-bottom: 32px;">Reputation, handled.</div>
<div style="display: inline-block; padding: 6px 14px; background: #fcfcfb; border: 1px solid #e0e0e0; border-radius: 20px;">
<span style="display: inline-block; width: 6px; height: 6px; background: #4ade80; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span>
<span style="font-size: 8px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #1a1a1a;">Active Monitoring</span>
</div>
</div>

</div>

<!-- FOOTER -->
<div style="background: #fafaf8; padding: 40px; text-align: center; border-top: 1px solid #f0f0f0; font-size: 11px; color: #888;">
<p style="margin: 0 0 12px; color: #999; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">© 2025 Maitreo Inc.</p>
<p style="margin: 0;">
<a href="mailto:hello@maitreo.com" style="color: #888; text-decoration: none;">hello@maitreo.com</a>
<span style="color: #ccc; margin: 0 8px;">|</span>
<a href="${stripePortalUrl}" style="color: #888; text-decoration: none;">Manage subscription</a>
<span style="color: #ccc; margin: 0 8px;">|</span>
<a href="${unsubscribeUrl}" style="color: #888; text-decoration: none;">Email preferences</a>
</p>
</div>

</div>
</body>
</html>`;

(async () => {
  try {
    const result = await resend.emails.send({
      from: 'noreply@maitreo.com',
      to: 'kevin.j.reyes@gmail.com',
      subject: 'Maitreo is now active for your restaurant',
      html,
    });
    console.log('✅ Fixed email sent!');
    console.log('ID:', result.data?.id);
  } catch (error) {
    console.error('Exception:', error.message);
  }
})();
