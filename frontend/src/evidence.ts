export const EVIDENCE_COUNT = 3;
export const EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp";
const IMAGE_LIMIT = 1_000_000;
const SOURCE_LIMIT = 20_000_000;

export type EvidenceDraft = { id: string; dataUrl?: string };
export type ImageProblem =
  "imageType" | "imageTooLarge" | "imageFailed" | "imageCount";
export class EvidenceError extends Error {
  constructor(public issue: ImageProblem) {
    super(issue);
  }
}

function previewData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new EvidenceError("imageFailed"));
    reader.readAsDataURL(blob);
  });
}

function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareEvidence(file: File): Promise<EvidenceDraft> {
  if (!EVIDENCE_ACCEPT.split(",").includes(file.type))
    throw new EvidenceError("imageType");
  if (file.size > SOURCE_LIMIT) throw new EvidenceError("imageTooLarge");

  const url = URL.createObjectURL(file);
  const picture = new Image();
  try {
    picture.src = url;
    await picture.decode();
    const { naturalWidth: width, naturalHeight: height } = picture;
    if (file.size <= IMAGE_LIMIT && width * height <= 40_000_000)
      return { id: crypto.randomUUID(), dataUrl: await previewData(file) };

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new EvidenceError("imageFailed");
    let scale = Math.min(1, 2560 / Math.max(width, height));
    let type = "image/webp";
    while (true) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      if (type === "image/jpeg") {
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.94, 0.85, 0.74, 0.62]) {
        let result = await encode(canvas, type, quality);
        if (result && result.size <= IMAGE_LIMIT)
          return {
            id: crypto.randomUUID(),
            dataUrl: await previewData(result),
          };
        if (type === "image/webp" && result?.type !== type) {
          type = "image/jpeg";
          context.globalCompositeOperation = "destination-over";
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.globalCompositeOperation = "source-over";
          result = await encode(canvas, type, quality);
          if (result && result.size <= IMAGE_LIMIT)
            return {
              id: crypto.randomUUID(),
              dataUrl: await previewData(result),
            };
        }
      }
      if (Math.max(canvas.width, canvas.height) <= 256) break;
      scale *= 0.75;
    }
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    throw new EvidenceError("imageType");
  } finally {
    URL.revokeObjectURL(url);
  }
  throw new EvidenceError("imageFailed");
}
