import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
  const headersList = await headers()
  const ua = headersList.get('user-agent') || ''
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)
  redirect(isMobile ? '/mobile.html' : '/desktop.html')
}
