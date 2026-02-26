import pg from 'pg';
export declare const pool: pg.Pool;
export declare function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
export declare function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
export default pool;
//# sourceMappingURL=client.d.ts.map