export function databaseConnectionString(connectionString: string): string {
  if (process.env.NODE_ENV !== 'production') return connectionString;

  const url = new URL(connectionString);
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  return url.toString();
}
