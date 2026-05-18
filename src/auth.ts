import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            'openid email profile https://www.googleapis.com/auth/youtube',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    //jwtコールバックでアクセストークンとリフレッシュトークンを保存し、有効期限が切れそうなときにリフレッシュトークンで更新する
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.userId = account.providerAccountId;
      }

      const expiresAt = token.expiresAt as number | undefined;
      //アクセストークンの有効期限が切れそうならリフレッシュトークンで更新
      if (
        expiresAt &&
        Date.now() / 1000 > expiresAt - 60 &&
        token.refreshToken
      ) {
        const refreshed = await refreshAccessToken(
          token.refreshToken as string,
        );
        if (refreshed) {
          token.accessToken = refreshed.access_token;
          token.expiresAt = refreshed.expires_at;
        }
      }

      return token;
    },
    //sessionコールバックでJWTからアクセストークンをセッションに渡す
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.user.id = token.userId as string;
      return session;
    },
  },
});

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_at: number } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    return {
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch {
    return null;
  }
}
