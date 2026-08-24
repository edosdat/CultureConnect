import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      tastes?: string;
      tastesSetAt?: string;
    };
  }

  interface User {
    tastes?: string;
    tastesSetAt?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tastes?: string;
    tastesSetAt?: string;
  }
}
