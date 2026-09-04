/**
 * プロセス内 TTL キャッシュ。
 *
 * 上流の football-data.org は 10 リクエスト/分しか許さない。
 * Next.js の `fetch(..., { next: { revalidate } })` はこのアプリの構成では効いておらず
 * （実測: 同一URLの5回表示で上流を5回叩いていた）、1人が数回リロードしただけで
 * 枠を使い切って全員が 503 になる。フレームワークの挙動に依存せず自前で持つ。
 *
 * 同時アクセスで同じキーが殺到しても上流は1回だけ叩く（in-flight を共有する）。
 */
interface Entry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

/** 想定キー数（リーグ×シーズン×種別）を大きく超えたら古いものから捨てる */
const MAX_ENTRIES = 200

function evictExpired(now: number): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next()
    if (oldest.done) break
    store.delete(oldest.value)
  }
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expiresAt > now) return hit.value as T

  const running = inflight.get(key)
  if (running) return running as Promise<T>

  const promise = load()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      evictExpired(Date.now())
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

/** テスト用。プロセス内の状態を消す */
export function clearTtlCache(): void {
  store.clear()
  inflight.clear()
}
