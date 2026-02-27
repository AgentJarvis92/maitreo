import { Resend } from 'resend';

const apiKey = process.argv[2];
const resend = new Resend(apiKey);

(async () => {
  try {
    const result = await resend.emails.send({
      from: 'noreply@maitreo.com',
      to: 'kevin.j.reyes@gmail.com',
      subject: 'Test Email - Simple',
      html: '<h1>Test</h1><p>This is a test email from Resend.</p>',
    });
    
    console.log('Response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Exception:', error.message);
    console.error(error.response?.data || error);
  }
})();
