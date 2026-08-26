/**
 * Pure JavaScript cosine similarity and vector search over Float32Array embeddings.
 * Embeddings are stored as Buffer (byte blob of Float32Array) in SQLite.
 *
 * This avoids external native vector database / sqlite-vec complications while
 * being extremely fast (sub-millisecond for thousands of vectors).
 */

export interface VectorSearchResult<T> {
  item: T
  similarity: number
}

/**
 * Compute cosine similarity between two Float32Array vectors.
 * Returns a value between -1 and 1 (1 being identical direction).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Convert a raw number array (from OpenAI API) to a Buffer for SQLite storage.
 */
export function embeddingToBuffer(embedding: number[]): Buffer {
  const floatArray = new Float32Array(embedding)
  return Buffer.from(floatArray.buffer)
}

/**
 * Convert a Buffer stored in SQLite back to a Float32Array for calculation.
 */
export function bufferToFloat32Array(buffer: Buffer | Uint8Array): Float32Array {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
  return new Float32Array(arrayBuffer)
}

/**
 * Rank items with embeddings against a query vector by cosine similarity.
 */
export function rankBySimilarity<T extends { embedding: Buffer | Uint8Array | null }>(
  items: T[],
  queryEmbedding: number[] | Float32Array,
  topK: number = 10,
): VectorSearchResult<T>[] {
  const queryVec =
    queryEmbedding instanceof Float32Array
      ? queryEmbedding
      : new Float32Array(queryEmbedding)

  const scored: VectorSearchResult<T>[] = []

  for (const item of items) {
    if (!item.embedding) continue
    const itemVec = bufferToFloat32Array(item.embedding)
    const sim = cosineSimilarity(queryVec, itemVec)
    scored.push({ item, similarity: sim })
  }

  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, topK)
}
