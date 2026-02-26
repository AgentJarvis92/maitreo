import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    const ua = request.headers.get('user-agent') || ''
    const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)
    const url = request.nextUrl.clone()
    url.pathname = isMobile ? '/mobile.html' : '/desktop.html'
    return NextResponse.rewrite(url)
  }
}

export const config = {
  matcher: ['/'],
}
