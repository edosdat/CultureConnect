/**
 * French copy for the Auth.js error page.
 * Only whitelisted codes are shown. Anything else becomes Default,
 * so a query string can never echo a secret or a stack trace.
 */

export const AUTH_ERROR_RETRY_HREF = '/';

const AUTH_ERROR_CODES = [
  'Configuration',
  'AccessDenied',
  'OAuthCallback',
  'Verification',
  'Default',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthErrorCopy = {
  code: AuthErrorCode;
  title: string;
  body: string;
};

const COPY: Record<AuthErrorCode, AuthErrorCopy> = {
  Configuration: {
    code: 'Configuration',
    title: 'La connexion n’a pas abouti.',
    body: 'La connexion n’est pas disponible pour le moment. Ça arrive aussi si le lien d’entrée n’est pas le bon.',
  },
  AccessDenied: {
    code: 'AccessDenied',
    title: 'La connexion n’a pas abouti.',
    body: 'L’accès a été refusé.',
  },
  OAuthCallback: {
    code: 'OAuthCallback',
    title: 'La connexion n’a pas abouti.',
    body: 'Le retour depuis Google n’a pas abouti.',
  },
  Verification: {
    code: 'Verification',
    title: 'La connexion n’a pas abouti.',
    body: 'Ce lien de vérification n’est plus valable. Il a peut-être déjà servi, ou il a expiré.',
  },
  Default: {
    code: 'Default',
    title: 'La connexion n’a pas abouti.',
    body: 'Quelque chose a bloqué la connexion.',
  },
};

function firstCode(error: string | string[] | undefined): string | undefined {
  if (typeof error === 'string') return error;
  if (Array.isArray(error) && typeof error[0] === 'string') return error[0];
  return undefined;
}

export function authErrorCopy(
  error: string | string[] | undefined,
): AuthErrorCopy {
  const raw = firstCode(error);
  if (raw && (AUTH_ERROR_CODES as readonly string[]).includes(raw)) {
    return COPY[raw as AuthErrorCode];
  }
  return COPY.Default;
}
