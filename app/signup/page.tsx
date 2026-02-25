'use client'

import { useState } from 'react'
import Link from 'next/link'

const MaitreoLogo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5" />
    <path d="M12 6L12 18M8 9L16 9M8 15L16 15" stroke="white" strokeWidth="1.5" strokeLinecap="square" />
  </svg>
)

export default function Signup() {
  const [form, setForm] = useState({ name: '', restaurant: '', phone: '', email: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: wire to backend
    console.log('Signup:', form)
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 glass-header px-8 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <MaitreoLogo />
          <span className="text-sm font-medium tracking-[0.15em] uppercase">Maitreo</span>
        </Link>
      </nav>

      <main className="min-h-screen flex items-center justify-center px-4 pt-20">
        <div className="w-full max-w-lg">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-6 opacity-80">
              <MaitreoLogo size={20} />
              <span className="text-[11px] tracking-[0.2em] uppercase">Maitreo</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-medium uppercase tracking-wide mb-4">Start Your Free Trial</h1>
            <p className="text-sm text-white/50">7 days free. No credit card required.</p>
          </div>

          <div className="glass-panel p-10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-white" />
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/50 block mb-2">Your Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition-colors"
                  placeholder="John Smith"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/50 block mb-2">Restaurant Name</label>
                <input
                  type="text"
                  value={form.restaurant}
                  onChange={e => setForm({ ...form, restaurant: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition-colors"
                  placeholder="The Pepper Room"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/50 block mb-2">Mobile Number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition-colors"
                  placeholder="+1 (555) 000-0000"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/50 block mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition-colors"
                  placeholder="you@restaurant.com"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-white text-black h-14 font-bold uppercase tracking-[0.15em] text-xs hover:bg-gray-200 transition-colors mt-4"
              >
                Start Free Trial
              </button>
            </form>
            <p className="text-[10px] text-white/30 text-center mt-6 uppercase tracking-wider">No credit card required • Cancel anytime</p>
          </div>
        </div>
      </main>
    </>
  )
}
