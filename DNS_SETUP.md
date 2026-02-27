# DNS Setup for maitreo.com Email Authentication

To ensure activation emails reach the Gmail inbox (instead of spam), you need to add SPF, DKIM, and DMARC records to maitreo.com's DNS. This tells email providers that noreply@maitreo.com is authorized to send emails.

## 1. Get DNS Records from Resend

1. Log in to Resend Dashboard: https://resend.com
2. Go to Settings → Domains
3. Add or select `maitreo.com`
4. Copy the DNS records provided (you should see 3 records):
   - SPF record
   - DKIM record(s)
   - DMARC record

## 2. Add Records to maitreo.com DNS

Depending on your domain registrar (GoDaddy, Namecheap, etc.), add these DNS records:

### SPF Record
**Type:** TXT  
**Name:** `@` (or leave blank)  
**Value:** `v=spf1 include:sendingdomain.resend.dev ~all`

Example from Resend:
```
v=spf1 include:sendingdomain.resend.dev ~all
```

### DKIM Record
**Type:** TXT  
**Name:** `<token>._domainkey` (provided by Resend)  
**Value:** `v=DKIM1; h=sha256; p=<PUBLIC_KEY>` (provided by Resend)

### DMARC Record
**Type:** TXT  
**Name:** `_dmarc`  
**Value:** `v=DMARC1; p=none; rua=mailto:hello@maitreo.com; ruf=mailto:hello@maitreo.com; fo=1`

## 3. Verify in Resend Dashboard

After adding the DNS records:
1. Go back to Resend → Domains
2. Click "Verify" on maitreo.com
3. Wait 5-10 minutes for DNS propagation
4. You should see "✓ Verified" when complete

## 4. Logo Hosting

The activation email references the logo at `https://maitreo.com/logo.svg`. Make sure:

**Option A: Host on CDN (Recommended)**
- Upload `backend/public/logo.svg` to your CDN (Cloudflare, AWS S3, etc.)
- Update email template to use the CDN URL

**Option B: Serve from Backend**
- The logo is already in `backend/public/logo.svg`
- Make sure your backend serves static files at `/logo.svg`
- Update email template if needed

**Option C: Use Data URI (Last Resort)**
- Base64-encoded SVG embedded directly in HTML
- No external request needed, but bloats email size
- Already available in `logo-to-base64.mjs`

## 5. Test

Run a test email:
```bash
npm run test:email
```

Or manually:
```bash
cd ~/restaurant-saas
RESEND_KEY=$(security find-generic-password -s "Resend" -w) && node test-spacing.mjs "$RESEND_KEY"
```

Check that:
- ✅ Email arrives in Gmail inbox (not spam)
- ✅ Logo displays
- ✅ All content renders correctly

## References

- Resend Docs: https://resend.com/docs
- SPF/DKIM/DMARC: https://dmarcian.com/
- Gmail Spam Filter: https://support.google.com/mail/answer/6590
