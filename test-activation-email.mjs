import { Resend } from 'resend';

const apiKey = process.argv[2];
const resend = new Resend(apiKey);

// Simulate actual Stripe customer portal URL
const stripeCustomerPortalUrl = 'https://billing.stripe.com/p/session/test_1234567890';

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maitreo Activation</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #f2f2f0;
      -webkit-font-smoothing: antialiased;
      color: #1a1a1a;
      margin: 0;
      padding: 40px 16px;
    }
    .email-wrapper {
      background-color: #ffffff;
      max-width: 600px;
      margin: 0 auto;
      box-shadow: 0 10px 40px -10px rgba(0,0,0,0.05);
      border-radius: 2px;
    }
    .header {
      padding: 48px 32px 40px;
      text-align: center;
      border-bottom: 1px solid #e5e5e5;
    }
    .logo {
      width: 32px;
      height: 32px;
      margin: 0 auto 12px;
    }
    .logo-text {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #1a1a1a;
      margin-top: 12px;
    }
    .main {
      padding: 56px 32px 56px 56px;
    }
    h1 {
      font-size: 32px;
      line-height: 1.15;
      font-weight: 300;
      color: #1a1a1a;
      margin: 0 0 32px;
      letter-spacing: -0.5px;
    }
    .intro {
      font-size: 15px;
      line-height: 1.6;
      color: #4a4a4a;
      font-weight: 300;
      margin-bottom: 24px;
      max-width: 480px;
    }
    .divider {
      height: 1px;
      background: #e5e5e5;
      margin: 48px 0;
      border: none;
    }
    .commands-section h2 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #999999;
      font-weight: 500;
      margin: 0 0 32px;
    }
    .command-row {
      display: flex;
      flex-direction: row;
      align-items: baseline;
      border-bottom: 1px solid #f0f0f0;
      padding: 14px 0;
    }
    .command-key {
      width: 112px;
      flex-shrink: 0;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: 1px;
    }
    .command-desc {
      flex-grow: 1;
      font-size: 13px;
      color: #666666;
      font-weight: 300;
    }
    .subscription-section h2 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #999999;
      font-weight: 500;
      margin: 0 0 16px;
    }
    .subscription-text {
      font-size: 14px;
      line-height: 1.6;
      color: #4a4a4a;
      font-weight: 300;
      max-width: 560px;
      margin-bottom: 20px;
    }
    .subscription-link {
      display: inline-block;
      font-size: 12px;
      color: #1a1a1a;
      text-decoration: none;
      border-bottom: 1px solid #1a1a1a;
      padding-bottom: 2px;
      letter-spacing: 0.5px;
      transition: color 0.2s;
      margin-top: 20px;
    }
    .subscription-link:hover {
      color: #555555;
      border-color: #555555;
    }
    .monospace {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      font-weight: 700;
    }
    .footer-section {
      text-align: center;
      padding-bottom: 32px;
    }
    .tagline {
      font-family: 'Playfair Display', serif;
      font-style: italic;
      font-size: 26px;
      color: #1a1a1a;
      margin: 0 0 40px;
    }
    .monitoring-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 16px;
      background: #fcfcfb;
      border: 1px solid #ebebeb;
      border-radius: 999px;
    }
    .monitoring-dot {
      width: 6px;
      height: 6px;
      background: #4ade80;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
      70% { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
      100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
    }
    .monitoring-text {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #1a1a1a;
    }
    .footer {
      background: #fafaf8;
      padding: 32px;
      border-top: 1px solid #f0f0f0;
      text-align: center;
    }
    .footer-copy {
      font-size: 10px;
      color: #999999;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 12px;
    }
    .footer-links {
      font-size: 11px;
      color: #888888;
      font-weight: 300;
      display: flex;
      justify-content: center;
      gap: 16px;
    }
    .footer-links a {
      color: #888888;
      text-decoration: none;
      border-bottom: 1px solid transparent;
      padding-bottom: 2px;
      transition: color 0.2s, border-color 0.2s;
    }
    .footer-links a:hover {
      color: #1a1a1a;
      border-color: #1a1a1a;
    }
    .divider-text {
      color: #cccccc;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <header class="header">
      <svg class="logo" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="#1a1a1a" d="M500,999.94C224.3,999.94,0,775.65,0,499.95S224.3-.05,500-.05s500,224.3,500,500-224.3,500-500,500ZM500,71.92c-236.01,0-428.02,192.01-428.02,428.02s192.01,428.02,428.02,428.02,428.02-192.01,428.02-428.02S736.02,71.92,500,71.92Z"></path>
        <rect fill="#1a1a1a" x="679.07" y="244.75" width="71.98" height="510.39"></rect>
        <rect fill="#1a1a1a" x="175.33" y="463.96" width="649.33" height="71.98"></rect>
        <rect fill="#1a1a1a" x="472.05" y="293.72" width="71.97" height="349.04"></rect>
        <rect fill="#1a1a1a" x="265.02" y="244.75" width="71.98" height="510.39"></rect>
      </svg>
      <div class="logo-text">Maitreo</div>
    </header>

    <main class="main">
      <h1>Maitreo is now active<br>for Test Restaurant.</h1>
      
      <p class="intro">Your Google Business Profile is now being monitored. Every new review will be analyzed instantly, and you'll receive an SMS alert with a drafted response ready for your approval.</p>
      
      <p class="intro">No dashboard. No logins. Just a text when something needs attention.</p>

      <hr class="divider">

      <section class="commands-section">
        <h2>When a review arrives</h2>
        
        <div class="command-row">
          <div class="command-key">APPROVE</div>
          <div class="command-desc">Post the reply instantly</div>
        </div>
        
        <div class="command-row">
          <div class="command-key">EDIT</div>
          <div class="command-desc">Revise before posting</div>
        </div>
        
        <div class="command-row">
          <div class="command-key">IGNORE</div>
          <div class="command-desc">Mark as handled</div>
        </div>
        
        <div class="command-row">
          <div class="command-key">PAUSE</div>
          <div class="command-desc">Temporarily stop monitoring</div>
        </div>
        
        <div class="command-row">
          <div class="command-key">RESUME</div>
          <div class="command-desc">Restart monitoring</div>
        </div>
        
        <div class="command-row">
          <div class="command-key">STATUS</div>
          <div class="command-desc">Check system status</div>
        </div>
        
        <div class="command-row">
          <div class="command-key">BILLING</div>
          <div class="command-desc">Manage subscription</div>
        </div>
      </section>

      <hr class="divider">

      <section class="subscription-section">
        <h2>Your Subscription</h2>
        <p class="subscription-text">Your subscription is active. To manage billing, update your card, or cancel at any time, simply reply <span class="monospace">BILLING</span> to any Maitreo message.</p>
        <a href="${stripeCustomerPortalUrl}" class="subscription-link">Manage or cancel your subscription →</a>
      </section>

      <div class="footer-section">
        <div class="tagline">Reputation, handled.</div>
        
        <div class="monitoring-badge">
          <div class="monitoring-dot"></div>
          <span class="monitoring-text">Active Monitoring</span>
        </div>
      </div>
    </main>

    <footer class="footer">
      <p class="footer-copy">© 2025 Maitreo Inc.</p>
      <div class="footer-links">
        <a href="mailto:hello@maitreo.com">hello@maitreo.com</a>
        <span class="divider-text">|</span>
        <a href="${stripeCustomerPortalUrl}">Manage subscription</a>
      </div>
    </footer>
  </div>
</body>
</html>
`;

(async () => {
  try {
    const result = await resend.emails.send({
      from: 'noreply@maitreo.com',
      to: 'Kevin.j.reyes@gmail.com',
      subject: 'Maitreo is now active for Test Restaurant',
      html,
    });
    console.log('✅ Activation email sent successfully!');
    console.log('ID:', result.data?.id);
  } catch (error) {
    console.error('❌ Failed to send:', error);
  }
})();
