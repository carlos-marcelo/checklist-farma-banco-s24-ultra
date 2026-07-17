const COMPRESSED_PAYLOAD_MIME = 'application/x-auditflow-gzip';
const DEFAULT_MIME = 'application/octet-stream';
const MIN_COMPRESSION_BYTES = 64 * 1024;
const MIN_SAVINGS_RATIO = 0.08;

export type EncodedFilePayload = {
    dataUrl: string;
    originalSize: number;
    storedSize: number;
    compressed: boolean;
    savingsRatio: number;
    originalMimeType: string;
};

type ParsedPayload = {
    base64: string;
    compressed: boolean;
    mimeType: string;
};

const yieldMainThread = () => new Promise<void>(resolve => {
    if (typeof window === 'undefined') {
        globalThis.setTimeout(resolve, 0);
        return;
    }
    window.setTimeout(resolve, 0);
});

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao codificar arquivo.'));
    reader.readAsDataURL(blob);
});

const extractBase64 = (dataUrl: string): string => {
    const commaIndex = dataUrl.indexOf(',');
    return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

const parseStoredPayload = (payload: string, fallbackMimeType?: string | null): ParsedPayload => {
    const raw = String(payload || '').trim();
    const fallbackMime = String(fallbackMimeType || '').trim() || DEFAULT_MIME;
    if (!raw.startsWith('data:')) {
        return { base64: raw, compressed: false, mimeType: fallbackMime };
    }

    const commaIndex = raw.indexOf(',');
    if (commaIndex < 0) {
        return { base64: '', compressed: false, mimeType: fallbackMime };
    }

    const header = raw.slice(5, commaIndex);
    const base64 = raw.slice(commaIndex + 1);
    const mediaType = header.split(';')[0] || fallbackMime;
    const compressed = mediaType.toLowerCase() === COMPRESSED_PAYLOAD_MIME;
    if (!compressed) {
        return { base64, compressed: false, mimeType: mediaType || fallbackMime };
    }

    const originalMatch = header.match(/(?:^|;)original=([^;]+)/i);
    let originalMime = fallbackMime;
    if (originalMatch?.[1]) {
        try {
            originalMime = decodeURIComponent(originalMatch[1]) || fallbackMime;
        } catch {
            originalMime = fallbackMime;
        }
    }
    return { base64, compressed: true, mimeType: originalMime };
};

const base64ToBytes = async (base64: string): Promise<Uint8Array> => {
    if (!base64) return new Uint8Array();
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    const chunkSize = 512 * 1024;
    for (let offset = 0; offset < binary.length; offset += chunkSize) {
        const end = Math.min(binary.length, offset + chunkSize);
        for (let index = offset; index < end; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        if (end < binary.length) await yieldMainThread();
    }
    return bytes;
};

const gzipBytes = async (bytes: Uint8Array): Promise<Uint8Array> => {
    const { gzip } = await import('fflate');
    return new Promise((resolve, reject) => {
        gzip(bytes, { level: 6 }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
};

const gunzipBytes = async (bytes: Uint8Array): Promise<Uint8Array> => {
    const { gunzip } = await import('fflate');
    return new Promise((resolve, reject) => {
        gunzip(bytes, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
};

export const isCompressedFilePayload = (payload?: string | null): boolean => {
    const raw = String(payload || '').trim().toLowerCase();
    return raw.startsWith(`data:${COMPRESSED_PAYLOAD_MIME}`);
};

export const encodeFileForStorage = async (file: File): Promise<EncodedFilePayload> => {
    const originalMimeType = file.type || DEFAULT_MIME;
    const originalSize = file.size;

    if (originalSize >= MIN_COMPRESSION_BYTES) {
        try {
            const originalBytes = new Uint8Array(await file.arrayBuffer());
            const compressedBytes = await gzipBytes(originalBytes);
            const savingsRatio = originalSize > 0 ? 1 - (compressedBytes.byteLength / originalSize) : 0;

            if (savingsRatio >= MIN_SAVINGS_RATIO) {
                const compressedDataUrl = await blobToDataUrl(
                    new Blob([compressedBytes as BlobPart], { type: COMPRESSED_PAYLOAD_MIME })
                );
                const base64 = extractBase64(compressedDataUrl);
                return {
                    dataUrl: `data:${COMPRESSED_PAYLOAD_MIME};original=${encodeURIComponent(originalMimeType)};base64,${base64}`,
                    originalSize,
                    storedSize: compressedBytes.byteLength,
                    compressed: true,
                    savingsRatio,
                    originalMimeType
                };
            }
        } catch (error) {
            console.warn('[FilePayload] Compressão indisponível; mantendo arquivo original.', error);
        }
    }

    return {
        dataUrl: await blobToDataUrl(file),
        originalSize,
        storedSize: originalSize,
        compressed: false,
        savingsRatio: 0,
        originalMimeType
    };
};

export const decodeStoredFilePayloadToBlob = async (
    payload?: string | null,
    fallbackMimeType?: string | null
): Promise<Blob | null> => {
    const parsed = parseStoredPayload(String(payload || ''), fallbackMimeType);
    if (!parsed.base64) return null;

    const storedBytes = await base64ToBytes(parsed.base64);
    const originalBytes = parsed.compressed ? await gunzipBytes(storedBytes) : storedBytes;
    return new Blob([originalBytes as BlobPart], { type: parsed.mimeType || DEFAULT_MIME });
};

export const decodeStoredFilePayloadToFile = async (
    payload: string | null | undefined,
    fileName: string | null | undefined,
    fallbackMimeType?: string | null
): Promise<File | null> => {
    const blob = await decodeStoredFilePayloadToBlob(payload, fallbackMimeType);
    if (!blob) return null;
    return new File([blob], fileName || 'arquivo.xlsx', {
        type: blob.type || fallbackMimeType || DEFAULT_MIME
    });
};

export const decodeStoredFilePayloadToArrayBuffer = async (
    payload?: string | null,
    fallbackMimeType?: string | null
): Promise<ArrayBuffer | null> => {
    const blob = await decodeStoredFilePayloadToBlob(payload, fallbackMimeType);
    return blob ? blob.arrayBuffer() : null;
};
