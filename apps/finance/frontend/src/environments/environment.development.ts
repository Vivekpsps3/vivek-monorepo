export const environment = {
  production: false,
  apiUrl: '/api',
  /**
   * Allows the UI to unlock the local-dev vault after the API says `local_dev`.
   * The API still ignores that unless LOCAL_DEV_AUTH is on and the host is local
   * (or apps/finance/backend/.env.development is in use).
   */
  localDevAuth: true,
};