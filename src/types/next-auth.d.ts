import 'next-auth';
import 'next-auth/jwt';
import type { AccountTasteState } from '@/lib/signals';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      tastes?: string;
      tastesSetAt?: string;
      tasteState?: AccountTasteState;
    };
  }

  interface User {
    tastes?: string;
    tastesSetAt?: string;
    tasteState?: AccountTasteState;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tastes?: string;
    tastesSetAt?: string;
    tasteState?: AccountTasteState;
  }
}
