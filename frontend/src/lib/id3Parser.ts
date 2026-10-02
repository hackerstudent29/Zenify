"use client";

export interface LocalAudioMetadata {
  id: string;
  title: string;
  artist: string;
  album: string;
  folderPath: string;
  folderName: string;
  duration: number;
  coverUrl?: string;
  file: File;
  audioUrl: string;
  sizeBytes: number;
  lastModified: number;

  // Online Catalog Enrichment fields
  matchedCoverUrl?: string;
  matchedArtistName?: string;
  matchedAlbumName?: string;
  matchedGenre?: string;
  isMatched?: boolean;
}

/**
 * Strips domain watermarks & spam tags inserted by music download portals
 * e.g., "Avalukena :: isaimini.co" -> "Avalukena"
 * "Badli Si Hawa Hai (pagalall.com)" -> "Badli Si Hawa Hai"
 */
export function cleanWebTags(text: string): string {
  if (!text) return "";
  let clean = text;

  const domainPatterns = [
    /::\s*[a-z0-9\.\-]+\.(co|com|net|org|in|dev|cc|info|me|site|xyz)\b/gi,
    /[\(\[\{][^\)\]\}]*\.(co|com|net|org|in|dev|cc|info|me|site|xyz)[^\)\]\}]*[\)\]\}]/gi,
    /\b(isaimini|pagalall|pagalworld|masstamilan|starmusiq|kuttyweb|sensongs|5starmusiq|pendujatt|starMusiQ|kuttymovies|tnhits|musiq)\b[^\s]*/gi,
    /\[?\b320kbps\b\]?/gi,
    /\[?\b128kbps\b\]?/gi,
    /\[?\b64kbps\b\]?/gi,
    /\.(mp3|m4a|flac|wav|ogg|aac)$/i,
  ];

  for (const pat of domainPatterns) {
    clean = clean.replace(pat, "");
  }

  clean = clean.replace(/[\:\-\|\,\s]+$/, "").replace(/^[\:\-\|\,\s]+/, "").trim();
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

/**
 * Detects if a decoded text string is corrupted Chinese/mojibake ideographs
 */
function isMojibake(str: string): boolean {
  if (!str) return false;
  const cjkCount = (str.match(/[\u4e00-\u9fff\ud800-\udfff]/g) || []).length;
  if (cjkCount > 0 && cjkCount >= Math.max(1, str.length * 0.2)) {
    return true;
  }
  if (/[\x00-\x08\x0E-\x1F\x7F-\x9F]/.test(str)) {
    return true;
  }
  return false;
}

/**
 * Clean filename into smart Title and Artist fallbacks
 */
export function parseFilenameMetadata(fileName: string, relativePath?: string): { title: string; artist: string; album: string; folderPath: string; folderName: string } {
  let nameWithoutExt = fileName.replace(/\.(mp3|m4a|flac|wav|ogg|aac)$/i, "").trim();
  
  nameWithoutExt = cleanWebTags(nameWithoutExt);
  nameWithoutExt = nameWithoutExt.replace(/^(?:\d{1,3}[\.\-\_\s]+)+/, "").trim();

  let folderPath = "Root";
  let folderName = "Device Downloads";

  if (relativePath && relativePath.includes("/")) {
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length > 1) {
      const folderParts = parts.slice(0, -1);
      folderName = folderParts[folderParts.length - 1] || "Device Music";
      folderPath = folderParts.join(" / ");
    }
  }

  let title = nameWithoutExt;
  let artist = "Local Artist";

  if (nameWithoutExt.includes(" - ")) {
    const parts = nameWithoutExt.split(" - ");
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  } else if (nameWithoutExt.includes(" | ")) {
    const parts = nameWithoutExt.split(" | ");
    if (parts.length >= 2) {
      title = parts[0].trim();
      artist = parts[1].trim();
    }
  } else {
    title = nameWithoutExt;
  }

  return {
    title: cleanWebTags(title) || "Untitled Track",
    artist: cleanWebTags(artist) || "Local Artist",
    album: folderName,
    folderPath,
    folderName
  };
}

/**
 * Multi-format ID3v2 & MP4 binary tag parser with album art extraction
 */
