import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log('✅ OpenAI client initialized');

(async () => {
  try {
    console.log('🚀 Testing GPT-4o mini...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Say "Hello from GPT-4o-mini"',
        },
      ],
    });
    console.log('✅ Success:', response.choices[0].message.content);
  } catch (e) {
    console.error('❌ Error:', (e as Error).message);
  }
})();
