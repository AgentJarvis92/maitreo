import { Resend } from 'resend';

const apiKey = process.argv[2];
const resend = new Resend(apiKey);

const stripePortalUrl = 'https://billing.stripe.com/p/session/test_1234567890';
const unsubscribeUrl = 'https://maitreo.com/email-preferences';

const html = `<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maitreo Activation</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f2f2f0; color: #1a1a1a; margin: 0; padding: 40px 16px; }
        .email-wrapper { background-color: #ffffff; max-width: 600px; margin: 0 auto; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.05); }
        header { padding: 48px 32px 40px; text-align: center; border-bottom: 1px solid #e5e5e5; }
        header img { width: 32px; height: 32px; margin-bottom: 12px; }
        header span { font-size: 10px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: #1a1a1a; }
        main { padding: 80px 32px 56px 56px; }
        h1 { font-size: 32px; line-height: 1.15; font-weight: 300; color: #1a1a1a; margin: 0 0 32px; }
        .intro { font-size: 15px; line-height: 1.6; color: #4a4a4a; font-weight: 300; margin-bottom: 24px; }
        .divider { height: 1px; background: #e5e5e5; margin: 48px 0; border: none; }
        h2 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #999999; font-weight: 500; margin: 0 0 32px; }
        .command-row { display: flex; align-items: baseline; border-bottom: 1px solid #f0f0f0; padding: 14px 0; }
        .command-key { width: 112px; flex-shrink: 0; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #1a1a1a; }
        .command-desc { flex-grow: 1; font-size: 13px; color: #666666; }
        .tagline { font-family: 'Playfair Display', serif; font-style: italic; font-size: 26px; color: #1a1a1a; margin: 0 0 40px; }
        .monitoring-badge { display: inline-flex; align-items: center; gap: 10px; padding: 6px 16px; background: #fcfcfb; border: 1px solid #ebebeb; border-radius: 999px; }
        .monitoring-dot { width: 6px; height: 6px; background: #4ade80; border-radius: 50%; }
        footer { background: #fafaf8; padding: 32px; border-top: 1px solid #f0f0f0; text-align: center; }
        footer p { font-size: 10px; color: #999999; margin: 0 0 12px; }
        .footer-links { font-size: 11px; color: #888888; }
        .footer-links a { color: #888888; text-decoration: none; }
        .divider-text { color: #cccccc; margin: 0 4px; }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <header>
            <img src="https://maitreo.com/logo.svg" alt="Maitreo" onerror="this.style.display='none'">
            <span>Maitreo</span>
        </header>
        <main>
            <div>
                <h1>Maitreo is now active<br>for Test Restaurant.</h1>
                <p class="intro">Your Google Business Profile is now being monitored. Every new review will be analyzed instantly, and you'll receive an SMS alert with a drafted response ready for your approval.</p>
                <p class="intro">No dashboard. No logins. Just a text when something needs attention.</p>
            </div>
            <hr class="divider">
            <div>
                <h2>When a review arrives</h2>
                <div class="command-row"><div class="command-key">APPROVE</div><div class="command-desc">Post the reply instantly</div></div>
                <div class="command-row"><div class="command-key">EDIT</div><div class="command-desc">Revise before posting</div></div>
                <div class="command-row"><div class="command-key">IGNORE</div><div class="command-desc">Mark as handled</div></div>
                <div class="command-row"><div class="command-key">PAUSE</div><div class="command-desc">Temporarily stop monitoring</div></div>
                <div class="command-row"><div class="command-key">RESUME</div><div class="command-desc">Restart monitoring</div></div>
                <div class="command-row"><div class="command-key">STATUS</div><div class="command-desc">Check system status</div></div>
                <div class="command-row"><div class="command-key">BILLING</div><div class="command-desc">Manage subscription</div></div>
            </div>
            <hr class="divider">
            <div>
                <h2>Your Subscription</h2>
                <p>Your subscription is active. To manage billing, update your card, or cancel at any time, simply reply <span style="font-family: 'Courier New';">BILLING</span> to any Maitreo message.</p>
                <a href="${stripePortalUrl}" style="font-size: 12px; color: #1a1a1a; border-bottom: 1px solid #1a1a1a; text-decoration: none;">Manage or cancel your subscription →</a>
            </div>
            <div style="text-align: center; padding: 32px 0;">
                <div class="tagline">Reputation, handled.</div>
                <div class="monitoring-badge">
                    <div class="monitoring-dot"></div>
                    <span style="font-size: 9px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #1a1a1a;">Active Monitoring</span>
                </div>
            </div>
        </main>
        <footer>
            <p>© 2025 Maitreo Inc.</p>
            <div class="footer-links">
                <a href="mailto:hello@maitreo.com">hello@maitreo.com</a>
                <span class="divider-text">|</span>
                <a href="${stripePortalUrl}">Manage subscription</a>
                <span class="divider-text">|</span>
                <a href="${unsubscribeUrl}">Email preferences</a>
            </div>
        </footer>
    </div>
</body>
</html>`;

(async () => {
  try {
    const result = await resend.emails.send({
      from: 'noreply@maitreo.com',
      to: 'kevin.j.reyes@gmail.com',
      subject: 'Maitreo is now active for Test Restaurant',
      html,
    });
    console.log('✅ Email sent (lowercase)');
    console.log('ID:', result.data?.id);
    if (result.error) console.log('Error:', result.error);
  } catch (error) {
    console.error('Exception:', error.message);
  }
})();
