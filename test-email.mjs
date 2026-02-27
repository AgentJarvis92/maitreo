import { Resend } from 'resend';

const apiKey = process.argv[2];
const resend = new Resend(apiKey);

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Maitreo</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121212; padding: 20px; margin: 0;">
  
  <div style="background: #121212; max-width: 600px; margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
    
    <!-- Header -->
    <div style="background: #161616; border-bottom: 2px solid #00ff00; padding: 40px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 32px; color: #ffffff; letter-spacing: 2px;">MAITREO</h1>
      <p style="margin: 8px 0 0; font-size: 14px; color: #00ff00; font-weight: 600;">Your Google Reviews. On Text.</p>
    </div>

    <!-- Welcome section -->
    <div style="padding: 40px 20px;">
      <h2 style="color: #ffffff; margin: 0 0 12px; font-size: 24px;">Hey Kevin,</h2>
      <p style="color: rgba(255,255,255,0.8); font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
        Test Restaurant is now live on Maitreo. Starting today, we're monitoring your Google reviews 24/7. The moment a customer leaves feedback, you'll get a text.
      </p>

      <!-- Status indicator -->
      <div style="background: #1a1a1a; border: 1px solid rgba(0,255,0,0.3); padding: 20px; border-radius: 6px; margin: 24px 0;">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <div style="width: 12px; height: 12px; background: #00ff00; border-radius: 50%; margin-right: 12px; box-shadow: 0 0 8px #00ff00;"></div>
          <span style="color: #00ff00; font-weight: 600; font-size: 14px;">MONITORING ACTIVE</span>
        </div>
        <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 13px;">
          Your account is verified and ready. We'll alert you the instant feedback comes in.
        </p>
      </div>

      <!-- Next step -->
      <div style="background: #161616; border-left: 3px solid #00ff00; padding: 20px; border-radius: 4px; margin: 24px 0;">
        <h3 style="margin: 0 0 12px; color: #ffffff; font-size: 16px;">Next Step</h3>
        <p style="margin: 0 0 12px; color: rgba(255,255,255,0.8); font-size: 14px;">
          Connect your Google Business Profile to start receiving review alerts. Takes 60 seconds.
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="https://maitreo.com/onboarding/complete" 
           style="display: inline-block; background: #00ff00; color: #121212; text-decoration: none; padding: 14px 40px; border-radius: 4px; font-weight: 700; font-size: 16px; letter-spacing: 0.5px; box-shadow: 0 0 16px rgba(0,255,0,0.3);">
          CONNECT GOOGLE
        </a>
      </div>

      <!-- Quick commands -->
      <div style="background: #1a1a1a; border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 6px; margin: 24px 0;">
        <h4 style="margin: 0 0 16px; color: #ffffff; font-size: 14px; font-weight: 600;">TEXT COMMANDS</h4>
        <div style="color: rgba(255,255,255,0.7); font-size: 13px; font-family: 'Courier New', monospace; line-height: 2;">
          <div><span style="color: #00ff00;">HELP</span> — See all commands</div>
          <div><span style="color: #00ff00;">STATUS</span> — Account overview</div>
          <div><span style="color: #00ff00;">PAUSE</span> — Pause monitoring</div>
          <div><span style="color: #00ff00;">BILLING</span> — Manage payment</div>
        </div>
      </div>

      <!-- Pricing callout -->
      <div style="background: rgba(0,255,0,0.05); border: 1px solid rgba(0,255,0,0.2); padding: 16px; border-radius: 6px; text-align: center; margin: 24px 0;">
        <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 13px;">
          <strong style="color: #00ff00;">14-day free trial</strong> — $99/month after. Cancel anytime via text.
        </p>
      </div>

      <!-- Footer -->
      <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px; margin-top: 32px; color: rgba(255,255,255,0.5); font-size: 12px;">
        <p style="margin: 0;">Questions? Text us <strong>HELP</strong> or reply to this email.</p>
        <p style="margin: 8px 0 0;">© 2026 Maitreo. All rights reserved.</p>
      </div>

    </div>
  </div>

</body>
</html>
`;

(async () => {
  try {
    const result = await resend.emails.send({
      from: 'noreply@maitreo.com',
      to: 'Kevin.j.reyes@gmail.com',
      subject: 'Welcome to Maitreo',
      html,
    });
    console.log('✅ Email sent successfully!');
    console.log('ID:', result.data?.id);
  } catch (error) {
    console.error('❌ Failed to send:', error);
  }
})();
