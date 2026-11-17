import { Pool, type PoolClient, type PoolConfig } from 'pg';

type PoolConfigWithConnectionHook = PoolConfig & {
  onConnect: (client: PoolClient) => Promise<void>;
};

export function createDatabasePool(config: PoolConfig): Pool {
  const configWithSearchPath: PoolConfigWithConnectionHook = {
    ...config,
    onConnect: async (client) => {
      await client.query('SET search_path TO public');
    },
  };

  return new Pool(configWithSearchPath);
}