export async function parseAudioFileMetadata(file: File): Promise<LocalAudioMetadata> {
  const fileId = `local-${file.name}-${file.size}-${file.lastModified}`;
  const relativePath = (file as any).webkitRelativePath || file.name;
  const parsed = parseFilenameMetadata(file.name, relativePath);
  const audioUrl = URL.createObjectURL(file);

  let coverUrl: string | undefined = undefined;
  let title = parsed.title;
  let artist = parsed.artist;
  let album = parsed.album;

  try {
    const headerBuf = await file.slice(0, 10).arrayBuffer();
    const headerView = new DataView(headerBuf);

    if (headerView.byteLength >= 10 && headerView.getUint8(0) === 0x49 && headerView.getUint8(1) === 0x44 && headerView.getUint8(2) === 0x33) {
      const majorVer = headerView.getUint8(3);
      const totalTagSize = (headerView.getUint8(6) & 0x7f) << 21 |
                           (headerView.getUint8(7) & 0x7f) << 14 |
                           (headerView.getUint8(8) & 0x7f) << 7 |
                           (headerView.getUint8(9) & 0x7f);

      const id3SliceSize = Math.min(totalTagSize + 10, Math.min(file.size, 4 * 1024 * 1024));
      const buffer = await file.slice(0, id3SliceSize).arrayBuffer();
      const view = new DataView(buffer);

      let offset = 10;
      while (offset < Math.min(totalTagSize, buffer.byteLength - 10)) {
        let frameId = "";
        let frameSize = 0;

        if (majorVer === 2) {
          frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2));
          frameSize = (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | view.getUint8(offset + 5);
          if (frameSize <= 0) break;

          if (frameId === "TT2") {
            const text = parseFrameText(view, offset + 6, frameSize);
            if (text) title = text;
          } else if (frameId === "TP1") {
            const text = parseFrameText(view, offset + 6, frameSize);
            if (text) artist = text;
          } else if (frameId === "TAL") {
            const text = parseFrameText(view, offset + 6, frameSize);
            if (text) album = text;
          } else if (frameId === "PIC") {
            const picBlob = parsePICFrame(buffer, offset + 6, frameSize);
            if (picBlob) coverUrl = URL.createObjectURL(picBlob);
          }
          offset += 6 + frameSize;
        } else {
          frameId = String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
          );

          if (majorVer === 4) {
            frameSize = (view.getUint8(offset + 4) & 0x7f) << 21 |
                        (view.getUint8(offset + 5) & 0x7f) << 14 |
                        (view.getUint8(offset + 6) & 0x7f) << 7 |
                        (view.getUint8(offset + 7) & 0x7f);
          } else {
            frameSize = (view.getUint8(offset + 4) << 24) |
                        (view.getUint8(offset + 5) << 16) |
                        (view.getUint8(offset + 6) << 8) |
                        view.getUint8(offset + 7);
          }

          if (frameSize <= 0 || offset + 10 + frameSize > buffer.byteLength) break;

          if (frameId === "TIT2") {
            const text = parseFrameText(view, offset + 10, frameSize);
            if (text) title = text;
          } else if (frameId === "TPE1") {
            const text = parseFrameText(view, offset + 10, frameSize);
            if (text) artist = text;
          } else if (frameId === "TALB") {
            const text = parseFrameText(view, offset + 10, frameSize);
            if (text) album = text;
          } else if (frameId === "APIC") {
            try {
              const picBlob = parseAPICFrame(buffer, offset + 10, frameSize);
              if (picBlob) {
                coverUrl = URL.createObjectURL(picBlob);
              }
            } catch (e) {
              // Ignore APIC parse fallback
            }
          }

          offset += 10 + frameSize;
        }
      }
    }
  } catch (e) {
    console.warn("Binary tag extraction skipped for local file:", file.name, e);
  }

  title = cleanWebTags(title) || parsed.title;
  artist = cleanWebTags(artist) || parsed.artist;
  album = cleanWebTags(album) || parsed.album;

  let duration = 0;
  try {
    duration = await getAudioDuration(audioUrl);
  } catch (e) {
    duration = 180;
  }

  return {
    id: fileId,
    title: title || "Untitled Track",
    artist: artist || "Local Artist",
    album: album || parsed.folderName,
    folderPath: parsed.folderPath,
    folderName: parsed.folderName,
    duration,
    coverUrl,
    file,
    audioUrl,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    isMatched: false
  };
}

function parseFrameText(view: DataView, offset: number, size: number): string {
  if (size <= 1) return "";
  const encoding = view.getUint8(offset);
  const bytes = new Uint8Array(view.buffer, offset + 1, size - 1);
  if (bytes.length === 0) return "";

  let result = "";
  try {
    if (encoding === 1) {
      if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        result = new TextDecoder("utf-16le").decode(bytes.subarray(2));
      } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        result = new TextDecoder("utf-16be").decode(bytes.subarray(2));
      } else {
        result = new TextDecoder("utf-8").decode(bytes);
      }
    } else if (encoding === 2) {
      result = new TextDecoder("utf-16be").decode(bytes);
    } else if (encoding === 3) {
      result = new TextDecoder("utf-8").decode(bytes);
    } else {
      try {
        result = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        result = new TextDecoder("iso-8859-1").decode(bytes);
      }
    }
  } catch (e) {
    result = "";
  }

  result = result.replace(/\0/g, "").trim();

  if (isMojibake(result)) {
    return "";
  }

  return result;
}

function parseAPICFrame(buffer: ArrayBuffer, offset: number, size: number): Blob | null {
  try {
    const bytes = new Uint8Array(buffer, offset, Math.min(size, buffer.byteLength - offset));
    if (bytes.length < 5) return null;

    const encoding = bytes[0];
    let pos = 1;

    let mimeType = "";
    while (pos < bytes.length && bytes[pos] !== 0) {
      mimeType += String.fromCharCode(bytes[pos]);
      pos++;
    }
    pos++;

    if (!mimeType || mimeType === "image/") mimeType = "image/jpeg";
    if (mimeType.toLowerCase().includes("png")) mimeType = "image/png";

    pos++;

    if (encoding === 1 || encoding === 2) {
      while (pos < bytes.length - 1 && !(bytes[pos] === 0 && bytes[pos + 1] === 0)) {
        pos += 2;
      }
      pos += 2;
    } else {
      while (pos < bytes.length && bytes[pos] !== 0) {
        pos++;
      }
      pos++;
    }

    if (pos >= bytes.length) return null;

    const imgBytes = bytes.subarray(pos);
    if (imgBytes.length === 0) return null;

    return new Blob([imgBytes], { type: mimeType });
  } catch (e) {
    return null;
  }
}

function parsePICFrame(buffer: ArrayBuffer, offset: number, size: number): Blob | null {
  try {
    const bytes = new Uint8Array(buffer, offset, Math.min(size, buffer.byteLength - offset));
    if (bytes.length < 6) return null;
    const format = String.fromCharCode(bytes[1], bytes[2], bytes[3]).toLowerCase();
    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const imgBytes = bytes.subarray(6);
    return new Blob([imgBytes], { type: mimeType });
  } catch (e) {
    return null;
  }
}

function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 180);
    };
    audio.onerror = () => {
      resolve(180);
    };
  });
}
