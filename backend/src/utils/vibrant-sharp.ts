import axios from 'axios';
import sharp from 'sharp';
import { BasicPipeline, Vibrant } from '@vibrant/core';
import { DefaultGenerator } from '@vibrant/generator-default';
import { ImageBase, ImageData, ImageSource } from '@vibrant/image';
import { MMCQ } from '@vibrant/quantizer-mmcq';

const HTTP_URL_REGEX = /^https?:\/\/.*/i;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 4096 * 4096;
const DECODE_MAX_DIMENSION = 512;

/**
 * Sharp-backed Vibrant Image implementation.
 * Decodes JPEG/PNG/WebP/GIF/AVIF/SVG safely via libvips without vulnerable Jimp/file-type dependencies.
 */
export class SharpImage extends ImageBase {
    private _imageData: ImageData | undefined;

    private _getData(): ImageData {
        if (!this._imageData) {
            throw new Error('Image not loaded');
        }
        return this._imageData;
    }

    private async _decodeBuffer(input: Buffer | string): Promise<ImageBase> {
        const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
            .resize({
                width: DECODE_MAX_DIMENSION,
                height: DECODE_MAX_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        this._imageData = {
            data,
            width: info.width,
            height: info.height,
        };
        return this;
    }

    async load(image: ImageSource): Promise<ImageBase> {
        if (Buffer.isBuffer(image)) {
            return this._decodeBuffer(image);
        }

        if (typeof image === 'string') {
            if (HTTP_URL_REGEX.test(image)) {
                const res = await axios.get<ArrayBuffer>(image, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    maxContentLength: MAX_IMAGE_BYTES,
                });
                return this._decodeBuffer(Buffer.from(res.data));
            }
            return this._decodeBuffer(image);
        }

        throw new Error('Cannot load HTMLImageElement in Node environment');
    }

    clear(): void {
        this._imageData = undefined;
    }

    update(imageData: ImageData): void {
        this._imageData = imageData;
    }

    getWidth(): number {
        return this._getData().width;
    }

    getHeight(): number {
        return this._getData().height;
    }

    resize(targetWidth: number, targetHeight: number, _ratio: number): void {
        const src = this._getData();
        const dstW = Math.max(1, Math.round(targetWidth));
        const dstH = Math.max(1, Math.round(targetHeight));
        if (dstW === src.width && dstH === src.height) return;

        const out = Buffer.allocUnsafe(dstW * dstH * 4);
        const srcData = src.data;
        const xScale = src.width / dstW;
        const yScale = src.height / dstH;

        for (let y = 0; y < dstH; y++) {
            const sy = Math.min(src.height - 1, Math.floor(y * yScale));
            const srcRowOffset = sy * src.width;
            const dstRowOffset = y * dstW;
            for (let x = 0; x < dstW; x++) {
                const sx = Math.min(src.width - 1, Math.floor(x * xScale));
                const sIdx = (srcRowOffset + sx) * 4;
                const dIdx = (dstRowOffset + x) * 4;
                out[dIdx] = srcData[sIdx];
                out[dIdx + 1] = srcData[sIdx + 1];
                out[dIdx + 2] = srcData[sIdx + 2];
                out[dIdx + 3] = srcData[sIdx + 3];
            }
        }

        this._imageData = {
            data: out,
            width: dstW,
            height: dstH,
        };
    }

    getPixelCount(): number {
        const data = this._getData();
        return data.width * data.height;
    }

    getImageData(): ImageData {
        return this._getData();
    }

    remove(): void {
        this._imageData = undefined;
    }
}

const pipeline = new BasicPipeline()
    .filter.register(
        'default',
        (r, g, b, a) => a >= 125 && !(r > 250 && g > 250 && b > 250)
    )
    .quantizer.register('mmcq', MMCQ)
    .generator.register('default', DefaultGenerator);

Vibrant.DefaultOpts.ImageClass = SharpImage;
Vibrant.DefaultOpts.quantizer = 'mmcq';
Vibrant.DefaultOpts.generators = ['default'];
Vibrant.DefaultOpts.filters = ['default'];
Vibrant.use(pipeline);

export { Vibrant };
