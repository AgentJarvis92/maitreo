'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const MaitreoLogo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5" />
    <path d="M12 6L12 18M8 9L16 9M8 15L16 15" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
  </svg>
)

export default function Home() {
  const [activeStep, setActiveStep] = useState(3)
  const [activeTab, setActiveTab] = useState<'positive' | 'negative' | 'crisis'>('positive')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [platformTicker, setPlatformTicker] = useState('GOOGLE...')

  useEffect(() => {
    const platforms = ['GOOGLE', 'YELP', 'TRIPADVISOR']
    let i = 0
    const interval = setInterval(() => {
      i = (i + 1) % platforms.length
      setPlatformTicker(platforms[i] + '...')
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const steps = [
    { n: 1, title: 'Review Received', desc: 'Maitreo detects a new review on any connected platform instantly.' },
    { n: 2, title: 'Issue Identified', desc: 'AI analyzes the sentiment and identifies specific operational issues.' },
    { n: 3, title: 'Alert Sent', desc: 'You receive a text with a drafted response. Reply YES to post or EDIT to revise.' },
    { n: 4, title: 'Response Posted', desc: 'The approved response is published to the platform automatically.' },
  ]

  const faqs = [
    { q: 'Will replies sound robotic?', a: 'No. Maitreo learns your voice from existing responses and adapts to your tone. You approve or edit every negative reply before it\'s posted.' },
    { q: 'How long does setup take?', a: 'Under 5 minutes. Enter your restaurant details, connect your review platforms, and monitoring begins within 24 hours.' },
    { q: 'Can I cancel anytime?', a: 'Yes. No contracts, no cancellation fees. Stop whenever you want.' },
    { q: 'What happens to positive reviews?', a: '4 and 5-star reviews are automatically posted with personalized, grateful responses. This happens within minutes of the review appearing, with no action required from you.' },
    { q: 'Do I need to log in anywhere?', a: 'No. Everything happens via SMS. You\'ll receive alerts and drafts directly to your phone. Simply reply YES to approve or EDIT to modify. Your weekly intelligence report arrives via email.' },
    { q: 'Which platforms do you support?', a: 'We currently monitor Google, Yelp, and TripAdvisor. These three platforms represent over 90% of online restaurant reviews. Additional platforms coming soon.' },
    { q: 'What if I disagree with the drafted response?', a: 'Simply reply EDIT to the SMS and type your preferred response. You have complete control. Nothing gets posted without your approval for negative reviews.' },
    { q: 'How does crisis detection work?', a: 'If multiple negative reviews mention similar issues within a short time window, Maitreo flags it as a potential operational crisis and sends an immediate alert so you can address the issue in real-time.' },
    { q: 'What\'s included in the weekly report?', a: 'Your weekly intelligence briefing includes: rating trends, new review count, common keywords and patterns, staff mentions, competitor insights, and recommended actions. It arrives every Monday morning.' },
    { q: 'Can I use this for multiple locations?', a: 'Yes. Each location is $99/month. You can manage all locations from a single account and receive consolidated or separate reports based on your preference.' },
    { q: 'Is my data secure?', a: 'Yes. We use enterprise-grade encryption and follow SOC 2 compliance standards. Your platform credentials are stored securely and never shared. We only access what\'s necessary to monitor and respond to reviews.' },
  ]

  return (
    <>
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-header px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MaitreoLogo />
          <span className="text-sm font-medium tracking-[0.15em] uppercase">Maitreo</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/signup" className="bg-white text-black px-6 py-3 text-[11px] font-bold tracking-[0.1em] uppercase hover:scale-105 transition-transform duration-200">
            Start Free Trial
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="min-h-screen flex flex-col justify-center items-center text-center px-4 relative pt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-[#121212] z-0 pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-8 opacity-80">
            <MaitreoLogo size={20} />
            <span className="text-[11px] tracking-[0.2em] uppercase">Maitreo</span>
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight leading-[0.9] uppercase mb-8">
            Your Reputation<br />
            Has A Maître D&apos; Now.
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed font-light mb-4">
            Monitor every review.<br />
            Get alerted and respond by text, only when it matters.
          </p>
          <p className="text-sm text-white/50 max-w-2xl mx-auto font-light mb-12">
            No dashboard. No logins.<br />
            Runs quietly in the background.<br />
            You only hear from it when something needs attention.
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-[10px] md:text-[11px] tracking-[0.1em] uppercase text-white/50 mb-8">
            <span>Works with Google, Yelp &amp; TripAdvisor</span>
            <span className="hidden md:inline">•</span>
            <span>Checked every 15 minutes, 24/7</span>
          </div>
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm">
            <div className="monitoring-indicator w-2 h-2 rounded-full bg-[#00ff00]" />
            <span className="text-[10px] tracking-[0.1em] text-white/60">MONITORING</span>
            <span className="text-[10px] font-bold tracking-[0.1em] min-w-[100px] text-left">{platformTicker}</span>
          </div>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce opacity-30">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* HOW IT WORKS - DEMO */}
      <section className="py-32 px-6 md:px-12 bg-[#121212] border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-[10px] tracking-[0.2em] text-white/50 uppercase flex items-center justify-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#00ff00] monitoring-indicator" />
              How It Works, In Real Time
            </span>
            <h2 className="text-3xl md:text-4xl font-medium uppercase tracking-wide">How Maitreo Handles a Negative Review</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 items-center">
            <div className="lg:col-span-5 space-y-4">
              {steps.map((step) => (
                <div
                  key={step.n}
                  className={`p-6 border-l-2 cursor-pointer transition-all duration-300 ${activeStep === step.n ? 'step-active border-white text-white' : 'border-white/10 hover:bg-white/5'}`}
                  onMouseEnter={() => setActiveStep(step.n)}
                >
                  <span className="text-[10px] uppercase tracking-[0.1em] text-white/50 block mb-2">Step {step.n}</span>
                  <h3 className="text-lg font-medium">{step.title}</h3>
                  <p className="text-sm text-white/60 mt-2">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="lg:col-span-7 relative h-[500px] flex items-center justify-center glass-panel rounded-sm overflow-hidden">
              {/* Step 1 */}
              <div className={`${activeStep === 1 ? 'flex' : 'hidden'} absolute w-full max-w-md p-6 glass-panel flex-col`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-1">
                    <span className="text-yellow-400">★</span><span className="text-yellow-400">★</span>
                    <span className="text-gray-600">★</span><span className="text-gray-600">★</span><span className="text-gray-600">★</span>
                  </div>
                  <span className="text-[10px] uppercase text-white/50">Yelp • Just Now</span>
                </div>
                <p className="text-lg font-light leading-relaxed mb-4">&ldquo;The food was excellent, but the wait between courses was longer than expected. We sat for 45 minutes before our mains arrived.&rdquo;</p>
                <div className="flex items-center gap-3 border-t border-white/10 pt-4">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-xs">JD</div>
                  <span className="text-xs uppercase tracking-wider">John Doe</span>
                </div>
              </div>
              {/* Step 2 */}
              <div className={`${activeStep === 2 ? 'block' : 'hidden'} absolute w-full max-w-md`}>
                <div className="glass-panel p-6 mb-4 border-l-4 border-l-red-500">
                  <span className="text-[10px] uppercase tracking-wider text-red-400 mb-2 block">Negative Sentiment Detected</span>
                  <h3 className="text-xl font-medium mb-1">Service Timing Issue</h3>
                  <p className="text-sm text-white/60">Keywords: &ldquo;wait&rdquo;, &ldquo;45 minutes&rdquo;, &ldquo;longer than expected&rdquo;</p>
                </div>
                <div className="glass-panel p-4 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-white/50">Risk Level</span>
                  <span className="text-xs uppercase tracking-wider font-bold text-yellow-500">Moderate</span>
                </div>
              </div>
              {/* Step 3 */}
              <div className={`${activeStep === 3 ? 'block' : 'hidden'} absolute w-full max-w-sm`}>
                <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl rounded-br-none mb-2 ml-auto sms-bubble right">
                  <p className="text-sm">New 2★ review for The Pepper Room mentioning slow service.</p>
                  <div className="h-2" />
                  <p className="text-sm text-white/80">Draft reply:</p>
                  <p className="text-sm italic my-2">&ldquo;We&rsquo;re sorry your experience fell short. This is not the standard we aim to deliver. We would appreciate the opportunity to speak with you directly.&rdquo;</p>
                  <p className="text-sm text-white/80">Reply YES to post.<br />Reply EDIT to revise.</p>
                </div>
                <div className="text-right pr-2">
                  <span className="text-[10px] text-white/30 uppercase">Maitreo Now</span>
                </div>
              </div>
              {/* Step 4 */}
              <div className={`${activeStep === 4 ? 'flex' : 'hidden'} absolute w-full max-w-sm flex-col gap-4 items-end`}>
                <div className="bg-white text-black p-3 rounded-2xl rounded-br-none sms-bubble right max-w-[100px]">
                  <p className="text-sm font-medium">YES</p>
                </div>
                <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-3 rounded-2xl rounded-bl-none sms-bubble left max-w-[200px] self-start">
                  <p className="text-sm">Response posted to Yelp.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INTELLIGENT RESPONSE SYSTEM */}
      <section id="how-it-works" className="py-32 px-6 md:px-12 bg-[#161616] border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[10px] tracking-[0.2em] text-white/50 uppercase block mb-4">Workflow</span>
            <h2 className="text-3xl md:text-4xl font-medium uppercase tracking-wide">Intelligent Response System</h2>
          </div>
          <div className="flex justify-center mb-12 border-b border-white/10">
            {(['positive', 'negative', 'crisis'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-8 py-4 text-xs font-bold uppercase tracking-[0.1em] border-b-2 transition-colors ${activeTab === tab ? 'text-white border-white' : 'text-white/40 border-transparent hover:text-white'}`}
              >
                {tab === 'positive' ? 'Positive Review' : tab === 'negative' ? 'Negative Review' : 'Crisis Mode'}
              </button>
            ))}
          </div>
          <div className="relative min-h-[300px]">
            {/* Positive */}
            <div className={`${activeTab === 'positive' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'} transition-opacity duration-300`}>
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h3 className="text-2xl font-light mb-4">Auto-Pilot for Praise</h3>
                  <p className="text-white/60 leading-relaxed mb-8">When a customer leaves a 4 or 5-star review, Maitreo automatically generates and posts a grateful, personalized response within minutes. No action required.</p>
                  <div className="flex items-center gap-4 text-xs text-white/40 uppercase tracking-wider">
                    <span>• Increases SEO</span><span>• Shows Engagement</span>
                  </div>
                </div>
                <div className="glass-panel p-8 flex flex-col items-center justify-center">
                  <div className="bg-white/10 p-4 rounded-lg w-full max-w-sm mb-4 border border-white/5">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold">Google Review</span>
                      <span className="text-xs text-green-400">5 Stars</span>
                    </div>
                    <p className="text-sm opacity-80">&ldquo;Great atmosphere and amazing pasta!&rdquo;</p>
                  </div>
                  <div className="w-[2px] h-8 bg-white/20 mb-1" />
                  <div className="w-2 h-2 rounded-full bg-white/20 mb-1" />
                  <div className="bg-[#00ff00]/10 border border-[#00ff00]/20 text-[#00ff00] px-4 py-2 text-xs uppercase tracking-widest rounded-full">Auto-Posted</div>
                </div>
              </div>
            </div>
            {/* Negative */}
            <div className={`${activeTab === 'negative' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'} transition-opacity duration-300`}>
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h3 className="text-2xl font-light mb-4">Human-in-the-Loop for Issues</h3>
                  <p className="text-white/60 leading-relaxed mb-8">Negative reviews trigger an immediate SMS alert. We draft a diplomatic response for you. You can approve it with a single text or edit it if you want to add a personal touch.</p>
                  <div className="flex items-center gap-4 text-xs text-white/40 uppercase tracking-wider">
                    <span>• Prevents Escalation</span><span>• Professional Tone</span>
                  </div>
                </div>
                <div className="glass-panel p-8 flex flex-col items-center justify-center">
                  <div className="bg-black border border-white/20 p-4 rounded-xl max-w-sm w-full relative">
                    <div className="absolute -top-2 left-4 px-2 bg-black text-[10px] uppercase tracking-wider text-white/70">Message</div>
                    <p className="text-sm mb-3">New 2★ review. Draft reply: &ldquo;We apologize...&rdquo;</p>
                    <div className="flex gap-2">
                      <div className="bg-white text-black text-xs font-bold px-3 py-1 rounded">YES</div>
                      <div className="bg-white/10 text-white text-xs font-bold px-3 py-1 rounded">EDIT</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Crisis */}
            <div className={`${activeTab === 'crisis' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'} transition-opacity duration-300`}>
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h3 className="text-2xl font-light mb-4">Immediate Operational Awareness</h3>
                  <p className="text-white/60 leading-relaxed mb-6">Before ratings drop.<br />Before bookings fall.</p>
                  <p className="text-sm text-white/50 mb-8">Most restaurants discover issues hours or days later.</p>
                  <div className="flex items-center gap-4 text-xs text-white/40 uppercase tracking-wider">
                    <span>• Real-time Alerts</span><span>• Pattern Detection</span>
                  </div>
                </div>
                <div className="glass-panel p-8">
                  <div className="relative pl-8 border-l border-white/20 space-y-8">
                    <div className="relative">
                      <span className="absolute -left-[37px] top-1 w-2 h-2 bg-white/30 rounded-full" />
                      <span className="text-[10px] opacity-50 block mb-1">7:42 PM</span>
                      <p className="text-sm">2★ review mentioning slow service</p>
                    </div>
                    <div className="relative">
                      <span className="absolute -left-[37px] top-1 w-2 h-2 bg-white/30 rounded-full" />
                      <span className="text-[10px] opacity-50 block mb-1">8:15 PM</span>
                      <p className="text-sm">1★ review mentioning long wait</p>
                    </div>
                    <div className="relative">
                      <span className="absolute -left-[37px] top-0 w-4 h-4 bg-red-500 rounded-full animate-pulse border-2 border-black" />
                      <span className="text-[10px] text-red-400 font-bold block mb-1">8:16 PM CRISIS ALERT</span>
                      <p className="text-sm font-medium">Maitreo alerts management of potential service breakdown.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-32 px-6 md:px-12 bg-[#121212] border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
                title: 'Continuous Awareness',
                desc: 'We monitor all major platforms simultaneously. Our systems check for new reviews every 15 minutes, ensuring nothing slips through the cracks.',
                example: '"Slow service" mentioned 3 times this week triggers a pattern alert.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
                title: 'Intelligent Response',
                desc: 'Our AI mirrors your brand voice. It learns from your past responses to create drafts that sound like you, not a robot.',
                example: 'Reply YES to publish instantly, or type your edit directly in the chat.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
                title: 'Competitor Intelligence',
                desc: 'See what\'s gaining traction nearby before it affects you. Receive a weekly digest that summarizes your reputation health, highlights team wins, and tracks local competitors.',
                example: 'Miami Chop House +200% review growth this week.',
              },
            ].map((feature) => (
              <div key={feature.title} className="glass-panel p-10 hover:bg-white/5 transition-colors duration-300 group">
                <div className="w-12 h-12 border border-white/20 flex items-center justify-center mb-8 rounded-full group-hover:border-white transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-medium uppercase tracking-wide mb-4">{feature.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed mb-8">{feature.desc}</p>
                <div className="pl-4 border-l border-white/30">
                  <span className="text-[10px] uppercase text-white/40 block mb-2">Example</span>
                  <p className="text-xs italic text-white/80">&ldquo;{feature.example}&rdquo;</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WEEKLY REPORT */}
      <section className="py-32 px-6 md:px-12 bg-[#161616] border-b border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[10px] tracking-[0.2em] text-white/50 uppercase block mb-4">Weekly Intelligence</span>
            <h2 className="text-3xl md:text-4xl font-medium uppercase tracking-wide mb-3">Weekly Reputation Roundup</h2>
            <p className="text-sm text-white/50">Delivered weekly. No dashboard required.</p>
          </div>
          <p className="text-center text-white/60 mb-8 max-w-2xl mx-auto">Everything you need to understand your reputation — in one place.</p>
          <div className="glass-panel border-t-4 border-t-white p-8 md:p-12">
            <div className="flex justify-between items-start mb-12 border-b border-white/10 pb-8">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-widest mb-1">The Pepper Room</h3>
                <p className="text-xs text-white/50 uppercase tracking-wider">Week of Feb 3 — Feb 9</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-light">4.6 <span className="text-sm text-green-400">↑ 4.4</span></div>
                <p className="text-[10px] text-white/40 uppercase tracking-widest">Avg Rating</p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-12">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-6">At A Glance</h4>
                <ul className="space-y-4 text-sm font-light">
                  <li className="flex justify-between"><span>New Reviews</span><span className="font-medium">14 <span className="text-green-400 text-xs ml-1">(+40%)</span></span></li>
                  <li className="flex justify-between"><span>Response Time</span><span className="font-medium">18 min</span></li>
                  <li className="flex justify-between"><span>Risk Signals</span><span className="font-medium text-white/40">None</span></li>
                </ul>
              </div>
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-6">Patterns Noticed</h4>
                <ul className="space-y-4 text-sm font-light">
                  <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" /><span>&ldquo;Slow service&rdquo; mentioned in 3 reviews</span></li>
                  <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" /><span>Maria mentioned positively 5 times</span></li>
                  <li className="flex items-start gap-3"><span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" /><span>Outdoor seating praised</span></li>
                </ul>
              </div>
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-6">Competitor Watch</h4>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-1"><span className="font-medium">Miami Chop House</span><span className="text-green-400">+12 Reviews</span></div>
                    <p className="text-xs text-white/50">Growth anomaly detected.</p>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1"><span className="font-medium">Harbor Grill</span><span className="text-red-400">4.5 to 4.2</span></div>
                    <p className="text-xs text-white/50">Rating decline.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-12 pt-8 border-t border-white/10">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4">Recommended Actions</h4>
              <div className="flex flex-wrap gap-4">
                {['☐ Investigate Friday dinner timing', '☐ Recognize Maria', '☐ Monitor Miami Chop House'].map(a => (
                  <span key={a} className="px-3 py-1 bg-white/5 border border-white/10 text-xs rounded-sm hover:bg-white/10 cursor-pointer">{a}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OLD WAY VS MAITREO WAY */}
      <section className="py-32 px-6 md:px-12 bg-[#121212] border-b border-white/5 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-[10px] tracking-[0.2em] text-white/50 uppercase block mb-8">No Dashboard</span>
            <h2 className="text-3xl md:text-5xl font-medium uppercase tracking-wide leading-tight mb-6">
              Most Tools Give You Dashboards.<br />
              Maitreo Sends a Text.
            </h2>
            <p className="text-base text-white/60 mt-4">No dashboard. No logins. No checking.<br />Just alerts when something needs attention.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-0 border border-white/10">
            <div className="p-12 md:p-16 bg-[#1a1a1a] flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/10 group">
              <div className="w-full max-w-[300px] h-[200px] bg-gradient-to-br from-[#2a2a2a] to-[#111] border border-white/10 relative rounded-sm overflow-hidden mb-8 transition-transform duration-500 group-hover:scale-105 shadow-2xl">
                <div className="absolute top-0 w-full h-6 bg-white/5 border-b border-white/5 flex items-center px-2 gap-1">
                  <div className="w-2 h-2 rounded-sm bg-white/20" /><div className="h-1 w-8 bg-white/10 rounded-full" />
                </div>
                <div className="absolute top-6 left-0 w-8 bottom-0 border-r border-white/5 flex flex-col gap-2 p-2">
                  <div className="w-full h-1 bg-white/10" /><div className="w-full h-1 bg-white/5" /><div className="w-full h-1 bg-white/5" />
                </div>
                <div className="absolute top-8 left-10 right-2 bottom-2 p-2 opacity-50">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="h-12 bg-white/5 border border-white/5" /><div className="h-12 bg-white/5 border border-white/5" /><div className="h-12 bg-white/5 border border-white/5" />
                  </div>
                  <div className="h-20 bg-white/5 border border-white/5 flex items-end justify-between px-1 pb-1 gap-1">
                    {['40%','70%','50%','80%','60%'].map((h,i) => <div key={i} className="w-full bg-white/10 dash-bar" style={{height:h}} />)}
                  </div>
                </div>
              </div>
              <p className="text-xs uppercase tracking-widest text-white/40 text-center">The Old Way</p>
              <p className="text-sm mt-2 opacity-60 text-center">Another login. Another dashboard. Another thing to check.</p>
            </div>
            <div className="p-12 md:p-16 bg-[#121212] flex flex-col items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-t from-green-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="w-full max-w-[280px] mb-8 relative z-10 transition-transform duration-500 group-hover:scale-105">
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl rounded-bl-none border border-white/20 sms-bubble left">
                  <p className="text-sm font-medium">2 negative reviews in 40 minutes. Operational issue likely occurring tonight.</p>
                </div>
              </div>
              <p className="text-xs uppercase tracking-widest text-green-400">The Maitreo Way</p>
              <p className="text-sm mt-2 opacity-60">Just clarity. Instantly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-32 px-6 md:px-12 bg-[#161616] border-b border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-[10px] tracking-[0.2em] text-white/50 uppercase block mb-8">Simple Pricing</span>
          <div className="glass-panel p-16 max-w-lg mx-auto relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-white" />
            <p className="text-sm text-white/60 mb-8">No contracts. Cancel anytime.</p>
            <h3 className="text-6xl md:text-8xl font-thin mb-4">$99</h3>
            <p className="text-sm uppercase tracking-widest text-white/50 mb-12">Per month / Per location</p>
            <ul className="text-left space-y-4 mb-12 max-w-xs mx-auto">
              {['Google, Yelp, TripAdvisor','Unlimited reviews','Auto-post positive replies','SMS approval for negatives','Weekly Intelligence Report'].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm font-light">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="block w-full bg-white text-black h-14 font-bold uppercase tracking-[0.15em] text-xs hover:bg-gray-200 transition-colors flex items-center justify-center">
              Start 7-Day Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section className="py-32 px-6 md:px-12 bg-[#121212] border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-medium uppercase tracking-wide text-center mb-20">Four Steps to Full Coverage</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-6 left-0 w-full h-[1px] bg-white/10 z-0" />
            {[
              { n: 1, title: 'Enter Details', desc: 'Input your restaurant name and address. We\'ll find your profiles.', active: true },
              { n: 2, title: 'Connect', desc: 'Securely link your review platforms. Takes less than 2 minutes.', active: false },
              { n: 3, title: 'Monitoring', desc: 'System begins ingesting history and monitoring for new reviews immediately.', active: false },
              { n: 4, title: 'First Alert', desc: 'You\'ll receive your first intelligence report or review alert when needed.', active: false },
            ].map((s) => (
              <div key={s.n} className="relative z-10">
                <div className={`w-12 h-12 bg-[#121212] border ${s.active ? 'border-white' : 'border-white/30'} flex items-center justify-center text-lg font-bold mb-6 mx-auto md:mx-0 ${s.active ? '' : 'text-white/50'}`}>{s.n}</div>
                <h3 className="text-lg font-medium mb-2 text-center md:text-left">{s.title}</h3>
                <p className="text-sm text-white/50 text-center md:text-left">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-32 px-6 md:px-12 bg-[#161616] border-b border-white/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-medium uppercase tracking-wide text-center mb-16">Common Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="faq-item border-b border-white/10 pb-4">
                <button
                  className="w-full flex justify-between items-center py-4 text-left group"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-sm font-bold uppercase tracking-widest group-hover:text-white/70 transition-colors">{faq.q}</span>
                  <span className={`text-xl font-light transform transition-transform ${openFaq === i ? 'rotate-45' : ''}`}>+</span>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-40' : 'max-h-0'}`}>
                  <p className="pb-4 text-sm text-white/60 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-32 px-6 md:px-12 bg-[#121212] border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { quote: 'We caught a service issue on a Saturday night before it affected our rating. The ROI on that alone pays for the year.', author: 'Michael Chen, Harbor Grill', offset: false },
              { quote: 'Finally stopped checking Google every morning. Maitreo handles it. My anxiety is gone.', author: 'Sarah Lopez, The Pepper Room', offset: true },
              { quote: 'Three negative reviews in an hour. We fixed the problem that night because we knew immediately.', author: 'David Park, Bloom Restaurant', offset: false },
            ].map((t) => (
              <div key={t.author} className={`glass-panel p-10 text-center ${t.offset ? 'transform md:-translate-y-4' : ''}`}>
                <p className="text-lg font-light leading-relaxed mb-8 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="h-[1px] w-8 bg-white/20 mx-auto mb-4" />
                <span className="text-[10px] uppercase tracking-widest text-white/50">{t.author}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FOOTER */}
      <section className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 bg-[#0a0a0a] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-80 pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <MaitreoLogo size={48} />
          <h2 className="text-4xl md:text-5xl font-medium uppercase tracking-wide mb-8 mt-8">Your Maître D&apos; Is Ready.</h2>
          <p className="text-lg text-white/60 mb-12 font-light">Continuous reputation oversight begins immediately.</p>
          <div className="flex flex-col md:flex-row gap-4 justify-center w-full">
            <Link href="/signup" className="bg-white text-black px-12 py-4 text-xs font-bold tracking-[0.15em] uppercase hover:bg-gray-200 transition-colors min-w-[200px] text-center">
              Start Free Trial
            </Link>
          </div>
          <div className="mt-24 pt-8 border-t border-white/5 w-full flex flex-col md:flex-row justify-between items-center text-[10px] text-white/30 uppercase tracking-widest gap-4">
            <span>© 2024 Maitreo Inc.</span>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white">Privacy</a>
              <a href="#" className="hover:text-white">Terms</a>
              <a href="#" className="hover:text-white">Contact</a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
