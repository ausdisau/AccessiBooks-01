import fs from "node:fs";
import { toFile } from "openai";
import { Buffer } from "node:buffer";
import { openai, OPENAI_IMAGE_MODEL } from "../../lib/openai";

type ImageSize = "1024x1024" | "512x512" | "256x256";
type OpenAIImageSize = "1024x1024" | "1792x1024" | "1024x1792" | "256x256" | "512x512";

function resolveImageSize(size: ImageSize): OpenAIImageSize {
  if (OPENAI_IMAGE_MODEL.startsWith("dall-e-3")) {
    return "1024x1024";
  }
  return size as OpenAIImageSize;
}

export async function generateImageBuffer(
  prompt: string,
  size: ImageSize = "1024x1024",
): Promise<Buffer> {
  const resolvedSize = resolveImageSize(size);
  const response = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: resolvedSize,
    response_format: "b64_json",
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string,
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      }),
    ),
  );

  const response = await openai.images.edit({
    model: OPENAI_IMAGE_MODEL,
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
