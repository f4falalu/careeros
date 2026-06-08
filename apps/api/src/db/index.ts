import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'
import { config } from '../config.js'

const client = postgres(config.databaseUrl, { max: 10 })
export const db = drizzle(client, { schema })
export { schema }
export type DB = typeof db
