import { config as dotenvConfig } from 'dotenv';
import { ConfigService } from './services/config.service';

dotenvConfig({ path: '../../.env' });

const globalForConfig = globalThis as unknown as {
  configSrv: ConfigService | undefined;
};

export function getConfigService() {
  if (!globalForConfig.configSrv) {
    globalForConfig.configSrv = new ConfigService();
  }
  return globalForConfig.configSrv;
}

export const config = getConfigService();
