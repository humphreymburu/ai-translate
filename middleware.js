import { NextResponse } from 'next/server'

const USER = process.env.BASIC_AUTH_USER
const PASS = process.env.BASIC_AUTH_PASS

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="eval-translations"' },
  })
}

export function middleware(request) {
  if (!USER || !PASS) return NextResponse.next()

  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Basic ')) return unauthorized()

  const decoded = Buffer.from(header.slice(6), 'base64').toString()
  const idx = decoded.indexOf(':')
  if (idx < 0) return unauthorized()

  const user = decoded.slice(0, idx)
  const pass = decoded.slice(idx + 1)
  if (user !== USER || pass !== PASS) return unauthorized()

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}