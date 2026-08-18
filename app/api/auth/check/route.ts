import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verificarToken, COOKIE_NAME } from '@/lib/auth';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  const esValido = await verificarToken(token);
  if (!esValido) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}
