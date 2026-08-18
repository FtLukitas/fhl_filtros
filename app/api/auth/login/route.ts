import { NextResponse } from 'next/server';
import { firmarToken, COOKIE_NAME } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    const envUser = process.env.ADMIN_USER || 'admin';
    const envPass = process.env.ADMIN_PASSWORD || 'admin';

    if (username !== envUser || password !== envPass) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos' },
        { status: 401 }
      );
    }

    const token = await firmarToken({
      user: username,
      timestamp: Date.now(),
    });

    const response = NextResponse.json({ ok: true, message: 'Sesión iniciada' });
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 días
    });

    return response;
  } catch (error) {
    console.error('Error en login:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
