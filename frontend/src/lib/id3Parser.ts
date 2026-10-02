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
}

/**
 * Clean filename into smart Title and Artist fallbacks
 * e.g., "Anirudh - Thaarame Thaarame [128kbps].mp3" -> Title: "Thaarame Thaarame", Artist: "Anirudh"
 */
export function parseFilenameMetadata(fileName: string, relativePath?: string): { title: string; artist: string; album: string; folderPath: string; folderName: string } {
  // Strip extension (.mp3, .m4a, .flac, .wav, .ogg, .aac)
  const nameWithoutExt = fileName.replace(/\.(mp3|m4a|flac|wav|ogg|aac)$/i, "").trim();

  // Extract folder hierarchy
  let folderPath = "Root";
  let folderName = "Device Downloads";

  if (relativePath && relativePath.includes("/")) {
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length > 1) {
      // Remove filename from end
      const folderParts = parts.slice(0, -1);
      folderName = folderParts[folderParts.length - 1] || "Device Music";
      folderPath = folderParts.join(" / ");
    }
  }

  // Check for "Artist - Title" or "Title - Artist" format
  let title = nameWithoutExt;
  let artist = "Unknown Local Artist";

  // Clean bracketed noise e.g., (Lyric Video), [320kbps], (Official Video)
  const cleaned = nameWithoutExt
    .replace(/[\(\[\{](official|lyric|video|audio|320kbps|128kbps|hd|4k|remix)[\)\]\}]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.includes(" - ")) {
    const parts = cleaned.split(" - ");
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  } else if (cleaned.includes(" | ")) {
    const parts = cleaned.split(" | ");
    if (parts.length >= 2) {
      title = parts[0].trim();
      artist = parts[1].trim();
    }
  } else {
    title = cleaned || nameWithoutExt;
  }

  return {
    title: title || "Untitled Song",
    artist: artist || "Local Artist",
    album: folderName,
    folderPath,
    folderName
  };
}

/**
 * Basic ID3v2 & MP4 binary cover art and metadata reader
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
    // Read first 128KB of file for ID3v2 header
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buffer);

    // Check ID3v2 Header ("ID3")
    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
      let offset = 10; // ID3v2 header length
      const totalSize = (view.getUint8(6) & 0x7f) << 21 |
                        (view.getUint8(7) & 0x7f) << 14 |
                        (view.getUint8(8) & 0x7f) << 7 |
                        (view.getUint8(9) & 0x7f);

      while (offset < Math.min(totalSize, buffer.byteLength - 10)) {
        const frameId = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );

        const frameSize = (view.getUint8(offset + 4) << 24) |
                          (view.getUint8(offset + 5) << 16) |
                          (view.getUint8(offset + 6) << 8) |
                          view.getUint8(offset + 7);

        if (frameSize <= 0 || offset + 10 + frameSize > buffer.byteLength) break;

        // Title frame TIT2
        if (frameId === "TIT2") {
          const text = parseFrameText(view, offset + 10, frameSize);
          if (text) title = text;
        }
        // Artist frame TPE1
        else if (frameId === "TPE1") {
          const text = parseFrameText(view, offset + 10, frameSize);
          if (text) artist = text;
        }
        // Album frame TALB
        else if (frameId === "TALB") {
          const text = parseFrameText(view, offset + 10, frameSize);
          if (text) album = text;
        }
        // Picture frame APIC
        else if (frameId === "APIC") {
          try {
            const picBlob = parseAPICFrame(buffer, offset + 10, frameSize);
            if (picBlob) {
              coverUrl = URL.createObjectURL(picBlob);
            }
          } catch (e) {
            // Ignore picture parse error fallback
          }
        }

        offset += 10 + frameSize;
      }
    }
  } catch (e) {
    console.warn("Failed binary ID3 parse for local file:", file.name, e);
  }

  // Get duration using a temporary HTML5 Audio element
  let duration = 0;
  try {
    duration = await getAudioDuration(audioUrl);
  } catch (e) {
    duration = 180; // default 3 mins fallback
  }

  return {
    id: fileId,
    title,
    artist,
    album,
    folderPath: parsed.folderPath,
    folderName: parsed.folderName,
    duration,
    coverUrl,
    file,
    audioUrl,
    sizeBytes: file.size,
    lastModified: file.lastModified
  };
}

function parseFrameText(view: DataView, offset: number, size: number): string {
  if (size <= 1) return "";
  const encoding = view.getUint8(offset);
  const bytes = new Uint8Array(view.buffer, offset + 1, size - 1);
  const decoder = new TextDecoder(encoding === 1 ? "utf-16" : "utf-8");
  return decoder.decode(bytes).replace(/\0/g, "").trim();
}

function parseAPICFrame(buffer: ArrayBuffer, offset: number, size: number): Blob | null {
  const bytes = new Uint8Array(buffer, offset, size);
  // Find MIME type
  let mimeEnd = 1;
  while (mimeEnd < bytes.length && bytes[mimeEnd] !== 0) mimeEnd++;
  const mimeType = new TextDecoder().decode(bytes.subarray(1, mimeEnd)) || "image/jpeg";

  let imgStart = mimeEnd + 2; // skip description null byte
  if (imgStart >= bytes.length) imgStart = mimeEnd + 1;

  const imgBytes = bytes.subarray(imgStart);
  return new Blob([imgBytes], { type: mimeType });
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
