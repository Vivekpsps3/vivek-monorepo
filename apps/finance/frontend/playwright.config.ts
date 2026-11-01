import { domainConfig } from '../../../tests/e2e/config';

const config = domainConfig('finance');
config.use = { ...config.use, timezoneId: 'America/Los_Angeles' };
export default config;
