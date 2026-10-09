import type { IncomingMessage, ServerResponse } from 'node:http'

export function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean>
export function applyEnvFile(file: string): void
