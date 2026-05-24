/**
 * Shopify Rate Limiter
 *
 * Shopify's API has a leaky bucket algorithm with:
 * - REST Admin API: 2 requests/second (40 per 20 seconds)
 * - Bucket size: 40 requests
 *
 * This module provides rate-limited fetching to avoid hitting limits.
 */

// Minimum delay between requests (500ms = 2 requests/second)
const MIN_DELAY_MS = 500

// Track last request time per shop to avoid concurrent rate limiting
const lastRequestTime: Map<string, number> = new Map()

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get delay needed before next request for a shop
 */
function getDelayNeeded(shop: string): number {
  const lastTime = lastRequestTime.get(shop) || 0
  const elapsed = Date.now() - lastTime
  return Math.max(0, MIN_DELAY_MS - elapsed)
}

/**
 * Parse Shopify rate limit header
 * Format: "used/limit" e.g., "38/40"
 */
function parseRateLimitHeader(header: string | null): { used: number; limit: number } | null {
  if (!header) return null
  const match = header.match(/^(\d+)\/(\d+)$/)
  if (!match) return null
  return {
    used: parseInt(match[1], 10),
    limit: parseInt(match[2], 10),
  }
}

/**
 * Fetch with Shopify rate limiting
 *
 * @param shop - The shop domain (e.g., "mystore.myshopify.com")
 * @param url - Full URL to fetch
 * @param options - Fetch options
 * @returns Response
 */
export async function shopifyFetch(
  shop: string,
  url: string,
  options: RequestInit
): Promise<Response> {
  // Wait if needed to respect rate limit
  const delay = getDelayNeeded(shop)
  if (delay > 0) {
    await sleep(delay)
  }

  // Make the request
  const response = await fetch(url, options)
  lastRequestTime.set(shop, Date.now())

  // Check rate limit headers
  const rateLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit')
  const rateLimit = parseRateLimitHeader(rateLimitHeader)

  // If we're using more than 80% of the bucket, back off
  if (rateLimit && rateLimit.used > rateLimit.limit * 0.8) {
    await sleep(2000) // Wait 2 seconds to let bucket refill
  }

  // Handle 429 Too Many Requests
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000
    console.warn(`Shopify rate limit hit for ${shop}, waiting ${waitTime}ms`)
    await sleep(waitTime)
    // Retry the request
    return shopifyFetch(shop, url, options)
  }

  return response
}

/**
 * Fetch all pages from Shopify API with rate limiting
 *
 * @param shop - The shop domain
 * @param initialUrl - Starting URL
 * @param accessToken - Shopify access token
 * @param dataKey - Key in response containing the array (e.g., 'products', 'orders')
 * @param maxPages - Maximum pages to fetch (safety limit)
 * @returns Array of all items
 */
export async function shopifyFetchAll<T>(
  shop: string,
  initialUrl: string,
  accessToken: string,
  dataKey: string,
  maxPages: number = 100
): Promise<T[]> {
  let allItems: T[] = []
  let nextUrl: string | null = initialUrl
  let pageCount = 0

  while (nextUrl && pageCount < maxPages) {
    pageCount++

    const response = await shopifyFetch(shop, nextUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.errors || `Shopify API error: ${response.status}`)
    }

    const data = await response.json()
    const items = data[dataKey] || []
    allItems = allItems.concat(items)

    // Check for next page in Link header
    const linkHeader = response.headers.get('Link')
    nextUrl = null
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
      if (nextMatch) {
        nextUrl = nextMatch[1]
      }
    }
  }

  return allItems
}

/**
 * Clear rate limit tracking for a shop (useful for testing)
 */
export function clearRateLimitTracking(shop?: string): void {
  if (shop) {
    lastRequestTime.delete(shop)
  } else {
    lastRequestTime.clear()
  }
}
