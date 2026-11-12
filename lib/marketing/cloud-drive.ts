import { createPrivateKey, createSign } from 'node:crypto'
import * as XLSX from 'xlsx'

const FILES = { monthly: '18PIYecGjCDSN4aUYgP8vyrPPg0c877FNeEakqKlH2OU', accounting: '1AOLNHHLWNzdz8LW-zC62sqqLnw5U2QC_', designs: '198Op2VTqh8tjTxBlQ0Q39SR6VYeEyRhF' } as const
export async function downloadMarketingWorkbooks() {
  const text = process.env.MARKETING_GOOGLE_SERVICE_ACCOUNT_JSON
  if (!text) throw new Error('Falta conectar Google Drive en Vercel: MARKETING_GOOGLE_SERVICE_ACCOUNT_JSON')
  let account: { client_email: string; private_key: string }
  try { account = JSON.parse(text) } catch { throw new Error('La credencial de Google Drive no es un JSON válido') }
  if (!account.client_email || !account.private_key) throw new Error('La credencial de Google Drive está incompleta')
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
  const signer = createSign('RSA-SHA256'); signer.update(input)
  const jwt = `${input}.${signer.sign(createPrivateKey(account.private_key)).toString('base64url')}`
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }), cache: 'no-store', signal: AbortSignal.timeout(20000) })
  const token = await tokenResponse.json()
  if (!tokenResponse.ok || !token.access_token) throw new Error('Google no autorizó la conexión de lectura de Drive')
  const headers = { Authorization: `Bearer ${token.access_token}` }
  const result = await Promise.all(Object.entries(FILES).map(async ([name, id]) => {
    const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,mimeType,modifiedTime`, { headers, cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if (!meta.ok) throw new Error(`Google Drive no permite leer el archivo ${name}; compártelo como lector con la cuenta de servicio`)
    const info = await meta.json()
    const path = info.mimeType === 'application/vnd.google-apps.spreadsheet'
      ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet`
      : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`
    const file = await fetch(path, { headers, cache: 'no-store', signal: AbortSignal.timeout(45000) })
    if (!file.ok) throw new Error(`No se pudo descargar el archivo ${name}`)
    const chunks: Uint8Array[] = []; let size = 0
    if (!file.body) throw new Error('El archivo de Drive llegó vacío')
    for await (const chunk of file.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length
      if (size > 10 * 1024 * 1024) throw new Error(`El archivo ${name} supera el límite de lectura segura`)
      chunks.push(chunk)
    }
    const workbook = XLSX.read(Buffer.concat(chunks), { type: 'buffer', cellFormula: true })
    return [name, { workbook, modifiedTime: info.modifiedTime }] as const
  }))
  return Object.fromEntries(result) as Record<keyof typeof FILES, { workbook: XLSX.WorkBook; modifiedTime: string }>
}
