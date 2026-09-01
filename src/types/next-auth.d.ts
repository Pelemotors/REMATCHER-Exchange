import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      dealerId: string | null;
      dealerName: string | null;
      verificationStatus: string | null;
      emailVerifiedAt: string | null;
    };
  }

  interface User {
    role?: string;
    dealerId?: string | null;
    dealerName?: string | null;
    verificationStatus?: string | null;
    emailVerifiedAt?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    dealerId?: string | null;
    dealerName?: string | null;
    verificationStatus?: string | null;
    emailVerifiedAt?: string | null;
  }
}
